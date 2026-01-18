import { PointsLedger, EmissionRate, SnapshotBalance, ProductType } from '@prisma/client';
import prisma from '../utils/prisma';
import logger from '../utils/logger';
import { CalculationError } from '../utils/errors';
import Decimal from 'decimal.js';

/**
 * Calculation result for a single balance
 */
interface CalculationResult {
  address: string;
  snapshotId: string;
  seasonId: string;
  pointsDelta: string;
  reason: string;
  productType: ProductType;
  asset: string;
  calculationBasis: {
    balance: string;
    rate: string;
    days: number;
    formula: string;
  };
}

/**
 * PointsCalculator
 *
 * Responsibilities:
 * - Convert snapshot balances into points using emission rates
 * - Write all points to the append-only ledger
 * - Ensure deterministic calculations
 *
 * Invariants:
 * - Same snapshot → Same points (determinism)
 * - Points = balance × rate × days (simple formula)
 * - All calculations are transparent (stored in calculation_basis)
 * - No multipliers, compounding, or randomness in V1
 */
export class PointsCalculator {
  /**
   * Calculate points for a snapshot
   *
   * This is the main entry point for points calculation.
   * It should be called after a snapshot is completed.
   *
   * @param snapshotId - ID of the completed snapshot
   * @returns Array of ledger entries
   */
  async calculatePointsForSnapshot(snapshotId: string): Promise<PointsLedger[]> {
    logger.info('Calculating points for snapshot', { snapshotId });

    // Get snapshot with balances
    const snapshot = await prisma.snapshot.findUnique({
      where: { id: snapshotId },
      include: { balances: true },
    });

    if (!snapshot) {
      throw new CalculationError(`Snapshot not found: ${snapshotId}`);
    }

    if (snapshot.status !== 'completed') {
      throw new CalculationError(`Snapshot is not completed: ${snapshotId}`);
    }

    // Check if points already calculated for this snapshot
    const existingEntries = await prisma.pointsLedger.findFirst({
      where: { snapshotId },
    });

    if (existingEntries) {
      logger.info('Points already calculated for snapshot', { snapshotId });
      return await prisma.pointsLedger.findMany({
        where: { snapshotId },
      });
    }

    // Get emission rates for the season
    const emissionRates = await this.getEmissionRates(
      snapshot.seasonId,
      snapshot.intervalStart,
      snapshot.intervalEnd
    );

    // Calculate days in period
    const days = this.calculateDays(snapshot.intervalStart, snapshot.intervalEnd);

    // Calculate points for each balance
    const calculations = this.calculatePoints(
      snapshot.balances,
      emissionRates,
      days,
      snapshot.id,
      snapshot.seasonId
    );

    // Write to ledger (append-only)
    const ledgerEntries = await this.writeLedgerEntries(calculations);

    logger.info('Points calculation completed', {
      snapshotId,
      entriesWritten: ledgerEntries.length,
    });

    return ledgerEntries;
  }

  /**
   * Get applicable emission rates for the time period
   */
  private async getEmissionRates(
    seasonId: string,
    intervalStart: Date,
    intervalEnd: Date
  ): Promise<Map<string, EmissionRate>> {
    const rates = await prisma.emissionRate.findMany({
      where: {
        seasonId,
        effectiveFrom: { lte: intervalEnd },
        OR: [{ effectiveUntil: null }, { effectiveUntil: { gte: intervalStart } }],
      },
    });

    // Create lookup map: "productType:asset" -> EmissionRate
    const rateMap = new Map<string, EmissionRate>();
    for (const rate of rates) {
      const key = `${rate.productType}:${rate.asset}`;
      rateMap.set(key, rate);
    }

    return rateMap;
  }

  /**
   * Calculate number of days in the period
   */
  private calculateDays(start: Date, end: Date): number {
    const milliseconds = end.getTime() - start.getTime();
    const days = milliseconds / (1000 * 60 * 60 * 24);
    return days;
  }

  /**
   * Calculate points for all balances
   *
   * Formula: points = balance × rate × days
   */
  private calculatePoints(
    balances: SnapshotBalance[],
    emissionRates: Map<string, EmissionRate>,
    days: number,
    snapshotId: string,
    seasonId: string
  ): CalculationResult[] {
    const calculations: CalculationResult[] = [];

    for (const balance of balances) {
      const key = `${balance.productType}:${balance.asset}`;
      const rate = emissionRates.get(key);

      if (!rate) {
        // No emission rate configured, award 0 points
        logger.warn('No emission rate found, awarding 0 points', {
          productType: balance.productType,
          asset: balance.asset,
          address: balance.address,
        });

        calculations.push({
          address: balance.address,
          snapshotId,
          seasonId,
          pointsDelta: '0',
          reason: `No emission rate configured for ${balance.productType} ${balance.asset}`,
          productType: balance.productType,
          asset: balance.asset,
          calculationBasis: {
            balance: balance.effectiveBalance.toString(),
            rate: '0',
            days,
            formula: 'balance × rate × days',
          },
        });
        continue;
      }

      // Calculate points: balance × rate × days
      const balanceDecimal = new Decimal(balance.effectiveBalance.toString());
      const rateDecimal = new Decimal(rate.ratePerTokenPerDay.toString());
      const daysDecimal = new Decimal(days);

      const points = balanceDecimal.mul(rateDecimal).mul(daysDecimal);

      calculations.push({
        address: balance.address,
        snapshotId,
        seasonId,
        pointsDelta: points.toFixed(18),
        reason: `Daily points for ${balance.productType} ${balance.asset} holdings`,
        productType: balance.productType,
        asset: balance.asset,
        calculationBasis: {
          balance: balance.effectiveBalance.toString(),
          rate: rate.ratePerTokenPerDay.toString(),
          days,
          formula: 'balance × rate × days',
        },
      });
    }

    return calculations;
  }

  /**
   * Write ledger entries (append-only, atomic)
   */
  private async writeLedgerEntries(calculations: CalculationResult[]): Promise<PointsLedger[]> {
    // Use transaction for atomicity
    return await prisma.$transaction(
      calculations.map((calc) =>
        prisma.pointsLedger.create({
          data: {
            address: calc.address,
            snapshotId: calc.snapshotId,
            seasonId: calc.seasonId,
            pointsDelta: calc.pointsDelta,
            reason: calc.reason,
            productType: calc.productType,
            asset: calc.asset,
            calculationBasis: calc.calculationBasis,
          },
        })
      )
    );
  }

  /**
   * Get total points for an address in a season
   */
  async getTotalPoints(address: string, seasonId: string): Promise<string> {
    const result = await prisma.pointsLedger.aggregate({
      where: {
        address,
        seasonId,
      },
      _sum: {
        pointsDelta: true,
      },
    });

    return result._sum.pointsDelta?.toString() || '0';
  }

  /**
   * Get points breakdown for an address in a season
   */
  async getPointsBreakdown(
    address: string,
    seasonId: string
  ): Promise<
    Array<{
      productType: ProductType;
      asset: string;
      totalPoints: string;
    }>
  > {
    const entries = await prisma.pointsLedger.findMany({
      where: {
        address,
        seasonId,
      },
      select: {
        productType: true,
        asset: true,
        pointsDelta: true,
      },
    });

    // Group by product type and asset
    const breakdown = new Map<string, { productType: ProductType; asset: string; total: Decimal }>();

    for (const entry of entries) {
      const key = `${entry.productType}:${entry.asset}`;
      const existing = breakdown.get(key);

      if (existing) {
        existing.total = existing.total.add(new Decimal(entry.pointsDelta.toString()));
      } else {
        breakdown.set(key, {
          productType: entry.productType,
          asset: entry.asset,
          total: new Decimal(entry.pointsDelta.toString()),
        });
      }
    }

    // Convert to array
    return Array.from(breakdown.values()).map((item) => ({
      productType: item.productType,
      asset: item.asset,
      totalPoints: item.total.toFixed(18),
    }));
  }
}

export default new PointsCalculator();
