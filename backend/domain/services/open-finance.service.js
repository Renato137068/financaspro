// backend/domain/services/open-finance.service.js
import { OpenFinanceRepository } from '../repositories/open-finance.repository.js';
import { TransactionRepository } from '../repositories/transaction.repository.js';
import {
  getProvider,
  SANDBOX_PROVIDER,
  BELVO_PROVIDER,
} from '../../lib/open-finance/index.js';
import {
  isBelvoConfigured,
  createBelvoWidgetToken,
  deleteBelvoLink,
} from '../../lib/open-finance/belvo.js';
import { AppError } from '../errors.js';
import { StateService } from './state.service.js';

function toPublicConnection(conn) {
  return {
    id: conn.id,
    provider: conn.provider,
    bankName: conn.bankName,
    status: conn.status,
    linkedAt: conn.createdAt,
    lastSync: conn.lastSyncAt,
    externalLinkId: conn.externalLinkId,
  };
}

export const OpenFinanceService = {
  listProviders() {
    return {
      sandbox: true,
      belvo: isBelvoConfigured(),
      default: isBelvoConfigured() ? BELVO_PROVIDER : SANDBOX_PROVIDER,
    };
  },

  async listConnections(userId) {
    const rows = await OpenFinanceRepository.listByUser(userId);
    return rows.map(toPublicConnection);
  },

  async connectSandbox(userId, bankName) {
    const conn = await OpenFinanceRepository.create({
      userId,
      provider: SANDBOX_PROVIDER,
      bankName: (bankName || 'Banco Demo').trim() || 'Banco Demo',
      status: 'linked',
    });
    return toPublicConnection(conn);
  },

  async createBelvoWidgetSession(userId) {
    if (!isBelvoConfigured()) {
      throw new AppError('Belvo não configurado no servidor', 503);
    }
    return createBelvoWidgetToken(userId);
  },

  async completeBelvoConnection(userId, linkId, bankName) {
    if (!linkId) throw new AppError('linkId obrigatório', 422);
    if (!isBelvoConfigured()) throw new AppError('Belvo não configurado', 503);

    const existing = await OpenFinanceRepository.listByUser(userId);
    const dup = existing.find(function(c) {
      return c.externalLinkId === linkId;
    });
    if (dup) return toPublicConnection(dup);

    const conn = await OpenFinanceRepository.create({
      userId,
      provider: BELVO_PROVIDER,
      bankName: (bankName || 'Conta bancária').trim() || 'Conta bancária',
      status: 'linked',
      externalLinkId: linkId,
    });
    return toPublicConnection(conn);
  },

  async disconnect(userId, connectionId) {
    const conn = await OpenFinanceRepository.findById(connectionId, userId);
    if (!conn) throw new AppError('Conexão não encontrada', 404);

    if (conn.provider === BELVO_PROVIDER && conn.externalLinkId) {
      await deleteBelvoLink(conn.externalLinkId);
    }

    await OpenFinanceRepository.delete(connectionId, userId);
    return { ok: true };
  },

  async sync(userId, connectionId) {
    const conn = await OpenFinanceRepository.findById(connectionId, userId);
    if (!conn) throw new AppError('Conexão não encontrada', 404);

    const provider = getProvider(conn.provider);
    let items = await Promise.resolve(provider.fetchTransactions(conn));
    if (!Array.isArray(items)) items = [];

    let imported = 0;
    let skipped = 0;

    for (const raw of items) {
      const openFinanceId = `${connectionId}:${raw.externalId}`;
      const existing = await TransactionRepository.findByOpenFinanceId(userId, openFinanceId);
      if (existing) {
        skipped += 1;
        continue;
      }

      await TransactionRepository.create({
        userId,
        type: raw.type,
        amount: raw.amount,
        description: raw.description,
        category: raw.category,
        date: new Date(`${raw.date}T12:00:00.000Z`),
        openFinanceId,
        tags: ['open-finance'],
      });
      imported += 1;
    }

    await OpenFinanceRepository.updateLastSync(connectionId, new Date());
    StateService.invalidateCache(userId);

    return { imported, skipped };
  },
};
