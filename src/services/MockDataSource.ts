import { ProductType } from '@prisma/client';
import { IDataSource, BalanceData } from '../interfaces/DataSource';
import logger from '../utils/logger';

/**
 * MockDataSource
 *
 * A mock implementation of IDataSource for testing and development.
 * Returns deterministic mock data.
 *
 * In production, replace this with a real implementation that fetches
 * data from a blockchain indexer, subgraph, or on-chain RPC calls.
 */
export class MockDataSource implements IDataSource {
  async fetchBalances(_intervalStart: Date, _intervalEnd: Date): Promise<BalanceData[]> {
    logger.info('MockDataSource: Fetching balances', {
      intervalStart: _intervalStart,
      intervalEnd: _intervalEnd,
    });

    // Return mock data for demonstration
    // In production, this would query a real data source
    const mockBalances: BalanceData[] = [
      // Mock user 1
      {
        address: '0x1111111111111111111111111111111111111111',
        productType: ProductType.Vault,
        asset: 'USDT',
        effectiveBalance: '1000.000000000000000000',
      },
      {
        address: '0x1111111111111111111111111111111111111111',
        productType: ProductType.Vault,
        asset: 'USDC',
        effectiveBalance: '500.000000000000000000',
      },

      // Mock user 2
      {
        address: '0x2222222222222222222222222222222222222222',
        productType: ProductType.LST,
        asset: 'stOM',
        effectiveBalance: '10.000000000000000000',
      },

      // Mock user 3
      {
        address: '0x3333333333333333333333333333333333333333',
        productType: ProductType.LP,
        asset: 'OM-USDT',
        effectiveBalance: '5.000000000000000000',
      },
      {
        address: '0x3333333333333333333333333333333333333333',
        productType: ProductType.Vault,
        asset: 'OM',
        effectiveBalance: '100.000000000000000000',
      },
    ];

    logger.info('MockDataSource: Returning mock balances', {
      count: mockBalances.length,
    });

    return mockBalances;
  }

  async healthCheck(): Promise<boolean> {
    logger.debug('MockDataSource: Health check');
    return true;
  }
}

export default new MockDataSource();
