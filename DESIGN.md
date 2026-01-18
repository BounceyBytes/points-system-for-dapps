# Points System V1 — Design Document

## 1. Database Schema

### 1.1 Core Tables

#### seasons
```sql
CREATE TABLE seasons (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  season_number     INTEGER UNIQUE NOT NULL,
  start_time        TIMESTAMPTZ NOT NULL,
  end_time          TIMESTAMPTZ,
  is_active         BOOLEAN NOT NULL DEFAULT false,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Constraints
  CONSTRAINT seasons_end_after_start CHECK (end_time IS NULL OR end_time > start_time),
  CONSTRAINT seasons_unique_active CHECK (
    NOT is_active OR (
      SELECT COUNT(*) FROM seasons WHERE is_active = true
    ) <= 1
  )
);

CREATE UNIQUE INDEX idx_seasons_active ON seasons(is_active) WHERE is_active = true;
CREATE INDEX idx_seasons_number ON seasons(season_number);
```

**Invariants:**
- Exactly 0 or 1 active season at any time
- end_time must be after start_time if set
- season_number must be unique and sequential
- Seasons are immutable after creation (no updates except end_time and is_active)

---

#### snapshots
```sql
CREATE TABLE snapshots (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  season_id         UUID NOT NULL REFERENCES seasons(id),
  snapshot_time     TIMESTAMPTZ NOT NULL,
  interval_start    TIMESTAMPTZ NOT NULL,
  interval_end      TIMESTAMPTZ NOT NULL,
  status            VARCHAR(20) NOT NULL DEFAULT 'pending',
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at      TIMESTAMPTZ,

  -- Constraints
  CONSTRAINT snapshots_valid_interval CHECK (interval_end > interval_start),
  CONSTRAINT snapshots_valid_status CHECK (status IN ('pending', 'completed', 'failed')),
  CONSTRAINT snapshots_unique_interval UNIQUE (season_id, interval_start, interval_end)
);

CREATE INDEX idx_snapshots_season ON snapshots(season_id);
CREATE INDEX idx_snapshots_time ON snapshots(snapshot_time);
CREATE INDEX idx_snapshots_status ON snapshots(status);
```

**Invariants:**
- Snapshots are immutable once status = 'completed'
- interval_end must be after interval_start
- No overlapping intervals within a season
- snapshot_time should be >= interval_end (capture after period ends)

---

#### snapshot_balances
```sql
CREATE TABLE snapshot_balances (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  snapshot_id       UUID NOT NULL REFERENCES snapshots(id),
  address           VARCHAR(66) NOT NULL,  -- 0x + 64 chars for EVM addresses
  product_type      VARCHAR(20) NOT NULL,
  asset             VARCHAR(100) NOT NULL,
  effective_balance DECIMAL(38, 18) NOT NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Constraints
  CONSTRAINT snapshot_balances_valid_product CHECK (product_type IN ('LP', 'LST', 'Vault')),
  CONSTRAINT snapshot_balances_positive_balance CHECK (effective_balance >= 0),
  CONSTRAINT snapshot_balances_unique_entry UNIQUE (snapshot_id, address, product_type, asset)
);

CREATE INDEX idx_snapshot_balances_snapshot ON snapshot_balances(snapshot_id);
CREATE INDEX idx_snapshot_balances_address ON snapshot_balances(address);
CREATE INDEX idx_snapshot_balances_product ON snapshot_balances(product_type);
```

**Invariants:**
- Balances are append-only (no updates or deletes)
- effective_balance must be >= 0
- address must be valid format (enforced at application layer)
- One balance per (snapshot, address, product_type, asset) tuple

---

#### emission_rates
```sql
CREATE TABLE emission_rates (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  season_id         UUID NOT NULL REFERENCES seasons(id),
  product_type      VARCHAR(20) NOT NULL,
  asset             VARCHAR(100) NOT NULL,
  rate_per_token_per_day DECIMAL(38, 18) NOT NULL,
  effective_from    TIMESTAMPTZ NOT NULL,
  effective_until   TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Constraints
  CONSTRAINT emission_rates_valid_product CHECK (product_type IN ('LP', 'LST', 'Vault')),
  CONSTRAINT emission_rates_positive_rate CHECK (rate_per_token_per_day >= 0),
  CONSTRAINT emission_rates_valid_period CHECK (
    effective_until IS NULL OR effective_until > effective_from
  )
);

CREATE INDEX idx_emission_rates_season ON emission_rates(season_id);
CREATE INDEX idx_emission_rates_product_asset ON emission_rates(product_type, asset);
CREATE INDEX idx_emission_rates_effective ON emission_rates(effective_from, effective_until);
```

**Invariants:**
- Rates are explicit constants (no formulas)
- rate_per_token_per_day must be >= 0
- No overlapping periods for same (season, product_type, asset)
- Rates are append-only (new entry to change rate)

---

#### points_ledger (THE SINGLE SOURCE OF TRUTH)
```sql
CREATE TABLE points_ledger (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  address           VARCHAR(66) NOT NULL,
  snapshot_id       UUID NOT NULL REFERENCES snapshots(id),
  season_id         UUID NOT NULL REFERENCES seasons(id),
  points_delta      DECIMAL(38, 18) NOT NULL,
  reason            TEXT NOT NULL,
  product_type      VARCHAR(20) NOT NULL,
  asset             VARCHAR(100) NOT NULL,
  calculation_basis JSONB NOT NULL,  -- Store calculation details for auditability
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Constraints
  CONSTRAINT points_ledger_valid_product CHECK (product_type IN ('LP', 'LST', 'Vault'))
);

CREATE INDEX idx_points_ledger_address ON points_ledger(address);
CREATE INDEX idx_points_ledger_season ON points_ledger(season_id);
CREATE INDEX idx_points_ledger_snapshot ON points_ledger(snapshot_id);
CREATE INDEX idx_points_ledger_created ON points_ledger(created_at);

-- Prevent any updates or deletes
CREATE RULE points_ledger_no_update AS ON UPDATE TO points_ledger DO INSTEAD NOTHING;
CREATE RULE points_ledger_no_delete AS ON DELETE TO points_ledger DO INSTEAD NOTHING;
```

**Invariants (CRITICAL):**
- **APPEND-ONLY**: No UPDATE or DELETE operations ever
- points_delta can be positive or negative (for corrections)
- Every entry must reference a valid snapshot and season
- calculation_basis must contain: { balance, rate, days, formula }
- Total points = SUM(points_delta) GROUP BY address, season_id
- Ledger must be replayable from genesis

---

### 1.2 Materialized View (Optional, for Performance)

```sql
CREATE MATERIALIZED VIEW points_totals AS
SELECT
  address,
  season_id,
  SUM(points_delta) as total_points,
  MAX(created_at) as last_updated
FROM points_ledger
GROUP BY address, season_id;

CREATE UNIQUE INDEX idx_points_totals_address_season ON points_totals(address, season_id);
CREATE INDEX idx_points_totals_season ON points_totals(season_id);
```

**Note:** This is derived data only. The ledger is the source of truth.

---

## 2. System Invariants

### 2.1 Economic Invariants

1. **Determinism**: Same input (snapshot) → Same output (points)
   - No use of current time in calculations
   - No randomness
   - No external mutable state

2. **Bounded Emissions**: Total daily points are calculable
   ```
   Max Daily Points = Σ(TVL_asset × emission_rate_asset)
   ```

3. **No Compounding**: Points do not earn points

4. **No Unbounded Multipliers**: All multipliers are explicit constants (V1: no multipliers)

### 2.2 Data Integrity Invariants

1. **Snapshot Immutability**: Once snapshot status = 'completed', no changes allowed

2. **Ledger Append-Only**: No UPDATE or DELETE on points_ledger

3. **Season Isolation**: Points from season N cannot affect season N+1

4. **Balance Non-Negativity**: effective_balance >= 0 always

5. **Referential Integrity**: All foreign keys must be valid

### 2.3 Temporal Invariants

1. **Fixed Cadence**: Snapshots occur at predictable intervals (daily at 00:00 UTC)

2. **No Retroactive Changes**: Cannot modify past snapshots or ledger entries

3. **Sequential Processing**: Snapshots processed in chronological order

4. **Season Boundaries**: No snapshot can span multiple seasons

### 2.4 Auditability Invariants

1. **Replay Guarantee**: Ledger can be replayed from genesis to any point

2. **Calculation Transparency**: Every ledger entry includes calculation_basis

3. **Reason Traceability**: Every ledger entry has human-readable reason

4. **Total Reconciliation**: API totals = Ledger totals (exactly)

---

## 3. System Architecture

### 3.1 High-Level Components

```
┌─────────────────────────────────────────────────────────┐
│                     Points System V1                     │
└─────────────────────────────────────────────────────────┘

┌──────────────┐      ┌──────────────┐      ┌──────────────┐
│   Snapshot   │      │   Points     │      │   Season     │
│   Engine     │─────▶│  Calculator  │──────▶│   Manager    │
└──────────────┘      └──────────────┘      └──────────────┘
       │                      │                      │
       ▼                      ▼                      ▼
┌─────────────────────────────────────────────────────────┐
│                   Points Ledger (DB)                     │
│                 (Single Source of Truth)                 │
└─────────────────────────────────────────────────────────┘
       │
       ▼
┌──────────────┐
│  Read-Only   │
│     API      │
└──────────────┘
```

### 3.2 Component Responsibilities

#### Snapshot Engine
- **Purpose**: Capture user balances at fixed intervals
- **Inputs**:
  - Current season
  - Snapshot interval (start, end)
  - Data source (blockchain indexer / subgraph)
- **Outputs**:
  - Immutable snapshot record
  - Balance records per (address, product, asset)
- **Guarantees**:
  - Idempotent: Re-running produces identical results
  - Atomic: All balances written or none
  - Fixed cadence: Daily at 00:00 UTC

#### Points Calculator
- **Purpose**: Convert snapshots to points using emission rates
- **Inputs**:
  - Snapshot ID
  - Emission rates for season
- **Outputs**:
  - Ledger entries (append-only)
- **Guarantees**:
  - Deterministic: Same snapshot → Same points
  - Transparent: Calculation basis stored
  - Bounded: Total emissions calculable

#### Season Manager
- **Purpose**: Handle season lifecycle
- **Operations**:
  - Start new season
  - End current season
  - Query season state
- **Guarantees**:
  - One active season at a time
  - Clean reset between seasons
  - Historical seasons preserved

#### Read-Only API
- **Purpose**: Expose points data to users
- **Endpoints**:
  - GET /points/:address
  - GET /points/:address/breakdown
  - GET /seasons/current
- **Guarantees**:
  - No business logic duplication
  - Totals reconcile with ledger
  - Deterministic responses

---

### 3.3 Data Flow

```
1. Daily Snapshot Trigger (Cron @ 00:00 UTC)
   │
   ▼
2. Snapshot Engine
   │  ├─ Query blockchain data source
   │  ├─ Create snapshot record
   │  ├─ Write snapshot_balances (immutable)
   │  └─ Mark snapshot as 'completed'
   │
   ▼
3. Points Calculator
   │  ├─ Load snapshot balances
   │  ├─ Load emission rates for season
   │  ├─ Calculate: points = balance × rate × days
   │  └─ Write to points_ledger (append-only)
   │
   ▼
4. Points Ledger (Persistent)
   │
   ▼
5. API Reads Ledger
   │  └─ Return aggregated totals
   │
   ▼
6. User sees points balance
```

---

### 3.4 Error Handling Strategy

#### Snapshot Failures
- **Missing Data**: Fail loudly, do not interpolate
- **Partial Data**: Rollback transaction, mark snapshot as 'failed'
- **Network Errors**: Retry with exponential backoff (max 3 attempts)

#### Calculation Failures
- **Missing Rate**: Use 0 and log warning
- **Negative Balance**: Reject and fail
- **Overflow**: Use DECIMAL(38,18) to prevent

#### API Failures
- **Invalid Address**: Return 400 Bad Request
- **Season Not Found**: Return 404 Not Found
- **Database Error**: Return 503 Service Unavailable

---

## 4. Calculation Formulas (V1)

### 4.1 Simple Points Calculation

```typescript
// For each snapshot balance:
points_earned = effective_balance × emission_rate × days_in_period

// Where:
// - effective_balance: user's balance in snapshot (DECIMAL)
// - emission_rate: rate_per_token_per_day from emission_rates table
// - days_in_period: (interval_end - interval_start) / 86400 seconds
```

### 4.2 Example

```
User deposits 1000 USDT in Vault
Emission rate: 10 points per USDT per day
Snapshot period: 1 day

points_earned = 1000 × 10 × 1 = 10,000 points
```

### 4.3 Ledger Entry Format

```json
{
  "id": "uuid-v4",
  "address": "0x1234...5678",
  "snapshot_id": "uuid-of-snapshot",
  "season_id": "uuid-of-season",
  "points_delta": "10000.000000000000000000",
  "reason": "Daily points for Vault USDT holdings",
  "product_type": "Vault",
  "asset": "USDT",
  "calculation_basis": {
    "balance": "1000.000000000000000000",
    "rate": "10.000000000000000000",
    "days": 1,
    "formula": "balance × rate × days"
  },
  "created_at": "2026-01-18T00:05:00Z"
}
```

---

## 5. Technology Stack

### Backend
- **Runtime**: Node.js 20+
- **Language**: TypeScript 5+
- **Framework**: Express.js
- **Database**: PostgreSQL 15+
- **ORM**: Prisma
- **Validation**: Zod
- **Testing**: Jest

### Infrastructure
- **Containerization**: Docker
- **Orchestration**: Docker Compose
- **Scheduling**: node-cron
- **Logging**: Winston
- **Monitoring**: Prometheus metrics (optional)

---

## 6. Implementation Phases

### Phase 1: Foundation (Priority 1)
- [ ] Database schema
- [ ] Prisma models
- [ ] Season manager
- [ ] Basic API skeleton

### Phase 2: Core Logic (Priority 2)
- [ ] Snapshot engine
- [ ] Points calculator
- [ ] Ledger writer
- [ ] Cron scheduler

### Phase 3: API (Priority 3)
- [ ] GET /points/:address
- [ ] GET /points/:address/breakdown
- [ ] GET /seasons/current
- [ ] Error handling

### Phase 4: Operations (Priority 4)
- [ ] Docker setup
- [ ] Environment configuration
- [ ] Migration scripts
- [ ] README documentation

---

## 7. Security Considerations

1. **SQL Injection**: Use parameterized queries (Prisma handles this)
2. **Input Validation**: Validate all addresses and parameters
3. **Rate Limiting**: Apply to API endpoints (not in V1, document for V2)
4. **Read-Only API**: No authentication needed, but log all requests
5. **Database Rules**: Enforce append-only on points_ledger

---

## 8. Testing Strategy

### Unit Tests
- Points calculation logic
- Season state transitions
- Address validation
- Decimal precision

### Integration Tests
- End-to-end snapshot → points flow
- API endpoint responses
- Database constraints
- Ledger immutability

### Invariant Tests
- Ledger append-only enforcement
- Season isolation
- Balance non-negativity
- Total reconciliation

---

## 9. Deployment Checklist

- [ ] PostgreSQL database running
- [ ] Environment variables configured
- [ ] Database migrations applied
- [ ] Initial season created
- [ ] Emission rates seeded
- [ ] Cron job scheduled
- [ ] API health endpoint responding
- [ ] Logs being written
- [ ] Backup strategy in place

---

## 10. Future Considerations (V2+)

These are explicitly out of scope for V1 but documented for future reference:

- Leaderboard (V2)
- Points history UI (V2)
- Referral system (V3)
- Team competitions (V3)
- Social tasks (V3)
- Real-time websocket updates (V3)

---

## Appendix: Review Checklist

Before merging any PR, verify:

- [ ] No V2/V3 features present
- [ ] Emission rates are explicit constants
- [ ] No unbounded multipliers or compounding
- [ ] Snapshots are immutable
- [ ] Ledger is append-only
- [ ] Seasons have clean boundaries
- [ ] API totals reconcile with ledger
- [ ] All calculations are deterministic
- [ ] Can explain total points outstanding
- [ ] System can run unchanged for 12 months

**If any check fails, the PR must not merge.**
