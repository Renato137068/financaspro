// backend/domain/repositories/sync-op.repository.js
import prisma from '../../lib/db.js';

export const SyncOpRepository = {
  async findById(opId, userId) {
    return prisma.syncOp.findFirst({ where: { id: opId, userId } });
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
