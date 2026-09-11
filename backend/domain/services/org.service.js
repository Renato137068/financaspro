// backend/domain/services/org.service.js
import { OrgRepository } from '../repositories/org.repository.js';
import { AppError } from '../errors.js';
import { enqueue, QUEUES } from '../../lib/queue.js';
import prisma from '../../lib/db.js';
import logger from '../../lib/logger.js';
import { assertOrgMemberCapacity, getOrgPlanTier, PLAN_LIMITS } from '../../middleware/plan.js';

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

    const freePlan = await prisma.plan.findFirst({ where: { tier: 'FREE' } });
    const now = new Date();
    const periodEnd = new Date(now);
    periodEnd.setFullYear(periodEnd.getFullYear() + 10);

    const org = await OrgRepository.create(
      { name, slug, ownerId: userId },
      freePlan
        ? {
          subscription: {
            planId: freePlan.id,
            status: 'ACTIVE',
            currentPeriodStart: now,
            currentPeriodEnd: periodEnd,
          },
        }
        : undefined,
    );

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

    await assertOrgMemberCapacity(orgId);

    // FREE não tem teamFeatures; PRO/BUSINESS liberam convites (limites via maxUsers).
    const tier = await getOrgPlanTier(orgId);
    if (!PLAN_LIMITS[tier]?.teamFeatures) {
      throw new AppError('Convite de membros disponível a partir do plano Pro', 402);
    }

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

    const existing = await OrgRepository.findMember(invitation.orgId, userId);
    if (existing) throw new AppError('Você já é membro desta organização', 409);

    await assertOrgMemberCapacity(invitation.orgId, { accepting: true });

    const result = await OrgRepository.acceptInvitationForUser(token, userId);

    if (result.error === 'NOT_FOUND') throw new AppError('Convite inválido', 404);
    if (result.error === 'USED') throw new AppError('Convite já utilizado', 409);
    if (result.error === 'EXPIRED') throw new AppError('Convite expirado', 410);
    if (result.error === 'EMAIL_MISMATCH') throw new AppError('Este convite não é para sua conta', 403);
    if (result.error === 'ALREADY_MEMBER') throw new AppError('Você já é membro desta organização', 409);

    return { orgId: result.orgId, role: result.role };
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

  /**
   * Transfere a propriedade da organização para outro membro.
   *
   * Sem isto, o dono de uma organização com membros não tinha saída: apagar a
   * conta era bloqueado (409) e a única alternativa era excluir a organização
   * inteira — levando junto os dados de todo mundo que estava lá dentro. Quem
   * quisesse apenas sair do produto era obrigado a destruir o trabalho dos
   * outros, ou a manter a conta aberta para sempre.
   */
  async transferOwnership(orgId, targetUserId, actorUserId) {
    const org = await OrgRepository.findById(orgId);
    if (!org) throw new AppError('Organização não encontrada', 404);
    if (org.ownerId !== actorUserId) {
      throw new AppError('Apenas o dono pode transferir a propriedade', 403);
    }
    if (targetUserId === actorUserId) {
      throw new AppError('Você já é o dono desta organização', 400);
    }

    // O destinatário precisa já pertencer à organização: promover alguém de
    // fora daria acesso a dados que essa pessoa nunca teve permissão de ver.
    const membro = await OrgRepository.findMember(orgId, targetUserId);
    if (!membro) throw new AppError('O novo dono precisa ser membro da organização', 400);

    await OrgRepository.transferOwnership(orgId, actorUserId, targetUserId);
    logger.info({ orgId, de: actorUserId, para: targetUserId }, 'Propriedade da organização transferida');

    return { orgId, ownerId: targetUserId };
  },

  async listInvitations(orgId) {
    return OrgRepository.listInvitations(orgId);
  },

  async revokeInvitation(orgId, invitationId, actorUserId) {
    const org = await OrgRepository.findById(orgId);
    if (!org) throw new AppError('Organização não encontrada', 404);
    const membership = await OrgRepository.findMember(orgId, actorUserId);
    if (!membership || !['OWNER', 'ADMIN'].includes(membership.role)) {
      throw new AppError('Sem permissão para revogar convites', 403);
    }
    const result = await OrgRepository.deleteInvitation(orgId, invitationId);
    if (!result.count) throw new AppError('Convite não encontrado', 404);
    return { ok: true };
  },
};
