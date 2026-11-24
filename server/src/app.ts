import cors from 'cors';
import express, { type NextFunction, type Request, type Response } from 'express';
import { rateLimit } from 'express-rate-limit';
import helmet from 'helmet';
import { requireAuth } from './auth.js';
import { ApiError } from './errors.js';
import { alertsRouter } from './routes/alerts.js';
import { mapRouter } from './routes/map.js';
import { reportsRouter } from './routes/reports.js';

export function createApp() {
  const app = express();
  app.set('trust proxy', 1); // Render sits behind one proxy
  app.disable('x-powered-by');

  app.use(helmet());
  app.use(cors());
  app.use(express.json({ limit: '100kb' }));
  app.use(rateLimit({ windowMs: 15 * 60_000, limit: 600, standardHeaders: 'draft-8', legacyHeaders: false }));

  app.get('/health', (_req, res) => {
    res.json({ ok: true, service: 'civic-map-server', time: new Date().toISOString() });
  });

  // Everything below needs a signed-in user.
  app.use(requireAuth);
  app.use('/alerts', alertsRouter);
  app.use('/reports', reportsRouter);
  app.use('/', mapRouter);

  app.use((_req, _res, next) => next(new ApiError(404, 'NOT_FOUND', 'No such endpoint.')));

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    if (err instanceof ApiError) {
      res.status(err.status).json({ error: { code: err.code, message: err.message } });
      return;
    }
    if (err && typeof err === 'object' && 'type' in err && err.type === 'entity.parse.failed') {
      res.status(400).json({ error: { code: 'INVALID_JSON', message: 'The request body is not valid JSON.' } });
      return;
    }
    console.error('Unexpected error:', err);
    res.status(500).json({ error: { code: 'SERVER_ERROR', message: 'Something went wrong. Try again.' } });
  });

  return app;
}
