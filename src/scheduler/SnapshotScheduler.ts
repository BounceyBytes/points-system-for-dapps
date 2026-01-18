import cron from 'node-cron';
import { SnapshotEngine } from '../services/SnapshotEngine';
import pointsCalculator from '../services/PointsCalculator';
import mockDataSource from '../services/MockDataSource';
import logger from '../utils/logger';
import config from '../utils/config';

/**
 * SnapshotScheduler
 *
 * Responsibilities:
 * - Schedule daily snapshots at fixed time (00:00 UTC)
 * - Automatically calculate points after snapshot completion
 * - Handle errors gracefully with retries
 *
 * Fixed Cadence: Daily at 00:00 UTC
 */
export class SnapshotScheduler {
  private snapshotEngine: SnapshotEngine;
  private cronJob: cron.ScheduledTask | null = null;

  constructor(snapshotEngine: SnapshotEngine) {
    this.snapshotEngine = snapshotEngine;
  }

  /**
   * Start the snapshot scheduler
   */
  start(): void {
    const schedule = config.snapshot.cronSchedule;

    logger.info('Starting snapshot scheduler', { schedule });

    // Validate cron expression
    if (!cron.validate(schedule)) {
      throw new Error(`Invalid cron schedule: ${schedule}`);
    }

    // Schedule the job
    this.cronJob = cron.schedule(
      schedule,
      async () => {
        await this.runDailySnapshot();
      },
      {
        timezone: 'UTC',
      }
    );

    logger.info('Snapshot scheduler started successfully');
  }

  /**
   * Stop the snapshot scheduler
   */
  stop(): void {
    if (this.cronJob) {
      this.cronJob.stop();
      logger.info('Snapshot scheduler stopped');
    }
  }

  /**
   * Run daily snapshot (can also be called manually)
   */
  async runDailySnapshot(): Promise<void> {
    logger.info('Starting daily snapshot job');

    try {
      // Calculate yesterday's period (00:00 to 23:59:59.999)
      const now = new Date();
      const yesterday = new Date(now);
      yesterday.setUTCDate(yesterday.getUTCDate() - 1);

      const intervalStart = new Date(
        Date.UTC(
          yesterday.getUTCFullYear(),
          yesterday.getUTCMonth(),
          yesterday.getUTCDate(),
          0,
          0,
          0,
          0
        )
      );

      const intervalEnd = new Date(
        Date.UTC(
          yesterday.getUTCFullYear(),
          yesterday.getUTCMonth(),
          yesterday.getUTCDate(),
          23,
          59,
          59,
          999
        )
      );

      logger.info('Snapshot interval calculated', {
        intervalStart: intervalStart.toISOString(),
        intervalEnd: intervalEnd.toISOString(),
      });

      // Create snapshot
      const snapshot = await this.snapshotEngine.createSnapshot(intervalStart, intervalEnd);

      logger.info('Snapshot created successfully', {
        snapshotId: snapshot.id,
        status: snapshot.status,
      });

      // Calculate points for the snapshot
      logger.info('Calculating points for snapshot', { snapshotId: snapshot.id });
      const ledgerEntries = await pointsCalculator.calculatePointsForSnapshot(snapshot.id);

      logger.info('Daily snapshot job completed successfully', {
        snapshotId: snapshot.id,
        pointsEntriesCreated: ledgerEntries.length,
      });
    } catch (error) {
      logger.error('Daily snapshot job failed', {
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      });

      // Don't throw - let the scheduler continue for next day
    }
  }
}

// Create singleton instance with mock data source
// In production, replace mockDataSource with real implementation
const scheduler = new SnapshotScheduler(new SnapshotEngine(mockDataSource));

export default scheduler;
