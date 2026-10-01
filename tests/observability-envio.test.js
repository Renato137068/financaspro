/**
 * observability-envio.test.js — quando um erro sai do aparelho, e quando não.
 *
 * Antes o OBS só enviava com `obsEndpoint` configurado, e nada no app o
 * configurava: todo erro de produção morria num buffer local. Agora erros vão
 * por padrão para a Edge Function obs-ingest do Supabase, com opção de
 * desligar no Perfil; analytics continua opt-in.
 */
const { carregarScript } = require('./helpers/carregar-script.cjs');
const fs = require('fs');
const path = require('path');
const { fontePerfil } = require('./helpers/chunk-perfil.cjs');
const { indexComTelas } = require('./helpers/index-com-telas.cjs');

const root = path.join(__dirname, '..');
const SUPABASE = 'https://projeto.supabase.co';

function carregarObs(config, supabaseUrl) {
  global.DADOS = { getConfig: function() { return config || {}; } };
  global.CONFIG = { VERSION: '11.3.18', SUPABASE_URL: supabaseUrl === undefined ? SUPABASE : supabaseUrl };
  let OBS;
  jest.isolateModules(function() { OBS = carregarScript('js/utilities/observability.js'); });
  return OBS;
}

let enviar;
beforeEach(function() {
  localStorage.clear();
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

describe('OBS.contarSessao — contagem de uso anônima', function() {
  test('no máximo um aviso por dia, só com o kind e a versão', function() {
    const OBS = carregarObs({});
    expect(OBS.contarSessao()).toBe(true);
    expect(OBS.contarSessao()).toBe(false);

    expect(enviar).toHaveBeenCalledTimes(1);
    const [url, corpo] = enviar.mock.calls[0];
    expect(url).toBe(SUPABASE + '/functions/v1/obs-ingest');
    expect(JSON.parse(corpo)).toEqual({ kind: 'sessao', app: '11.3.18' });
    // Não é evento: não entra no buffer nem gasta o limite de erros.
    expect(OBS.getBuffer().filter(function(e) { return e.kind !== 'perf'; })).toHaveLength(0);
    for (let i = 0; i < 20; i++) OBS.captureError(new Error('e' + i));
    expect(enviar).toHaveBeenCalledTimes(21);
  });

  test('no dia seguinte (UTC) avisa de novo, inclusive depois de reabrir o app', function() {
    localStorage.setItem('fp_obs_sessao_dia', '2000-01-01');
    const OBS = carregarObs({});
    expect(OBS.contarSessao()).toBe(true);
    expect(localStorage.getItem('fp_obs_sessao_dia')).toBe(new Date().toISOString().slice(0, 10));
    const reaberto = carregarObs({});
    expect(reaberto.contarSessao()).toBe(false);
    expect(enviar).toHaveBeenCalledTimes(1);
  });

  test('mesmo opt-out dos relatórios de erro', function() {
    const OBS = carregarObs({ obsErrorsEnabled: false });
    expect(OBS.contarSessao()).toBe(false);
    expect(enviar).not.toHaveBeenCalled();
    expect(localStorage.getItem('fp_obs_sessao_dia')).toBeNull();
  });

  test('build local (sem Supabase) e coletor próprio não recebem o aviso', function() {
    expect(carregarObs({}, '').contarSessao()).toBe(false);
    expect(carregarObs({ obsEndpoint: 'https://coletor.exemplo/ingest' }).contarSessao()).toBe(false);
    expect(enviar).not.toHaveBeenCalled();
  });

  test('o boot chama o aviso depois que DADOS está pronto', function() {
    const lifecycle = fs.readFileSync(path.join(root, 'js/core/lifecycle.js'), 'utf8');
    const iRecorrentes = lifecycle.indexOf('RECORRENTES.processarNaAbertura();');
    const iAviso = lifecycle.indexOf('OBS.contarSessao()');
    expect(iAviso).toBeGreaterThan(iRecorrentes);
  });
});

describe('Perfil — controle "Enviar relatórios de erro"', function() {
  const html = indexComTelas();
  const initConfig = fontePerfil();

  test('o switch existe, rotulado', function() {
    expect(html).toMatch(/<input type="checkbox" id="chk-obs-erros" aria-label="Enviar relatórios de erro">/);
  });

  test('a dica do switch conta que ele também cobre o aviso diário de versão', function() {
    expect(html).toMatch(/uma vez por dia, avisa só a versão do app em uso/);
  });

  test('a política de privacidade descreve a contagem de uso', function() {
    const priv = fs.readFileSync(path.join(root, 'privacidade.html'), 'utf8');
    expect(priv).toMatch(/Contagem de uso anônima/);
    expect(priv).toMatch(/contagem de uso por versão são apagados após 30 dias/);
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

  test('aviso de uso: só a versão vai ao contador, com retenção de 30 dias', function() {
    expect(fn).toMatch(/const versao = versaoDaSessao\(entrada\)/);
    expect(fn).toMatch(/rpc\("fp_obs_contar_sessao", \{ p_versao: versao \}\)/);
    expect(fn).toMatch(/from\("fp_app_sessao_dia"\)\.delete\(\)\.lt\("dia", corteDia\)/);
  });

  test('deploy com --no-verify-jwt (sendBeacon não manda auth), documentado', function() {
    // O deploy mora em scripts/deploy-supabase.cjs (workflow de release).
    const { comandos } = require('../scripts/deploy-supabase.cjs');
    const obs = comandos({ ref: 'abc', soFuncoes: true }).map(function(a) { return a.join(' '); })
      .filter(function(c) { return c.indexOf('functions deploy obs-ingest ') === 0; });
    expect(obs).toEqual(['functions deploy obs-ingest --project-ref abc --no-verify-jwt']);
    expect(readme).toMatch(/`obs-ingest` \(`navigator\.sendBeacon` não envia header de\s+auth\)/);
  });
});
