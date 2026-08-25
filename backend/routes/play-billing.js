// backend/routes/play-billing.js — verificação de compras Google Play (Android)
import { Router } from 'express';
import { z } from 'zod';
import { authenticate } from '../middleware/auth.js';
import { validateBody, validateParams, orgIdParamSchema } from '../middleware/validate.js';
import { asyncHandler } from '../lib/async-handler.js';
import { resolveOrg, requireOrgRole } from '../middleware/org.js';
import { PlayBillingService } from '../domain/services/play-billing.service.js';

const router = Router({ mergeParams: true });
router.use(authenticate);

const verifySchema = z.object({
  productId: z.string().min(3).max(120),
  purchaseToken: z.string().min(20).max(4096),
  packageName: z.string().min(3).max(120).optional(),
});

router.post(
  '/:orgId/verify',
  validateParams(orgIdParamSchema),
  resolveOrg,
  requireOrgRole('OWNER'),
  validateBody(verifySchema),
  asyncHandler(async (req, res) => {
    const out = await PlayBillingService.verifyPurchase(req.params.orgId, req.body);
    res.json({ data: out });
  }),
);

router.get(
  '/:orgId/entitlement',
  validateParams(orgIdParamSchema),
  resolveOrg,
  requireOrgRole('MEMBER'),
  asyncHandler(async (req, res) => {
    const ent = await PlayBillingService.getEntitlement(req.params.orgId);
    res.json({ data: ent });
  }),
);

export default router;
