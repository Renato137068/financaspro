// backend/lib/redis.js — singleton ioredis com fallback gracioso
import Redis from 'ioredis';
import logger from './logger.js';

let client = null;
let isConnected = false;

function createClient() {
  const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';

  const redis = new Redis(redisUrl, {
    maxRetriesPerRequest: 3,
    enableReadyCheck: true,
    lazyConnect: true,
    connectTimeout: 5000,
    retryStrategy(times) {
      if (times > 5) return null; // desiste após 5 tentativas
      return Math.min(times * 200, 2000);
    },
  });

  redis.on('connect', () => {
    isConnected = true;
    logger.info('Redis conectado');
  });

  redis.on('ready', () => logger.debug('Redis pronto'));

  redis.on('error', (err) => {
    isConnected = false;
    // Não lança exceção — o app funciona sem Redis em dev
    logger.warn({ err: err.message }, 'Redis indisponível — operações de cache/fila desativadas');
  });

  redis.on('close', () => {
    isConnected = false;
    logger.warn('Redis desconectado');
  });

  return redis;
}

/** Conecta ao Redis. Falha silenciosamente se REDIS_URL não estiver configurada ou Redis offline. */
export async function connectRedis() {
  if (!process.env.REDIS_URL && process.env.NODE_ENV === 'development') {
    logger.info('REDIS_URL não configurada — Redis desativado (modo dev)');
    return null;
  }

  try {
    client = createClient();
    await client.connect();
    return client;
  } catch (err) {
    logger.warn({ err: err.message }, 'Falha ao conectar ao Redis — continuando sem Redis');
    return null;
  }
}

export function disconnectRedis() {
  if (client) {
    client.disconnect();
    client = null;
    isConnected = false;
  }
}

export function isRedisAvailable() {
  return isConnected && client !== null;
}

export function getRedisStatus() {
  if (!client) return 'disabled';
  return client.status;
}

/** Retorna o cliente Redis ou null se indisponível. Sempre checar antes de usar. */
export default {
  get client() { return client; },
  get isAvailable() { return isRedisAvailable(); },
  get status() { return getRedisStatus(); },
  connect: connectRedis,
  disconnect: disconnectRedis,
};
