// backend/domain/services/ledger.service.js
//
// Saldo derivado do ledger — Account.balance é apenas saldo INICIAL.
// Movimentações vêm exclusivamente de Transaction (incl. transferências).
import prisma from '../../lib/db.js';
import { fromCents, toCents } from '../../lib/money.js';

function openingCents(account) {
  return toCents(Number(account.balance ?? 0));
}

function deltaForAccount(tx, accountId) {
  const cent = toCents(Number(tx.amount));
  if (!Number.isFinite(cent)) return 0;

  if (tx.type === 'receita' && tx.accountId === accountId) return cent;
  if (tx.type === 'despesa' && tx.accountId === accountId) return -cent;
  if (tx.type === 'transferencia') {
    if (tx.accountId === accountId) return -cent;
    if (tx.targetAccountId === accountId) return cent;
  }
  return 0;
}

export const LedgerService = {
  /**
   * Saldo derivado = saldo inicial + Σ movimentações da conta.
   */
  async deriveBalance(userId, accountId) {
    const account = await prisma.account.findFirst({
      where: { id: accountId, userId, active: true },
    });
    if (!account) return null;

    const txs = await prisma.transaction.findMany({
      where: {
        userId,
        deletedAt: null,
        OR: [
          { accountId },
          { targetAccountId: accountId, type: 'transferencia' },
        ],
      },
      select: {
        type: true, amount: true, accountId: true, targetAccountId: true,
      },
    });

    const deltaCent = txs.reduce((acc, tx) => acc + deltaForAccount(tx, accountId), 0);
    return fromCents(openingCents(account) + deltaCent);
  },

  /** Patrimônio líquido agregado (receitas - despesas; transferências cancelam). */
  async deriveNetWorthDelta(userId) {
    const txs = await prisma.transaction.findMany({
      where: { userId, deletedAt: null },
      select: { type: true, amount: true },
    });
    let cent = 0;
    for (const tx of txs) {
      const v = toCents(Number(tx.amount));
      if (!Number.isFinite(v)) continue;
      if (tx.type === 'receita') cent += v;
      else if (tx.type === 'despesa') cent -= v;
    }
    return fromCents(cent);
  },

  deltaForAccount,
};
