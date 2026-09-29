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
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { JSDOM, VirtualConsole } = require('jsdom');
const { executarModulo } = require('./esm-como-script.cjs');

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
      signUp: (cred) => { chamadas.push({ metodo: 'signUp', email: cred.email }); return ok({ user: null, session: null }); },
      resetPasswordForEmail: (email) => { chamadas.push({ metodo: 'resetPasswordForEmail', email: email }); return ok({}); },
      resend: () => ok({}),
      setSession: (s) => { sessao = s; return ok({ session: s }); },
      updateUser: () => ok({ user: sessao && sessao.user }),
      mfa: {
        listFactors: () => ok({ totp: [], all: [] }),
        getAuthenticatorAssuranceLevel: () => ok({ currentLevel: 'aal1', nextLevel: 'aal1' }),
        enroll: () => ok({}), challengeAndVerify: () => ok({}), unenroll: () => ok({}),
      },
    },
    from: () => consulta(),
    rpc: () => ok(null),
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
 *                                      { contas: {email: senha}, sessao }
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

module.exports = { subirApp, scriptsDoIndex, modulosDoIndex };
