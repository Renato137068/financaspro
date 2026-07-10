/**
 * observability.js — captura de erros (Sentry-like) + analytics de produto,
 * SEM dependência externa e CSP-safe. Tudo opt-in via config.
 *
 * Ativação (via DADOS.getConfig()):
 *   obsErrorsEnabled: true            -> captura erros globais
 *   obsAnalyticsEnabled: true         -> registra eventos de produto
 *   obsEndpoint: 'https://.../ingest' -> envia beacons (opcional; senão só buffer local)
 *
 * Uso:
 *   OBS.captureError(err, { contexto: 'salvarTransacao' })
 *   OBS.track('transacao_criada', { tipo: 'despesa' })
 *   OBS.getBuffer()  // inspeção local (debug)
 *
 * Privacidade: nunca serializa valores de transação nem PII por padrão.
 * Só envia se obsEndpoint estiver configurado e o usuário tiver consentido.
 */
var OBS = (function() {
  var MAX_BUFFER = 50;
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
      app: (typeof APP_VERSION !== 'undefined' ? APP_VERSION : 'v11'),
      data: payload || {}
    };
    buffer.push(entry);
    if (buffer.length > MAX_BUFFER) buffer.shift();
    return entry;
  }

  function beacon(entry) {
    var c = cfg();
    if (!c.obsEndpoint) return; // sem endpoint => só buffer local
    try {
      var body = JSON.stringify(entry);
      if (navigator && typeof navigator.sendBeacon === 'function') {
        navigator.sendBeacon(c.obsEndpoint, body);
      } else if (typeof fetch === 'function') {
        fetch(c.obsEndpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: body,
          keepalive: true
        }).catch(function() {});
      }
    } catch (e) { /* observabilidade nunca pode quebrar o app */ }
  }

  function captureError(err, context) {
    try {
      if (!cfg().obsErrorsEnabled) { push('error', shape(err, context)); return; }
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
    } catch (e) { /* ambiente sem window */ }
  }

  return {
    start: start,
    captureError: captureError,
    track: track,
    getBuffer: function() { return buffer.slice(); }
  };
})();

// Auto-start: registra os listeners globais imediatamente (o envio remoto
// continua condicionado ao opt-in em config).
if (typeof window !== 'undefined') { OBS.start(); }

if (typeof module !== 'undefined' && module.exports) { module.exports = OBS; }
