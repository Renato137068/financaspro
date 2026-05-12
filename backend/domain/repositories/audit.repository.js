// backend/domain/repositories/audit.repository.js
import prisma from '../../lib/db.js';

export const AuditRepository = {
  async log({ userId, action, resource, resourceId, ipAddress, userAgent, metadata }) {
    return prisma.auditLog.create({
      data: { userId, action, resource, resourceId, ipAddress, userAgent, metadata },
    });
  },
};
