// backend/middleware/rateLimiter.js — rate limiting por IP (in-process)
// Para produção multi-instância, substitua por redis-based rate limiter
import CONFIG from '../config.js';

const { windowMs, max, authMax } = CONFIG.rateLimit;

/**
 * Fábrica de rate limiter in-memory.
 * @param {{ windowMs: number, max: number, keyFn?: (req) => string }} opts
 */
function createLimiter({ windowMs: wMs, max: limit, keyFn }) {
  const store = new Map();

  // Limpeza periódica para evitar vazamento de memória
  setInterval(() => {
    const now = Date.now();
    for (const [key, rec] of store) {
      if (now > rec.resetAt) store.delete(key);
    }
  }, wMs).unref();

  return function rateLimiter(req, res, next) {
    const key = keyFn ? keyFn(req) : (req.headers['x-forwarded-for'] ?? req.ip ?? 'unknown');
    const now = Date.now();
    const rec = store.get(key);

    if (!rec || now > rec.resetAt) {
      store.set(key, { count: 1, resetAt: now + wMs });
      return next();
    }

    if (rec.count >= limit) {
      const retryAfter = Math.ceil((rec.resetAt - now) / 1000);
      res.set('Retry-After', String(retryAfter));
      return res.status(429).json({
        error: 'Muitas requisições. Tente novamente em breve.',
        retryAfter,
      });
    }

    rec.count++;
    next();
  };
}

/** Limiter global para todas as rotas */
export const globalLimiter = createLimiter({ windowMs, max });

/** Limiter mais restritivo para rotas de autenticação */
export const authLimiter = createLimiter({
  windowMs,
  max: authMax,
  keyFn: (req) => {
    const ip = req.headers['x-forwarded-for'] ?? req.ip ?? 'unknown';
    const email = req.body?.email ?? '';
    return `${ip}:${email}`;
  },
});
