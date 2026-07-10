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
    return prisma.verificationToken.update({ where: { id }, data: { usedAt: new Date() } });
  },

  // Invalida tokens anteriores do mesmo tipo (um pedido novo revoga os antigos).
  async deleteForUser(userId, type) {
    return prisma.verificationToken.deleteMany({ where: { userId, type } });
  },
};
