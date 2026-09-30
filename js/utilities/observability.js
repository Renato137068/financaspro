/**
 * observability.js — captura de erros (Sentry-like) + analytics de produto,
 * SEM dependência externa e CSP-safe. Tudo opt-in via config.
 *
 * Ativação (via DADOS.getConfig()):
 *   obsErrorsEnabled: false           -> NÃO envia relatórios de erro (o padrão
 *                                        é enviar; o usuário desliga no Perfil)
 *   obsAnalyticsEnabled: true         -> registra eventos de produto (opt-in)
 *   obsEndpoint: 'https://.../ingest' -> endpoint próprio (sobrepõe o padrão)
 *
 * Erros vão por padrão para a Edge Function obs-ingest do Supabase (só no
 * build de nuvem; no modo local nada sai do aparelho), no máximo MAX_ENVIOS
 * por sessão. A função sanitiza e só aceita erros — analytics continua
 * exigindo obsEndpoint explícito.
 *
 * Uso:
 *   OBS.captureError(err, { contexto: 'salvarTransacao' })
 *   OBS.track('transacao_criada', { tipo: 'despesa' })
 *   OBS.getBuffer()  // inspeção local (debug)
 *   OBS.contarSessao() // aviso anônimo de uso, 1×/dia (chamado no boot)
 *
 * Privacidade: nunca serializa valores de transação nem PII por padrão.
 *
 * Contagem de uso (painel de saúde): para saber quantos erros cada versão tem
 * POR SESSÃO, o app avisa que foi aberto — no máximo uma vez por dia (UTC) por
 * aparelho, só com a versão. Nada de usuário, id, horário ou dado financeiro;
 * o servidor guarda só um contador por dia e versão, por 30 dias. Segue o
 * mesmo opt-out e o mesmo destino dos relatórios de erro.
 */
var OBS = (function() {
  var MAX_BUFFER = 50;
  // Um erro em loop (render a cada frame) não pode virar uma rajada de envios.
  var MAX_ENVIOS = 20;
  var enviados = 0;
  var buffer = [];
  var started = false;

  function cfg() {
    try {
      return (typeof DADOS !== 'undefined' && DADOS.getConfig) ? DADOS.getConfig() : {};
    } catch (e) { return {}; }
  }

  function nowIso() {
    try { return new Date().toISOString(); } catch (e) { return String(Date.now()); }
  }

  function push(kind, payload) {
    var entry = {
      kind: kind,
      ts: nowIso(),
      url: (location && location.pathname) || '',
      app: (typeof CONFIG !== 'undefined' && CONFIG.VERSION) || 'v11',
      data: payload || {}
    };
    buffer.push(entry);
    if (buffer.length > MAX_BUFFER) buffer.shift();
    return entry;
  }

  function endpoint(entry) {
    var c = cfg();
    if (c.obsEndpoint) return c.obsEndpoint;
    var base = entry.kind === 'error' && typeof CONFIG !== 'undefined' && CONFIG.SUPABASE_URL;
    return base ? base + '/functions/v1/obs-ingest' : '';
  }

  function beacon(entry) {
    var url = endpoint(entry);
    if (!url || enviados >= MAX_ENVIOS) return; // sem endpoint => só buffer local
    enviados++;
    try {
      var body = JSON.stringify(entry);
      if (navigator && typeof navigator.sendBeacon === 'function') {
        navigator.sendBeacon(url, body);
      } else if (typeof fetch === 'function') {
        fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: body,
          keepalive: true
        }).catch(function() {});
      }
    } catch (e) { /* observabilidade nunca pode quebrar o app */ }
  }

  var SESSAO_KEY = 'fp_obs_sessao_dia';

  /** Dia em UTC (AAAA-MM-DD): o mesmo dia que o contador do servidor usa. */
  function diaUtc() {
    return new Date().toISOString().slice(0, 10);
  }

  /**
   * Avisa "o app foi aberto hoje nesta versão", uma vez por dia. Volta true se
   * o aviso saiu. Não conta no limite de erros (MAX_ENVIOS) e não entra no
   * buffer: não é um evento, é um tique no contador.
   */
  function contarSessao() {
    try {
      var c = cfg();
      if (c.obsErrorsEnabled === false) return false;
      // Coletor próprio (obsEndpoint) recebe erros, não este contador.
      if (c.obsEndpoint) return false;
      var base = typeof CONFIG !== 'undefined' && CONFIG.SUPABASE_URL;
      var versao = typeof CONFIG !== 'undefined' && CONFIG.VERSION;
      if (!base || !versao) return false; // modo local: nada sai do aparelho
      var hoje = diaUtc();
      if (localStorage.getItem(SESSAO_KEY) === hoje) return false;
      // Marca antes de enviar: se o envio falhar, perde-se um tique — melhor
      // que contar duas vezes.
      localStorage.setItem(SESSAO_KEY, hoje);
      var body = JSON.stringify({ kind: 'sessao', app: String(versao) });
      var url = base + '/functions/v1/obs-ingest';
      if (navigator && typeof navigator.sendBeacon === 'function') {
        navigator.sendBeacon(url, body);
      } else if (typeof fetch === 'function') {
        fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'text/plain' },
          body: body,
          keepalive: true
        }).catch(function() {});
      } else {
        return false;
      }
      return true;
    } catch (e) { return false; /* sem localStorage (modo privado) ou sem rede */ }
  }

  function captureError(err, context) {
    try {
      if (cfg().obsErrorsEnabled === false) { push('error', shape(err, context)); return; }
      var entry = push('error', shape(err, context));
      beacon(entry);
    } catch (e) { /* noop */ }
  }

  function shape(err, context) {
    var msg = '', stack = '';
    if (err && err.message) { msg = String(err.message); }
    else { msg = String(err); }
    if (err && err.stack) { stack = String(err.stack).split('\n').slice(0, 6).join('\n'); }
    return { message: msg.slice(0, 300), stack: stack, context: context || {} };
  }

  function track(evento, props) {
    try {
      if (!cfg().obsAnalyticsEnabled) { push('event', { name: evento, props: props || {} }); return; }
      var entry = push('event', { name: evento, props: props || {} });
      beacon(entry);
    } catch (e) { /* noop */ }
  }

  /** Métricas de performance (cold start, LCP, INP, CLS, re-renders). */
  var perfBuffer = [];
  var renderCount = 0;
  var bootTs = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();

  function recordPerf(name, value, extra) {
    var entry = { name: name, value: value, ts: nowIso(), extra: extra || {} };
    perfBuffer.push(entry);
    if (perfBuffer.length > MAX_BUFFER) perfBuffer.shift();
    push('perf', entry);
    return entry;
  }

  function markRender() {
    renderCount++;
    recordPerf('re-render', renderCount);
  }

  function startPerf() {
    try {
      if (typeof performance === 'undefined') return;
      if (typeof PerformanceObserver === 'function') {
        try {
          var poLcp = new PerformanceObserver(function(list) {
            var entries = list.getEntries();
            var last = entries[entries.length - 1];
            if (last) recordPerf('LCP', Math.round(last.startTime));
          });
          poLcp.observe({ type: 'largest-contentful-paint', buffered: true });
        } catch (e1) { /* browser sem LCP */ }

        try {
          var poCls = new PerformanceObserver(function(list) {
            var score = 0;
            list.getEntries().forEach(function(e) {
              if (!e.hadRecentInput) score += e.value;
            });
            recordPerf('CLS', Number(score.toFixed(4)));
          });
          poCls.observe({ type: 'layout-shift', buffered: true });
        } catch (e2) { /* browser sem CLS */ }

        try {
          var poInp = new PerformanceObserver(function(list) {
            list.getEntries().forEach(function(e) {
              recordPerf('INP', Math.round(e.duration || e.processingStart || 0));
            });
          });
          poInp.observe({ type: 'event', buffered: true, durationThreshold: 16 });
        } catch (e3) {
          try {
            var poFid = new PerformanceObserver(function(list) {
              list.getEntries().forEach(function(e) {
                recordPerf('INP', Math.round(e.processingStart - e.startTime));
              });
            });
            poFid.observe({ type: 'first-input', buffered: true });
          } catch (e4) { /* noop */ }
        }
      }

      if (typeof document !== 'undefined') {
        if (document.readyState === 'complete') {
          recordPerf('cold-start', Math.round(
            (typeof performance.now === 'function' ? performance.now() : Date.now()) - bootTs
          ));
        } else {
          window.addEventListener('load', function() {
            recordPerf('cold-start', Math.round(
              (typeof performance.now === 'function' ? performance.now() : Date.now()) - bootTs
            ));
          });
        }
      }
    } catch (e) { /* perf nunca quebra o app */ }
  }

  function getPerf() {
    return { metrics: perfBuffer.slice(), renderCount: renderCount };
  }

  function start() {
    if (started) return;
    started = true;
    try {
      window.addEventListener('error', function(ev) {
        captureError(ev.error || ev.message, { type: 'window.onerror', src: ev.filename, line: ev.lineno });
      });
      window.addEventListener('unhandledrejection', function(ev) {
        captureError(ev.reason || 'unhandledrejection', { type: 'unhandledrejection' });
      });
      startPerf();
    } catch (e) { /* ambiente sem window */ }
  }

  return {
    start: start,
    captureError: captureError,
    contarSessao: contarSessao,
    track: track,
    getBuffer: function() { return buffer.slice(); },
    recordPerf: recordPerf,
    markRender: markRender,
    getPerf: getPerf
  };
})();

// Auto-start: registra os listeners globais imediatamente (o envio remoto
// continua condicionado ao opt-in em config).
if (typeof window !== 'undefined') { OBS.start(); }

if (typeof module !== 'undefined' && module.exports) { module.exports = OBS; }
