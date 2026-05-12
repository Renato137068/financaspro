// backend/domain/services/org.service.js
import { OrgRepository } from '../repositories/org.repository.js';
import { AppError } from '../errors.js';
import { enqueue, QUEUES } from '../../lib/queue.js';
import prisma from '../../lib/db.js';

function slugify(name) {
  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 50);
}

async function uniqueSlug(base) {
  let slug = slugify(base);
  let attempt = 0;
  while (await OrgRepository.findBySlug(slug)) {
    attempt++;
    slug = `${slugify(base)}-${attempt}`;
  }
  return slug;
}

export const OrgService = {
  async listForUser(userId) {
    const memberships = await OrgRepository.findByUser(userId);
    return memberships.map(m => ({
      ...m.org,
      myRole: m.role,
      joinedAt: m.joinedAt,
    }));
  },

  async getById(id, userId) {
    const org = await OrgRepository.findById(id);
    if (!org) throw new AppError('Organização não encontrada', 404);

    const membership = org.members.find(m => m.userId === userId);
    if (!membership) throw new AppError('Acesso negado', 403);

    return { ...org, myRole: membership.role };
  },

  async create(userId, body) {
    const { name } = body;
    const slug = await uniqueSlug(name);
    const org = await OrgRepository.create({ name, slug, ownerId: userId });

    // Cria subscription FREE por padrão
    const freePlan = await prisma.plan.findFirst({ where: { tier: 'FREE' } });
    if (freePlan) {
      const now = new Date();
      const periodEnd = new Date(now);
      periodEnd.setFullYear(periodEnd.getFullYear() + 10); // FREE não expira

      await prisma.subscription.create({
        data: {
          orgId:              org.id,
          planId:             freePlan.id,
          status:             'ACTIVE',
          currentPeriodStart: now,
          currentPeriodEnd:   periodEnd,
        },
      });
    }

    return org;
  },

  async update(id, userId, body) {
    const org = await OrgRepository.findById(id);
    if (!org) throw new AppError('Organização não encontrada', 404);
    if (org.ownerId !== userId) throw new AppError('Apenas o dono pode editar a organização', 403);

    const data = { name: body.name };
    if (body.name) data.slug = await uniqueSlug(body.name);

    return OrgRepository.update(id, data);
  },

  async delete(id, userId) {
    const org = await OrgRepository.findById(id);
    if (!org) throw new AppError('Organização não encontrada', 404);
    if (org.ownerId !== userId) throw new AppError('Apenas o dono pode excluir a organização', 403);
    await OrgRepository.softDelete(id);
  },

  async inviteMember(orgId, inviterUserId, email, role = 'MEMBER') {
    const org = await OrgRepository.findById(orgId);
    if (!org) throw new AppError('Organização não encontrada', 404);

    // Verifica se o convite já existe e não expirou
    const existing = await prisma.invitation.findFirst({
      where: { orgId, email, acceptedAt: null, expiresAt: { gt: new Date() } },
    });
    if (existing) throw new AppError('Convite já enviado para este e-mail', 409);

    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7);

    const invitation = await OrgRepository.createInvitation({ orgId, email, role, expiresAt });

    // Enfileira e-mail de convite
    await enqueue(QUEUES.EMAIL, 'invite-member', {
      to: email,
      templateName: 'invite-member',
      data: { orgName: org.name, token: invitation.token, role },
    });

    return invitation;
  },

  async acceptInvitation(token, userId) {
    const invitation = await OrgRepository.findInvitation(token);

    if (!invitation) throw new AppError('Convite inválido', 404);
    if (invitation.acceptedAt) throw new AppError('Convite já utilizado', 409);
    if (invitation.expiresAt < new Date()) throw new AppError('Convite expirado', 410);

    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (user?.email !== invitation.email) throw new AppError('Este convite não é para sua conta', 403);

    const existing = await OrgRepository.findMember(invitation.orgId, userId);
    if (existing) throw new AppError('Você já é membro desta organização', 409);

    await OrgRepository.addMember(invitation.orgId, userId, invitation.role);
    await OrgRepository.acceptInvitation(token);

    return { orgId: invitation.orgId, role: invitation.role };
  },

  async updateMemberRole(orgId, targetUserId, newRole, actorUserId) {
    const org = await OrgRepository.findById(orgId);
    if (!org) throw new AppError('Organização não encontrada', 404);
    if (org.ownerId !== actorUserId) throw new AppError('Apenas o dono pode alterar papéis', 403);
    if (targetUserId === actorUserId) throw new AppError('Não é possível alterar seu próprio papel', 400);

    return OrgRepository.updateMember(orgId, targetUserId, newRole);
  },

  async removeMember(orgId, targetUserId, actorUserId) {
    const org = await OrgRepository.findById(orgId);
    if (!org) throw new AppError('Organização não encontrada', 404);

    const isOwner = org.ownerId === actorUserId;
    const isSelf  = targetUserId === actorUserId;

    if (!isOwner && !isSelf) throw new AppError('Sem permissão para remover este membro', 403);
    if (isOwner && targetUserId === org.ownerId) throw new AppError('O dono não pode ser removido', 400);

    await OrgRepository.removeMember(orgId, targetUserId);
  },

  async listInvitations(orgId) {
    return OrgRepository.listInvitations(orgId);
  },
};
