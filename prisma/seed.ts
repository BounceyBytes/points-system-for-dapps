import { PrismaClient, ProductType } from '@prisma/client';
import Decimal from 'decimal.js';

const prisma = new PrismaClient();

async function main(): Promise<void> {
  console.log('Starting database seed...');

  // Create Season 1
  const season1 = await prisma.season.upsert({
    where: { seasonNumber: 1 },
    update: {},
    create: {
      seasonNumber: 1,
      startTime: new Date(process.env.DEFAULT_SEASON_START || '2026-01-01T00:00:00Z'),
      isActive: true,
    },
  });

  console.log(`Created Season 1: ${season1.id}`);

  // Define emission rates (explicit constants)
  // These are examples - adjust based on actual tokenomics
  const emissionRates = [
    // Vault products
    {
      productType: ProductType.Vault,
      asset: 'USDT',
      ratePerTokenPerDay: new Decimal(10), // 10 points per USDT per day
    },
    {
      productType: ProductType.Vault,
      asset: 'USDC',
      ratePerTokenPerDay: new Decimal(10), // 10 points per USDC per day
    },
    {
      productType: ProductType.Vault,
      asset: 'OM',
      ratePerTokenPerDay: new Decimal(100), // 100 points per OM per day
    },

    // LST (Liquid Staking Token) products
    {
      productType: ProductType.LST,
      asset: 'stOM',
      ratePerTokenPerDay: new Decimal(150), // 150 points per stOM per day (higher incentive)
    },

    // LP (Liquidity Pool) products
    {
      productType: ProductType.LP,
      asset: 'OM-USDT',
      ratePerTokenPerDay: new Decimal(200), // 200 points per LP token per day (highest incentive)
    },
    {
      productType: ProductType.LP,
      asset: 'OM-USDC',
      ratePerTokenPerDay: new Decimal(200), // 200 points per LP token per day
    },
  ];

  // Insert emission rates
  for (const rate of emissionRates) {
    const created = await prisma.emissionRate.create({
      data: {
        seasonId: season1.id,
        productType: rate.productType,
        asset: rate.asset,
        ratePerTokenPerDay: rate.ratePerTokenPerDay.toFixed(18),
        effectiveFrom: season1.startTime,
        effectiveUntil: season1.endTime || undefined,
      },
    });

    console.log(
      `Created emission rate: ${rate.productType} ${rate.asset} = ${rate.ratePerTokenPerDay} points/token/day`
    );
  }

  console.log('Database seed completed successfully!');
}

main()
  .catch((e) => {
    console.error('Seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
