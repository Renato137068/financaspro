// backend/domain/repositories/session.repository.js
import prisma from '../../lib/db.js';
import { hashToken } from '../../lib/jwt.js';

// Refresh tokens são armazenados como SHA-256 hash — o valor original nunca persiste no banco.
// Se o DB for comprometido, os tokens não são diretamente utilizáveis.

export const SessionRepository = {
  async findByToken(refreshToken) {
    return prisma.session.findUnique({ where: { refreshToken: hashToken(refreshToken) } });
  },

  async create({ refreshToken, ...rest }) {
    return prisma.session.create({ data: { ...rest, refreshToken: hashToken(refreshToken) } });
  },

  async revokeByUserAndToken(userId, refreshToken) {
    return prisma.session.updateMany({
      where: { userId, refreshToken: hashToken(refreshToken) },
      data: { revokedAt: new Date() },
    });
  },

  // Revoga TODAS as sessões ativas do usuário (reuso de token, troca de senha, etc.).
  async revokeAllForUser(userId) {
    return prisma.session.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  },

  async rotateToken(oldSessionId, { refreshToken, ...rest }) {
    return prisma.$transaction(async (tx) => {
      const revoked = await tx.session.updateMany({
        where: { id: oldSessionId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      if (revoked.count === 0) return false;
      await tx.session.create({ data: { ...rest, refreshToken: hashToken(refreshToken) } });
      return true;
    });
  },
};
