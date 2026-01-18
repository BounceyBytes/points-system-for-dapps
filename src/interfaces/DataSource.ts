import { ProductType } from '@prisma/client';

/**
 * Balance data returned from data source
 */
export interface BalanceData {
  address: string;
  productType: ProductType;
  asset: string;
  effectiveBalance: string; // Decimal as string
}

/**
 * DataSource interface
 *
 * Defines the contract for fetching user balance data from external sources
 * (e.g., blockchain indexer, subgraph, on-chain RPC calls)
 *
 * Implementations must:
 * - Return deterministic data for the same time period
 * - Handle network errors with retries
 * - Validate data before returning
 */
export interface IDataSource {
  /**
   * Fetch all user balances for a given time period
   *
   * @param intervalStart - Start of the time period
   * @param intervalEnd - End of the time period
   * @returns Array of balance data
   */
  fetchBalances(intervalStart: Date, intervalEnd: Date): Promise<BalanceData[]>;

  /**
   * Health check for the data source
   * @returns true if data source is reachable and healthy
   */
  healthCheck(): Promise<boolean>;
}
