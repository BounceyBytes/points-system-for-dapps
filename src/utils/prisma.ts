import { PrismaClient } from '@prisma/client';
import logger from './logger';

// Singleton pattern for Prisma Client
declare global {
  // eslint-disable-next-line no-var
  var prisma: PrismaClient | undefined;
}

const prisma =
  global.prisma ||
  new PrismaClient({
    log: [
      { level: 'query', emit: 'event' },
      { level: 'error', emit: 'event' },
      { level: 'warn', emit: 'event' },
    ],
  });

// Log database queries in development
if (process.env.NODE_ENV === 'development') {
  prisma.$on('query', (e) => {
    logger.debug('Query', { query: e.query, params: e.params, duration: e.duration });
  });
}

// Log database errors
prisma.$on('error', (e) => {
  logger.error('Database error', { message: e.message, target: e.target });
});

// Log database warnings
prisma.$on('warn', (e) => {
  logger.warn('Database warning', { message: e.message, target: e.target });
});

if (process.env.NODE_ENV !== 'production') {
  global.prisma = prisma;
}

export default prisma;

/**
 * Graceful shutdown for Prisma Client
 */
export async function disconnectPrisma(): Promise<void> {
  await prisma.$disconnect();
  logger.info('Prisma Client disconnected');
}
