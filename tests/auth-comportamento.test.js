/**
 * auth-comportamento.test.js — testes que EXECUTAM o código de autenticação.
 *
 * Os demais arquivos de auth são guardas estáticos: leem o fonte e conferem se
 * um trecho continua lá. Travam regressão, mas não provam comportamento.
 * Aqui o módulo roda de verdade, contra dublês do plugin nativo e do Supabase.
 *
 * Cada bloco corresponde a um defeito real já observado no aparelho.
 */
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');

/* ───────────────────────── Biometria ─────────────────────────
   Bug de origem: ao reabrir o app, a biometria não entrava. O cliente já
   havia renovado a sessão sozinho e o Supabase rotaciona o refresh token —
   o token guardado no Keystore virava "already used". */

function carregarBiometria(nativo) {
  delete global.AUTH_BIOMETRIC;
  global.window.Capacitor = {
    isNativePlatform: () => true,
    Plugins: { NativeBiometric: nativo },
  };
  const src = fs.readFileSync(path.join(root, 'js/auth-biometric.js'), 'utf8');
  // eslint-disable-next-line no-new-func
  new Function(src)();
  return global.window.AUTH_BIOMETRIC;
}

function nativoFake(over) {
  return Object.assign({
    isAvailable: () => Promise.resolve({ isAvailable: true }),
    verifyIdentity: jest.fn(() => Promise.resolve()),
    getCredentials: jest.fn(() => Promise.resolve({ username: 'r@x.com', password: 'refresh-guardado' })),
    setCredentials: jest.fn(() => Promise.resolve()),
    deleteCredentials: jest.fn(() => Promise.resolve()),
  }, over || {});
}

describe('Biometria — entrar depois de reabrir o app', () => {
  beforeEach(() => {
    localStorage.clear();
    localStorage.setItem('fp-biometric-enabled', '1');
  });

  test('com sessão válida, NÃO usa o token do Keystore', async () => {
    const nb = nativoFake();
    global.SUPA_AUTH = {
      validate: () => Promise.resolve(true),
      getSessionSync: () => ({ user: { email: 'r@x.com' } }),
      getRefreshToken: () => Promise.resolve('refresh-novo'),
      restoreSession: jest.fn(),
    };
    const bio = carregarBiometria(nb);

    const r = await bio.tryLogin();

    expect(r.email).toBe('r@x.com');
    expect(nb.verifyIdentity).toHaveBeenCalled();
    // O ponto do conserto: nada de setSession com token possivelmente vencido.
    expect(nb.getCredentials).not.toHaveBeenCalled();
    expect(global.SUPA_AUTH.restoreSession).not.toHaveBeenCalled();
  });

  test('com sessão válida, regrava o token atual no Keystore', async () => {
    const nb = nativoFake();
    global.SUPA_AUTH = {
      validate: () => Promise.resolve(true),
      getSessionSync: () => ({ user: { email: 'r@x.com' } }),
      getRefreshToken: () => Promise.resolve('refresh-novo'),
    };
    const bio = carregarBiometria(nb);

    await bio.tryLogin();
    await new Promise((r) => setTimeout(r, 0));

    expect(nb.setCredentials).toHaveBeenCalledWith(
      expect.objectContaining({ password: 'refresh-novo', username: 'r@x.com' }),
    );
  });

  test('sem sessão, restaura pelo Keystore e guarda o token rotacionado', async () => {
    const nb = nativoFake();
    global.SUPA_AUTH = {
      validate: () => Promise.resolve(false),
      getSessionSync: () => null,
      restoreSession: jest.fn(() => Promise.resolve({ user: { email: 'r@x.com' } })),
      getRefreshToken: () => Promise.resolve('refresh-rotacionado'),
    };
    const bio = carregarBiometria(nb);

    const r = await bio.tryLogin();

    expect(global.SUPA_AUTH.restoreSession).toHaveBeenCalledWith('refresh-guardado');
    expect(r.email).toBe('r@x.com');
    await new Promise((res) => setTimeout(res, 0));
    expect(nb.setCredentials).toHaveBeenCalledWith(
      expect.objectContaining({ password: 'refresh-rotacionado' }),
    );
  });

  test('token já usado vira instrução clara, não erro cru do Supabase', async () => {
    const nb = nativoFake();
    global.SUPA_AUTH = {
      validate: () => Promise.resolve(false),
      getSessionSync: () => null,
      restoreSession: () => Promise.reject(new Error('Invalid Refresh Token: Already Used')),
    };
    const bio = carregarBiometria(nb);

    await expect(bio.tryLogin()).rejects.toThrow(/Entre com a senha uma vez/);
  });

  test('credencial ausente desativa a biometria em vez de insistir', async () => {
    const nb = nativoFake({ getCredentials: () => Promise.reject(new Error('no credentials found')) });
    global.SUPA_AUTH = { validate: () => Promise.resolve(false), getSessionSync: () => null };
    const bio = carregarBiometria(nb);

    await expect(bio.tryLogin()).rejects.toThrow();
    expect(nb.deleteCredentials).toHaveBeenCalled();
    expect(localStorage.getItem('fp-biometric-enabled')).toBe('0');
  });

  test('desligada, nem chega a pedir a digital', async () => {
    localStorage.setItem('fp-biometric-enabled', '0');
    const nb = nativoFake();
    global.SUPA_AUTH = { validate: () => Promise.resolve(true), getSessionSync: () => ({ user: {} }) };
    const bio = carregarBiometria(nb);

    await expect(bio.tryLogin()).rejects.toThrow(/não configurada/i);
    expect(nb.verifyIdentity).not.toHaveBeenCalled();
  });
});

/* ───────────────────────── PIN ───────────────────────── */

const { PIN_SECURITY } = require('../js/pin.js');

describe('PIN — recusa os palpites óbvios', () => {
  test('barra os campeões de tentativa', () => {
    ['1234', '0000', '1111', '1212', '7777', '4321'].forEach((p) => {
      expect(PIN_SECURITY.avaliarPin(p).fraco).toBe(true);
    });
  });

  test('barra sequências, repetições, padrão ABAB e anos', () => {
    expect(PIN_SECURITY.avaliarPin('3456').fraco).toBe(true);  // sequência
    expect(PIN_SECURITY.avaliarPin('8765').fraco).toBe(true);  // sequência inversa
    expect(PIN_SECURITY.avaliarPin('5555').fraco).toBe(true);  // repetição
    expect(PIN_SECURITY.avaliarPin('3535').fraco).toBe(true);  // ABAB
    expect(PIN_SECURITY.avaliarPin('1987').fraco).toBe(true);  // ano
    expect(PIN_SECURITY.avaliarPin('2011').fraco).toBe(true);  // ano
  });

  test('cada recusa explica o motivo — o usuário precisa saber o que mudar', () => {
    expect(PIN_SECURITY.avaliarPin('1234').motivo).toMatch(/\S/);
    expect(PIN_SECURITY.avaliarPin('5555').motivo).toMatch(/iguais/i);
    expect(PIN_SECURITY.avaliarPin('1987').motivo).toMatch(/ano/i);
  });

  test('PIN comum e sem padrão passa', () => {
    ['8305', '4907', '6142'].forEach((p) => {
      expect(PIN_SECURITY.avaliarPin(p)).toEqual({ fraco: false });
    });
  });

  test('formato inválido é recusado antes de qualquer regra', () => {
    ['123', '12345', 'abcd', '', null].forEach((p) => {
      expect(PIN_SECURITY.avaliarPin(p).fraco).toBe(true);
    });
  });
});

describe('PIN — hash antigo continua entrando', () => {
  test('reconhece as iterações de cada formato', () => {
    expect(PIN_SECURITY.iteracoesDe('pbkdf2-sha256-100k')).toBe(100000);
    expect(PIN_SECURITY.iteracoesDe('pbkdf2-sha256-310k')).toBe(310000);
  });

  test('só o formato antigo precisa migrar', () => {
    expect(PIN_SECURITY.precisaMigrar('pbkdf2-sha256-100k')).toBe(true);
    expect(PIN_SECURITY.precisaMigrar(PIN_SECURITY.ALGORITMO_ID)).toBe(false);
  });
});

describe('PIN — backoff depois das tentativas', () => {
  let cfg;
  beforeEach(() => {
    cfg = {};
    global.DADOS = {
      getConfig: () => cfg,
      salvarConfig: (up) => Object.assign(cfg, up),
    };
  });

  test('as primeiras tentativas erradas não bloqueiam', () => {
    for (let i = 0; i < 4; i++) PIN_SECURITY.registrarFalha();
    expect(PIN_SECURITY.estaBloqueado()).toBe(0);
    expect(cfg.pinTentativas).toBe(4);
  });

  test('a quinta bloqueia por 30s e a sexta dobra', () => {
    for (let i = 0; i < 5; i++) PIN_SECURITY.registrarFalha();
    const primeiro = PIN_SECURITY.estaBloqueado();
    expect(primeiro).toBeGreaterThan(25);
    expect(primeiro).toBeLessThanOrEqual(30);

    PIN_SECURITY.registrarFalha();
    const segundo = PIN_SECURITY.estaBloqueado();
    expect(segundo).toBeGreaterThan(55);
    expect(segundo).toBeLessThanOrEqual(60);
  });

  test('acertar zera o contador', () => {
    for (let i = 0; i < 5; i++) PIN_SECURITY.registrarFalha();
    PIN_SECURITY.resetarFalhas();
    expect(PIN_SECURITY.estaBloqueado()).toBe(0);
    expect(cfg.pinTentativas).toBe(0);
  });
});

/* ───────────────────────── CSP ───────────────────────── */

const { limparCsp, openFinanceLigado } = require('../scripts/harden-csp.cjs');

describe('CSP — a lista de origens segue a feature flag', () => {
  const csp = fs.readFileSync(path.join(root, 'index.html'), 'utf8')
    .match(/<meta http-equiv="Content-Security-Policy"[^>]*>/)[0];

  test('com Open Finance desligado, a Belvo sai do script-src', () => {
    const out = limparCsp(csp, { openFinance: false });
    expect(out).not.toContain('belvo');
    expect(out).not.toContain('frame-src');
  });

  test('com Open Finance ligado, a Belvo permanece', () => {
    const out = limparCsp(csp, { openFinance: true });
    expect(out).toContain('cdn.belvo.com');
  });

  test('origens de dev nunca sobrevivem ao build', () => {
    ['localhost', '127.0.0.1'].forEach((o) => {
      expect(limparCsp(csp, { openFinance: true })).not.toContain(o);
      expect(limparCsp(csp, { openFinance: false })).not.toContain(o);
    });
  });

  test('a flag é lida do fonte, não chutada', () => {
    expect(typeof openFinanceLigado(path.join(root, 'js/core/config.js'))).toBe('boolean');
  });

  test('o Supabase continua liberado — senão o app não fala com a nuvem', () => {
    expect(limparCsp(csp, { openFinance: false })).toContain('supabase.co');
  });
});

/* ──────────────── Limite de tentativas na recuperação ────────────────
   supabase.js é uma IIFE que só se instala com CONFIG preenchido, então o
   tradutor de erros não é importável. Aqui ele é extraído do fonte e
   EXECUTADO — continua sendo comportamento real, não leitura de string. */

function carregarMsgRecovery() {
  const src = fs.readFileSync(path.join(root, 'js/core/supabase.js'), 'utf8');
  const corpo = src.slice(src.indexOf('function _msgRecovery'), src.indexOf('var SUPA_AUTH'));
  // eslint-disable-next-line no-new-func
  return new Function('_msg', 'return ' + corpo.replace(/^\s*function\s+_msgRecovery/, 'function'))(
    (e) => String((e && e.message) || e),
  );
}

describe('Recuperação — aviso de limite de tentativas', () => {
  const msg = carregarMsgRecovery();

  test('traduz o erro do banco em minutos, não em jargão', () => {
    expect(msg(new Error('RECOVERY_RATE_LIMITED:420'))).toMatch(/7 minutos/);
    expect(msg(new Error('RECOVERY_RATE_LIMITED:420'))).not.toContain('RECOVERY_RATE_LIMITED');
  });

  test('menos de um minuto não vira "0 minutos"', () => {
    expect(msg(new Error('RECOVERY_RATE_LIMITED:45'))).toMatch(/1 minuto/);
  });

  test('os outros erros da recuperação continuam traduzidos', () => {
    expect(msg(new Error('MFA_REQUIRED'))).toMatch(/autenticador/i);
    expect(msg(new Error('NOT_AUTHENTICATED'))).toMatch(/Sess/);
  });

  test('erro desconhecido passa adiante em vez de virar mensagem genérica', () => {
    expect(msg(new Error('falha esquisita do servidor'))).toContain('falha esquisita');
  });
});

describe('Recuperação — o limite está no banco, não na tela', () => {
  const dir = path.join(root, 'supabase/migrations');
  const arq = fs.readdirSync(dir).find((f) => /mfa_recovery_rate_limit\.sql$/.test(f));
  const sql = arq ? fs.readFileSync(path.join(dir, arq), 'utf8') : '';

  test('existe a migration do teto de tentativas', () => {
    expect(arq).toBeTruthy();
  });

  test('conta apenas falhas, e só dentro da janela', () => {
    expect(sql).toMatch(/not "sucesso"/);
    expect(sql).toMatch(/"attemptedAt" > now\(\) - JANELA/);
  });

  test('acerto não é punido por falhas anteriores', () => {
    // O bloqueio acontece ANTES da busca do código, e o insert de sucesso
    // é gravado com sucesso = true — nunca conta contra o usuário.
    expect(sql).toMatch(/values \(uid, true\)/);
  });

  test('a tabela de tentativas é fechada ao cliente', () => {
    expect(sql).toMatch(/enable row level security/);
    expect(sql).toMatch(/revoke all on table public\."MfaRecoveryAttempt" from anon, authenticated/);
  });

  test('o histórico não vira arquivo permanente', () => {
    expect(sql).toMatch(/interval '24 hours'/);
  });
});

describe('CSP — Tesseract servido pelo próprio app', () => {
  const { limparCsp, tesseractLocal } = require('../scripts/harden-csp.cjs');
  const csp = fs.readFileSync(path.join(root, 'index.html'), 'utf8')
    .match(/<meta http-equiv="Content-Security-Policy"[^>]*>/)[0];
  const diretiva = (html, nome) => ((html.match(new RegExp(nome + '[^;]*')) || [''])[0]);

  test('vendorizado, ninguém de fora executa script na página', () => {
    const out = limparCsp(csp, { openFinance: false, tesseractLocal: true });
    expect(diretiva(out, 'script-src')).not.toContain('jsdelivr');
    expect(diretiva(out, 'script-src')).toContain("'self'");
  });

  test('os .traineddata continuam permitidos — são dados, não script', () => {
    const out = limparCsp(csp, { openFinance: false, tesseractLocal: true });
    expect(diretiva(out, 'connect-src')).toContain('jsdelivr');
  });

  test('sem vendorizar, o CDN permanece — senão o OCR quebra', () => {
    const out = limparCsp(csp, { openFinance: false, tesseractLocal: false });
    expect(diretiva(out, 'script-src')).toContain('tesseract');
  });

  test('a flag ausente é lida como CDN, não como local', () => {
    // Conservador de propósito: errar para o lado que não quebra o app.
    expect(tesseractLocal('/caminho/que/nao/existe.js')).toBe(false);
  });

  test('o OCR escolhe os caminhos pela mesma flag', () => {
    const ocr = fs.readFileSync(path.join(root, 'js/ocr.js'), 'utf8');
    expect(ocr).toContain('CONFIG.TESSERACT_LOCAL');
    expect(ocr).toMatch(/workerPath: local \?/);
    expect(ocr).toMatch(/corePath: local \?/);
  });

  test('vendorizado, o loader não tenta o CDN que a CSP bloqueia', () => {
    const ocr = fs.readFileSync(path.join(root, 'js/ocr.js'), 'utf8');
    expect(ocr).toMatch(/src === localSrc && !OCR\._tesseractLocal\(\)/);
  });

  test('o script de vendorização registra integridade e permite desfazer', () => {
    const sc = fs.readFileSync(path.join(root, 'scripts/vendor-tesseract.cjs'), 'utf8');
    expect(sc).toContain('sha384');
    expect(sc).toContain('--undo');
    expect(sc).toContain('--check');
  });
});
