import { Snapshot, SnapshotStatus, SnapshotBalance } from '@prisma/client';
import prisma from '../utils/prisma';
import logger from '../utils/logger';
import { SnapshotError } from '../utils/errors';
import { IDataSource } from '../interfaces/DataSource';
import seasonManager from './SeasonManager';
import { normalizeAddress } from '../utils/validation';
import Decimal from 'decimal.js';

/**
 * SnapshotEngine
 *
 * Responsibilities:
 * - Capture user balances at fixed checkpoints
 * - Ensure snapshots are immutable once completed
 * - Handle errors gracefully (fail loudly, no interpolation)
 *
 * Invariants:
 * - Snapshots are idempotent (re-running produces identical results)
 * - Snapshots are atomic (all balances written or none)
 * - Fixed cadence (daily at 00:00 UTC)
 * - No overlapping intervals within a season
 */
export class SnapshotEngine {
  private dataSource: IDataSource;

  constructor(dataSource: IDataSource) {
    this.dataSource = dataSource;
  }

  /**
   * Create a new snapshot for the given time period
   *
   * This is the main entry point for the snapshot process.
   * It should be called by the cron scheduler daily at 00:00 UTC.
   *
   * @param intervalStart - Start of the snapshot period
   * @param intervalEnd - End of the snapshot period
   * @returns Created snapshot with balances
   */
  async createSnapshot(intervalStart: Date, intervalEnd: Date): Promise<Snapshot> {
    logger.info('Creating snapshot', { intervalStart, intervalEnd });

    // Validate interval
    if (intervalEnd <= intervalStart) {
      throw new SnapshotError('Interval end must be after interval start');
    }

    // Get active season
    const season = await seasonManager.validateSnapshotSeason(intervalEnd);

    // Check for existing snapshot in this interval
    const existingSnapshot = await prisma.snapshot.findFirst({
      where: {
        seasonId: season.id,
        intervalStart,
        intervalEnd,
      },
    });

    if (existingSnapshot) {
      if (existingSnapshot.status === SnapshotStatus.completed) {
        logger.info('Snapshot already exists and is completed', {
          snapshotId: existingSnapshot.id,
        });
        return existingSnapshot;
      }

      // If failed, we can retry
      if (existingSnapshot.status === SnapshotStatus.failed) {
        logger.warn('Retrying failed snapshot', { snapshotId: existingSnapshot.id });
        return await this.retrySnapshot(existingSnapshot.id);
      }

      // If pending, mark as failed and retry
      logger.warn('Found pending snapshot, marking as failed and retrying', {
        snapshotId: existingSnapshot.id,
      });
      await prisma.snapshot.update({
        where: { id: existingSnapshot.id },
        data: { status: SnapshotStatus.failed },
      });
    }

    // Create new snapshot record
    const snapshot = await prisma.snapshot.create({
      data: {
        seasonId: season.id,
        snapshotTime: new Date(),
        intervalStart,
        intervalEnd,
        status: SnapshotStatus.pending,
      },
    });

    try {
      // Fetch balance data from data source
      const balances = await this.dataSource.fetchBalances(intervalStart, intervalEnd);

      if (balances.length === 0) {
        logger.warn('No balances returned from data source', { snapshotId: snapshot.id });
        // This might be legitimate (no users), so we don't fail
      }

      // Validate and normalize balances
      const validatedBalances = this.validateBalances(balances);

      // Write balances to database (atomic transaction)
      await this.writeBalances(snapshot.id, validatedBalances);

      // Mark snapshot as completed
      const completedSnapshot = await prisma.snapshot.update({
        where: { id: snapshot.id },
        data: {
          status: SnapshotStatus.completed,
          completedAt: new Date(),
        },
      });

      logger.info('Snapshot created successfully', {
        snapshotId: completedSnapshot.id,
        balanceCount: balances.length,
      });

      return completedSnapshot;
    } catch (error) {
      // Mark snapshot as failed
      await prisma.snapshot.update({
        where: { id: snapshot.id },
        data: { status: SnapshotStatus.failed },
      });

      logger.error('Snapshot creation failed', {
        snapshotId: snapshot.id,
        error: error instanceof Error ? error.message : String(error),
      });

      throw new SnapshotError(
        `Snapshot creation failed: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /**
   * Retry a failed snapshot
   */
  private async retrySnapshot(snapshotId: string): Promise<Snapshot> {
    const snapshot = await prisma.snapshot.findUnique({
      where: { id: snapshotId },
    });

    if (!snapshot) {
      throw new SnapshotError(`Snapshot not found: ${snapshotId}`);
    }

    if (snapshot.status === SnapshotStatus.completed) {
      throw new SnapshotError('Cannot retry completed snapshot');
    }

    // Delete any partial balances
    await prisma.snapshotBalance.deleteMany({
      where: { snapshotId },
    });

    // Reset to pending
    await prisma.snapshot.update({
      where: { id: snapshotId },
      data: { status: SnapshotStatus.pending },
    });

    // Retry
    return await this.createSnapshot(snapshot.intervalStart, snapshot.intervalEnd);
  }

  /**
   * Validate balance data
   */
  private validateBalances(balances: Array<{
    address: string;
    productType: string;
    asset: string;
    effectiveBalance: string;
  }>): Array<{
    address: string;
    productType: string;
    asset: string;
    effectiveBalance: string;
  }> {
    return balances.map((balance) => {
      // Normalize address
      const normalizedAddress = normalizeAddress(balance.address);

      // Validate balance is non-negative
      const balanceDecimal = new Decimal(balance.effectiveBalance);
      if (balanceDecimal.isNegative()) {
        throw new SnapshotError(
          `Negative balance not allowed: ${balance.address} ${balance.productType} ${balance.asset}`
        );
      }

      return {
        ...balance,
        address: normalizedAddress,
      };
    });
  }

  /**
   * Write balances to database (atomic transaction)
   */
  private async writeBalances(
    snapshotId: string,
    balances: Array<{
      address: string;
      productType: string;
      asset: string;
      effectiveBalance: string;
    }>
  ): Promise<void> {
    // Use transaction for atomicity
    await prisma.$transaction(
      balances.map((balance) =>
        prisma.snapshotBalance.create({
          data: {
            snapshotId,
            address: balance.address,
            productType: balance.productType as any,
            asset: balance.asset,
            effectiveBalance: balance.effectiveBalance,
          },
        })
      )
    );
  }

  /**
   * Get snapshot by ID
   */
  async getSnapshot(snapshotId: string): Promise<
    | (Snapshot & {
        balances: SnapshotBalance[];
      })
    | null
  > {
    return await prisma.snapshot.findUnique({
      where: { id: snapshotId },
      include: { balances: true },
    });
  }

  /**
   * Get all snapshots for a season
   */
  async getSnapshotsBySeason(seasonId: string): Promise<Snapshot[]> {
    return await prisma.snapshot.findMany({
      where: { seasonId },
      orderBy: { snapshotTime: 'asc' },
    });
  }
}
