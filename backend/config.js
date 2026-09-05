// backend/config.js — configuração centralizada (ESM)
import 'dotenv/config';
import { randomBytes } from 'node:crypto';

const env = process.env.NODE_ENV || 'development';
const isProd = env === 'production';

function required(key) {
  const value = process.env[key];
  if (!value && isProd) throw new Error(`Variável de ambiente obrigatória ausente: ${key}`);
  return value;
}

/**
 * Segredo de desenvolvimento — sorteado a cada boot, nunca literal no repo.
 *
 * O guard de produção já recusa `dev-access-secret` e exige 32+ caracteres,
 * mas ele só roda quando NODE_ENV === 'production'. O caso que sobrava era
 * outro, e é o fácil de acontecer: subir o backend com NODE_ENV ausente ou
 * 'development' num host exposto. Aí o guard passa batido e os tokens eram
 * assinados com um segredo publicado no repositório — qualquer pessoa forja
 * um JWT para qualquer usuário.
 *
 * Com valor aleatório por processo esse caminho fecha sozinho. O efeito
 * colateral é desejável: reiniciar o backend em dev invalida as sessões,
 * o que deixa claro que aquilo não é ambiente para valer.
 */
const segredosSorteados = [];
function segredoDeDesenvolvimento(nomeDaVariavel) {
  segredosSorteados.push(nomeDaVariavel);
  return randomBytes(48).toString('base64url');
}

const CONFIG = {
  env,
  isProd,
  port: parseInt(process.env.PORT) || 4000,

  database: {
    // Em produção a URL é obrigatória (fail-closed) — sem fallback inseguro.
    url: isProd
      ? required('DATABASE_URL')
      : (process.env.DATABASE_URL || 'postgresql://financaspro:changeme@localhost:5432/financaspro'),
  },

  auth: {
    accessSecret: isProd
      ? required('JWT_ACCESS_SECRET')
      : (process.env.JWT_ACCESS_SECRET || segredoDeDesenvolvimento('JWT_ACCESS_SECRET')),
    refreshSecret: isProd
      ? required('JWT_REFRESH_SECRET')
      : (process.env.JWT_REFRESH_SECRET || segredoDeDesenvolvimento('JWT_REFRESH_SECRET')),
    accessExpiresIn: process.env.JWT_ACCESS_EXPIRES_IN || '15m',
    refreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '7d',
    cookieSameSite: process.env.COOKIE_SAME_SITE || 'Lax',
    pbkdf2Iterations: parseInt(process.env.PBKDF2_ITERATIONS) || 600000,
    saltLength: 16,
    issuer: process.env.JWT_ISSUER || 'financaspro-api',
    audience: process.env.JWT_AUDIENCE || 'financaspro-client',
    loginMaxAttempts: parseInt(process.env.LOGIN_MAX_ATTEMPTS) || 5,
    loginLockoutMs: parseInt(process.env.LOGIN_LOCKOUT_MS) || 15 * 60 * 1000,
  },

  cors: {
    origin: process.env.CORS_ORIGIN || (isProd ? null : '*'),
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'Cookie'],
    credentials: true,
  },

  rateLimit: {
    windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 60_000,
    max: parseInt(process.env.RATE_LIMIT_MAX) || 60,
    authMax: parseInt(process.env.RATE_LIMIT_AUTH_MAX) || 10,
  },

  logging: {
    level: process.env.LOG_LEVEL || (isProd ? 'info' : 'debug'),
    pretty: !isProd,
  },

  pagination: {
    defaultLimit: 50,
    maxLimit: 200,
  },

  // Fase 10 — Redis + Filas
  redis: {
    url: process.env.REDIS_URL || null,
  },

  // Fase 10 — Stripe
  stripe: {
    secretKey:     process.env.STRIPE_SECRET_KEY || null,
    webhookSecret: process.env.STRIPE_WEBHOOK_SECRET || null,
    publishableKey: process.env.STRIPE_PUBLISHABLE_KEY || null,
  },

  // Fase 10 — E-mail (SMTP)
  email: {
    host:   process.env.SMTP_HOST || null,
    port:   parseInt(process.env.SMTP_PORT) || 587,
    secure: process.env.SMTP_SECURE === 'true',
    user:   process.env.SMTP_USER || null,
    pass:   process.env.SMTP_PASS || null,
    // Produção: SMTP_FROM obrigatório (fail-closed). Em dev mantém fallback
    // local até o domínio oficial ser definido pelo operador.
    from: isProd
      ? required('SMTP_FROM')
      : (process.env.SMTP_FROM || 'FinançasPro <dev@localhost>'),
  },

  // Fase 10 — URL pública do app (usada em e-mails e portal Stripe)
  appUrl: process.env.APP_URL || 'http://localhost:4000',

  // Fase 11 — Open Finance (Belvo / Pluggy / sandbox)
  openFinance: {
    defaultProvider: process.env.OPEN_FINANCE_PROVIDER || 'sandbox',
    belvoEnvironment: process.env.BELVO_ENV || 'sandbox',
    belvoSecretId: process.env.BELVO_SECRET_ID || null,
    belvoSecretPassword: process.env.BELVO_SECRET_PASSWORD || null,
    pluggyClientId: process.env.PLUGGY_CLIENT_ID || null,
    pluggyClientSecret: process.env.PLUGGY_CLIENT_SECRET || null,
  },

  /** Em produção, Redis é obrigatório para rate limit distribuído e workers. */
  requireRedis: env === 'production' || process.env.REQUIRE_REDIS === '1',

  /** E-mail de contato LGPD — obrigatório em produção (política promete resposta). */
  privacyContactEmail: isProd
    ? required('PRIVACY_CONTACT_EMAIL')
    : (process.env.PRIVACY_CONTACT_EMAIL || 'dev-privacy@localhost'),

  metrics: {
    token: process.env.METRICS_TOKEN || null,
  },

  crypto: {
    totpEncryptionKey: process.env.TOTP_ENCRYPTION_KEY || null,
  },

  performance: {
    syncDeltaBatchSize: parseInt(process.env.SYNC_DELTA_BATCH_SIZE, 10) || 500,
    txListMaxLimit: 200,
    localTxWindowMonths: parseInt(process.env.LOCAL_TX_WINDOW_MONTHS, 10) || 24,
  },

  playBilling: {
    packageName: process.env.PLAY_PACKAGE_NAME || 'com.financaspro.mobile',
    serviceAccountJson: process.env.GOOGLE_PLAY_SERVICE_ACCOUNT_JSON || null,
    // Segredo compartilhado do webhook RTDN. Envie no header `x-rtdn-secret`;
    // a query string (?secret=) segue aceita mas é deprecada — o caminho
    // recomendado é OIDC do Pub/Sub (ver supabase/functions/play-rtdn).
    rtdnSecret: process.env.PLAY_RTDN_SECRET || null,
  },
};

if (segredosSorteados.length && env !== 'test') {
  console.warn(
    '[config] ' + segredosSorteados.join(' e ') + ' não definido(s): usando segredo '
    + 'aleatório desta execução. As sessões caem a cada reinício, e este processo '
    + 'NÃO está pronto para produção.',
  );
}

export default CONFIG;
