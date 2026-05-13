// backend/middleware/auth.js — verificação de JWT e hidratação de req.user
import { verifyAccessToken } from '../lib/jwt.js';
import prisma from '../lib/db.js';

/**
 * Extrai e verifica o Bearer token. Hidrata req.user com o usuário do banco.
 * Retorna 401 se token ausente/inválido, 403 se usuário inativo, 503 se DB indisponível.
 */
export async function authenticate(req, res, next) {
  const header = req.headers.authorization ?? '';
  const token = header.startsWith('Bearer ') ? header.slice(7).trim() : '';

  if (!token) return res.status(401).json({ error: 'Token de autenticação ausente' });

  let payload;
  try {
    payload = verifyAccessToken(token);
  } catch {
    return res.status(401).json({ error: 'Token inválido ou expirado' });
  }

  let user;
  try {
    user = await prisma.user.findUnique({ where: { id: payload.sub } });
  } catch {
    return res.status(503).json({ error: 'Serviço temporariamente indisponível' });
  }

  if (!user) return res.status(401).json({ error: 'Usuário não encontrado' });
  if (!user.active) return res.status(403).json({ error: 'Conta desativada' });

  req.user = user;
  next();
}

/**
 * Versão opcional: não rejeita requisições sem token (req.user = null).
 * Útil para rotas públicas que se comportam diferente quando autenticadas.
 */
export async function optionalAuth(req, res, next) {
  const header = req.headers.authorization ?? '';
  const token = header.startsWith('Bearer ') ? header.slice(7).trim() : '';

  if (!token) {
    req.user = null;
    return next();
  }

  try {
    const payload = verifyAccessToken(token);
    req.user = await prisma.user.findUnique({ where: { id: payload.sub } }) ?? null;
  } catch {
    req.user = null;
  }
  next();
}
