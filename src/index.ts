import { startServer } from './api/server';
import snapshotScheduler from './scheduler/SnapshotScheduler';
import { disconnectPrisma } from './utils/prisma';
import logger from './utils/logger';
import config from './utils/config';
import fs from 'fs';
import path from 'path';

/**
 * Points System V1 - Main Entry Point
 *
 * Starts:
 * 1. Express API server (read-only endpoints)
 * 2. Snapshot scheduler (daily cron job)
 */

async function main(): Promise<void> {
  logger.info('Starting Points System V1', {
    nodeEnv: config.server.nodeEnv,
    port: config.server.port,
  });

  // Ensure logs directory exists
  const logsDir = path.join(process.cwd(), 'logs');
  if (!fs.existsSync(logsDir)) {
    fs.mkdirSync(logsDir, { recursive: true });
  }

  try {
    // Start API server
    await startServer();

    // Start snapshot scheduler
    snapshotScheduler.start();

    logger.info('Points System V1 started successfully');
  } catch (error) {
    logger.error('Failed to start Points System V1', {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });
    process.exit(1);
  }
}

/**
 * Graceful shutdown
 */
async function shutdown(): Promise<void> {
  logger.info('Shutting down Points System V1');

  // Stop scheduler
  snapshotScheduler.stop();

  // Disconnect Prisma
  await disconnectPrisma();

  logger.info('Points System V1 shut down successfully');
  process.exit(0);
}

// Handle shutdown signals
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

// Handle unhandled errors
process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled Promise Rejection', {
    reason: String(reason),
    promise: String(promise),
  });
});

process.on('uncaughtException', (error) => {
  logger.error('Uncaught Exception', {
    error: error.message,
    stack: error.stack,
  });
  process.exit(1);
});

// Start the application
main().catch((error) => {
  logger.error('Fatal error during startup', {
    error: error instanceof Error ? error.message : String(error),
  });
  process.exit(1);
});
