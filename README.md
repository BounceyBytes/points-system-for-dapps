# Fluxtra Points System V1 — Economic Core

A deterministic, append-only points system for incentivizing TVL growth and retention on MANTRA Chain.

## Overview

This is the **V1 implementation** of the Fluxtra/Lotus Points System, strictly following the [Product Requirements Document (PRD)](DESIGN.md).

**Key Principles:**
- Deterministic over flexible
- Economic correctness over engagement
- Append-only data over mutability
- Narrow scope over feature completeness
- Explainability over cleverness

## What This System Does

1. **Captures user balances** at fixed daily intervals (snapshots)
2. **Calculates points** using explicit emission rates: `points = balance × rate × days`
3. **Records all points** in an append-only ledger (immutable)
4. **Operates in seasons** with clean boundaries and resets
5. **Exposes read-only API** for querying points balances

## What This System Does NOT Do (V1)

- Referrals
- Social tasks (e.g., Twitter)
- Team competitions
- Lotteries or randomness
- Real-time updates
- Multipliers or compounding
- UI components

These features are explicitly out of scope for V1.

---

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                   Points System V1                       │
└─────────────────────────────────────────────────────────┘

Daily Cron (00:00 UTC)
       │
       ▼
┌──────────────┐      ┌──────────────┐      ┌──────────────┐
│   Snapshot   │      │   Points     │      │   Ledger     │
│   Engine     │─────▶│  Calculator  │─────▶│   Writer     │
└──────────────┘      └──────────────┘      └──────────────┘
       │                                            │
       │                                            ▼
       │                                    ┌──────────────┐
       │                                    │  PostgreSQL  │
       │                                    │   (Ledger)   │
       │                                    └──────────────┘
       │                                            │
       └────────────────────────────────────────────┘
                                                    │
                                                    ▼
                                            ┌──────────────┐
                                            │ Read-Only    │
                                            │    API       │
                                            └──────────────┘
```

---

## Tech Stack

- **Runtime**: Node.js 20+
- **Language**: TypeScript 5+
- **Framework**: Express.js
- **Database**: PostgreSQL 15+
- **ORM**: Prisma
- **Validation**: Zod
- **Scheduling**: node-cron
- **Logging**: Winston
- **Container**: Docker

---

## Quick Start

### Prerequisites

- Docker & Docker Compose
- Node.js 20+ (for local development)
- PostgreSQL 15+ (if not using Docker)

### 1. Clone Repository

```bash
git clone https://github.com/BounceyBytes/points-system-for-dapps.git
cd points-system-for-dapps
```

### 2. Configure Environment

```bash
cp .env.example .env
```

Edit `.env` with your configuration:

```env
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/points_system?schema=public"
PORT=3000
NODE_ENV=development
SNAPSHOT_CRON_SCHEDULE="0 0 * * *"  # Daily at 00:00 UTC
DATA_SOURCE_URL="http://localhost:8080/graphql"
LOG_LEVEL=info
DEFAULT_SEASON_START="2026-01-01T00:00:00Z"
```

### 3. Start with Docker (Recommended)

```bash
docker-compose up -d
```

This will:
1. Start PostgreSQL database
2. Run database migrations
3. Seed initial data (Season 1 + emission rates)
4. Start the API server on port 3000

### 4. Verify Installation

```bash
# Health check
curl http://localhost:3000/health

# Get current season
curl http://localhost:3000/seasons/current

# Get points for an address
curl http://localhost:3000/points/0x1111111111111111111111111111111111111111
```

---

## Local Development

### Install Dependencies

```bash
npm install
```

### Database Setup

```bash
# Generate Prisma Client
npm run db:generate

# Run migrations
npm run db:migrate

# Seed database
npm run db:seed
```

### Run Development Server

```bash
npm run dev:watch
```

### Run Tests

```bash
npm test
```

---

## API Endpoints

### Health Check

```http
GET /health
```

**Response:**
```json
{
  "status": "ok",
  "timestamp": "2026-01-18T00:00:00.000Z",
  "service": "points-system-v1"
}
```

### Get Current Season

```http
GET /seasons/current
```

**Response:**
```json
{
  "id": "uuid",
  "seasonNumber": 1,
  "startTime": "2026-01-01T00:00:00.000Z",
  "endTime": null,
  "isActive": true
}
```

### Get Season by Number

```http
GET /seasons/:seasonNumber
```

**Response:**
```json
{
  "id": "uuid",
  "seasonNumber": 1,
  "startTime": "2026-01-01T00:00:00.000Z",
  "endTime": null,
  "isActive": true
}
```

### Get Points for Address

```http
GET /points/:address?seasonId=<optional-uuid>
```

**Example:**
```bash
curl http://localhost:3000/points/0x1111111111111111111111111111111111111111
```

**Response:**
```json
{
  "address": "0x1111111111111111111111111111111111111111",
  "seasonId": "uuid",
  "seasonNumber": 1,
  "totalPoints": "15000.000000000000000000"
}
```

### Get Points Breakdown

```http
GET /points/:address/breakdown?seasonId=<optional-uuid>
```

**Response:**
```json
{
  "address": "0x1111111111111111111111111111111111111111",
  "seasonId": "uuid",
  "seasonNumber": 1,
  "totalPoints": "15000.000000000000000000",
  "breakdown": [
    {
      "productType": "Vault",
      "asset": "USDT",
      "points": "10000.000000000000000000"
    },
    {
      "productType": "Vault",
      "asset": "USDC",
      "points": "5000.000000000000000000"
    }
  ]
}
```

---

## Points Calculation

### Formula (V1)

```
points_earned = effective_balance × emission_rate × days_in_period
```

### Example

User deposits **1000 USDT** in a Vault.
Emission rate: **10 points per USDT per day**.
Snapshot period: **1 day**.

```
points = 1000 × 10 × 1 = 10,000 points
```

### Emission Rates (Default)

| Product Type | Asset    | Rate (points/token/day) |
|--------------|----------|-------------------------|
| Vault        | USDT     | 10                      |
| Vault        | USDC     | 10                      |
| Vault        | OM       | 100                     |
| LST          | stOM     | 150                     |
| LP           | OM-USDT  | 200                     |
| LP           | OM-USDC  | 200                     |

These rates can be configured in `prisma/seed.ts`.

---

## Database Schema

See [DESIGN.md](DESIGN.md) for complete schema documentation.

**Core Tables:**
- `seasons` - Discrete time periods
- `snapshots` - Balance captures at fixed intervals
- `snapshot_balances` - User balances per snapshot
- `emission_rates` - Points per token per day
- `points_ledger` - **Single source of truth** (append-only)

### Key Invariants

1. **Ledger is append-only**: No UPDATE or DELETE operations
2. **Snapshots are immutable**: Once completed, cannot be changed
3. **Seasons are isolated**: Points from Season N do not affect Season N+1
4. **Determinism**: Same snapshot → Same points (always)
5. **Auditability**: All calculations stored with basis

---

## Snapshot Scheduler

Snapshots run **daily at 00:00 UTC** (configurable via `SNAPSHOT_CRON_SCHEDULE`).

**Process:**
1. Cron triggers at 00:00 UTC
2. Snapshot Engine fetches balances for previous day (00:00 - 23:59:59.999)
3. Balances are written to `snapshot_balances` (immutable)
4. Points Calculator computes points using emission rates
5. Points are written to `points_ledger` (append-only)

**Manual Trigger:**

You can manually trigger a snapshot for testing:

```typescript
import snapshotScheduler from './scheduler/SnapshotScheduler';

await snapshotScheduler.runDailySnapshot();
```

---

## Data Source Integration

**V1 uses a mock data source** for demonstration. In production, replace with a real implementation.

### Implementing a Real Data Source

1. Create a class that implements `IDataSource`:

```typescript
import { IDataSource, BalanceData } from './interfaces/DataSource';

export class SubgraphDataSource implements IDataSource {
  async fetchBalances(intervalStart: Date, intervalEnd: Date): Promise<BalanceData[]> {
    // Query your blockchain indexer / subgraph
    // Return array of { address, productType, asset, effectiveBalance }
  }

  async healthCheck(): Promise<boolean> {
    // Ping your data source
    return true;
  }
}
```

2. Replace the mock in `src/scheduler/SnapshotScheduler.ts`:

```typescript
import { SubgraphDataSource } from '../services/SubgraphDataSource';

const dataSource = new SubgraphDataSource();
const scheduler = new SnapshotScheduler(new SnapshotEngine(dataSource));
```

---

## Season Management

### Start New Season

```typescript
import seasonManager from './services/SeasonManager';

const season = await seasonManager.startNewSeason(
  2, // Season number
  new Date('2026-07-01T00:00:00Z') // Start time
);
```

### End Current Season

```typescript
const endedSeason = await seasonManager.endCurrentSeason(
  new Date('2026-12-31T23:59:59Z') // End time
);
```

---

## Deployment

### Production Checklist

- [ ] PostgreSQL database is running and accessible
- [ ] Environment variables are configured correctly
- [ ] Database migrations have been applied
- [ ] Initial season has been created
- [ ] Emission rates have been seeded
- [ ] Cron job is scheduled (00:00 UTC)
- [ ] API health endpoint is responding
- [ ] Logs are being written to `/app/logs`
- [ ] Backup strategy is in place

### Environment Variables (Production)

```env
DATABASE_URL="postgresql://user:password@host:5432/points_system?schema=public"
PORT=3000
NODE_ENV=production
SNAPSHOT_CRON_SCHEDULE="0 0 * * *"
DATA_SOURCE_URL="https://your-indexer.com/graphql"
LOG_LEVEL=info
DEFAULT_SEASON_START="2026-01-01T00:00:00Z"
```

### Docker Deployment

```bash
# Build image
docker build -t points-system-v1 .

# Run with docker-compose
docker-compose -f docker-compose.yml up -d
```

---

## Monitoring & Observability

### Logs

Logs are written to:
- Console (stdout)
- `logs/combined.log` (all logs)
- `logs/error.log` (errors only)

**Log Levels:** error, warn, info, debug, verbose

### Health Check

```bash
curl http://localhost:3000/health
```

### Database Queries

Use Prisma Studio for visual database exploration:

```bash
npm run db:studio
```

---

## Testing

### Run All Tests

```bash
npm test
```

### Run Tests with Coverage

```bash
npm run test:coverage
```

### Run Tests in Watch Mode

```bash
npm run test:watch
```

---

## Troubleshooting

### Database Connection Failed

**Error:** `Error: Can't reach database server`

**Solution:**
1. Ensure PostgreSQL is running
2. Verify `DATABASE_URL` in `.env`
3. Check firewall/network settings

### Snapshot Failed

**Error:** `Snapshot creation failed`

**Solution:**
1. Check data source is reachable (`DATA_SOURCE_URL`)
2. Review logs in `logs/error.log`
3. Retry failed snapshot manually

### Points Don't Match Expected

**Issue:** Calculated points differ from expected

**Solution:**
1. Verify emission rates in `emission_rates` table
2. Check snapshot balances in `snapshot_balances` table
3. Review `calculation_basis` in `points_ledger` for transparency

---

## Project Structure

```
points-system-for-dapps/
├── prisma/
│   ├── schema.prisma          # Database schema
│   └── seed.ts                # Seed data (Season 1 + emission rates)
├── src/
│   ├── api/
│   │   ├── routes.ts          # API endpoints
│   │   └── server.ts          # Express server setup
│   ├── interfaces/
│   │   └── DataSource.ts      # Data source interface
│   ├── scheduler/
│   │   └── SnapshotScheduler.ts  # Cron scheduler
│   ├── services/
│   │   ├── SeasonManager.ts   # Season lifecycle management
│   │   ├── SnapshotEngine.ts  # Balance snapshot creation
│   │   ├── PointsCalculator.ts # Points calculation logic
│   │   └── MockDataSource.ts  # Mock data source (replace in prod)
│   ├── utils/
│   │   ├── config.ts          # Environment configuration
│   │   ├── logger.ts          # Winston logger
│   │   ├── prisma.ts          # Prisma client singleton
│   │   ├── validation.ts      # Input validation utilities
│   │   └── errors.ts          # Custom error classes
│   └── index.ts               # Main entry point
├── logs/                      # Log files (created at runtime)
├── docker-compose.yml         # Docker orchestration
├── Dockerfile                 # Container image
├── DESIGN.md                  # Full design documentation
├── .env.example               # Environment template
├── package.json               # Dependencies
├── tsconfig.json              # TypeScript config
└── README.md                  # This file
```

---

## Implementation Review Checklist

Before deploying, verify:

- [x] No V2/V3 features present
- [x] Emission rates are explicit constants
- [x] No unbounded multipliers or compounding
- [x] Snapshots are immutable
- [x] Ledger is append-only
- [x] Seasons have clean boundaries
- [x] API totals reconcile with ledger
- [x] All calculations are deterministic
- [x] Can explain total points outstanding
- [x] System can run unchanged for 12 months

---

## Future Roadmap

### V2 — Transparency & Engagement
- Leaderboard
- Points history UI
- Rank visibility

### V3 — Gamification & Growth
- Team competitions
- Seasonal bonuses
- Referrals
- Social activation

**Important:** All future features must flow through the same append-only ledger.

---

## Support

For issues or questions:
- Open an issue on GitHub
- Review logs in `logs/error.log`
- Check Prisma Studio for database state: `npm run db:studio`

---

## License

MIT

---

## Golden Rule

**If a feature cannot be expressed as a ledger entry, it does not exist.**
