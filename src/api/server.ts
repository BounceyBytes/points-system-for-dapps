import express, { Express, Request, Response, NextFunction } from 'express';
import routes from './routes';
import logger from '../utils/logger';
import config from '../utils/config';

/**
 * Create and configure Express server
 */
export function createServer(): Express {
  const app = express();

  // Middleware
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

  // Request logging middleware
  app.use((req: Request, _res: Response, next: NextFunction) => {
    logger.info('API Request', {
      method: req.method,
      path: req.path,
      query: req.query,
      ip: req.ip,
    });
    next();
  });

  // Routes
  app.use('/', routes);

  // 404 handler
  app.use((_req: Request, res: Response) => {
    res.status(404).json({
      error: 'Not found',
    });
  });

  // Error handler
  app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
    logger.error('Unhandled error', {
      error: err.message,
      stack: err.stack,
    });

    res.status(500).json({
      error: 'Internal server error',
    });
  });

  return app;
}

/**
 * Start the Express server
 */
export async function startServer(): Promise<void> {
  const app = createServer();
  const port = config.server.port;

  app.listen(port, () => {
    logger.info(`Points System V1 API started`, {
      port,
      environment: config.server.nodeEnv,
    });
  });
}
