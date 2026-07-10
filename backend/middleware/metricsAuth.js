// backend/middleware/metricsAuth.js — protege /metrics* em produção
import CONFIG from '../config.js';

/**
 * Exige token em produção (header X-Metrics-Token ou ?token=).
 * Em dev, aberto se METRICS_TOKEN não estiver definido.
 */
export function requireMetricsAuth(req, res, next) {
  const token = CONFIG.metrics?.token;
  if (!token) {
    if (CONFIG.isProd) {
      return res.status(503).json({ error: 'Métricas desabilitadas (METRICS_TOKEN ausente)' });
    }
    return next();
  }

  // Apenas via header — evita que o token apareça na URL (e nos logs de acesso).
  const provided = req.headers['x-metrics-token'];
  if (provided !== token) {
    return res.status(401).json({ error: 'Token de métricas inválido' });
  }
  return next();
}
