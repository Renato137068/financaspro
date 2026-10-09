/**
 * app-jsdom.cjs — sobe o FinançasPro inteiro num jsdom, como no navegador.
 *
 * A maior parte dos testes de UI carrega um módulo isolado com dublês à volta.
 * Isso trava regra de negócio, mas não prova que a tela funciona: o dublê
 * responde o que o teste espera, não o que o app real responderia. Aqui o
 * index.html real é montado num jsdom próprio e TODOS os scripts rodam na
 * ordem do index, no contexto da janela, com o caminho real de cada arquivo —
 * o que também faz a cobertura V8 contá-los.
 *
 * Modo local (fp-force-local), sem Supabase nem rede: é o app de quem usa sem
 * conta. O que depende de nuvem fica fora deste harness.
 *
 *   const app = await subirApp({ config: {...}, transacoes: [...] });
 *   app.window.mudarAba('novo');
 *   app.fechar();
 *
 * O relógio da janela começa em AGORA_PADRAO, não na hora real: o app mostra o
 * mês corrente, e um teste com lançamentos de uma data fixa quebrava na virada
 * do mês (aconteceu em 1º/out). Quem precisa do relógio real pede
 * `agora: 'real'`. E cada teste ganha 15 s em vez dos 5 s do Jest: subir o app
 * leva até ~1,5 s e, com a máquina ocupada (cobertura, E2E ao lado), um teste
 * que sobe o app duas vezes passava dos 5 s.
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { JSDOM, VirtualConsole } = require('jsdom');
const { executarModulo } = require('./esm-como-script.cjs');

/** Data/hora em que o app "acorda" nos testes, salvo `opts.agora`. */
const AGORA_PADRAO = '2026-09-20T12:00:00.000-03:00';
const TEMPO_LIMITE_MS = 15000;

// `jest` é injetado em cada módulo carregado pelo Jest; vale para o arquivo de
// teste que importou o harness.
if (typeof jest !== 'undefined' && jest.setTimeout) jest.setTimeout(TEMPO_LIMITE_MS);

const ROOT = path.join(__dirname, '..', '..');

function scriptsDoIndex(html) {
  const re = /<script[^>]+src="([^"]+)"[^>]*><\/script>/g;
  const lista = [];
  let m;
  while ((m = re.exec(html))) {
    if (!/^https?:/.test(m[1])) lista.push(m[1].replace(/^\//, ''));
  }
  return lista;
}

/** `<script type="module" src>` do index.html (ES Modules, ADR 0005). */
function modulosDoIndex(html) {
  const re = /<script[^>]+type="module"[^>]+src="([^"]+)"[^>]*><\/script>/g;
  const lista = [];
  let m;
  while ((m = re.exec(html))) lista.push(m[1].replace(/^\//, ''));
  return lista;
}

/**
 * Dublê do supabase-js: mesma superfície que js/core/supabase.js e o sync usam.
 * `contas` é { email: senha }; login com senha certa abre sessão e avisa os
 * ouvintes de onAuthStateChange, como o cliente real.
 */
function criarSupabaseFalso(opts) {
  opts = opts || {};
  const contas = opts.contas || {};
  const ouvintes = [];
  const chamadas = [];
  let sessao = opts.sessao || null;
  const ok = (data) => Promise.resolve({ data: data, error: null });
  const falha = (message, code) => Promise.resolve({ data: null, error: { message: message, code: code, status: 422 } });

  /* MFA com estado (opts.mfa = { codigo }): cadastrar cria um fator não
     verificado; o código certo o verifica (ou autoriza removê-lo); errado
     devolve o erro do Supabase. Códigos de recuperação pelas RPCs reais. */
  const mfaCfg = opts.mfa || null;
  const fatores = [];
  let codigosRecuperacao = [];
  function mfaComEstado() {
    return {
      listFactors: () => ok({ totp: fatores.map((f) => Object.assign({}, f)), all: fatores.slice() }),
      getAuthenticatorAssuranceLevel: () => {
        const nivel = fatores.some((f) => f.status === 'verified') ? 'aal2' : 'aal1';
        return ok({ currentLevel: nivel, nextLevel: nivel });
      },
      enroll: (p) => {
        chamadas.push({ metodo: 'mfa.enroll', tipo: p && p.factorType });
        const f = { id: 'fator-' + (fatores.length + 1), status: 'unverified', factor_type: 'totp' };
        fatores.push(f);
        return ok({ id: f.id, totp: { qr_code: '<svg xmlns="http://www.w3.org/2000/svg"></svg>', secret: 'JBSWY3DPEHPK3PXP' } });
      },
      challengeAndVerify: (p) => {
        chamadas.push({ metodo: 'mfa.challengeAndVerify', code: p.code });
        const f = fatores.find((x) => x.id === p.factorId);
        if (!f || p.code !== mfaCfg.codigo) return falha('Invalid TOTP code entered', 'mfa_verification_failed');
        f.status = 'verified';
        return ok({});
      },
      unenroll: (p) => {
        chamadas.push({ metodo: 'mfa.unenroll', factorId: p.factorId });
        const i = fatores.findIndex((x) => x.id === p.factorId);
        if (i >= 0) fatores.splice(i, 1);
        return ok({ id: p.factorId });
      },
    };
  }
  function rpcRecuperacao(nome) {
    if (nome === 'fp_mfa_recovery_generate') {
      codigosRecuperacao = ['aaaa-1111', 'bbbb-2222', 'cccc-3333', 'dddd-4444'];
      chamadas.push({ metodo: 'rpc', nome: nome });
      return ok(codigosRecuperacao.slice());
    }
    if (nome === 'fp_mfa_recovery_count') return ok(codigosRecuperacao.length);
    return ok(null);
  }
  const avisar = (evento) => ouvintes.forEach((cb) => { try { cb(evento, sessao); } catch (e) { /* ouvinte do app */ } });
  const consulta = function() {
    const q = {};
    ['select', 'eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'in', 'is', 'order', 'limit', 'range', 'match', 'update', 'delete', 'or', 'filter']
      .forEach((m) => { q[m] = function() { return q; }; });
    q.upsert = function() { return ok([]); };
    q.insert = function() { return ok([]); };
    q.single = function() { return ok(null); };
    q.maybeSingle = function() { return ok(null); };
    q.then = function(res, rej) { return ok([]).then(res, rej); };
    return q;
  };
  const client = {
    auth: {
      getSession: () => ok({ session: sessao }),
      onAuthStateChange: (cb) => { ouvintes.push(cb); return { data: { subscription: { unsubscribe() {} } } }; },
      signInWithPassword: (cred) => {
        chamadas.push({ metodo: 'signInWithPassword', email: cred.email });
        if (!Object.prototype.hasOwnProperty.call(contas, cred.email) || contas[cred.email] !== cred.password) {
          return Promise.resolve({ data: { session: null, user: null }, error: { message: 'Invalid login credentials', status: 400, code: 'invalid_credentials' } });
        }
        const user = { id: 'u-' + cred.email, email: cred.email, user_metadata: {} };
        sessao = { access_token: 'tok', refresh_token: 'ref', expires_at: Math.floor(Date.now() / 1000) + 3600, user: user };
        setTimeout(() => avisar('SIGNED_IN'), 0);
        return ok({ session: sessao, user: user });
      },
      signOut: () => { sessao = null; setTimeout(() => avisar('SIGNED_OUT'), 0); return Promise.resolve({ error: null }); },
      /* `opts.jaCadastrados`: e-mails que o projeto recusa com "User already
         registered" (projeto sem confirmação de e-mail). */
      signUp: (cred) => {
        const dados = (cred.options && cred.options.data) || {};
        chamadas.push({ metodo: 'signUp', email: cred.email, nome: dados.name });
        if ((opts.jaCadastrados || []).indexOf(cred.email) >= 0) {
          return Promise.resolve({ data: { user: null, session: null }, error: { message: 'User already registered', status: 422, code: 'user_already_exists' } });
        }
        return ok({ user: null, session: null });
      },
      resetPasswordForEmail: (email) => { chamadas.push({ metodo: 'resetPasswordForEmail', email: email }); return ok({}); },
      resend: () => ok({}),
      setSession: (s) => { sessao = s; return ok({ session: s }); },
      updateUser: () => ok({ user: sessao && sessao.user }),
      mfa: mfaCfg ? mfaComEstado() : {
        listFactors: () => ok({ totp: [], all: [] }),
        getAuthenticatorAssuranceLevel: () => ok({ currentLevel: 'aal1', nextLevel: 'aal1' }),
        enroll: () => ok({}), challengeAndVerify: () => ok({}), unenroll: () => ok({}),
      },
    },
    /* `opts.from(tabela)`: um teste pode servir as tabelas que lhe interessam
       (devolvendo um construtor de consulta); o que ficar de fora é a
       consulta vazia de sempre. */
    from: (tabela) => (opts.from && opts.from(tabela)) || consulta(),
    rpc: (nome) => {
      if (nome === 'fp_delete_own_account') {
        chamadas.push({ metodo: 'rpc', nome: nome });
        return ok(null);
      }
      return mfaCfg ? rpcRecuperacao(nome) : ok(null);
    },
    channel: () => ({ on() { return this; }, subscribe() { return this; }, unsubscribe() {} }),
    removeChannel: () => {},
  };
  return { createClient: () => client, chamadas: chamadas };
}

/** APIs de navegador que o jsdom não traz e o app consulta no boot. */
function completarJanela(w) {
  if (!w.matchMedia) {
    w.matchMedia = function(q) {
      return { matches: false, media: q, onchange: null, addListener() {}, removeListener() {},
        addEventListener() {}, removeEventListener() {}, dispatchEvent() { return false; } };
    };
  }
  const Observador = function() { return { observe() {}, unobserve() {}, disconnect() {}, takeRecords() { return []; } }; };
  if (!w.IntersectionObserver) w.IntersectionObserver = Observador;
  if (!w.ResizeObserver) w.ResizeObserver = Observador;
  if (!w.requestIdleCallback) w.requestIdleCallback = function(fn) { return setTimeout(function() { fn({ timeRemaining() { return 50; }, didTimeout: false }); }, 0); };
  if (!w.cancelIdleCallback) w.cancelIdleCallback = function(id) { clearTimeout(id); };
  if (!w.scrollTo || /not implemented/i.test(String(w.scrollTo))) w.scrollTo = function() {};
  w.HTMLElement.prototype.scrollIntoView = function() {};
  if (!w.crypto || !w.crypto.subtle) {
    Object.defineProperty(w, 'crypto', { value: require('crypto').webcrypto, configurable: true });
  }
  if (!w.TextEncoder) { w.TextEncoder = require('util').TextEncoder; w.TextDecoder = require('util').TextDecoder; }
  if (!w.structuredClone) w.structuredClone = function(v) { return JSON.parse(JSON.stringify(v)); };
  w.fetch = function() { return Promise.reject(new Error('sem rede no teste')); };
  if (!w.navigator.sendBeacon) w.navigator.sendBeacon = function() { return true; };
}

/**
 * @param {object} [opts]
 * @param {object} [opts.config]       fp-config inicial
 * @param {Array}  [opts.transacoes]   fp-transacoes inicial
 * @param {object} [opts.storage]      chaves extras do localStorage
 * @param {object|boolean} [opts.nuvem] build de nuvem com Supabase falso;
 *                                      { contas: {email: senha}, sessao, mfa: {codigo},
 *                                        jaCadastrados: [email], from: (tabela) => consulta }
 * @param {string} [opts.agora]       data/hora ISO em que o app "acorda" (o relógio da
 *                                      janela anda a partir dela). Padrão: AGORA_PADRAO;
 *                                      'real' deixa o relógio da máquina
 * @param {Function} [opts.antesDoBoot] (janela, global) depois dos scripts e antes
 *                                      do DOMContentLoaded (para instalar espiões)
 * @returns {Promise<{window, document, erros: string[], fechar: Function}>}
 */
async function subirApp(opts) {
  opts = opts || {};
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  const semScripts = html.replace(/<script\b[\s\S]*?<\/script>/g, '');
  const erros = [];
  const consoleVirtual = new VirtualConsole();
  consoleVirtual.on('jsdomError', function(e) {
    const msg = e && (e.message || String(e));
    if (/Not implemented|Could not parse CSS/.test(msg)) return;
    erros.push(msg);
  });

  const dom = new JSDOM(semScripts, {
    url: 'http://127.0.0.1/?offline=1',
    runScripts: 'outside-only',
    pretendToBeVisual: true,
    virtualConsole: consoleVirtual,
  });
  const w = dom.window;
  completarJanela(w);
  w.addEventListener('error', function(ev) { erros.push((ev.error && ev.error.message) || ev.message); });
  w.addEventListener('unhandledrejection', function(ev) {
    const r = ev.reason;
    erros.push('unhandledrejection: ' + ((r && r.message) || String(r)));
  });

  let supaFalso = null;
  if (opts.nuvem) {
    supaFalso = criarSupabaseFalso(opts.nuvem === true ? {} : opts.nuvem);
  } else {
    w.localStorage.setItem('fp-force-local', '1');
  }
  w.localStorage.setItem('fp-config', JSON.stringify(Object.assign({
    nome: 'Teste', moeda: 'BRL', tema: 'light', plano: 'free', pinAtivo: false,
    onboardingConcluido: true, renda: 5000, _schemaVer: 2,
  }, opts.config || {})));
  w.localStorage.setItem('fp-transacoes', JSON.stringify(opts.transacoes || []));
  w.localStorage.setItem('fp-contas', '[]');
  Object.entries(opts.storage || {}).forEach(function([k, v]) { w.localStorage.setItem(k, v); });

  const ctx = dom.getInternalVMContext();
  const agora = opts.agora === 'real' ? null : (opts.agora || AGORA_PADRAO);
  if (agora) {
    // Date da própria janela (mesmo realm dos scripts, para instanceof valer),
    // deslocado para `agora` e andando normalmente dali em diante.
    vm.runInContext('(function(fixo){var R=Date;var d=fixo-R.now();' +
      'class D extends R{constructor(...a){if(a.length)super(...a);else super(R.now()+d);}static now(){return R.now()+d;}}' +
      'globalThis.Date=D;})(' + new Date(agora).getTime() + ')', ctx);
  }
  const modulos = new Map();
  const esm = modulosDoIndex(html);
  for (const rel of scriptsDoIndex(html)) {
    const arquivo = path.join(ROOT, rel);
    if (!fs.existsSync(arquivo)) continue;
    if (rel === 'js/vendor/supabase.js' && supaFalso) { w.supabase = supaFalso; continue; }
    try {
      if (esm.includes(rel)) executarModulo(ctx, arquivo, modulos);
      else vm.runInContext(fs.readFileSync(arquivo, 'utf8'), ctx, { filename: arquivo });
    } catch (e) {
      erros.push(rel + ': ' + e.message);
    }
  }

  // Módulos declarados com `const` são globais léxicos: não aparecem em window.
  const global_ = function(nome) { return vm.runInContext(nome, ctx); };
  if (typeof opts.antesDoBoot === 'function') opts.antesDoBoot(w, global_);
  // O próprio jsdom dispara DOMContentLoaded e load depois deste tick (o
  // readyState ainda é 'loading' aqui, como com scripts defer no navegador).
  // Disparar à mão inicializaria o app duas vezes.

  // Espera o dashboard hidratar (mesmo critério do E2E). Na nuvem sem sessão
  // quem aparece primeiro é o login.
  const limite = Date.now() + 8000;
  while (Date.now() < limite) {
    const auth = w.document.getElementById('auth-overlay');
    if (opts.nuvem && !(opts.nuvem.sessao) && auth && auth.style.display !== 'none'
        && w.document.body.classList.contains('auth-overlay-open')) break;
    const resumo = w.document.getElementById('aba-resumo');
    if (resumo && resumo.getAttribute('data-dashboard-ready') === '1') break;
    await new Promise(function(r) { setTimeout(r, 25); });
  }

  return {
    window: w,
    document: w.document,
    erros: erros,
    /** Chamadas feitas ao Supabase falso (só com opts.nuvem). */
    supabase: supaFalso,
    /** Lê um global do app pelo nome (funciona para `const` e `var`). */
    global: global_,
    esperar: function(cond, ms) {
      const fim = Date.now() + (ms || 3000);
      return (async function loop() {
        while (Date.now() < fim) {
          if (cond()) return true;
          await new Promise(function(r) { setTimeout(r, 20); });
        }
        return false;
      })();
    },
    /**
     * Chunk 'conta' (paywall, 2FA, Open Finance) pelo caminho do app: LAZY.load
     * e o init() de cada módulo, como ao abrir o Perfil. É ES Module sob
     * demanda: nem no código-fonte vem no boot.
     */
    carregarChunkConta: function() {
      return new Promise(function(resolve) { w.INIT_NAVIGATION.carregarChunkConta(resolve); });
    },
    fechar: function() { w.close(); },
  };
}

module.exports = { subirApp, scriptsDoIndex, modulosDoIndex, AGORA_PADRAO, TEMPO_LIMITE_MS };
