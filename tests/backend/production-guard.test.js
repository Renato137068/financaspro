/**
 * production-guard.test.js — validações de boot em produção.
 */
import { jest } from '@jest/globals';

describe('assertProductionReady', () => {
  // Base mínima para o config.js carregar em produção: além de DATABASE_URL, o
  // config agora exige SMTP_FROM e PRIVACY_CONTACT_EMAIL (fail-closed). Sem eles
  // o import do config lança antes do guard rodar. Não são o alvo deste teste —
  // o guard valida CORS/JWT/Redis — então entram como baseline fixo.
  const prodBase = {
    DATABASE_URL: 'postgresql://test:test@localhost:5432/test',
    SMTP_FROM: 'FinançasPro <no-reply@example.com>',
    PRIVACY_CONTACT_EMAIL: 'privacidade@example.com',
  };

  // Segredos de fixture precisam ter o tamanho real de um segredo de produção
  // (>= 32 chars). Usar 'prod-access-secret' aqui fazia o teste "configuração
  // mínima segura" aprovar um segredo de 18 caracteres — exatamente o buraco
  // que o piso de entropia fecha.
  const ACCESS_OK  = 'a'.repeat(24) + '-access-prod';
  const REFRESH_OK = 'b'.repeat(24) + '-refresh-prod';

  const loadGuard = async (envOverrides = {}) => {
    jest.resetModules();
    Object.assign(process.env, { NODE_ENV: 'production', ...prodBase, ...envOverrides });
    const { assertProductionReady } = await import('../../backend/lib/production-guard.js');
    return assertProductionReady;
  };

  afterEach(() => {
    process.env.NODE_ENV = 'test';
    delete process.env.DATABASE_URL;
    delete process.env.CORS_ORIGIN;
    delete process.env.JWT_ACCESS_SECRET;
    delete process.env.JWT_REFRESH_SECRET;
    delete process.env.REDIS_URL;
    delete process.env.SMTP_FROM;
    delete process.env.PRIVACY_CONTACT_EMAIL;
  });

  test('não falha fora de produção', async () => {
    jest.resetModules();
    process.env.NODE_ENV = 'development';
    const { assertProductionReady } = await import('../../backend/lib/production-guard.js');
    expect(() => assertProductionReady()).not.toThrow();
  });

  test('falha com CORS wildcard em produção', async () => {
    const assertProductionReady = await loadGuard({
      CORS_ORIGIN: '*',
      JWT_ACCESS_SECRET: ACCESS_OK,
      JWT_REFRESH_SECRET: REFRESH_OK,
      REDIS_URL: 'redis://localhost:6379',
    });
    expect(() => assertProductionReady()).toThrow(/CORS_ORIGIN/);
  });

  test('falha com segredos JWT de desenvolvimento em produção', async () => {
    const assertProductionReady = await loadGuard({
      CORS_ORIGIN: 'https://app.example.com',
      JWT_ACCESS_SECRET: 'dev-access-secret',
      JWT_REFRESH_SECRET: REFRESH_OK,
      REDIS_URL: 'redis://localhost:6379',
    });
    expect(() => assertProductionReady()).toThrow(/JWT_ACCESS_SECRET/);
  });

  test('falha sem REDIS_URL em produção', async () => {
    const assertProductionReady = await loadGuard({
      CORS_ORIGIN: 'https://app.example.com',
      JWT_ACCESS_SECRET: ACCESS_OK,
      JWT_REFRESH_SECRET: REFRESH_OK,
    });
    delete process.env.REDIS_URL;
    expect(() => assertProductionReady()).toThrow(/REDIS_URL/);
  });

  test('passa com configuração mínima segura', async () => {
    const assertProductionReady = await loadGuard({
      CORS_ORIGIN: 'https://app.example.com',
      JWT_ACCESS_SECRET: ACCESS_OK,
      JWT_REFRESH_SECRET: REFRESH_OK,
      REDIS_URL: 'redis://localhost:6379',
    });
    expect(() => assertProductionReady()).not.toThrow();
  });
  test('falha com segredo JWT curto demais em produção', async () => {
    const assertProductionReady = await loadGuard({
      CORS_ORIGIN: 'https://app.example.com',
      JWT_ACCESS_SECRET: 'curto-demais',
      JWT_REFRESH_SECRET: REFRESH_OK,
      REDIS_URL: 'redis://localhost:6379',
    });
    expect(() => assertProductionReady()).toThrow(/JWT_ACCESS_SECRET deve ter ao menos 32/);
  });

  test('falha se o refresh secret for curto, mesmo com access longo', async () => {
    const assertProductionReady = await loadGuard({
      CORS_ORIGIN: 'https://app.example.com',
      JWT_ACCESS_SECRET: ACCESS_OK,
      JWT_REFRESH_SECRET: 'x'.repeat(31),
      REDIS_URL: 'redis://localhost:6379',
    });
    expect(() => assertProductionReady()).toThrow(/JWT_REFRESH_SECRET deve ter ao menos 32/);
  });

  test('falha se access e refresh usarem o MESMO segredo', async () => {
    // Segredos iguais fazem um refresh token passar como access token.
    const assertProductionReady = await loadGuard({
      CORS_ORIGIN: 'https://app.example.com',
      JWT_ACCESS_SECRET: ACCESS_OK,
      JWT_REFRESH_SECRET: ACCESS_OK,
      REDIS_URL: 'redis://localhost:6379',
    });
    expect(() => assertProductionReady()).toThrow(/devem ser diferentes/);
  });

  test('aceita exatamente 32 caracteres (fronteira do piso)', async () => {
    const assertProductionReady = await loadGuard({
      CORS_ORIGIN: 'https://app.example.com',
      JWT_ACCESS_SECRET: 'a'.repeat(32),
      JWT_REFRESH_SECRET: 'b'.repeat(32),
      REDIS_URL: 'redis://localhost:6379',
    });
    expect(() => assertProductionReady()).not.toThrow();
  });
});
