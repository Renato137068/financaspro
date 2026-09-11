/**
 * config-dev-secrets.test.js — o segredo de dev não pode ser literal do repo.
 *
 * O guard de produção (production-guard.js) já recusa 'dev-access-secret' e
 * exige 32+ caracteres — mas só roda quando NODE_ENV === 'production'. O buraco
 * que estes testes fecham é o outro, e é o fácil de acontecer: backend no ar
 * com NODE_ENV ausente ou 'development'. Antes, os tokens eram assinados com um
 * segredo publicado no repositório, e forjar um JWT de qualquer usuário era
 * questão de ler o arquivo.
 */
import { describe, test, expect } from '@jest/globals';
import { spawnSync } from 'child_process';
import path from 'path';
import { pathToFileURL, fileURLToPath } from 'url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const configUrl = pathToFileURL(path.join(root, 'backend', 'config.js')).href;

function bootConfig(overrides = {}) {
  const env = { ...process.env, NODE_ENV: 'development', ...overrides };
  ['JWT_ACCESS_SECRET', 'JWT_REFRESH_SECRET'].forEach((k) => {
    if (!Object.prototype.hasOwnProperty.call(overrides, k)) delete env[k];
  });
  env.DOTENV_CONFIG_PATH = path.join(root, '.env.inexistente-para-teste');

  const script = `
    import(${JSON.stringify(configUrl)}).then((m) => {
      console.log(JSON.stringify({
        access: m.default.auth.accessSecret,
        refresh: m.default.auth.refreshSecret,
      }));
    });
  `;
  const r = spawnSync(process.execPath, ['--input-type=module', '-e', script], {
    cwd: root, env, encoding: 'utf8',
  });
  return { json: JSON.parse(r.stdout.trim().split('\n').pop()), stderr: r.stderr };
}

describe('backend — segredo de desenvolvimento', () => {
  test('não é mais um literal versionado', () => {
    const { json } = bootConfig();
    expect(json.access).not.toBe('dev-access-secret');
    expect(json.refresh).not.toBe('dev-refresh-secret');
  });

  test('tem entropia suficiente para não cair em força bruta', () => {
    const { json } = bootConfig();
    expect(json.access.length).toBeGreaterThanOrEqual(32);
    expect(json.refresh.length).toBeGreaterThanOrEqual(32);
  });

  test('access e refresh são segredos distintos', () => {
    const { json } = bootConfig();
    expect(json.access).not.toBe(json.refresh);
  });

  test('muda a cada processo — nada previsível entre boots', () => {
    const a = bootConfig().json;
    const b = bootConfig().json;
    expect(a.access).not.toBe(b.access);
    expect(a.refresh).not.toBe(b.refresh);
  });

  test('avisa em voz alta que o processo não serve para produção', () => {
    const { stderr } = bootConfig();
    expect(stderr).toMatch(/JWT_ACCESS_SECRET/);
    expect(stderr).toMatch(/não está pronto para produção/i);
  });

  test('com a variável definida, usa o valor do operador sem sortear', () => {
    const { json, stderr } = bootConfig({
      JWT_ACCESS_SECRET: 'segredo-explicito-do-operador',
      JWT_REFRESH_SECRET: 'outro-segredo-explicito',
    });
    expect(json.access).toBe('segredo-explicito-do-operador');
    expect(json.refresh).toBe('outro-segredo-explicito');
    expect(stderr).not.toMatch(/segredo aleatório/);
  });
});
