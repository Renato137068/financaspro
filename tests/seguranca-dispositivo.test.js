/**
 * seguranca-dispositivo.test.js — achados da auditoria de segurança de 08/10/2026.
 *
 * 1. Troca de conta no mesmo aparelho: "Sair" deixa os dados no aparelho, e o
 *    login de OUTRA conta mesclava esses dados e os subia para ela.
 * 2. Link com tokens no hash (#access_token=…) trocava a sessão para qualquer
 *    conta, sem senha: um link do atacante punha a vítima na conta dele.
 * 3. "Continuar sem conexão" entrava sem biometria nem PIN: bastava o modo
 *    avião para passar pelo bloqueio ao voltar do fundo.
 *
 * Os módulos rodam de verdade (vm), contra dublês do Supabase e do plugin.
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { rodarNoContexto } = require('./helpers/esm-como-script.cjs');

const root = path.join(__dirname, '..');

/* ───────────────────────── 1. Troca de conta ───────────────────────── */

function carregarSync(opts) {
  const syncSrc = fs.readFileSync(path.join(root, 'js/core/supabase-sync.js'), 'utf8');
  const estado = { dono: opts.dono || null, selects: 0, recarregou: false, authCb: null };

  function cadeia() {
    const api = {
      select: () => api,
      is: () => api,
      eq: () => api,
      range: () => { estado.selects++; return Promise.resolve({ data: [], error: null }); },
      maybeSingle: () => { estado.selects++; return Promise.resolve({ data: null, error: null }); },
      upsert: () => Promise.resolve({ error: null }),
    };
    return api;
  }

  const DADOS = {
    limparTodos: jest.fn(),
    _mergeSnapshotLocal: jest.fn(),
    getConfig: () => ({}),
    getContas: () => [],
    getTransacoesRaw: () => [],
  };

  const sandbox = {
    SB: {
      from: () => ({ select: () => cadeia(), upsert: () => cadeia().upsert() }),
      auth: { onAuthStateChange: (cb) => { estado.authCb = cb; } },
    },
    SUPA_AUTH: {
      isActive: () => true,
      getSessionSync: () => ({ user: { id: opts.uidSessao || 'conta-b' } }),
      donoDoAparelho: () => estado.dono,
      definirDono: (uid) => { estado.dono = uid; },
    },
    DADOS,
    FINANCE_CONTRACT: { txPtToEn: (t) => t, contaPtToEn: (c) => c },
    location: { reload: () => { estado.recarregou = true; } },
    setTimeout: (fn) => fn(),
    console,
  };
  sandbox.window = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(syncSrc, sandbox, { filename: path.join(root, 'js/core/supabase-sync.js') });
  return { sandbox, estado, DADOS };
}

describe('Troca de conta no mesmo aparelho', () => {
  test('primeira conta a entrar vira a dona e sincroniza normalmente', () => {
    const { estado, DADOS } = carregarSync({ dono: null });
    estado.authCb('INITIAL_SESSION', { user: { id: 'conta-b' } });
    expect(estado.dono).toBe('conta-b');
    expect(DADOS.limparTodos).not.toHaveBeenCalled();
    expect(estado.selects).toBeGreaterThan(0);
  });

  test('a mesma conta voltando não apaga nada', () => {
    const { estado, DADOS } = carregarSync({ dono: 'conta-b' });
    estado.authCb('SIGNED_IN', { user: { id: 'conta-b' } });
    expect(DADOS.limparTodos).not.toHaveBeenCalled();
    expect(estado.recarregou).toBe(false);
    expect(estado.selects).toBeGreaterThan(0);
  });

  test('outra conta: apaga os dados do aparelho antes de sincronizar e recarrega', () => {
    const { estado, DADOS } = carregarSync({ dono: 'conta-a' });
    estado.authCb('SIGNED_IN', { user: { id: 'conta-b' } });
    expect(DADOS.limparTodos).toHaveBeenCalledTimes(1);
    expect(DADOS._mergeSnapshotLocal).not.toHaveBeenCalled();
    expect(estado.selects).toBe(0);
    expect(estado.dono).toBe('conta-b');
    expect(estado.recarregou).toBe(true);
  });

  test('pull com sessão de conta diferente da dona não toca na nuvem', async () => {
    const { sandbox, estado } = carregarSync({ dono: 'conta-a', uidSessao: 'conta-b' });
    await expect(sandbox.SUPA_SYNC.pull()).resolves.toBe(false);
    expect(estado.selects).toBe(0);
  });
});

/* ──────────────────────── 2. Link de outra conta ──────────────────────── */

function jwtDe(sub) {
  const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64')
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  return b64({ alg: 'HS256' }) + '.' + b64({ sub: sub, exp: 9999999999 }) + '.assinatura';
}

function carregarSupabase() {
  const src = fs.readFileSync(path.join(root, 'js/core/supabase.js'), 'utf8');
  const setSession = jest.fn(() => Promise.resolve({ data: { session: { user: { id: 'x' } } }, error: null }));
  const client = {
    auth: {
      getSession: () => Promise.resolve({ data: { session: null } }),
      onAuthStateChange: () => {},
      setSession,
    },
  };
  const sandbox = {
    CONFIG: { SUPABASE_URL: 'https://exemplo.supabase.co', SUPABASE_ANON_KEY: 'anon' },
    supabase: { createClient: () => client },
    location: { hash: '', pathname: '/', search: '', origin: 'https://app.financaspro.com', protocol: 'https:' },
    history: { replaceState: jest.fn() },
    localStorage: global.localStorage,
    URLSearchParams,
    atob: global.atob,
    CustomEvent: global.CustomEvent,
    dispatchEvent: () => true,
    setTimeout: () => 0,
    console: Object.assign({}, console, { warn: () => {} }),
  };
  sandbox.window = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(src, sandbox, { filename: path.join(root, 'js/core/supabase.js') });
  return { SUPA_AUTH: sandbox.SUPA_AUTH, setSession };
}

function linkDe(sub) {
  return {
    hash: '#access_token=' + jwtDe(sub) + '&refresh_token=r&type=signup',
    pathname: '/',
    search: '',
  };
}

describe('Link de login com tokens no hash', () => {
  beforeEach(() => localStorage.clear());

  test('aparelho sem dono aceita o link (confirmação de cadastro)', async () => {
    const { SUPA_AUTH, setSession } = carregarSupabase();
    await SUPA_AUTH.consumeAuthCallback(linkDe('conta-a'));
    expect(setSession).toHaveBeenCalledTimes(1);
  });

  test('link da própria conta continua valendo (recuperação de senha)', async () => {
    localStorage.setItem('financaspro_dono_uid', 'conta-a');
    const { SUPA_AUTH, setSession } = carregarSupabase();
    await SUPA_AUTH.consumeAuthCallback(linkDe('conta-a'));
    expect(setSession).toHaveBeenCalledTimes(1);
  });

  test('link de outra conta é ignorado quando o aparelho tem dono', async () => {
    localStorage.setItem('financaspro_dono_uid', 'conta-a');
    const { SUPA_AUTH, setSession } = carregarSupabase();
    await expect(SUPA_AUTH.consumeAuthCallback(linkDe('conta-atacante'))).resolves.toBeNull();
    expect(setSession).not.toHaveBeenCalled();
  });

  test('sessão gravada também define o dono, mesmo antes do primeiro login nesta versão', async () => {
    localStorage.setItem('fp-supabase-auth', JSON.stringify({ user: { id: 'conta-a' }, refresh_token: 'r' }));
    const { SUPA_AUTH, setSession } = carregarSupabase();
    await SUPA_AUTH.consumeAuthCallback(linkDe('conta-atacante'));
    expect(setSession).not.toHaveBeenCalled();
  });

  test('token ilegível não passa quando há dono', async () => {
    localStorage.setItem('financaspro_dono_uid', 'conta-a');
    const { SUPA_AUTH, setSession } = carregarSupabase();
    await SUPA_AUTH.consumeAuthCallback({ hash: '#access_token=lixo&refresh_token=r', pathname: '/', search: '' });
    expect(setSession).not.toHaveBeenCalled();
  });

  test('o dono não sobrevive a "Apagar todos os dados"', () => {
    const dados = fs.readFileSync(path.join(root, 'js/core/dados.js'), 'utf8');
    const lista = dados.slice(dados.indexOf('CHAVES_PRESERVADAS_AO_LIMPAR: ['), dados.indexOf('BANCOS_IDB'));
    expect(lista).not.toContain('financaspro_dono_uid');
  });
});

/* ─────────────────── 3. Entrada sem conexão: biometria ─────────────────── */

function carregarBiometria(nativo, prefLigada) {
  localStorage.setItem('fp-biometric-enabled', prefLigada ? '1' : '0');
  const nomes = ['window', 'document', 'localStorage', 'console', 'Promise', 'SUPA_AUTH', 'UTILS', 'INIT_MODALS', 'DADOS', 'CONFIG'];
  const sandbox = {};
  nomes.forEach((n) => Object.defineProperty(sandbox, n, { get: () => global[n], enumerable: true }));
  global.window.Capacitor = nativo
    ? { isNativePlatform: () => true, Plugins: { NativeBiometric: nativo } }
    : undefined;
  return rodarNoContexto(vm.createContext(sandbox), path.join(root, 'js/auth-biometric.js')).AUTH_BIOMETRIC;
}

describe('Entrada sem conexão — confirmação de identidade', () => {
  afterEach(() => { delete global.window.Capacitor; localStorage.clear(); });

  test('biometria ligada e aceita: ok', async () => {
    const nativo = { isAvailable: () => Promise.resolve({ isAvailable: true }), verifyIdentity: jest.fn(() => Promise.resolve()) };
    const bio = carregarBiometria(nativo, true);
    await expect(bio.confirmarIdentidade()).resolves.toBe('ok');
    expect(nativo.verifyIdentity).toHaveBeenCalled();
  });

  test('biometria recusada: falhou (não entra)', async () => {
    const nativo = { isAvailable: () => Promise.resolve({ isAvailable: true }), verifyIdentity: () => Promise.reject(new Error('cancelado')) };
    const bio = carregarBiometria(nativo, true);
    await expect(bio.confirmarIdentidade()).resolves.toBe('falhou');
  });

  test('biometria desligada no app: indisponivel (segue para o PIN)', async () => {
    const nativo = { isAvailable: () => Promise.resolve({ isAvailable: true }), verifyIdentity: jest.fn() };
    const bio = carregarBiometria(nativo, false);
    await expect(bio.confirmarIdentidade()).resolves.toBe('indisponivel');
    expect(nativo.verifyIdentity).not.toHaveBeenCalled();
  });

  test('o botão offline passa pela confirmação e pelo PIN', () => {
    const auth = fs.readFileSync(path.join(root, 'js/authController.js'), 'utf8');
    const corpo = auth.slice(auth.indexOf('function _entrarOffline'), auth.indexOf('function _concluirEntradaOffline'));
    expect(corpo).toContain('confirmarIdentidade');
    expect(corpo).toContain("res === 'falhou'");
    expect(corpo).toContain('PIN_SECURITY.exigirSeAtivo');
  });
});

/* ───────────────────────── 4. Backup com senha ───────────────────────── */

function carregarBackupCifrado() {
  const { webcrypto } = require('crypto');
  const util = require('util');
  const sandbox = {
    crypto: webcrypto,
    TextEncoder: util.TextEncoder,
    TextDecoder: util.TextDecoder,
    btoa: global.btoa,
    atob: global.atob,
    Uint8Array,
    Promise,
    Number,
    String,
    JSON,
    Error,
    document: global.document,
    UTILS: { escapeHtml: (s) => String(s) },
    console,
  };
  return rodarNoContexto(vm.createContext(sandbox), path.join(root, 'js/modules/backup-cifrado.js')).BACKUP_CIFRADO;
}

describe('Backup com senha', () => {
  const BC = carregarBackupCifrado();
  const original = JSON.stringify({ transacoes: [{ id: 't1', valor: 12.34, descricao: 'Mercado' }], config: { nome: 'Ana' } });

  test('cifra e decifra de volta com a mesma senha', async () => {
    const envelope = JSON.parse(await BC.cifrar(original, 'senha-forte'));
    expect(BC.ehCifrado(envelope)).toBe(true);
    await expect(BC.decifrar(envelope, 'senha-forte')).resolves.toBe(original);
  });

  test('o arquivo não mostra nada do conteúdo', async () => {
    const texto = await BC.cifrar(original, 'senha-forte');
    expect(texto).not.toContain('Mercado');
    expect(texto).not.toContain('Ana');
    expect(texto).not.toContain('12.34');
  });

  test('senha errada não abre e diz que é a senha', async () => {
    const envelope = JSON.parse(await BC.cifrar(original, 'senha-forte'));
    await expect(BC.decifrar(envelope, 'outra')).rejects.toThrow('SENHA_INCORRETA');
  });

  test('backup comum (sem senha) não é tratado como cifrado', () => {
    expect(BC.ehCifrado(JSON.parse(original))).toBe(false);
    expect(BC.ehCifrado(null)).toBe(false);
  });

  test('anexo grande (vários MB) não estoura a pilha', async () => {
    const grande = JSON.stringify({ anexos: ['x'.repeat(3 * 1024 * 1024)] });
    const envelope = JSON.parse(await BC.cifrar(grande, 'senha-forte'));
    await expect(BC.decifrar(envelope, 'senha-forte')).resolves.toHaveLength(grande.length);
  });

  test('exportar pergunta a senha e importar reconhece o arquivo com senha', () => {
    const src = fs.readFileSync(path.join(root, 'js/modules/config-backup.js'), 'utf8');
    const exportar = src.slice(src.indexOf('  exportarDados: function'), src.indexOf('var finalizar'));
    expect(exportar).toContain('pedirSenhaExportacao');
    expect(src).toContain('BACKUP_CIFRADO.cifrar(texto, senha)');
    expect(src).toMatch(/ehCifrado\(data\)[\s\S]{0,80}_importarCifrado/);
  });
});

/* ─────────────── 5. Prévia nos apps recentes com PIN ligado ─────────────── */

describe('Prévia nos apps recentes', () => {
  function carregarSecureScreen(pluginFake) {
    const sandbox = {
      window: {
        Capacitor: {
          isNativePlatform: () => true,
          Plugins: { FpSecureScreen: pluginFake },
        },
      },
    };
    vm.createContext(sandbox);
    const arquivo = path.join(root, 'js/fp-secure-screen.js');
    vm.runInContext(fs.readFileSync(arquivo, 'utf8'), sandbox, { filename: arquivo });
    return sandbox.window.FP_SECURE_SCREEN;
  }

  test('ocultarRecentes repassa o estado ao plugin nativo', () => {
    const plugin = { ocultarRecentes: jest.fn(() => Promise.resolve()) };
    const fp = carregarSecureScreen(plugin);
    fp.ocultarRecentes(true);
    fp.ocultarRecentes(false);
    expect(plugin.ocultarRecentes.mock.calls).toEqual([[{ ativo: true }], [{ ativo: false }]]);
  });

  test('app antigo sem o método nativo não quebra', () => {
    const fp = carregarSecureScreen({});
    expect(() => fp.ocultarRecentes(true)).not.toThrow();
  });

  test('o estado do PIN liga e desliga a ocultação', () => {
    const pin = fs.readFileSync(path.join(root, 'js/pin.js'), 'utf8');
    const sync = pin.slice(pin.indexOf('  syncLockFlag: function'), pin.indexOf('  bytesToHex'));
    expect(sync).toContain('FP_SECURE_SCREEN.ocultarRecentes(!!ativo)');
  });

  test('o nativo usa setRecentsScreenshotEnabled (13+) e FLAG_SECURE no onPause (anteriores)', () => {
    const dir = path.join(root, 'android/app/src/main/java/com/financaspro/app');
    const plugin = fs.readFileSync(path.join(dir, 'FpSecureScreenPlugin.java'), 'utf8');
    const main = fs.readFileSync(path.join(dir, 'MainActivity.java'), 'utf8');
    expect(plugin).toContain('public void ocultarRecentes(PluginCall call)');
    expect(plugin).toContain('setRecentsScreenshotEnabled(!ocultarRecentes)');
    expect(main).toMatch(/onPause\(\)[\s\S]*FLAG_SECURE[\s\S]*super\.onPause\(\)/);
    expect(main).toMatch(/onResume\(\)[\s\S]*!FpSecureScreenPlugin\.telaSensivel/);
  });
});
