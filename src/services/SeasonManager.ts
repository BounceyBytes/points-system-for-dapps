import { Season } from '@prisma/client';
import prisma from '../utils/prisma';
import logger from '../utils/logger';
import { SeasonError } from '../utils/errors';

/**
 * SeasonManager
 *
 * Responsibilities:
 * - Manage season lifecycle (create, start, end)
 * - Ensure exactly 0 or 1 active season at a time
 * - Enforce season boundaries and isolation
 *
 * Invariants:
 * - Only one active season allowed
 * - Seasons are sequential (season_number)
 * - end_time must be after start_time if set
 * - Historical seasons are immutable
 */
export class SeasonManager {
  /**
   * Get the current active season
   * Returns null if no active season exists
   */
  async getCurrentSeason(): Promise<Season | null> {
    const activeSeason = await prisma.season.findFirst({
      where: { isActive: true },
    });

    return activeSeason;
  }

  /**
   * Get season by number
   */
  async getSeasonByNumber(seasonNumber: number): Promise<Season | null> {
    return await prisma.season.findUnique({
      where: { seasonNumber },
    });
  }

  /**
   * Get season by ID
   */
  async getSeasonById(id: string): Promise<Season | null> {
    return await prisma.season.findUnique({
      where: { id },
    });
  }

  /**
   * Start a new season
   *
   * Requirements:
   * - No other active season exists
   * - seasonNumber is next in sequence
   * - startTime is valid
   *
   * @param seasonNumber - Sequential season number
   * @param startTime - Season start timestamp
   * @returns Created season
   */
  async startNewSeason(seasonNumber: number, startTime: Date): Promise<Season> {
    logger.info('Starting new season', { seasonNumber, startTime });

    // Check for existing active season
    const activeSeason = await this.getCurrentSeason();
    if (activeSeason) {
      throw new SeasonError(
        `Cannot start new season: Season ${activeSeason.seasonNumber} is still active`
      );
    }

    // Verify season number is sequential
    const lastSeason = await prisma.season.findFirst({
      orderBy: { seasonNumber: 'desc' },
    });

    if (lastSeason && seasonNumber !== lastSeason.seasonNumber + 1) {
      throw new SeasonError(
        `Season number must be sequential. Expected ${lastSeason.seasonNumber + 1}, got ${seasonNumber}`
      );
    }

    // Create new season
    const newSeason = await prisma.season.create({
      data: {
        seasonNumber,
        startTime,
        isActive: true,
      },
    });

    logger.info('New season started successfully', {
      seasonId: newSeason.id,
      seasonNumber: newSeason.seasonNumber,
    });

    return newSeason;
  }

  /**
   * End the current active season
   *
   * Requirements:
   * - An active season must exist
   * - endTime must be after startTime
   * - Points are calculated for all snapshots
   *
   * @param endTime - Season end timestamp
   * @returns Updated season
   */
  async endCurrentSeason(endTime: Date): Promise<Season> {
    logger.info('Ending current season', { endTime });

    const activeSeason = await this.getCurrentSeason();
    if (!activeSeason) {
      throw new SeasonError('No active season to end');
    }

    // Validate end time
    if (endTime <= activeSeason.startTime) {
      throw new SeasonError('Season end time must be after start time');
    }

    // End the season
    const updatedSeason = await prisma.season.update({
      where: { id: activeSeason.id },
      data: {
        endTime,
        isActive: false,
      },
    });

    logger.info('Season ended successfully', {
      seasonId: updatedSeason.id,
      seasonNumber: updatedSeason.seasonNumber,
      duration: endTime.getTime() - activeSeason.startTime.getTime(),
    });

    return updatedSeason;
  }

  /**
   * Get all seasons (for historical queries)
   */
  async getAllSeasons(): Promise<Season[]> {
    return await prisma.season.findMany({
      orderBy: { seasonNumber: 'asc' },
    });
  }

  /**
   * Validate that a snapshot belongs to the active season
   */
  async validateSnapshotSeason(snapshotTime: Date): Promise<Season> {
    const activeSeason = await this.getCurrentSeason();
    if (!activeSeason) {
      throw new SeasonError('No active season for snapshot');
    }

    if (snapshotTime < activeSeason.startTime) {
      throw new SeasonError('Snapshot time is before active season start');
    }

    if (activeSeason.endTime && snapshotTime > activeSeason.endTime) {
      throw new SeasonError('Snapshot time is after active season end');
    }

    return activeSeason;
  }
}

// Export singleton instance
export default new SeasonManager();
