// backend/routes/index.js — agregador de rotas da API v1
import { Router } from 'express';
import authRouter from './auth.js';
import usersRouter from './users.js';
import transactionsRouter from './transactions.js';
import accountsRouter from './accounts.js';
import budgetsRouter from './budgets.js';
import recurringRouter from './recurring.js';
import stateRouter from './state.js';

const router = Router();

router.use('/auth', authRouter);
router.use('/users', usersRouter);
router.use('/transactions', transactionsRouter);
router.use('/accounts', accountsRouter);
router.use('/budgets', budgetsRouter);
router.use('/recorrentes', recurringRouter);
router.use('/state', stateRouter);

export default router;
