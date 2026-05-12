// backend/routes/billing.js — planos, assinaturas, webhooks Stripe
import { Router } from 'express';
import { BillingService } from '../domain/services/billing.service.js';
import { authenticate } from '../middleware/auth.js';
import { resolveOrg, requireOrgRole } from '../middleware/org.js';
import { z } from 'zod';
import { validateBody } from '../middleware/validate.js';
import express from 'express';

const router = Router();

const subscribeSchema = z.object({
  planTier: z.enum(['FREE', 'PRO', 'BUSINESS']),
  interval: z.enum(['monthly', 'yearly']).default('monthly'),
});

const portalSchema = z.object({
  returnUrl: z.string().url(),
});

// ─── Planos públicos (sem auth) ───────────────────────────────────────────────
router.get('/plans', async (_req, res, next) => {
  try {
    const plans = await BillingService.listPlans();
    res.json({ data: plans });
  } catch (err) { next(err); }
});

// ─── Webhook Stripe (sem auth, corpo raw) ─────────────────────────────────────
// IMPORTANTE: esta rota usa express.raw() para que a assinatura Stripe funcione.
// Deve ser registrada ANTES do express.json() global — feito no server.js.
router.post(
  '/webhook',
  express.raw({ type: 'application/json' }),
  async (req, res, next) => {
    try {
      const sig = req.headers['stripe-signature'];
      const result = await BillingService.handleWebhook(req.body, sig);
      res.json(result);
    } catch (err) { next(err); }
  }
);

// ─── Rotas autenticadas ───────────────────────────────────────────────────────
router.use(authenticate);

// Obter assinatura da org
router.get('/:orgId/subscription', resolveOrg, async (req, res, next) => {
  try {
    const sub = await BillingService.getSubscription(req.params.orgId);
    res.json(sub);
  } catch (err) { next(err); }
});

// Assinar/mudar plano
router.post(
  '/:orgId/subscribe',
  resolveOrg,
  requireOrgRole('OWNER'),
  validateBody(subscribeSchema),
  async (req, res, next) => {
    try {
      const sub = await BillingService.subscribe(
        req.params.orgId,
        req.body.planTier,
        req.body.interval,
        req.user.email
      );
      res.json(sub);
    } catch (err) { next(err); }
  }
);

// Cancelar assinatura (ao final do período)
router.post('/:orgId/cancel', resolveOrg, requireOrgRole('OWNER'), async (req, res, next) => {
  try {
    const sub = await BillingService.cancel(req.params.orgId);
    res.json(sub);
  } catch (err) { next(err); }
});

// Abrir portal de billing do Stripe
router.post(
  '/:orgId/portal',
  resolveOrg,
  requireOrgRole('OWNER'),
  validateBody(portalSchema),
  async (req, res, next) => {
    try {
      const session = await BillingService.createPortalSession(
        req.params.orgId,
        req.body.returnUrl
      );
      res.json(session);
    } catch (err) { next(err); }
  }
);

// Listar faturas
router.get('/:orgId/invoices', resolveOrg, requireOrgRole('MEMBER'), async (req, res, next) => {
  try {
    const invoices = await BillingService.listInvoices(req.params.orgId);
    res.json({ data: invoices });
  } catch (err) { next(err); }
});

export default router;
