// backend/routes/orgs.js — CRUD de organizações + membros + convites
import { Router } from 'express';
import { OrgService } from '../domain/services/org.service.js';
import { authenticate } from '../middleware/auth.js';
import { resolveOrg, requireOrgRole, requireOrgOwner } from '../middleware/org.js';
import { requirePlan } from '../middleware/plan.js';
import { z } from 'zod';
import { validateBody } from '../middleware/validate.js';

const router = Router();
router.use(authenticate);

const createOrgSchema = z.object({
  name: z.string().min(2).max(100),
});

const inviteSchema = z.object({
  email: z.string().email(),
  role:  z.enum(['ADMIN', 'MEMBER', 'VIEWER']).default('MEMBER'),
});

const updateMemberSchema = z.object({
  role: z.enum(['ADMIN', 'MEMBER', 'VIEWER']),
});

// ─── Listar orgs do usuário ───────────────────────────────────────────────────
router.get('/', async (req, res, next) => {
  try {
    const orgs = await OrgService.listForUser(req.user.id);
    res.json({ data: orgs });
  } catch (err) { next(err); }
});

// ─── Criar org ────────────────────────────────────────────────────────────────
router.post('/', validateBody(createOrgSchema), async (req, res, next) => {
  try {
    const org = await OrgService.create(req.user.id, req.body);
    res.status(201).json(org);
  } catch (err) { next(err); }
});

// ─── Obter org ────────────────────────────────────────────────────────────────
router.get('/:orgId', resolveOrg, async (req, res, next) => {
  try {
    const org = await OrgService.getById(req.params.orgId, req.user.id);
    res.json(org);
  } catch (err) { next(err); }
});

// ─── Atualizar org ────────────────────────────────────────────────────────────
router.patch('/:orgId', resolveOrg, requireOrgOwner, validateBody(createOrgSchema.partial()), async (req, res, next) => {
  try {
    const org = await OrgService.update(req.params.orgId, req.user.id, req.body);
    res.json(org);
  } catch (err) { next(err); }
});

// ─── Excluir org ──────────────────────────────────────────────────────────────
router.delete('/:orgId', resolveOrg, requireOrgOwner, async (req, res, next) => {
  try {
    await OrgService.delete(req.params.orgId, req.user.id);
    res.sendStatus(204);
  } catch (err) { next(err); }
});

// ─── Membros ──────────────────────────────────────────────────────────────────

// Convidar membro (requer plano PRO para times)
router.post(
  '/:orgId/invite',
  resolveOrg,
  requireOrgRole('ADMIN'),
  requirePlan('PRO'),
  validateBody(inviteSchema),
  async (req, res, next) => {
    try {
      const inv = await OrgService.inviteMember(
        req.params.orgId,
        req.user.id,
        req.body.email,
        req.body.role
      );
      res.status(201).json(inv);
    } catch (err) { next(err); }
  }
);

// Listar convites pendentes
router.get('/:orgId/invitations', resolveOrg, requireOrgRole('ADMIN'), async (req, res, next) => {
  try {
    const invitations = await OrgService.listInvitations(req.params.orgId);
    res.json({ data: invitations });
  } catch (err) { next(err); }
});

// Aceitar convite (não requer resolveOrg — o token já contém orgId)
router.post('/invitations/:token/accept', async (req, res, next) => {
  try {
    const result = await OrgService.acceptInvitation(req.params.token, req.user.id);
    res.json(result);
  } catch (err) { next(err); }
});

// Alterar papel de membro
router.patch(
  '/:orgId/members/:userId',
  resolveOrg,
  requireOrgOwner,
  validateBody(updateMemberSchema),
  async (req, res, next) => {
    try {
      const member = await OrgService.updateMemberRole(
        req.params.orgId,
        req.params.userId,
        req.body.role,
        req.user.id
      );
      res.json(member);
    } catch (err) { next(err); }
  }
);

// Remover membro
router.delete('/:orgId/members/:userId', resolveOrg, async (req, res, next) => {
  try {
    await OrgService.removeMember(req.params.orgId, req.params.userId, req.user.id);
    res.sendStatus(204);
  } catch (err) { next(err); }
});

export default router;
