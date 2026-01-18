import { Router, Request, Response } from 'express';
import pointsCalculator from '../services/PointsCalculator';
import seasonManager from '../services/SeasonManager';
import { isValidEvmAddress, normalizeAddress } from '../utils/validation';
import logger from '../utils/logger';

const router = Router();

/**
 * Health check endpoint
 */
router.get('/health', (_req: Request, res: Response) => {
  res.status(200).json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    service: 'points-system-v1',
  });
});

/**
 * GET /seasons/current
 * Get the current active season
 */
router.get('/seasons/current', async (_req: Request, res: Response) => {
  try {
    const season = await seasonManager.getCurrentSeason();

    if (!season) {
      res.status(404).json({
        error: 'No active season found',
      });
      return;
    }

    res.status(200).json({
      id: season.id,
      seasonNumber: season.seasonNumber,
      startTime: season.startTime.toISOString(),
      endTime: season.endTime?.toISOString() || null,
      isActive: season.isActive,
    });
  } catch (error) {
    logger.error('Error fetching current season', {
      error: error instanceof Error ? error.message : String(error),
    });
    res.status(500).json({
      error: 'Internal server error',
    });
  }
});

/**
 * GET /seasons/:seasonNumber
 * Get season by number
 */
router.get('/seasons/:seasonNumber', async (req: Request, res: Response) => {
  try {
    const seasonNumber = parseInt(req.params.seasonNumber, 10);

    if (isNaN(seasonNumber) || seasonNumber < 1) {
      res.status(400).json({
        error: 'Invalid season number',
      });
      return;
    }

    const season = await seasonManager.getSeasonByNumber(seasonNumber);

    if (!season) {
      res.status(404).json({
        error: 'Season not found',
      });
      return;
    }

    res.status(200).json({
      id: season.id,
      seasonNumber: season.seasonNumber,
      startTime: season.startTime.toISOString(),
      endTime: season.endTime?.toISOString() || null,
      isActive: season.isActive,
    });
  } catch (error) {
    logger.error('Error fetching season', {
      error: error instanceof Error ? error.message : String(error),
    });
    res.status(500).json({
      error: 'Internal server error',
    });
  }
});

/**
 * GET /points/:address
 * Get total points for an address in the current season
 *
 * Query params:
 * - seasonId (optional): Get points for a specific season
 */
router.get('/points/:address', async (req: Request, res: Response) => {
  try {
    const { address } = req.params;
    const { seasonId } = req.query;

    // Validate address
    if (!isValidEvmAddress(address)) {
      res.status(400).json({
        error: 'Invalid EVM address format',
      });
      return;
    }

    const normalizedAddress = normalizeAddress(address);

    // Get season
    let season;
    if (seasonId && typeof seasonId === 'string') {
      season = await seasonManager.getSeasonById(seasonId);
    } else {
      season = await seasonManager.getCurrentSeason();
    }

    if (!season) {
      res.status(404).json({
        error: 'Season not found',
      });
      return;
    }

    // Get total points
    const totalPoints = await pointsCalculator.getTotalPoints(normalizedAddress, season.id);

    res.status(200).json({
      address: normalizedAddress,
      seasonId: season.id,
      seasonNumber: season.seasonNumber,
      totalPoints,
    });
  } catch (error) {
    logger.error('Error fetching points', {
      error: error instanceof Error ? error.message : String(error),
    });
    res.status(500).json({
      error: 'Internal server error',
    });
  }
});

/**
 * GET /points/:address/breakdown
 * Get points breakdown by product type and asset for an address
 *
 * Query params:
 * - seasonId (optional): Get breakdown for a specific season
 */
router.get('/points/:address/breakdown', async (req: Request, res: Response) => {
  try {
    const { address } = req.params;
    const { seasonId } = req.query;

    // Validate address
    if (!isValidEvmAddress(address)) {
      res.status(400).json({
        error: 'Invalid EVM address format',
      });
      return;
    }

    const normalizedAddress = normalizeAddress(address);

    // Get season
    let season;
    if (seasonId && typeof seasonId === 'string') {
      season = await seasonManager.getSeasonById(seasonId);
    } else {
      season = await seasonManager.getCurrentSeason();
    }

    if (!season) {
      res.status(404).json({
        error: 'Season not found',
      });
      return;
    }

    // Get breakdown
    const breakdown = await pointsCalculator.getPointsBreakdown(normalizedAddress, season.id);

    // Calculate total for verification
    const totalPoints = await pointsCalculator.getTotalPoints(normalizedAddress, season.id);

    res.status(200).json({
      address: normalizedAddress,
      seasonId: season.id,
      seasonNumber: season.seasonNumber,
      totalPoints,
      breakdown: breakdown.map((item) => ({
        productType: item.productType,
        asset: item.asset,
        points: item.totalPoints,
      })),
    });
  } catch (error) {
    logger.error('Error fetching points breakdown', {
      error: error instanceof Error ? error.message : String(error),
    });
    res.status(500).json({
      error: 'Internal server error',
    });
  }
});

export default router;
