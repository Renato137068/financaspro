// backend/domain/services/user.service.js
import prisma from '../../lib/db.js';
import { UserRepository } from '../repositories/user.repository.js';
import { AppError } from '../errors.js';
import { sanitizeUserConfig } from '../../lib/config-sanitize.js';
import logger from '../../lib/logger.js';

export const UserService = {
  async updateProfile(userId, body) {
    const user = await UserRepository.update(userId, body);
    return { id: user.id, name: user.name, email: user.email, role: user.role };
  },

  async getConfig(userId) {
    const config = await UserRepository.getConfig(userId);
    return config?.data ?? {};
  },

  async updateConfig(userId, data) {
    const safe = sanitizeUserConfig(data);
    const config = await UserRepository.upsertConfig(userId, safe);
    return config.data;
  },

  async listAll() {
    return UserRepository.findAll();
  },

  async updateById(id, body) {
    const user = await UserRepository.findById(id);
    if (!user) throw new AppError('Usuário não encontrado', 404);
    const updated = await UserRepository.update(id, body);
    return { id: updated.id, name: updated.name, email: updated.email, role: updated.role, active: updated.active };
  },

  /**
   * LGPD — portabilidade: exporta todos os dados pessoais do usuário em JSON.
   * Não inclui hashes de senha, salt nem segredos TOTP.
   */
  async exportData(userId) {
    const [user, config, transactions, accounts, budgets, recurring, openFinance] = await Promise.all([
      prisma.user.findUnique({
        where: { id: userId },
        select: { id: true, name: true, email: true, role: true, createdAt: true, totpEnabled: true },
      }),
      prisma.userConfig.findUnique({ where: { userId }, select: { data: true } }),
      prisma.transaction.findMany({ where: { userId } }),
      prisma.account.findMany({ where: { userId } }),
      prisma.budget.findMany({ where: { userId } }),
      prisma.recurringTransaction.findMany({ where: { userId } }),
      prisma.openFinanceConnection.findMany({
        where: { userId },
        select: { id: true, provider: true, institution: true, status: true, createdAt: true },
      }),
    ]);

    if (!user) throw new AppError('Usuário não encontrado', 404);

    return {
      exportedAt: new Date().toISOString(),
      profile: user,
      config: config?.data ?? {},
      transactions,
      accounts,
      budgets,
      recurring,
      openFinanceConnections: openFinance,
    };
  },

  /**
   * LGPD — direito ao esquecimento: apaga a conta e todos os dados pessoais.
   * As relações filhas têm onDelete: Cascade; logs de auditoria são anonimizados
   * (userId → null). Bloqueia se o usuário for dono de organização.
   */
  async deleteAccount(userId) {
    const ownedOrgs = await prisma.organization.count({ where: { ownerId: userId } });
    if (ownedOrgs > 0) {
      throw new AppError(
        'Transfira ou exclua suas organizações antes de apagar a conta',
        409,
      );
    }
    await prisma.user.delete({ where: { id: userId } });
    logger.info({ userId }, 'Conta excluída a pedido do titular (LGPD)');
    return { deleted: true };
  },
};
