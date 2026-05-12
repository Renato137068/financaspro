// backend/middleware/org.js — resolve org do contexto e verifica membership
import prisma from '../lib/db.js';
import { AppError } from '../domain/errors.js';

const ORG_ROLE_ORDER = { VIEWER: 0, MEMBER: 1, ADMIN: 2, OWNER: 3 };

/**
 * Resolve a org do parâmetro :orgId e injeta req.org + req.orgMembership.
 * Deve ser usado DEPOIS de authenticate.
 */
export async function resolveOrg(req, _res, next) {
  try {
    const orgId = req.params.orgId || req.query.orgId || req.body?.orgId;
    if (!orgId) return next(new AppError('orgId obrigatório', 400));

    const org = await prisma.organization.findFirst({
      where: { id: orgId, active: true },
    });

    if (!org) throw new AppError('Organização não encontrada', 404);

    const membership = await prisma.organizationMember.findUnique({
      where: { orgId_userId: { orgId, userId: req.user.id } },
    });

    if (!membership && req.user.role !== 'ADMIN') {
      throw new AppError('Acesso negado a esta organização', 403);
    }

    req.org           = org;
    req.orgMembership = membership;
    next();
  } catch (err) {
    next(err);
  }
}

/**
 * Exige que o membro tenha ao menos o papel especificado na org.
 * Uso: router.delete('/:orgId', resolveOrg, requireOrgRole('ADMIN'), handler)
 */
export function requireOrgRole(minRole) {
  return (req, _res, next) => {
    if (req.user.role === 'ADMIN') return next(); // ADMIN global bypassa

    const membership = req.orgMembership;
    if (!membership) return next(new AppError('Não é membro desta organização', 403));

    if (ORG_ROLE_ORDER[membership.role] < ORG_ROLE_ORDER[minRole]) {
      return next(new AppError(`Papel mínimo requerido: ${minRole}`, 403));
    }

    next();
  };
}

/** Verifica se o usuário é dono (OWNER) da org. */
export function requireOrgOwner(req, _res, next) {
  if (req.user.role === 'ADMIN') return next();

  if (req.org?.ownerId !== req.user.id) {
    return next(new AppError('Apenas o dono da organização pode realizar esta ação', 403));
  }
  next();
}
