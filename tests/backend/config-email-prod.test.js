/**
 * config-email-prod.test.js — SMTP_FROM e PRIVACY_CONTACT_EMAIL fail-closed
 */
import { describe, test, expect } from '@jest/globals';
import { spawnSync } from 'child_process';
import path from 'path';
import { pathToFileURL, fileURLToPath } from 'url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const configUrl = pathToFileURL(path.join(root, 'backend', 'config.js')).href;

function loadConfig(overrides) {
  const env = { ...process.env, ...overrides };
  for (const k of ['SMTP_FROM', 'PRIVACY_CONTACT_EMAIL']) {
    if (!Object.prototype.hasOwnProperty.call(overrides, k)) delete env[k];
    else if (overrides[k] === '') delete env[k];
  }
  env.DOTENV_CONFIG_PATH = path.join(root, '.env.inexistente-para-teste');

  const script = `
    import(${JSON.stringify(configUrl)}).then((m) => {
      console.log(JSON.stringify({
        from: m.default.email.from,
        privacy: m.default.privacyContactEmail,
      }));
    }).catch((e) => {
      console.error(String(e && e.message ? e.message : e));
      process.exit(2);
    });
  `;
  return spawnSync(process.execPath, ['--input-type=module', '-e', script], {
    cwd: root,
    env,
    encoding: 'utf8',
  });
}

describe('config e-mail / LGPD', () => {
  test('dev sobe sem SMTP_FROM/PRIVACY (fallback local)', () => {
    const r = loadConfig({
      NODE_ENV: 'development',
      SMTP_FROM: '',
      PRIVACY_CONTACT_EMAIL: '',
      DATABASE_URL: 'postgresql://u:p@localhost:5432/db',
      JWT_ACCESS_SECRET: 'dev-access-secret',
      JWT_REFRESH_SECRET: 'dev-refresh-secret',
    });
    expect(r.status).toBe(0);
    const lines = (r.stdout || '').trim().split('\n').filter(Boolean);
    const parsed = JSON.parse(lines[lines.length - 1]);
    expect(parsed.from).toContain('localhost');
    expect(parsed.privacy).toContain('localhost');
  });

  test('produção sem SMTP_FROM falha com mensagem clara', () => {
    const r = loadConfig({
      NODE_ENV: 'production',
      DATABASE_URL: 'postgresql://u:p@localhost:5432/db',
      JWT_ACCESS_SECRET: 'prod-access-secret-min-32-chars!!',
      JWT_REFRESH_SECRET: 'prod-refresh-secret-min-32-chars!',
      PRIVACY_CONTACT_EMAIL: 'privacidade@example.com',
    });
    expect(r.status).not.toBe(0);
    expect((r.stderr || '') + (r.stdout || '')).toMatch(/SMTP_FROM/);
  });

  test('produção sem PRIVACY_CONTACT_EMAIL falha com mensagem clara', () => {
    const r = loadConfig({
      NODE_ENV: 'production',
      DATABASE_URL: 'postgresql://u:p@localhost:5432/db',
      JWT_ACCESS_SECRET: 'prod-access-secret-min-32-chars!!',
      JWT_REFRESH_SECRET: 'prod-refresh-secret-min-32-chars!',
      SMTP_FROM: 'FinançasPro <noreply@example.com>',
    });
    expect(r.status).not.toBe(0);
    expect((r.stderr || '') + (r.stdout || '')).toMatch(/PRIVACY_CONTACT_EMAIL/);
  });
});
