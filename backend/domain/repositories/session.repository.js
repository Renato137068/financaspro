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

  async rotateToken(oldSessionId, { refreshToken, ...rest }) {
    return prisma.$transaction([
      prisma.session.update({ where: { id: oldSessionId }, data: { revokedAt: new Date() } }),
      prisma.session.create({ data: { ...rest, refreshToken: hashToken(refreshToken) } }),
    ]);
  },
};
