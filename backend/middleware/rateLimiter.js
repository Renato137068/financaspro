// backend/middleware/rateLimiter.js — rate limiting por IP (Redis em prod, memória em dev)
import CONFIG from '../config.js';
import redis from '../lib/redis.js';

const { windowMs, max, authMax } = CONFIG.rateLimit;

function getClientIp(req) {
  if (req.ip) return req.ip;
  const forwarded = req.headers['x-forwarded-for'];
  if (forwarded) return forwarded.split(',')[0].trim();
  return 'unknown';
}

function createMemoryLimiter({ windowMs: wMs, max: limit, keyFn }) {
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

function createRedisLimiter({ windowMs: wMs, max: limit, keyFn }) {
  const prefix = 'rl:';

  // Fallback instanciado UMA vez: criá-lo por request daria a cada chamada um
  // store vazio (rate limit viraria no-op) e vazaria um setInterval por request.
  const memoryFallback = createMemoryLimiter({ windowMs: wMs, max: limit, keyFn });

  return async function rateLimiter(req, res, next) {
    const client = redis.client;
    if (!client || !redis.isAvailable) {
      return memoryFallback(req, res, next);
    }

    const key = prefix + (keyFn ? keyFn(req) : getClientIp(req));

    try {
      const count = await client.incr(key);
      if (count === 1) await client.pexpire(key, wMs);

      const ttl = await client.pttl(key);
      const resetAt = Date.now() + Math.max(ttl, 0);

      res.set('RateLimit-Limit', String(limit));
      res.set('RateLimit-Remaining', String(Math.max(0, limit - count)));
      res.set('RateLimit-Reset', String(Math.ceil(resetAt / 1000)));

      if (count > limit) {
        const retryAfter = Math.ceil(ttl / 1000);
        res.set('Retry-After', String(Math.max(retryAfter, 1)));
        return res.status(429).json({
          error: 'Muitas requisições. Tente novamente em breve.',
          retryAfter: Math.max(retryAfter, 1),
        });
      }
      return next();
    } catch (_err) {
      return memoryFallback(req, res, next);
    }
  };
}

function createLimiter(opts) {
  if (CONFIG.isProd || process.env.REDIS_URL) {
    return createRedisLimiter(opts);
  }
  return createMemoryLimiter(opts);
}

export const globalLimiter = createLimiter({ windowMs, max });

export const authLimiter = createLimiter({
  windowMs,
  max: authMax,
  keyFn: (req) => {
    const ip = getClientIp(req);
    const email = req.body?.email ?? '';
    return `${ip}:${email}`;
  },
});
