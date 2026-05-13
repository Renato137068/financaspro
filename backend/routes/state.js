// backend/routes/state.js — estado completo do app para sincronização frontend
import { Router } from 'express';
import { authenticate } from '../middleware/auth.js';
import { StateService } from '../domain/services/state.service.js';

const router = Router();
router.use(authenticate);

// GET /api/v1/state — retorna snapshot completo do estado do usuário
router.get('/', async (req, res) => {
  const snapshot = await StateService.getSnapshot(req.user.id);
  res.json(snapshot);
});

export default router;
