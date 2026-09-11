// backend/domain/repositories/verification-token.repository.js
import prisma from '../../lib/db.js';
import { hashToken } from '../../lib/jwt.js';

// Apenas o SHA-256 do token é persistido — o valor original nunca vai ao banco.
// Um vazamento de DB não permite reusar os tokens diretamente.

export const VerificationTokenRepository = {
  async create({ token, type, userId, expiresAt }) {
    return prisma.verificationToken.create({
      data: { tokenHash: hashToken(token), type, userId, expiresAt },
    });
  },

  // Retorna o registro apenas se: existe, é do tipo esperado, não usado e não expirado.
  async findValid(token, type) {
    const rec = await prisma.verificationToken.findUnique({
      where: { tokenHash: hashToken(token) },
    });
    if (!rec || rec.type !== type || rec.usedAt || rec.expiresAt < new Date()) return null;
    return rec;
  },

  async consume(id) {
    const result = await prisma.verificationToken.updateMany({
      where: { id, usedAt: null },
      data: { usedAt: new Date() },
    });
    return result.count > 0;
  },

  /** Consome token, troca senha e revoga sessões em uma única transação. */
  async consumeForPasswordReset({ tokenId, userId, passwordSalt, passwordHash }) {
    return prisma.$transaction(async (tx) => {
      const consumed = await tx.verificationToken.updateMany({
        where: { id: tokenId, usedAt: null },
        data: { usedAt: new Date() },
      });
      if (consumed.count === 0) return false;

      await tx.user.update({
        where: { id: userId },
        data: { passwordSalt, passwordHash },
      });

      await tx.session.updateMany({
        where: { userId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      return true;
    });
  },

  // Invalida tokens anteriores do mesmo tipo (um pedido novo revoga os antigos).
  async deleteForUser(userId, type) {
    return prisma.verificationToken.deleteMany({ where: { userId, type } });
  },
};
