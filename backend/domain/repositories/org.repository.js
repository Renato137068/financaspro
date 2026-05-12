// backend/domain/repositories/org.repository.js
import prisma from '../../lib/db.js';

export const OrgRepository = {
  async findByUser(userId) {
    return prisma.organizationMember.findMany({
      where: { userId },
      include: {
        org: { include: { subscription: { include: { plan: true } } } },
      },
      orderBy: { joinedAt: 'asc' },
    });
  },

  async findById(id) {
    return prisma.organization.findFirst({
      where: { id, active: true },
      include: {
        members: { include: { user: { select: { id: true, name: true, email: true, role: true } } } },
        subscription: { include: { plan: true } },
      },
    });
  },

  async findBySlug(slug) {
    return prisma.organization.findFirst({
      where: { slug, active: true },
    });
  },

  async create(data) {
    return prisma.$transaction(async (tx) => {
      const org = await tx.organization.create({ data });

      // O criador é automaticamente OWNER
      await tx.organizationMember.create({
        data: { orgId: org.id, userId: data.ownerId, role: 'OWNER' },
      });

      return org;
    });
  },

  async update(id, data) {
    return prisma.organization.update({ where: { id }, data });
  },

  async softDelete(id) {
    return prisma.organization.update({ where: { id }, data: { active: false } });
  },

  async findMember(orgId, userId) {
    return prisma.organizationMember.findUnique({
      where: { orgId_userId: { orgId, userId } },
    });
  },

  async addMember(orgId, userId, role = 'MEMBER') {
    return prisma.organizationMember.create({ data: { orgId, userId, role } });
  },

  async updateMember(orgId, userId, role) {
    return prisma.organizationMember.update({
      where: { orgId_userId: { orgId, userId } },
      data: { role },
    });
  },

  async removeMember(orgId, userId) {
    return prisma.organizationMember.delete({
      where: { orgId_userId: { orgId, userId } },
    });
  },

  async createInvitation(data) {
    return prisma.invitation.create({ data });
  },

  async findInvitation(token) {
    return prisma.invitation.findUnique({
      where: { token },
      include: { org: true },
    });
  },

  async acceptInvitation(token) {
    return prisma.invitation.update({
      where: { token },
      data: { acceptedAt: new Date() },
    });
  },

  async listInvitations(orgId) {
    return prisma.invitation.findMany({
      where: { orgId, acceptedAt: null, expiresAt: { gt: new Date() } },
      orderBy: { createdAt: 'desc' },
    });
  },
};
