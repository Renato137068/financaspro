// backend/domain/repositories/user.repository.js
import prisma from '../../lib/db.js';

export const UserRepository = {
  async findByEmail(email) {
    return prisma.user.findUnique({ where: { email } });
  },

  async findById(id) {
    return prisma.user.findUnique({ where: { id } });
  },

  async findAll() {
    return prisma.user.findMany({
      select: { id: true, name: true, email: true, role: true, active: true, createdAt: true },
      orderBy: { createdAt: 'desc' },
    });
  },

  async create(data) {
    return prisma.user.create({ data });
  },

  async update(id, data) {
    return prisma.user.update({ where: { id }, data });
  },

  async getConfig(userId) {
    return prisma.userConfig.findUnique({ where: { userId } });
  },

  async upsertConfig(userId, data) {
    return prisma.userConfig.upsert({
      where: { userId },
      update: { data },
      create: { userId, data },
    });
  },
};
