// backend/domain/repositories/sync-op.repository.js
import prisma from '../../lib/db.js';

export const SyncOpRepository = {
  async findById(opId, userId) {
    return prisma.syncOp.findFirst({ where: { id: opId, userId } });
  },

  /**
   * Reserva opId de forma atômica. Retorna { claimed: true } se este worker
   * deve aplicar a mutação; { claimed: false, existing } se outro já processou.
   */
  async claim(opId, userId, { entity, resourceId }) {
    try {
      await prisma.syncOp.create({
        data: {
          id: opId,
          userId,
          entity: entity || 'transaction',
          resourceId: resourceId || '',
          action: 'pending',
          resultJson: null,
        },
      });
      return { claimed: true };
    } catch (err) {
      if (err?.code === 'P2002') {
        const existing = await this.findById(opId, userId);
        return { claimed: false, existing };
      }
      throw err;
    }
  },

  async complete(opId, userId, result) {
    return prisma.syncOp.update({
      where: { id: opId },
      data: {
        action: result.action || 'done',
        resultJson: JSON.stringify(result),
      },
    });
  },

  async record(opId, userId, { entity, resourceId, action, resultJson }) {
    return prisma.syncOp.create({
      data: {
        id: opId,
        userId,
        entity,
        resourceId,
        action,
        resultJson: resultJson != null ? JSON.stringify(resultJson) : null,
      },
    });
  },
};
