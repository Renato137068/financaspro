/**
 * lib.test.js — utilitários puros do backend (jwt, rbac, sanitize, crypto, métricas).
 *
 * Nenhum destes módulos toca banco ou rede, então são importados diretamente.
 */
import { jest } from '@jest/globals';
import {
  signTokens, verifyAccessToken, verifyRefreshToken,
  parseDurationMs, refreshTokenExpiry, hashToken,
} from '../../backend/lib/jwt.js';
import { hasPermission, requirePermission, requireRole } from '../../backend/lib/rbac.js';
import { sanitizeUserConfig } from '../../backend/lib/config-sanitize.js';
import { encryptField, decryptField } from '../../backend/lib/field-crypto.js';
import { asyncHandler } from '../../backend/lib/async-handler.js';
import { mockRes } from './helpers/mocks.js';

// ─── jwt ─────────────────────────────────────────────────────────────────────
describe('jwt — parseDurationMs', () => {
  test.each([
    ['30s', 30_000],
    ['15m', 900_000],
    ['2h', 7_200_000],
    ['7d', 604_800_000],
  ])('converte %s', (input, expected) => {
    expect(parseDurationMs(input)).toBe(expected);
  });

  test('cai para 7 dias em formato inválido', () => {
    expect(parseDurationMs('abc')).toBe(604_800_000);
    expect(parseDurationMs('')).toBe(604_800_000);
    expect(parseDurationMs('10x')).toBe(604_800_000);
  });
});

describe('jwt — signTokens', () => {
  const user = { id: 'user-1', role: 'USER' };

  test('access token carrega sub, role e jti', () => {
    const { accessToken } = signTokens(user);
    const payload = verifyAccessToken(accessToken);

    expect(payload.sub).toBe('user-1');
    expect(payload.role).toBe('USER');
    expect(payload.jti).toEqual(expect.any(String));
  });

  test('refresh token não carrega role (menor superfície se vazar)', () => {
    const { refreshToken } = signTokens(user);
    const payload = verifyRefreshToken(refreshToken);

    expect(payload.sub).toBe('user-1');
    expect(payload.role).toBeUndefined();
  });

  test('duas emissões seguidas produzem refresh tokens distintos', () => {
    // Sem jti próprio, dois logins no mesmo segundo colidiriam na unique
    // constraint de Session.refreshToken.
    expect(signTokens(user).refreshToken).not.toBe(signTokens(user).refreshToken);
  });

  test('access token não é aceito como refresh token e vice-versa', () => {
    const { accessToken, refreshToken } = signTokens(user);
    expect(() => verifyRefreshToken(accessToken)).toThrow();
    expect(() => verifyAccessToken(refreshToken)).toThrow();
  });

  test('token adulterado é rejeitado', () => {
    const { accessToken } = signTokens(user);
    const adulterado = accessToken.slice(0, -3) + 'aaa';
    expect(() => verifyAccessToken(adulterado)).toThrow();
  });

  test('refreshTokenExpiry projeta a expiração no futuro', () => {
    expect(refreshTokenExpiry()).toBeGreaterThan(Date.now());
  });
});

describe('jwt — hashToken', () => {
  test('gera SHA-256 hex estável', () => {
    expect(hashToken('abc')).toMatch(/^[0-9a-f]{64}$/);
    expect(hashToken('abc')).toBe(hashToken('abc'));
  });

  test('entradas diferentes geram hashes diferentes', () => {
    expect(hashToken('abc')).not.toBe(hashToken('abd'));
  });
});

// ─── rbac ────────────────────────────────────────────────────────────────────
describe('rbac — hasPermission', () => {
  test('ADMIN acumula permissões administrativas', () => {
    expect(hasPermission('ADMIN', 'users:delete')).toBe(true);
    expect(hasPermission('ADMIN', 'audit:read')).toBe(true);
  });

  test('USER não administra usuários nem lê auditoria', () => {
    expect(hasPermission('USER', 'users:delete')).toBe(false);
    expect(hasPermission('USER', 'audit:read')).toBe(false);
    expect(hasPermission('USER', 'transactions:write')).toBe(true);
  });

  test('VIEWER é somente leitura', () => {
    expect(hasPermission('VIEWER', 'transactions:read')).toBe(true);
    expect(hasPermission('VIEWER', 'transactions:write')).toBe(false);
    expect(hasPermission('VIEWER', 'config:write')).toBe(false);
  });

  test('role desconhecido não recebe nada (fail-closed)', () => {
    expect(hasPermission('ROOT', 'transactions:read')).toBe(false);
    expect(hasPermission(undefined, 'transactions:read')).toBe(false);
  });
});

describe('rbac — requirePermission', () => {
  test('401 sem usuário autenticado', () => {
    const res = mockRes(); const next = jest.fn();
    requirePermission('transactions:read')({}, res, next);

    expect(res.statusCode).toBe(401);
    expect(next).not.toHaveBeenCalled();
  });

  test('403 com permissão insuficiente e informa a exigida', () => {
    const res = mockRes(); const next = jest.fn();
    requirePermission('users:delete')({ user: { role: 'USER' } }, res, next);

    expect(res.statusCode).toBe(403);
    expect(res.body.required).toBe('users:delete');
    expect(next).not.toHaveBeenCalled();
  });

  test('segue adiante quando autorizado', () => {
    const res = mockRes(); const next = jest.fn();
    requirePermission('transactions:read')({ user: { role: 'USER' } }, res, next);

    expect(next).toHaveBeenCalled();
    expect(res.statusCode).toBe(200);
  });
});

describe('rbac — requireRole', () => {
  test('respeita a hierarquia ADMIN > USER > VIEWER', () => {
    const run = (role, min) => {
      const res = mockRes(); const next = jest.fn();
      requireRole(min)({ user: { role } }, res, next);
      return next.mock.calls.length === 1;
    };

    expect(run('ADMIN', 'USER')).toBe(true);
    expect(run('USER', 'USER')).toBe(true);
    expect(run('VIEWER', 'USER')).toBe(false);
    expect(run('ADMIN', 'ADMIN')).toBe(true);
    expect(run('USER', 'ADMIN')).toBe(false);
  });

  test('401 sem usuário', () => {
    const res = mockRes();
    requireRole('USER')({}, res, jest.fn());
    expect(res.statusCode).toBe(401);
  });

  test('role desconhecido é tratado como o mais baixo', () => {
    const res = mockRes(); const next = jest.fn();
    requireRole('VIEWER')({ user: { role: 'INVENTADO' } }, res, next);
    expect(res.statusCode).toBe(403);
    expect(next).not.toHaveBeenCalled();
  });
});

// ─── config-sanitize ─────────────────────────────────────────────────────────
describe('sanitizeUserConfig', () => {
  test('remove todo material do PIN antes de sincronizar', () => {
    const out = sanitizeUserConfig({
      renda: 5000,
      pinHash: 'abc', pinSalt: 'def', pinAtivo: true,
      pinTentativas: 2, pinBloqueadoAte: 123, pinAlgoritmo: 'sha256',
      _migracaoPinV2: true,
    });

    expect(out).toEqual({ renda: 5000 });
  });

  test('preserva o restante da configuração', () => {
    const cfg = { renda: 5000, metaPoupanca: 20, categorias_custom: [{ v: 'a', l: 'A' }] };
    expect(sanitizeUserConfig(cfg)).toEqual(cfg);
  });

  test('entradas não-objeto viram objeto vazio', () => {
    expect(sanitizeUserConfig(null)).toEqual({});
    expect(sanitizeUserConfig(undefined)).toEqual({});
    expect(sanitizeUserConfig('texto')).toEqual({});
    expect(sanitizeUserConfig([1, 2])).toEqual({});
  });

  test('não muta o objeto original', () => {
    const cfg = { renda: 1, pinHash: 'x' };
    sanitizeUserConfig(cfg);
    expect(cfg.pinHash).toBe('x');
  });
});

// ─── field-crypto ────────────────────────────────────────────────────────────
describe('field-crypto (sem chave configurada em teste)', () => {
  test('sem TOTP_ENCRYPTION_KEY fora de produção devolve o valor original', () => {
    expect(encryptField('segredo')).toBe('segredo');
  });

  test('valores vazios passam intactos', () => {
    expect(encryptField('')).toBe('');
    expect(encryptField(null)).toBe(null);
    expect(decryptField(null)).toBe(null);
    expect(decryptField(undefined)).toBe(undefined);
  });

  test('decryptField é idempotente para texto sem o prefixo enc:', () => {
    expect(decryptField('texto-puro')).toBe('texto-puro');
    expect(decryptField(12345)).toBe(12345);
  });

  test('valor enc: malformado não lança — devolve como veio', () => {
    expect(decryptField('enc:apenas:duas')).toBe('enc:apenas:duas');
  });
});

// ─── async-handler ───────────────────────────────────────────────────────────
describe('asyncHandler', () => {
  test('encaminha rejeição para next em vez de virar unhandledRejection', async () => {
    const boom = new Error('falhou');
    const next = jest.fn();

    asyncHandler(async () => { throw boom; })({}, mockRes(), next);
    await new Promise(r => setImmediate(r));

    expect(next).toHaveBeenCalledWith(boom);
  });

  test('handler que resolve não chama next', async () => {
    const next = jest.fn();
    asyncHandler(async (req, res) => { res.json({ ok: true }); })({}, mockRes(), next);
    await new Promise(r => setImmediate(r));

    expect(next).not.toHaveBeenCalled();
  });

  test('throw síncrono continua propagando — o Express 4 já trata esse caso', () => {
    // Documenta a fronteira do wrapper: ele existe só para promises rejeitadas.
    // Um throw síncrono acontece antes de Promise.resolve() e sobe para o
    // Express, que o converte em resposta de erro nativamente.
    const next = jest.fn();
    const wrapped = asyncHandler(() => { throw new Error('sync'); });

    expect(() => wrapped({}, mockRes(), next)).toThrow('sync');
    expect(next).not.toHaveBeenCalled();
  });

  test('preserva a assinatura (req, res, next) do handler original', () => {
    const spy = jest.fn(async () => {});
    const req = { id: 1 }; const res = mockRes(); const next = jest.fn();

    asyncHandler(spy)(req, res, next);

    expect(spy).toHaveBeenCalledWith(req, res, next);
  });
});
