// backend/domain/services/user.service.js
import { UserRepository } from '../repositories/user.repository.js';
import { AppError } from '../errors.js';

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
    const config = await UserRepository.upsertConfig(userId, data);
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
};
