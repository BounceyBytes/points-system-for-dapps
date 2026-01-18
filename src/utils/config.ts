import dotenv from 'dotenv';
import { z } from 'zod';

// Load environment variables
dotenv.config();

// Define configuration schema with strict validation
const configSchema = z.object({
  database: z.object({
    url: z.string().url(),
  }),
  server: z.object({
    port: z.number().int().min(1).max(65535),
    nodeEnv: z.enum(['development', 'production', 'test']),
  }),
  snapshot: z.object({
    cronSchedule: z.string(),
    dataSourceUrl: z.string().url(),
  }),
  goldsky: z.object({
    subgraphUrl: z.string().url(),
    apiKey: z.string().optional(),
  }),
  logging: z.object({
    level: z.enum(['error', 'warn', 'info', 'debug', 'verbose']),
  }),
  season: z.object({
    defaultStartDate: z.string().datetime(),
  }),
});

// Parse and validate configuration
const rawConfig = {
  database: {
    url: process.env.DATABASE_URL || '',
  },
  server: {
    port: parseInt(process.env.PORT || '3000', 10),
    nodeEnv: (process.env.NODE_ENV || 'development') as 'development' | 'production' | 'test',
  },
  snapshot: {
    cronSchedule: process.env.SNAPSHOT_CRON_SCHEDULE || '0 0 * * *',
    dataSourceUrl: process.env.DATA_SOURCE_URL || 'http://localhost:8080/graphql',
  },
  goldsky: {
    subgraphUrl: process.env.GOLDSKY_SUBGRAPH_URL || process.env.DATA_SOURCE_URL || 'http://localhost:8080/graphql',
    apiKey: process.env.GOLDSKY_API_KEY,
  },
  logging: {
    level: (process.env.LOG_LEVEL || 'info') as 'error' | 'warn' | 'info' | 'debug' | 'verbose',
  },
  season: {
    defaultStartDate: process.env.DEFAULT_SEASON_START || '2026-01-01T00:00:00Z',
  },
};

let config: z.infer<typeof configSchema>;

try {
  config = configSchema.parse(rawConfig);
} catch (error) {
  console.error('Configuration validation failed:', error);
  throw new Error('Invalid configuration. Please check your environment variables.');
}

export default config;
