# Goldsky Subgraph Integration Guide

This guide explains how to integrate the Points System V1 with Goldsky for MANTRA Chain.

## Overview

Goldsky provides high-performance blockchain indexing infrastructure with instant, queryable GraphQL APIs. This integration enables the Points System to fetch real-time user balance data from MANTRA Chain.

**Official Resources:**
- [Goldsky for MANTRA Chain](https://goldsky.com/chains/mantra)
- [Goldsky Documentation](https://docs.goldsky.com/)
- [MANTRA x Goldsky Announcement](https://mantrachain.io/resources/announcements/mantra-x-goldsky)

---

## Prerequisites

1. **Goldsky Account**: Sign up at [app.goldsky.com](https://app.goldsky.com)
2. **MANTRA Chain Contracts**: Your deployed Vault/LP/LST contracts
3. **Subgraph Definition**: GraphQL schema for your contracts

---

## Step 1: Create Your Subgraph

### 1.1 Install Goldsky CLI

```bash
npm install -g @goldsky/cli
goldsky login
```

### 1.2 Define Subgraph Schema

Create `subgraph/schema.graphql`:

```graphql
type Vault @entity {
  id: ID!
  asset: String!
  totalSupply: BigInt!
  positions: [VaultPosition!]! @derivedFrom(field: "vault")
}

type VaultPosition @entity {
  id: ID!
  user: Bytes!
  vault: Vault!
  balance: BigInt!
  lastUpdated: BigInt!
}

type LiquidityPool @entity {
  id: ID!
  token0: Token!
  token1: Token!
  totalSupply: BigInt!
  positions: [LPPosition!]! @derivedFrom(field: "pool")
}

type LPPosition @entity {
  id: ID!
  user: Bytes!
  pool: LiquidityPool!
  balance: BigInt!
  lastUpdated: BigInt!
}

type LiquidStakingToken @entity {
  id: ID!
  symbol: String!
  totalSupply: BigInt!
  positions: [LSTPosition!]! @derivedFrom(field: "token")
}

type LSTPosition @entity {
  id: ID!
  user: Bytes!
  token: LiquidStakingToken!
  balance: BigInt!
  lastUpdated: BigInt!
}

type Token @entity {
  id: ID!
  symbol: String!
  name: String!
  decimals: Int!
}
```

### 1.3 Create Subgraph Manifest

Create `subgraph/subgraph.yaml`:

```yaml
specVersion: 0.0.5
schema:
  file: ./schema.graphql
dataSources:
  # Vault Data Source
  - kind: ethereum/contract
    name: FluxtraVaultUSDT
    network: mantra
    source:
      address: "0x..." # Your USDT Vault contract address
      abi: Vault
      startBlock: 1000000
    mapping:
      kind: ethereum/events
      apiVersion: 0.0.7
      language: wasm/assemblyscript
      entities:
        - Vault
        - VaultPosition
      abis:
        - name: Vault
          file: ./abis/Vault.json
      eventHandlers:
        - event: Deposit(indexed address,uint256)
          handler: handleDeposit
        - event: Withdraw(indexed address,uint256)
          handler: handleWithdraw
      file: ./src/vault.ts

  # Add more data sources for other vaults, LPs, LSTs...

  - kind: ethereum/contract
    name: FluxtraLPOMUSDT
    network: mantra
    source:
      address: "0x..." # Your OM-USDT LP contract address
      abi: LiquidityPool
      startBlock: 1000000
    mapping:
      kind: ethereum/events
      apiVersion: 0.0.7
      language: wasm/assemblyscript
      entities:
        - LiquidityPool
        - LPPosition
      abis:
        - name: LiquidityPool
          file: ./abis/LiquidityPool.json
      eventHandlers:
        - event: AddLiquidity(indexed address,uint256)
          handler: handleAddLiquidity
        - event: RemoveLiquidity(indexed address,uint256)
          handler: handleRemoveLiquidity
      file: ./src/lp.ts

  - kind: ethereum/contract
    name: FluxtraLSTstOM
    network: mantra
    source:
      address: "0x..." # Your stOM LST contract address
      abi: LiquidStakingToken
      startBlock: 1000000
    mapping:
      kind: ethereum/events
      apiVersion: 0.0.7
      language: wasm/assemblyscript
      entities:
        - LiquidStakingToken
        - LSTPosition
      abis:
        - name: LiquidStakingToken
          file: ./abis/LiquidStakingToken.json
      eventHandlers:
        - event: Stake(indexed address,uint256)
          handler: handleStake
        - event: Unstake(indexed address,uint256)
          handler: handleUnstake
      file: ./src/lst.ts
```

### 1.4 Implement Mapping Handlers

Create `subgraph/src/vault.ts`:

```typescript
import { Deposit, Withdraw } from "../generated/FluxtraVaultUSDT/Vault";
import { Vault, VaultPosition } from "../generated/schema";
import { BigInt } from "@graphprotocol/graph-ts";

export function handleDeposit(event: Deposit): void {
  let vault = Vault.load(event.address.toHex());
  if (vault == null) {
    vault = new Vault(event.address.toHex());
    vault.asset = "USDT";
    vault.totalSupply = BigInt.fromI32(0);
  }

  // Create or update position
  let positionId = event.address.toHex() + "-" + event.params.user.toHex();
  let position = VaultPosition.load(positionId);
  if (position == null) {
    position = new VaultPosition(positionId);
    position.user = event.params.user;
    position.vault = vault.id;
    position.balance = BigInt.fromI32(0);
  }

  position.balance = position.balance.plus(event.params.amount);
  position.lastUpdated = event.block.timestamp;
  position.save();

  vault.totalSupply = vault.totalSupply.plus(event.params.amount);
  vault.save();
}

export function handleWithdraw(event: Withdraw): void {
  let positionId = event.address.toHex() + "-" + event.params.user.toHex();
  let position = VaultPosition.load(positionId);
  if (position != null) {
    position.balance = position.balance.minus(event.params.amount);
    position.lastUpdated = event.block.timestamp;
    position.save();
  }

  let vault = Vault.load(event.address.toHex());
  if (vault != null) {
    vault.totalSupply = vault.totalSupply.minus(event.params.amount);
    vault.save();
  }
}
```

Similar handlers for `lp.ts` and `lst.ts`.

---

## Step 2: Deploy Subgraph to Goldsky

### 2.1 Build Subgraph

```bash
cd subgraph
npm install
graph codegen
graph build
```

### 2.2 Deploy to Goldsky

```bash
goldsky subgraph deploy fluxtra-mantra/1.0.0 \
  --path ./build \
  --network mantra
```

### 2.3 Get Your Subgraph URL

After deployment, Goldsky will provide a URL:

```
https://api.goldsky.com/api/public/project_<PROJECT_ID>/subgraphs/fluxtra-mantra/1.0.0/gn
```

Copy this URL - you'll need it for configuration.

---

## Step 3: Configure Points System

### 3.1 Update Environment Variables

Edit `.env`:

```env
# Goldsky Configuration
GOLDSKY_SUBGRAPH_URL="https://api.goldsky.com/api/public/project_<YOUR_PROJECT_ID>/subgraphs/fluxtra-mantra/1.0.0/gn"
GOLDSKY_API_KEY=""  # Leave empty for public subgraphs
```

### 3.2 Update Emission Rates

Edit `prisma/seed.ts` to match your assets:

```typescript
const emissionRates = [
  {
    productType: ProductType.Vault,
    asset: 'USDT',  // Must match subgraph asset names
    ratePerTokenPerDay: new Decimal(10),
  },
  {
    productType: ProductType.LP,
    asset: 'OM-USDT',  // Must match subgraph pool naming
    ratePerTokenPerDay: new Decimal(200),
  },
  {
    productType: ProductType.LST,
    asset: 'stOM',  // Must match subgraph token symbols
    ratePerTokenPerDay: new Decimal(150),
  },
];
```

---

## Step 4: Test Integration

### 4.1 Test Subgraph Directly

```bash
curl -X POST \
  -H "Content-Type: application/json" \
  -d '{"query":"{ _meta { block { number timestamp } hasIndexingErrors } }"}' \
  https://api.goldsky.com/api/public/project_<YOUR_PROJECT_ID>/subgraphs/fluxtra-mantra/1.0.0/gn
```

Expected response:
```json
{
  "data": {
    "_meta": {
      "block": {
        "number": 12345678,
        "timestamp": 1735689600
      },
      "hasIndexingErrors": false
    }
  }
}
```

### 4.2 Test Points System Integration

```typescript
import { GoldskyDataSource } from './src/services/GoldskyDataSource';

const dataSource = new GoldskyDataSource();

// Test health check
const isHealthy = await dataSource.healthCheck();
console.log('Goldsky health:', isHealthy);

// Test balance fetching
const balances = await dataSource.fetchBalances(
  new Date('2026-01-17T00:00:00Z'),
  new Date('2026-01-17T23:59:59Z')
);
console.log('Fetched balances:', balances.length);
```

### 4.3 Run Manual Snapshot

```bash
npm run dev

# In another terminal
node -e "
const scheduler = require('./dist/scheduler/SnapshotScheduler').default;
scheduler.runDailySnapshot().then(() => console.log('Done'));
"
```

---

## Step 5: Production Deployment

### 5.1 Verify Subgraph is Synced

```bash
goldsky subgraph status fluxtra-mantra/1.0.0
```

Look for:
- `synced: true`
- `health: healthy`
- Latest block near chain head

### 5.2 Deploy Points System

```bash
# Update environment
export GOLDSKY_SUBGRAPH_URL="https://api.goldsky.com/api/public/project_<YOUR_PROJECT_ID>/subgraphs/fluxtra-mantra/1.0.0/gn"

# Deploy with Docker
docker-compose up -d

# Verify
curl http://localhost:3000/health
```

### 5.3 Monitor First Snapshot

Check logs at 00:00 UTC:

```bash
docker-compose logs -f api
```

Expected log flow:
```
[points-system-v1] Starting daily snapshot job
[points-system-v1] Fetching balances from Goldsky subgraph
[points-system-v1] Successfully fetched balances from Goldsky { total: 150, vaults: 100, lps: 30, lsts: 20 }
[points-system-v1] Snapshot created successfully
[points-system-v1] Calculating points for snapshot
[points-system-v1] Daily snapshot job completed successfully
```

---

## Troubleshooting

### Subgraph Not Syncing

**Problem:** Subgraph deployment is stuck or not syncing.

**Solution:**
```bash
# Check subgraph status
goldsky subgraph status fluxtra-mantra/1.0.0

# View logs
goldsky subgraph logs fluxtra-mantra/1.0.0

# Common fixes:
# - Verify contract addresses are correct
# - Check startBlock is not too early
# - Ensure ABIs match deployed contracts
```

### No Balances Returned

**Problem:** `fetchBalances()` returns empty array.

**Solution:**
1. Verify subgraph has indexed data:
   ```graphql
   query {
     vaultPositions(first: 5) {
       id
       user
       balance
     }
   }
   ```

2. Check query filters match your data:
   ```typescript
   // In GoldskyDataSource.ts, adjust queries if needed
   where: { balance_gt: "0" }  // May need to adjust threshold
   ```

3. Verify asset names match between subgraph and emission rates

### Authentication Errors

**Problem:** `401 Unauthorized` or `403 Forbidden`

**Solution:**
- For public subgraphs: Remove `GOLDSKY_API_KEY` from `.env`
- For private subgraphs: Get API key from Goldsky dashboard:
  ```bash
  goldsky auth status
  ```

### Slow Query Performance

**Problem:** Balance fetching takes >30 seconds

**Solution:**
1. Add pagination to queries:
   ```typescript
   // Fetch in batches of 1000
   first: 1000,
   skip: offset
   ```

2. Use indexed fields in `where` clauses
3. Contact Goldsky support to optimize indexes

---

## Query Examples

### Get All Active Vault Positions

```graphql
query {
  vaultPositions(
    where: { balance_gt: "0" }
    orderBy: balance
    orderDirection: desc
    first: 100
  ) {
    user
    vault {
      asset
    }
    balance
  }
}
```

### Get User's Total Holdings

```graphql
query GetUserHoldings($user: Bytes!) {
  vaultPositions(where: { user: $user }) {
    vault { asset }
    balance
  }
  lpPositions(where: { user: $user }) {
    pool { token0 { symbol } token1 { symbol } }
    balance
  }
  lstPositions(where: { user: $user }) {
    token { symbol }
    balance
  }
}
```

### Get Historical Snapshot

```graphql
query GetHistoricalBalances($blockNumber: Int!) {
  vaultPositions(
    block: { number: $blockNumber }
    where: { balance_gt: "0" }
  ) {
    user
    vault { asset }
    balance
  }
}
```

---

## Advanced Configuration

### Multiple Subgraphs

If you have separate subgraphs for different product types:

```typescript
// src/services/MultiGoldskyDataSource.ts
export class MultiGoldskyDataSource implements IDataSource {
  private vaultSubgraph: GoldskyDataSource;
  private lpSubgraph: GoldskyDataSource;
  private lstSubgraph: GoldskyDataSource;

  async fetchBalances(start: Date, end: Date): Promise<BalanceData[]> {
    const [vaults, lps, lsts] = await Promise.all([
      this.vaultSubgraph.fetchBalances(start, end),
      this.lpSubgraph.fetchBalances(start, end),
      this.lstSubgraph.fetchBalances(start, end),
    ]);
    return [...vaults, ...lps, ...lsts];
  }
}
```

### Custom Balance Calculation

For complex LP tokens (e.g., Uniswap V3):

```typescript
private async fetchLPBalances(timestamp: number): Promise<BalanceData[]> {
  // Query positions
  const positions = await this.executeQuery(...);

  // Calculate effective balance based on position in range
  return positions.map(p => ({
    address: p.user,
    productType: ProductType.LP,
    asset: p.pool.pair,
    effectiveBalance: this.calculateEffectiveBalance(p),
  }));
}

private calculateEffectiveBalance(position: any): string {
  // Custom logic for concentrated liquidity
  // e.g., only count in-range liquidity
  return position.liquidity; // Simplified
}
```

---

## Maintenance

### Updating Subgraph

When you need to update your subgraph:

```bash
# Deploy new version
goldsky subgraph deploy fluxtra-mantra/1.1.0 --path ./build

# Update environment variable
GOLDSKY_SUBGRAPH_URL="...fluxtra-mantra/1.1.0/gn"

# Restart Points System
docker-compose restart api
```

### Monitoring

Set up alerts for:
- Subgraph indexing lag > 10 blocks
- Query response time > 5 seconds
- Snapshot failures

```bash
# Check indexing lag
curl -s "$GOLDSKY_SUBGRAPH_URL" \
  -d '{"query":"{ _meta { block { number } } }"}' \
  | jq '.data._meta.block.number'
```

---

## Cost Optimization

Goldsky offers different pricing tiers. To optimize costs:

1. **Use pagination**: Fetch only what you need
2. **Cache responses**: If data doesn't change between snapshots
3. **Use webhooks**: React to events instead of polling
4. **Batch queries**: Combine multiple queries into one

---

## Support

- **Goldsky Docs**: [docs.goldsky.com](https://docs.goldsky.com)
- **Goldsky Discord**: Join for technical support
- **MANTRA Chain Docs**: [docs.mantrachain.io](https://docs.mantrachain.io)

---

## Summary

You've successfully integrated Goldsky with the Points System! The system will now:

1. **Query Goldsky subgraph** daily at 00:00 UTC
2. **Fetch all user balances** for Vaults, LPs, and LSTs
3. **Calculate points** using configured emission rates
4. **Write to ledger** in an append-only, auditable manner

**Next Steps:**
- Monitor first few snapshots for correctness
- Adjust emission rates based on TVL goals
- Set up production monitoring and alerts
