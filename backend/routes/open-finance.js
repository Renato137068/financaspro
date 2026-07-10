// backend/routes/open-finance.js — conexões bancárias e sincronização
import { Router } from 'express';
import { z } from 'zod';
import { authenticate } from '../middleware/auth.js';
import { validateBody } from '../middleware/validate.js';
import { OpenFinanceService } from '../domain/services/open-finance.service.js';

const router = Router();

const connectSchema = z.object({
  bankName: z.string().trim().min(1).max(80).optional(),
  provider: z.enum(['sandbox']).default('sandbox'),
});

const belvoCompleteSchema = z.object({
  linkId: z.string().trim().min(1).max(120),
  bankName: z.string().trim().min(1).max(80).optional(),
});

router.use(authenticate);

router.get('/providers', async (_req, res) => {
  res.json({ data: OpenFinanceService.listProviders() });
});

router.get('/connections', async (req, res, next) => {
  try {
    const data = await OpenFinanceService.listConnections(req.user.id);
    res.json({ data });
  } catch (err) { next(err); }
});

router.post('/connections', validateBody(connectSchema), async (req, res, next) => {
  try {
    if (req.body.provider !== 'sandbox') {
      return res.status(422).json({ error: 'Use POST /belvo/complete para conexões Belvo' });
    }
    const data = await OpenFinanceService.connectSandbox(req.user.id, req.body.bankName);
    res.status(201).json({ data });
  } catch (err) { next(err); }
});

router.post('/belvo/widget-token', async (req, res, next) => {
  try {
    const data = await OpenFinanceService.createBelvoWidgetSession(req.user.id);
    res.json({ data });
  } catch (err) { next(err); }
});

router.post('/belvo/complete', validateBody(belvoCompleteSchema), async (req, res, next) => {
  try {
    const data = await OpenFinanceService.completeBelvoConnection(
      req.user.id,
      req.body.linkId,
      req.body.bankName,
    );
    res.status(201).json({ data });
  } catch (err) { next(err); }
});

router.delete('/connections/:id', async (req, res, next) => {
  try {
    const result = await OpenFinanceService.disconnect(req.user.id, req.params.id);
    res.json(result);
  } catch (err) { next(err); }
});

router.post('/connections/:id/sync', async (req, res, next) => {
  try {
    const data = await OpenFinanceService.sync(req.user.id, req.params.id);
    res.json({ data });
  } catch (err) { next(err); }
});

export default router;
