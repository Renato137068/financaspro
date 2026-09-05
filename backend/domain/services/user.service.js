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
   *
   * Todas as relações filhas têm onDelete: Cascade e somem junto. A exceção é
   * AuditLog, cuja relação com User é opcional — ao apagar o usuário o Prisma
   * faz SetNull e a LINHA PERMANECE. Isso é proposital: o registro de auditoria
   * precisa sobreviver para provar que a exclusão aconteceu.
   *
   * O que NÃO pode sobreviver é o conteúdo pessoal dessa linha. Endereço IP e
   * user-agent são dado pessoal (LGPD art. 5º, I) e ficavam gravados sem
   * titular — nem apagados, nem reclamáveis por ninguém. `metadata` é Json
   * livre e pode conter qualquer coisa que o chamador tenha posto lá.
   *
   * Por isso limpamos esses campos ANTES do delete, na mesma transação: se o
   * delete falhar, não sobra um log meio anonimizado; se a limpeza falhar, a
   * conta não é apagada e o pedido pode ser repetido.
   */
  async deleteAccount(userId) {
    const ownedOrgs = await prisma.organization.count({ where: { ownerId: userId } });
    if (ownedOrgs > 0) {
      throw new AppError(
        'Transfira a propriedade ou exclua suas organizações antes de apagar a conta',
        409,
      );
    }

    const [anonimizados] = await prisma.$transaction([
      prisma.auditLog.updateMany({
        where: { userId },
        data: { ipAddress: null, userAgent: null, metadata: null },
      }),
      prisma.user.delete({ where: { id: userId } }),
    ]);

    logger.info(
      { userId, logsAnonimizados: anonimizados.count },
      'Conta excluída a pedido do titular (LGPD)',
    );
    return { deleted: true, auditLogsAnonymized: anonimizados.count };
  },
};
