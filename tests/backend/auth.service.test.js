/**
 * auth.service.test.js — regras de autenticação sem banco.
 *
 * Todos os repositórios, Redis, fila e logger são mockados; o serviço é
 * importado depois dos mocks (jest.unstable_mockModule exige import dinâmico).
 * jwt.js roda de verdade — assinar/verificar token é barato e mockar esconderia
 * bugs de payload.
 */
import { jest } from '@jest/globals';
import { pbkdf2Sync } from 'crypto';
import {
  makeUserRepo, makeSessionRepo, makeAuditRepo, makeVerificationRepo,
  makeLogger, makeRedisOffline, makeQueue, userFixture,
} from './helpers/mocks.js';

const ITER = 1000; // igual a PBKDF2_ITERATIONS do setup-backend.js

/** Reproduz o formato "<iterations>:<hex>" gravado pelo serviço. */
function hashFor(password, saltHex, iterations = ITER) {
  const hex = pbkdf2Sync(password, Buffer.from(saltHex, 'hex'), iterations, 32, 'sha256').toString('hex');
  return `${iterations}:${hex}`;
}

let UserRepository, SessionRepository, AuditRepository, VerificationTokenRepository;
let queueMock, AuthService, AppError;

beforeEach(async () => {
  jest.resetModules();

  UserRepository = makeUserRepo();
  SessionRepository = makeSessionRepo();
  AuditRepository = makeAuditRepo();
  VerificationTokenRepository = makeVerificationRepo();
  queueMock = makeQueue();

  jest.unstable_mockModule('../../backend/domain/repositories/user.repository.js', () => ({ UserRepository }));
  jest.unstable_mockModule('../../backend/domain/repositories/session.repository.js', () => ({ SessionRepository }));
  jest.unstable_mockModule('../../backend/domain/repositories/audit.repository.js', () => ({ AuditRepository }));
  jest.unstable_mockModule('../../backend/domain/repositories/verification-token.repository.js', () => ({ VerificationTokenRepository }));
  jest.unstable_mockModule('../../backend/lib/logger.js', makeLogger);
  jest.unstable_mockModule('../../backend/lib/redis.js', makeRedisOffline);
  jest.unstable_mockModule('../../backend/lib/queue.js', () => queueMock);
  jest.unstable_mockModule('../../backend/domain/services/totp.service.js', () => ({
    TotpService: { createPendingLogin: jest.fn(() => ({ requires2fa: true, pendingToken: 'pending-1' })) },
  }));

  ({ AuthService } = await import('../../backend/domain/services/auth.service.js'));
  ({ AppError } = await import('../../backend/domain/errors.js'));
});

// ─── register ────────────────────────────────────────────────────────────────
describe('AuthService.register', () => {
  test('cria usuário e devolve apenas campos públicos', async () => {
    UserRepository.findByEmail.mockResolvedValue(null);
    UserRepository.create.mockResolvedValue(userFixture());

    const out = await AuthService.register('Renato', 'renato@example.com', 'senha123!', {});

    expect(out).toEqual({
      id: 'user-1', name: 'Renato', email: 'renato@example.com', role: 'USER', totpEnabled: false,
    });
    expect(out.passwordHash).toBeUndefined();
    expect(out.passwordSalt).toBeUndefined();
  });

  test('grava hash no formato "<iterations>:<hex>" e nunca a senha em claro', async () => {
    UserRepository.findByEmail.mockResolvedValue(null);
    UserRepository.create.mockResolvedValue(userFixture());

    await AuthService.register('Renato', 'renato@example.com', 'senha123!', {});

    const [data] = UserRepository.create.mock.calls[0];
    expect(data.passwordHash).toMatch(/^\d+:[0-9a-f]{64}$/);
    expect(data.passwordHash).not.toContain('senha123!');
    expect(data.passwordSalt).toMatch(/^[0-9a-f]{32}$/);
  });

  test('cada cadastro usa um salt novo', async () => {
    UserRepository.findByEmail.mockResolvedValue(null);
    UserRepository.create.mockResolvedValue(userFixture());

    await AuthService.register('A', 'a@example.com', 'senha123!', {});
    await AuthService.register('B', 'b@example.com', 'senha123!', {});

    const [first] = UserRepository.create.mock.calls[0];
    const [second] = UserRepository.create.mock.calls[1];
    expect(first.passwordSalt).not.toBe(second.passwordSalt);
    expect(first.passwordHash).not.toBe(second.passwordHash);
  });

  test('rejeita e-mail já cadastrado com 409', async () => {
    UserRepository.findByEmail.mockResolvedValue(userFixture());
    await expect(AuthService.register('X', 'renato@example.com', 'senha123!', {}))
      .rejects.toMatchObject({ status: 409 });
    expect(UserRepository.create).not.toHaveBeenCalled();
  });

  test('falha ao enfileirar e-mail de verificação não derruba o cadastro', async () => {
    UserRepository.findByEmail.mockResolvedValue(null);
    UserRepository.create.mockResolvedValue(userFixture());
    queueMock.enqueue.mockRejectedValue(new Error('SMTP fora do ar'));

    await expect(AuthService.register('Renato', 'renato@example.com', 'senha123!', {}))
      .resolves.toMatchObject({ id: 'user-1' });
  });

  test('registra evento de auditoria', async () => {
    UserRepository.findByEmail.mockResolvedValue(null);
    UserRepository.create.mockResolvedValue(userFixture());

    await AuthService.register('Renato', 'renato@example.com', 'senha123!', { ip: '1.2.3.4' });

    expect(AuditRepository.log).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'register', userId: 'user-1', ip: '1.2.3.4' }),
    );
  });
});

// ─── login ───────────────────────────────────────────────────────────────────
describe('AuthService.login', () => {
  const SALT = '00112233445566778899aabbccddeeff';

  function validUser(over = {}) {
    return userFixture({ passwordSalt: SALT, passwordHash: hashFor('senha123!', SALT), ...over });
  }

  test('senha correta devolve tokens e usuário público', async () => {
    UserRepository.findByEmail.mockResolvedValue(validUser());

    const out = await AuthService.login('renato@example.com', 'senha123!', {});

    expect(out.accessToken).toEqual(expect.any(String));
    expect(out.refreshToken).toEqual(expect.any(String));
    expect(out.user).toEqual({
      id: 'user-1', name: 'Renato', email: 'renato@example.com', role: 'USER', totpEnabled: false,
    });
    expect(SessionRepository.create).toHaveBeenCalled();
  });

  test('senha errada devolve 401 sem criar sessão', async () => {
    UserRepository.findByEmail.mockResolvedValue(validUser());

    await expect(AuthService.login('renato@example.com', 'errada', {}))
      .rejects.toMatchObject({ status: 401 });
    expect(SessionRepository.create).not.toHaveBeenCalled();
  });

  test('e-mail inexistente devolve a mesma mensagem de senha errada (anti-enumeração)', async () => {
    UserRepository.findByEmail.mockResolvedValue(null);

    const inexistente = await AuthService.login('nao@existe.com', 'x', {}).catch(e => e);
    UserRepository.findByEmail.mockResolvedValue(validUser());
    const senhaErrada = await AuthService.login('renato@example.com', 'errada', {}).catch(e => e);

    expect(inexistente.message).toBe(senhaErrada.message);
    expect(inexistente.status).toBe(senhaErrada.status);
  });

  test('conta desativada só é revelada após senha correta', async () => {
    UserRepository.findByEmail.mockResolvedValue(validUser({ active: false }));

    await expect(AuthService.login('renato@example.com', 'senha123!', {}))
      .rejects.toMatchObject({ status: 403 });

    // Com senha errada, a resposta continua sendo 401 genérico.
    await expect(AuthService.login('renato@example.com', 'errada', {}))
      .rejects.toMatchObject({ status: 401 });
  });

  test('bloqueia a conta após o limite de tentativas (fallback em memória)', async () => {
    UserRepository.findByEmail.mockResolvedValue(validUser());

    for (let i = 0; i < 3; i++) {
      await AuthService.login('renato@example.com', 'errada', {}).catch(() => {});
    }

    // Mesmo com a senha certa, o lockout responde 429.
    await expect(AuthService.login('renato@example.com', 'senha123!', {}))
      .rejects.toMatchObject({ status: 429 });
  });

  test('login bem-sucedido limpa o contador de falhas', async () => {
    UserRepository.findByEmail.mockResolvedValue(validUser());

    await AuthService.login('renato@example.com', 'errada', {}).catch(() => {});
    await AuthService.login('renato@example.com', 'errada', {}).catch(() => {});
    await AuthService.login('renato@example.com', 'senha123!', {});

    // Contador zerado: mais duas falhas não devem bloquear.
    await AuthService.login('renato@example.com', 'errada', {}).catch(() => {});
    await AuthService.login('renato@example.com', 'errada', {}).catch(() => {});
    await expect(AuthService.login('renato@example.com', 'senha123!', {}))
      .resolves.toHaveProperty('accessToken');
  });

  test('aceita hash legado sem prefixo (interpretado como 100k iterações)', async () => {
    const legacyHash = pbkdf2Sync('senha123!', Buffer.from(SALT, 'hex'), 100000, 32, 'sha256').toString('hex');
    UserRepository.findByEmail.mockResolvedValue(validUser({ passwordHash: legacyHash }));

    await expect(AuthService.login('renato@example.com', 'senha123!', {}))
      .resolves.toHaveProperty('accessToken');
  });

  test('faz upgrade transparente de hash abaixo do alvo de iterações', async () => {
    // Alvo nos testes é 1000 (setup-backend.js); 500 está abaixo → deve re-hashear.
    UserRepository.findByEmail.mockResolvedValue(validUser({ passwordHash: hashFor('senha123!', SALT, 500) }));

    await AuthService.login('renato@example.com', 'senha123!', {});

    expect(UserRepository.update).toHaveBeenCalledWith(
      'user-1', expect.objectContaining({ passwordHash: expect.stringMatching(/^1000:/) }),
    );
  });

  test('hash já no alvo não dispara escrita desnecessária', async () => {
    UserRepository.findByEmail.mockResolvedValue(validUser());

    await AuthService.login('renato@example.com', 'senha123!', {});

    expect(UserRepository.update).not.toHaveBeenCalled();
  });

  test('falha no re-hash não impede o login', async () => {
    UserRepository.findByEmail.mockResolvedValue(validUser({ passwordHash: hashFor('senha123!', SALT, 500) }));
    UserRepository.update.mockRejectedValue(new Error('banco indisponível'));

    await expect(AuthService.login('renato@example.com', 'senha123!', {}))
      .resolves.toHaveProperty('accessToken');
  });

  test('usuário com 2FA recebe desafio pendente em vez de tokens', async () => {
    UserRepository.findByEmail.mockResolvedValue(
      validUser({ totpEnabled: true, totpSecret: 'enc:segredo' }),
    );

    const out = await AuthService.login('renato@example.com', 'senha123!', {});

    expect(out).toEqual({ requires2fa: true, pendingToken: 'pending-1' });
    expect(out.accessToken).toBeUndefined();
    expect(SessionRepository.create).not.toHaveBeenCalled();
  });

  test('dois logins seguidos geram refresh tokens distintos', async () => {
    UserRepository.findByEmail.mockResolvedValue(validUser());

    const a = await AuthService.login('renato@example.com', 'senha123!', {});
    const b = await AuthService.login('renato@example.com', 'senha123!', {});

    expect(a.refreshToken).not.toBe(b.refreshToken);
  });
});

// ─── refresh ─────────────────────────────────────────────────────────────────
describe('AuthService.refresh', () => {
  const SALT = '00112233445566778899aabbccddeeff';
  const validUser = () => userFixture({ passwordSalt: SALT, passwordHash: hashFor('senha123!', SALT) });

  async function tokenFor() {
    UserRepository.findByEmail.mockResolvedValue(validUser());
    const { refreshToken } = await AuthService.login('renato@example.com', 'senha123!', {});
    return refreshToken;
  }

  test('rotaciona a sessão e devolve novos tokens', async () => {
    const refreshToken = await tokenFor();
    SessionRepository.findByToken.mockResolvedValue({
      id: 'sess-1', userId: 'user-1', revokedAt: null, expiresAt: new Date(Date.now() + 60_000),
    });
    UserRepository.findById.mockResolvedValue(validUser());
    SessionRepository.rotateToken.mockResolvedValue(true);

    const out = await AuthService.refresh(refreshToken, {});

    expect(out.accessToken).toEqual(expect.any(String));
    expect(SessionRepository.rotateToken).toHaveBeenCalledWith('sess-1', expect.objectContaining({ userId: 'user-1' }));
  });

  test('refresh concorrente revoga família quando rotação condicional falha', async () => {
    const refreshToken = await tokenFor();
    SessionRepository.findByToken.mockResolvedValue({
      id: 'sess-1', userId: 'user-1', revokedAt: null, expiresAt: new Date(Date.now() + 60_000),
    });
    UserRepository.findById.mockResolvedValue(validUser());
    SessionRepository.rotateToken.mockResolvedValue(false);

    await expect(AuthService.refresh(refreshToken, {})).rejects.toMatchObject({ status: 401 });

    expect(SessionRepository.revokeAllForUser).toHaveBeenCalledWith('user-1');
    expect(AuditRepository.log).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'refresh_concurrent_detected' }),
    );
  });

  test('token malformado devolve 401 sem consultar sessão', async () => {
    await expect(AuthService.refresh('nao-e-um-jwt', {})).rejects.toMatchObject({ status: 401 });
    expect(SessionRepository.findByToken).not.toHaveBeenCalled();
  });

  test('sessão inexistente devolve 401', async () => {
    const refreshToken = await tokenFor();
    SessionRepository.findByToken.mockResolvedValue(null);

    await expect(AuthService.refresh(refreshToken, {})).rejects.toMatchObject({ status: 401 });
  });

  test('sessão expirada devolve 401', async () => {
    const refreshToken = await tokenFor();
    SessionRepository.findByToken.mockResolvedValue({
      id: 'sess-1', userId: 'user-1', revokedAt: null, expiresAt: new Date(Date.now() - 1000),
    });

    await expect(AuthService.refresh(refreshToken, {})).rejects.toMatchObject({ status: 401 });
  });

  test('reuso de token revogado revoga toda a família de sessões', async () => {
    const refreshToken = await tokenFor();
    SessionRepository.findByToken.mockResolvedValue({
      id: 'sess-1', userId: 'user-1', revokedAt: new Date(), expiresAt: new Date(Date.now() + 60_000),
    });

    await expect(AuthService.refresh(refreshToken, {})).rejects.toMatchObject({ status: 401 });

    expect(SessionRepository.revokeAllForUser).toHaveBeenCalledWith('user-1');
    expect(AuditRepository.log).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'refresh_reuse_detected' }),
    );
  });

  test('usuário desativado no meio da sessão não consegue renovar', async () => {
    const refreshToken = await tokenFor();
    SessionRepository.findByToken.mockResolvedValue({
      id: 'sess-1', userId: 'user-1', revokedAt: null, expiresAt: new Date(Date.now() + 60_000),
    });
    UserRepository.findById.mockResolvedValue(userFixture({ active: false }));

    await expect(AuthService.refresh(refreshToken, {})).rejects.toMatchObject({ status: 401 });
  });
});

// ─── senha ───────────────────────────────────────────────────────────────────
describe('AuthService — gestão de senha', () => {
  const SALT = '00112233445566778899aabbccddeeff';
  const validUser = () => userFixture({ passwordSalt: SALT, passwordHash: hashFor('senha123!', SALT) });

  test('checkPassword confirma a senha correta', async () => {
    UserRepository.findById.mockResolvedValue(validUser());
    await expect(AuthService.checkPassword('user-1', 'senha123!')).resolves.toBe(true);
    await expect(AuthService.checkPassword('user-1', 'outra')).resolves.toBe(false);
  });

  test('checkPassword devolve false para usuário inexistente', async () => {
    UserRepository.findById.mockResolvedValue(null);
    await expect(AuthService.checkPassword('fantasma', 'x')).resolves.toBe(false);
  });

  test('changePassword troca o hash e revoga todas as sessões', async () => {
    UserRepository.findById.mockResolvedValue(validUser());

    await AuthService.changePassword('user-1', 'senha123!', 'novaSenha456!', {});

    const [, data] = UserRepository.update.mock.calls[0];
    expect(data.passwordHash).toMatch(/^1000:[0-9a-f]{64}$/);
    expect(data.passwordSalt).not.toBe(SALT); // salt novo a cada troca
    expect(SessionRepository.revokeAllForUser).toHaveBeenCalledWith('user-1');
  });

  test('changePassword rejeita senha atual incorreta', async () => {
    UserRepository.findById.mockResolvedValue(validUser());

    await expect(AuthService.changePassword('user-1', 'errada', 'novaSenha456!', {}))
      .rejects.toMatchObject({ status: 401 });
    expect(UserRepository.update).not.toHaveBeenCalled();
    expect(SessionRepository.revokeAllForUser).not.toHaveBeenCalled();
  });

  test('requestPasswordReset é silencioso para e-mail inexistente', async () => {
    UserRepository.findByEmail.mockResolvedValue(null);

    await expect(AuthService.requestPasswordReset('nao@existe.com', {})).resolves.toBeUndefined();
    expect(queueMock.enqueue).not.toHaveBeenCalled();
    expect(VerificationTokenRepository.create).not.toHaveBeenCalled();
  });

  test('requestPasswordReset ignora conta desativada', async () => {
    UserRepository.findByEmail.mockResolvedValue(userFixture({ active: false }));

    await AuthService.requestPasswordReset('renato@example.com', {});
    expect(queueMock.enqueue).not.toHaveBeenCalled();
  });

  test('requestPasswordReset gera token de uso único e enfileira e-mail', async () => {
    UserRepository.findByEmail.mockResolvedValue(validUser());

    await AuthService.requestPasswordReset('renato@example.com', {});

    expect(VerificationTokenRepository.deleteForUser).toHaveBeenCalledWith('user-1', 'password_reset');
    const [rec] = VerificationTokenRepository.create.mock.calls[0];
    expect(rec.token).toMatch(/^[0-9a-f]{64}$/);
    expect(rec.type).toBe('password_reset');
    expect(rec.expiresAt.getTime()).toBeGreaterThan(Date.now());
    expect(queueMock.enqueue).toHaveBeenCalledWith('email', 'password-reset', expect.any(Object));
  });

  test('resetPassword consome o token, troca a senha e revoga sessões', async () => {
    VerificationTokenRepository.findValid.mockResolvedValue({ id: 'tok-1', userId: 'user-1' });
    VerificationTokenRepository.consumeForPasswordReset.mockResolvedValue(true);

    await AuthService.resetPassword('token-valido', 'novaSenha456!', {});

    expect(VerificationTokenRepository.consumeForPasswordReset).toHaveBeenCalledWith(expect.objectContaining({
      tokenId: 'tok-1',
      userId: 'user-1',
      passwordHash: expect.stringMatching(/^1000:/),
    }));
    expect(UserRepository.update).not.toHaveBeenCalled();
    expect(SessionRepository.revokeAllForUser).not.toHaveBeenCalled();
  });

  test('resetPassword rejeita token já consumido (corrida)', async () => {
    VerificationTokenRepository.findValid.mockResolvedValue({ id: 'tok-1', userId: 'user-1' });
    VerificationTokenRepository.consumeForPasswordReset.mockResolvedValue(false);

    await expect(AuthService.resetPassword('token-valido', 'novaSenha456!', {}))
      .rejects.toMatchObject({ status: 400 });
    expect(UserRepository.update).not.toHaveBeenCalled();
  });

  test('resetPassword rejeita token inválido', async () => {
    VerificationTokenRepository.findValid.mockResolvedValue(null);

    await expect(AuthService.resetPassword('expirado', 'novaSenha456!', {}))
      .rejects.toMatchObject({ status: 400 });
    expect(UserRepository.update).not.toHaveBeenCalled();
  });
});

// ─── verificação de e-mail ───────────────────────────────────────────────────
describe('AuthService — verificação de e-mail', () => {
  test('verifyEmail marca o usuário e consome o token', async () => {
    VerificationTokenRepository.findValid.mockResolvedValue({ id: 'tok-9', userId: 'user-1' });
    VerificationTokenRepository.consume.mockResolvedValue(true);

    await expect(AuthService.verifyEmail('tok')).resolves.toEqual({ verified: true });
    expect(UserRepository.update).toHaveBeenCalledWith('user-1', { emailVerified: true });
    expect(VerificationTokenRepository.consume).toHaveBeenCalledWith('tok-9');
  });

  test('verifyEmail rejeita token inválido com 400', async () => {
    VerificationTokenRepository.findValid.mockResolvedValue(null);
    await expect(AuthService.verifyEmail('ruim')).rejects.toMatchObject({ status: 400 });
  });

  test('sendVerificationEmail limpa tokens antigos antes de emitir', async () => {
    await AuthService.sendVerificationEmail(userFixture());

    expect(VerificationTokenRepository.deleteForUser).toHaveBeenCalledWith('user-1', 'email_verify');
    const [rec] = VerificationTokenRepository.create.mock.calls[0];
    expect(rec.type).toBe('email_verify');
    expect(queueMock.enqueue).toHaveBeenCalledWith('email', 'email-verify', expect.any(Object));
  });
});

// ─── logout ──────────────────────────────────────────────────────────────────
describe('AuthService.logout', () => {
  test('revoga a sessão informada e audita', async () => {
    await AuthService.logout('user-1', 'refresh-abc', { ip: '9.9.9.9' });

    expect(SessionRepository.revokeByUserAndToken).toHaveBeenCalledWith('user-1', 'refresh-abc');
    expect(AuditRepository.log).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'logout', userId: 'user-1' }),
    );
  });

  test('logout sem token ainda audita o evento', async () => {
    await AuthService.logout('user-1', null, {});

    expect(SessionRepository.revokeByUserAndToken).not.toHaveBeenCalled();
    expect(AuditRepository.log).toHaveBeenCalledWith(expect.objectContaining({ action: 'logout' }));
  });
});

describe('AppError', () => {
  test('marca erros 4xx como operacionais e 5xx como não', async () => {
    expect(new AppError('x', 404).isOperational).toBe(true);
    expect(new AppError('x', 500).isOperational).toBe(false);
    expect(new AppError('x').status).toBe(500);
  });
});
