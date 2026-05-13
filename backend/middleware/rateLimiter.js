// backend/middleware/rateLimiter.js — rate limiting por IP (in-process)
// Para produção multi-instância, substitua por redis-based rate limiter
import CONFIG from '../config.js';

const { windowMs, max, authMax } = CONFIG.rateLimit;

/**
 * Extrai o IP real do cliente.
 * req.ip já é resolvido corretamente pelo Express quando trust proxy está configurado.
 * O fallback pega apenas o primeiro IP do header para evitar spoofing com lista de IPs.
 */
function getClientIp(req) {
  if (req.ip) return req.ip;
  const forwarded = req.headers['x-forwarded-for'];
  if (forwarded) return forwarded.split(',')[0].trim();
  return 'unknown';
}

/**
 * Fábrica de rate limiter in-memory.
 * Retorna headers RFC 9110 em todas as respostas (RateLimit-Limit, RateLimit-Remaining, RateLimit-Reset).
 * @param {{ windowMs: number, max: number, keyFn?: (req) => string }} opts
 */
function createLimiter({ windowMs: wMs, max: limit, keyFn }) {
  const store = new Map();

  setInterval(() => {
    const now = Date.now();
    for (const [key, rec] of store) {
      if (now > rec.resetAt) store.delete(key);
    }
  }, wMs).unref();

  return function rateLimiter(req, res, next) {
    const key = keyFn ? keyFn(req) : getClientIp(req);
    const now = Date.now();
    const rec = store.get(key);

    if (!rec || now > rec.resetAt) {
      const resetAt = now + wMs;
      store.set(key, { count: 1, resetAt });
      res.set('RateLimit-Limit', String(limit));
      res.set('RateLimit-Remaining', String(limit - 1));
      res.set('RateLimit-Reset', String(Math.ceil(resetAt / 1000)));
      return next();
    }

    if (rec.count >= limit) {
      const retryAfter = Math.ceil((rec.resetAt - now) / 1000);
      res.set('Retry-After', String(retryAfter));
      res.set('RateLimit-Limit', String(limit));
      res.set('RateLimit-Remaining', '0');
      res.set('RateLimit-Reset', String(Math.ceil(rec.resetAt / 1000)));
      return res.status(429).json({
        error: 'Muitas requisições. Tente novamente em breve.',
        retryAfter,
      });
    }

    rec.count++;
    res.set('RateLimit-Limit', String(limit));
    res.set('RateLimit-Remaining', String(limit - rec.count));
    res.set('RateLimit-Reset', String(Math.ceil(rec.resetAt / 1000)));
    next();
  };
}

/** Limiter global para todas as rotas */
export const globalLimiter = createLimiter({ windowMs, max });

/** Limiter mais restritivo para rotas de autenticação — chave inclui email para limitar por conta */
export const authLimiter = createLimiter({
  windowMs,
  max: authMax,
  keyFn: (req) => {
    const ip = getClientIp(req);
    const email = req.body?.email ?? '';
    return `${ip}:${email}`;
  },
});
