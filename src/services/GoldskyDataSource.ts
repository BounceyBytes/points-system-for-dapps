import { IDataSource, BalanceData } from '../interfaces/DataSource';
import { ProductType } from '@prisma/client';
import logger from '../utils/logger';
import config from '../utils/config';

/**
 * GoldskyDataSource
 *
 * Fetches user balance data from Goldsky subgraph for MANTRA Chain.
 * Goldsky provides high-performance indexing with GraphQL APIs.
 *
 * Configuration:
 * - GOLDSKY_SUBGRAPH_URL: Your Goldsky subgraph endpoint
 * - GOLDSKY_API_KEY: Your Goldsky API key (optional, for private subgraphs)
 *
 * Subgraph Schema Requirements:
 * The subgraph must expose the following entities:
 * - VaultPosition: { id, user, vault { asset }, balance }
 * - LPPosition: { id, user, pool { token0, token1 }, balance }
 * - LSTPosition: { id, user, token { symbol }, balance }
 *
 * For public subgraphs on MANTRA Chain:
 * URL format: https://api.goldsky.com/api/public/project_<project-id>/subgraphs/<subgraph-name>/<version>/gn
 */
export class GoldskyDataSource implements IDataSource {
  private readonly subgraphUrl: string;
  private readonly apiKey?: string;
  private readonly maxRetries = 3;
  private readonly retryDelay = 2000; // 2 seconds

  constructor() {
    this.subgraphUrl = config.goldsky.subgraphUrl;
    this.apiKey = config.goldsky.apiKey;

    logger.info('GoldskyDataSource initialized', {
      subgraphUrl: this.subgraphUrl,
      hasApiKey: !!this.apiKey,
    });
  }

  /**
   * Fetch user balances from Goldsky subgraph
   *
   * Strategy:
   * 1. Query subgraph for all positions at the snapshot time
   * 2. Filter positions with balance > 0
   * 3. Transform to BalanceData format
   * 4. Deduplicate if needed
   */
  async fetchBalances(intervalStart: Date, intervalEnd: Date): Promise<BalanceData[]> {
    logger.info('Fetching balances from Goldsky subgraph', {
      intervalStart: intervalStart.toISOString(),
      intervalEnd: intervalEnd.toISOString(),
    });

    const timestampStart = Math.floor(intervalStart.getTime() / 1000);
    const timestampEnd = Math.floor(intervalEnd.getTime() / 1000);

    try {
      // Fetch all product types in parallel for performance
      const [vaultBalances, lpBalances, lstBalances] = await Promise.all([
        this.fetchVaultBalances(timestampEnd),
        this.fetchLPBalances(timestampEnd),
        this.fetchLSTBalances(timestampEnd),
      ]);

      const allBalances = [...vaultBalances, ...lpBalances, ...lstBalances];

      logger.info('Successfully fetched balances from Goldsky', {
        total: allBalances.length,
        vaults: vaultBalances.length,
        lps: lpBalances.length,
        lsts: lstBalances.length,
      });

      return allBalances;
    } catch (error) {
      logger.error('Failed to fetch balances from Goldsky', {
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      });
      throw error;
    }
  }

  /**
   * Fetch vault positions from subgraph
   */
  private async fetchVaultBalances(timestamp: number): Promise<BalanceData[]> {
    const query = `
      query GetVaultBalances($timestamp: Int!, $minBalance: BigInt!) {
        vaultPositions(
          first: 1000,
          where: {
            balance_gt: $minBalance
          },
          orderBy: balance,
          orderDirection: desc
        ) {
          id
          user
          vault {
            id
            asset
          }
          balance
          lastUpdated
        }
      }
    `;

    const variables = {
      timestamp,
      minBalance: '0',
    };

    const data = await this.executeQuery<{
      vaultPositions: Array<{
        user: string;
        vault: { asset: string };
        balance: string;
      }>;
    }>(query, variables);

    return data.vaultPositions.map((position) => ({
      address: position.user.toLowerCase(),
      productType: ProductType.Vault,
      asset: position.vault.asset,
      effectiveBalance: this.formatBalance(position.balance),
    }));
  }

  /**
   * Fetch LP positions from subgraph
   */
  private async fetchLPBalances(timestamp: number): Promise<BalanceData[]> {
    const query = `
      query GetLPBalances($timestamp: Int!, $minBalance: BigInt!) {
        lpPositions(
          first: 1000,
          where: {
            balance_gt: $minBalance
          },
          orderBy: balance,
          orderDirection: desc
        ) {
          id
          user
          pool {
            id
            token0 {
              symbol
            }
            token1 {
              symbol
            }
          }
          balance
          lastUpdated
        }
      }
    `;

    const variables = {
      timestamp,
      minBalance: '0',
    };

    const data = await this.executeQuery<{
      lpPositions: Array<{
        user: string;
        pool: {
          token0: { symbol: string };
          token1: { symbol: string };
        };
        balance: string;
      }>;
    }>(query, variables);

    return data.lpPositions.map((position) => {
      const pairName = `${position.pool.token0.symbol}-${position.pool.token1.symbol}`;
      return {
        address: position.user.toLowerCase(),
        productType: ProductType.LP,
        asset: pairName,
        effectiveBalance: this.formatBalance(position.balance),
      };
    });
  }

  /**
   * Fetch LST positions from subgraph
   */
  private async fetchLSTBalances(timestamp: number): Promise<BalanceData[]> {
    const query = `
      query GetLSTBalances($timestamp: Int!, $minBalance: BigInt!) {
        lstPositions(
          first: 1000,
          where: {
            balance_gt: $minBalance
          },
          orderBy: balance,
          orderDirection: desc
        ) {
          id
          user
          token {
            id
            symbol
          }
          balance
          lastUpdated
        }
      }
    `;

    const variables = {
      timestamp,
      minBalance: '0',
    };

    const data = await this.executeQuery<{
      lstPositions: Array<{
        user: string;
        token: { symbol: string };
        balance: string;
      }>;
    }>(query, variables);

    return data.lstPositions.map((position) => ({
      address: position.user.toLowerCase(),
      productType: ProductType.LST,
      asset: position.token.symbol,
      effectiveBalance: this.formatBalance(position.balance),
    }));
  }

  /**
   * Execute GraphQL query with retry logic
   */
  private async executeQuery<T>(
    query: string,
    variables: Record<string, unknown>
  ): Promise<T> {
    let lastError: Error | null = null;

    for (let attempt = 0; attempt < this.maxRetries; attempt++) {
      try {
        const headers: Record<string, string> = {
          'Content-Type': 'application/json',
        };

        // Add API key if configured
        if (this.apiKey) {
          headers['Authorization'] = `Bearer ${this.apiKey}`;
        }

        logger.debug('Executing Goldsky query', {
          attempt: attempt + 1,
          maxRetries: this.maxRetries,
        });

        const response = await fetch(this.subgraphUrl, {
          method: 'POST',
          headers,
          body: JSON.stringify({ query, variables }),
        });

        if (!response.ok) {
          throw new Error(
            `Goldsky API error: ${response.status} ${response.statusText}`
          );
        }

        const result = await response.json();

        if (result.errors) {
          throw new Error(
            `GraphQL errors: ${JSON.stringify(result.errors)}`
          );
        }

        return result.data as T;
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));

        logger.warn('Goldsky query attempt failed', {
          attempt: attempt + 1,
          error: lastError.message,
        });

        // Wait before retrying (exponential backoff)
        if (attempt < this.maxRetries - 1) {
          const delay = this.retryDelay * Math.pow(2, attempt);
          await new Promise((resolve) => setTimeout(resolve, delay));
        }
      }
    }

    throw new Error(
      `Failed to query Goldsky after ${this.maxRetries} attempts: ${lastError?.message}`
    );
  }

  /**
   * Format balance from BigInt string to decimal string (18 decimals)
   */
  private formatBalance(balance: string): string {
    // Assume balance is in wei (18 decimals)
    // Convert to decimal string
    const balanceBigInt = BigInt(balance);
    const divisor = BigInt(10 ** 18);

    const wholePart = balanceBigInt / divisor;
    const fractionalPart = balanceBigInt % divisor;

    // Pad fractional part to 18 digits
    const fractionalStr = fractionalPart.toString().padStart(18, '0');

    return `${wholePart}.${fractionalStr}`;
  }

  /**
   * Health check: Verify subgraph is reachable and responsive
   */
  async healthCheck(): Promise<boolean> {
    try {
      const query = `
        query {
          _meta {
            block {
              number
              timestamp
            }
            deployment
            hasIndexingErrors
          }
        }
      `;

      const data = await this.executeQuery<{
        _meta: {
          block: { number: number; timestamp: number };
          hasIndexingErrors: boolean;
        };
      }>(query, {});

      const isHealthy = !data._meta.hasIndexingErrors;

      logger.info('Goldsky health check', {
        isHealthy,
        blockNumber: data._meta.block.number,
        blockTimestamp: data._meta.block.timestamp,
      });

      return isHealthy;
    } catch (error) {
      logger.error('Goldsky health check failed', {
        error: error instanceof Error ? error.message : String(error),
      });
      return false;
    }
  }
}

export default new GoldskyDataSource();
