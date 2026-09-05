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

  async create(data, { subscription } = {}) {
    return prisma.$transaction(async (tx) => {
      const org = await tx.organization.create({ data });

      // O criador é automaticamente OWNER
      await tx.organizationMember.create({
        data: { orgId: org.id, userId: data.ownerId, role: 'OWNER' },
      });

      if (subscription) {
        await tx.subscription.create({
          data: { orgId: org.id, ...subscription },
        });
      }

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

  /**
   * Passa a propriedade da organização para outro membro, em uma transação.
   *
   * Os três passos precisam valer juntos: se o novo dono virasse OWNER sem que
   * `ownerId` mudasse, a organização teria dois donos aparentes e nenhum com
   * poder real — as checagens de permissão usam `ownerId`, não o papel.
   */
  async transferOwnership(orgId, fromUserId, toUserId) {
    return prisma.$transaction([
      prisma.organization.update({ where: { id: orgId }, data: { ownerId: toUserId } }),
      prisma.organizationMember.update({
        where: { orgId_userId: { orgId, userId: toUserId } },
        data: { role: 'OWNER' },
      }),
      prisma.organizationMember.update({
        where: { orgId_userId: { orgId, userId: fromUserId } },
        data: { role: 'ADMIN' },
      }),
    ]);
  },

  async createInvitation(data) {
    return prisma.invitation.create({ data });
  },

  /**
   * Aceita convite de forma atômica: claim do token + criação de membro.
   * Retorna objeto de erro simbólico em vez de lançar — o serviço traduz.
   */
  async acceptInvitationForUser(token, userId) {
    return prisma.$transaction(async (tx) => {
      const invitation = await tx.invitation.findUnique({
        where: { token },
        include: { org: true },
      });
      if (!invitation) return { error: 'NOT_FOUND' };
      if (invitation.acceptedAt) return { error: 'USED' };
      if (invitation.expiresAt < new Date()) return { error: 'EXPIRED' };

      const user = await tx.user.findUnique({ where: { id: userId } });
      if (user?.email !== invitation.email) return { error: 'EMAIL_MISMATCH' };

      const existing = await tx.organizationMember.findUnique({
        where: { orgId_userId: { orgId: invitation.orgId, userId } },
      });
      if (existing) return { error: 'ALREADY_MEMBER' };

      const claimed = await tx.invitation.updateMany({
        where: { token, acceptedAt: null },
        data: { acceptedAt: new Date() },
      });
      if (claimed.count === 0) return { error: 'USED' };

      await tx.organizationMember.create({
        data: { orgId: invitation.orgId, userId, role: invitation.role },
      });

      return { orgId: invitation.orgId, role: invitation.role };
    });
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

  async deleteInvitation(orgId, invitationId) {
    return prisma.invitation.deleteMany({
      where: { id: invitationId, orgId, acceptedAt: null },
    });
  },
};
