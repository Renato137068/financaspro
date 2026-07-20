// backend/app.js — fábrica Express (testável via supertest)
import express from 'express';
import helmet from 'helmet';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

import CONFIG from './config.js';
import logger from './lib/logger.js';
import { appErrorsTotal } from './lib/metrics.js';
import { requestLogger, addTraceContext } from './middleware/requestLogger.js';
import { globalLimiter } from './middleware/rateLimiter.js';
import apiRouter from './routes/index.js';
import healthRouter from './routes/health.js';
import { BillingService } from './domain/services/billing.service.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DEV_ROOT  = path.join(__dirname, '..');
const DIST_ROOT = path.join(__dirname, '..', 'dist');
// Em produção servimos exclusivamente o build. Cair para a raiz do projeto
// quando o build falta exporia backend/, prisma/, scripts/ e package.json —
// então aqui falhamos fechado, em vez de degradar silenciosamente.
function resolveStaticRoot() {
  const hasBuild = fs.existsSync(path.join(DIST_ROOT, 'index.html'));
  if (!CONFIG.isProd) return DEV_ROOT;
  if (!hasBuild) {
    throw new Error(
      'Build de produção ausente: dist/index.html não encontrado. Execute `npm run build` antes de iniciar o servidor.',
    );
  }
  return DIST_ROOT;
}

const STATIC_ROOT = resolveStaticRoot();

export function createApp() {
  const app = express();

  app.set('trust proxy', 1);

  app.use(helmet({
    crossOriginResourcePolicy: { policy: 'cross-origin' },
    contentSecurityPolicy: CONFIG.isProd ? undefined : false,
  }));

  app.use((req, res, next) => {
    const origin  = req.headers.origin;
    const allowed = CONFIG.cors.origin;

    if (allowed === '*') {
      res.setHeader('Access-Control-Allow-Origin',  '*');
      res.setHeader('Access-Control-Allow-Methods', CONFIG.cors.methods.join(','));
      res.setHeader('Access-Control-Allow-Headers', CONFIG.cors.allowedHeaders.join(', '));
    } else if (origin && origin === allowed) {
      res.setHeader('Access-Control-Allow-Origin',      origin);
      res.setHeader('Access-Control-Allow-Methods',     CONFIG.cors.methods.join(','));
      res.setHeader('Access-Control-Allow-Headers',     CONFIG.cors.allowedHeaders.join(', '));
      res.setHeader('Access-Control-Allow-Credentials', 'true');
      res.setHeader('Vary', 'Origin');
    }

    if (req.method === 'OPTIONS') return res.sendStatus(204);
    next();
  });

  app.use(addTraceContext);
  app.use(requestLogger);
  app.use(globalLimiter);

  app.post(
    '/api/v1/billing/webhook',
    express.raw({ type: 'application/json' }),
    async (req, res, next) => {
      try {
        const sig = req.headers['stripe-signature'];
        const result = await BillingService.handleWebhook(req.body, sig);
        res.json(result);
      } catch (err) {
        next(err);
      }
    },
  );

  app.use(express.json({ limit: '1mb' }));
  app.use(express.urlencoded({ extended: false, limit: '1mb' }));

  app.use(express.static(STATIC_ROOT, {
    index: 'index.html',
    maxAge: '1h',
    setHeaders(res, filePath) {
      if (/\.(png|jpe?g|svg|ico|webp)$/i.test(filePath)) {
        res.setHeader('Cache-Control', 'public, max-age=86400');
      }
    },
  }));

  app.use('/', healthRouter);
  app.use('/api/v1', apiRouter);

  app.use((req, res, next) => {
    if (req.path.startsWith('/api/')) return next();
    res.sendFile(path.join(STATIC_ROOT, 'index.html'));
  });

  // Rota de API inexistente: sem isto a requisição cai no finalhandler do
  // Express, que responde HTML — e um cliente fazendo res.json() quebra com
  // erro de parse em vez de simplesmente ver o 404.
  app.use('/api', (req, res) => {
    res.status(404).json({ error: 'Recurso não encontrado' });
  });

  app.use((err, req, res, _next) => {
    const status = err.status ?? err.statusCode ?? 500;
    const message = (err.isOperational || status < 500)
      ? err.message
      : 'Erro interno do servidor';

    const type = err.isOperational ? 'operational' : (status >= 500 ? 'unexpected' : '4xx');
    appErrorsTotal.inc({ type });

    logger.error({ err, traceId: req.traceId, userId: req.user?.id }, err.message);
    res.status(status).json({ error: message });
  });

  return app;
}
