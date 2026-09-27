/**
 * observability-envio.test.js — quando um erro sai do aparelho, e quando não.
 *
 * Antes o OBS só enviava com `obsEndpoint` configurado, e nada no app o
 * configurava: todo erro de produção morria num buffer local. Agora erros vão
 * por padrão para a Edge Function obs-ingest do Supabase, com opção de
 * desligar no Perfil; analytics continua opt-in.
 */
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const SUPABASE = 'https://projeto.supabase.co';

function carregarObs(config, supabaseUrl) {
  global.DADOS = { getConfig: function() { return config || {}; } };
  global.CONFIG = { VERSION: '11.3.18', SUPABASE_URL: supabaseUrl === undefined ? SUPABASE : supabaseUrl };
  let OBS;
  jest.isolateModules(function() { OBS = require('../js/utilities/observability.js'); });
  return OBS;
}

let enviar;
beforeEach(function() {
  enviar = jest.fn(function() { return true; });
  Object.defineProperty(global.navigator, 'sendBeacon', { value: enviar, configurable: true, writable: true });
});
afterEach(function() {
  delete global.DADOS;
  delete global.CONFIG;
});

describe('OBS — envio de relatórios de erro', function() {
  test('por padrão, erro vai para a Edge Function obs-ingest', function() {
    const OBS = carregarObs({});
    OBS.captureError(new Error('x is undefined'), { contexto: 'render:resumo' });

    expect(enviar).toHaveBeenCalledTimes(1);
    const [url, corpo] = enviar.mock.calls[0];
    expect(url).toBe(SUPABASE + '/functions/v1/obs-ingest');
    const entrada = JSON.parse(corpo);
    expect(entrada.kind).toBe('error');
    expect(entrada.app).toBe('11.3.18');
    expect(entrada.data.message).toBe('x is undefined');
    expect(entrada.data.context).toEqual({ contexto: 'render:resumo' });
  });

  test('usuário que desligou no Perfil não envia nada (só buffer local)', function() {
    const OBS = carregarObs({ obsErrorsEnabled: false });
    OBS.captureError(new Error('falhou'));

    expect(enviar).not.toHaveBeenCalled();
    const erros = OBS.getBuffer().filter(function(e) { return e.kind === 'error'; });
    expect(erros).toHaveLength(1);
  });

  test('build local (sem Supabase) não envia', function() {
    const OBS = carregarObs({}, '');
    OBS.captureError(new Error('falhou'));
    expect(enviar).not.toHaveBeenCalled();
  });

  test('analytics continua opt-in: sem obsEndpoint explícito, evento não sai', function() {
    const OBS = carregarObs({ obsAnalyticsEnabled: true });
    OBS.track('primeiro_lancamento', {});
    expect(enviar).not.toHaveBeenCalled();
  });

  test('erro em loop não vira rajada: no máximo 20 envios por sessão', function() {
    const OBS = carregarObs({});
    for (let i = 0; i < 50; i++) OBS.captureError(new Error('loop ' + i));
    expect(enviar).toHaveBeenCalledTimes(20);
  });

  test('obsEndpoint próprio continua tendo prioridade', function() {
    const OBS = carregarObs({ obsEndpoint: 'https://coletor.exemplo/ingest' });
    OBS.captureError(new Error('falhou'));
    expect(enviar.mock.calls[0][0]).toBe('https://coletor.exemplo/ingest');
  });
});

describe('Perfil — controle "Enviar relatórios de erro"', function() {
  const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  const initConfig = fs.readFileSync(path.join(root, 'js/modules/init-config.js'), 'utf8');

  test('o switch existe, rotulado', function() {
    expect(html).toMatch(/<input type="checkbox" id="chk-obs-erros" aria-label="Enviar relatórios de erro">/);
  });

  test('ligado por padrão e grava obsErrorsEnabled ao mudar', function() {
    expect(initConfig).toMatch(/chkObs\.checked = config\.obsErrorsEnabled !== false/);
    expect(initConfig).toMatch(/bind\('chk-obs-erros',[\s\S]{0,80}obsErrorsEnabled: !!e\.target\.checked/);
  });

  test('a preferência sobrevive a backup/restauração', function() {
    const allow = initConfig.slice(initConfig.indexOf('_IMPORT_CONFIG_ALLOWED'));
    expect(allow.slice(0, allow.indexOf(']'))).toContain("'obsErrorsEnabled'");
  });
});

describe('Edge Function obs-ingest', function() {
  const fn = fs.readFileSync(path.join(root, 'supabase/functions/obs-ingest/index.ts'), 'utf8');
  const readme = fs.readFileSync(path.join(root, 'supabase/functions/README.md'), 'utf8');

  test('sanitiza antes de gravar e recusa origem fora da allowlist', function() {
    expect(fn).toMatch(/isOriginAllowed\(originOf\(req\)\)/);
    expect(fn).toMatch(/sanitizarRelatorio\(entrada/);
    expect(fn).toMatch(/texto\.length > LIMITE_CORPO/);
    expect(fn).toMatch(/from\("fp_client_error"\)\.insert\(linha\)/);
  });

  test('limita por IP sem gravar o IP', function() {
    expect(fn).toMatch(/dentroDoLimite\(ip\)/);
    expect(fn).not.toMatch(/insert\(\{[^}]*ip/);
  });

  test('deploy documentado com --no-verify-jwt (sendBeacon não manda auth)', function() {
    expect(readme).toMatch(/functions deploy obs-ingest\s+--no-verify-jwt/);
  });
});
