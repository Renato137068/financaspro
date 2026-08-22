// backend/app.js — fábrica Express (testável via supertest)
import express from 'express';
import compression from 'compression';
import helmet from 'helmet';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

import CONFIG from './config.js';
import logger from './lib/logger.js';
import { appErrorsTotal } from './lib/metrics.js';
import { requestLogger, addTraceContext } from './middleware/requestLogger.js';
import { globalLimiter } from './middleware/rateLimiter.js';
import { csrfGuard } from './middleware/csrf.js';
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

  // Sem isto o build sai cru: app.bundle.js viaja 460 KB em vez de 117 KB e o
  // CSS 252 KB em vez de 37 KB. Numa rede móvel modesta isso é a diferença
  // medida entre LCP de 5,1 s e de 2,2 s — o maior ganho por linha do projeto.
  // Fica antes das rotas e do express.static para cobrir API e assets.
  app.use(compression());

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

  // Depois do webhook do Stripe (que é server-to-server, sem cookie e validado
  // por assinatura) e antes das rotas de aplicação.
  app.use(csrfGuard);

  // Assets com hash no nome (Vite) podem ser cacheados para sempre: mudar o
  // conteúdo muda o nome. index.html e o service worker NUNCA — são o ponto de
  // entrada que descobre os hashes novos, e um cache longo neles prenderia o
  // usuário numa versão antiga até o cache expirar.
  const UM_ANO = 31_536_000;
  const TEM_HASH = /-[A-Za-z0-9_-]{8,}\.[a-z0-9]+$/;

  // Em produção STATIC_ROOT é dist/, que só contém artefato público.
  // Em desenvolvimento é a RAIZ DO PROJETO — e servi-la inteira publicava
  // .env (segredos reais), backend/, prisma/, scripts/ e o .jks de assinatura
  // da Play Store para qualquer um que alcançasse a porta. Bastava um `npm run
  // backend:dev` numa rede compartilhada ou atrás de um túnel de preview.
  // Aqui a lista é explícita: só sai o que o index.html realmente pede.
  const PASTAS_PUBLICAS = ['js', 'css', 'icons', 'fonts', 'screenshots', 'assets'];
  const ARQUIVOS_PUBLICOS = new Set([
    'index.html', 'manifest.json', 'sw.js', 'privacidade.html', 'favicon.ico',
  ]);

  function cabecalhosDeCache(res, filePath) {
    const nome = path.basename(filePath);

    // index.html, sw.js e manifest são o ponto de entrada que descobre os
    // hashes novos. Cache longo neles prenderia o usuário numa versão antiga.
    if (nome === 'index.html' || nome === 'sw.js' || nome === 'manifest.json') {
      res.setHeader('Cache-Control', 'no-cache');
      return;
    }
    // Asset com hash no nome: mudar o conteúdo muda o nome, então pode ser
    // imutável por um ano.
    if (TEM_HASH.test(nome)) {
      res.setHeader('Cache-Control', `public, max-age=${UM_ANO}, immutable`);
      return;
    }
    res.setHeader('Cache-Control', 'public, max-age=3600');
  }

  if (CONFIG.isProd) {
    app.use(express.static(STATIC_ROOT, { index: 'index.html', setHeaders: cabecalhosDeCache }));
  } else {
    // Nada de express.static na raiz aqui: só as pastas e os arquivos da
    // allowlist são alcançáveis. O que não estiver nela simplesmente não
    // existe para o servidor de desenvolvimento.
    for (const pasta of PASTAS_PUBLICAS) {
      const dir = path.join(STATIC_ROOT, pasta);
      if (fs.existsSync(dir)) {
        app.use('/' + pasta, express.static(dir, { setHeaders: cabecalhosDeCache }));
      }
    }
    app.use((req, res, next) => {
      const nome = req.path.replace(/^\//, '');
      if (!ARQUIVOS_PUBLICOS.has(nome)) return next();
      cabecalhosDeCache(res, nome);
      res.sendFile(path.join(STATIC_ROOT, nome));
    });
  }

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
