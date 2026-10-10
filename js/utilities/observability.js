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
 * por sessão, cada erro uma vez só. Sem rede, até 10 relatórios esperam no
 * aparelho. A função sanitiza e só aceita erros — analytics continua
 * exigindo obsEndpoint explícito.
 *
 * Uso:
 *   OBS.captureError(err, { contexto: 'salvarTransacao' })
 *   OBS.track('transacao_criada', { tipo: 'despesa' })
 *   OBS.getBuffer()  // inspeção local (debug)
 *   OBS.contarSessao() // aviso anônimo de uso, 1×/dia (chamado no boot)
 *   OBS.enviarPendentes() // reenvia o que ficou guardado sem rede (boot e 'online')
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

  /**
   * Manda um corpo ao coletor. Volta false quando nem tentou: aparelho sem
   * rede, ou sendBeacon recusou (fila do navegador cheia). text/plain evita o
   * preflight de CORS; a Edge Function lê o corpo como texto.
   */
  function enviar(url, corpo) {
    if (navigator && navigator.onLine === false) return false;
    var body = JSON.stringify(corpo);
    if (navigator && typeof navigator.sendBeacon === 'function') {
      return navigator.sendBeacon(url, body) !== false;
    }
    if (typeof fetch !== 'function') return false;
    fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain' },
      body: body,
      keepalive: true
    }).catch(function() {});
    return true;
  }

  // Erro que acontece sem rede (metrô, modo avião) não se perde: fica guardado
  // no aparelho e sai na próxima abertura com rede ou quando a rede volta.
  var PENDENTES_KEY = 'fp_obs_pendentes';
  var MAX_PENDENTES = 10;

  function lerPendentes() {
    try { return JSON.parse(localStorage.getItem(PENDENTES_KEY) || '[]') || []; } catch (e) { return []; }
  }

  function beacon(entry) {
    var url = endpoint(entry);
    if (!url || enviados >= MAX_ENVIOS) return; // sem endpoint => só buffer local
    enviados++;
    try {
      if (!enviar(url, entry) && entry.kind === 'error') {
        localStorage.setItem(PENDENTES_KEY, JSON.stringify(lerPendentes().concat([entry]).slice(-MAX_PENDENTES)));
      }
    } catch (e) { /* observabilidade nunca pode quebrar o app */ }
  }

  /** Reenvia os relatórios guardados sem rede. Volta quantos tentou. */
  function enviarPendentes() {
    try {
      var lista = lerPendentes();
      if (!lista.length) return 0;
      localStorage.removeItem(PENDENTES_KEY);
      if (cfg().obsErrorsEnabled === false) return 0;
      lista.forEach(beacon); // ainda sem rede: voltam para a fila
      return lista.length;
    } catch (e) { return 0; }
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
      if (navigator && navigator.onLine === false) return false; // conta quando houver rede
      // Marca antes de enviar: se o envio falhar, perde-se um tique — melhor
      // que contar duas vezes.
      localStorage.setItem(SESSAO_KEY, hoje);
      return enviar(base + '/functions/v1/obs-ingest', { kind: 'sessao', app: String(versao) });
    } catch (e) { return false; /* sem localStorage (modo privado) ou sem rede */ }
  }

  // O mesmo erro (mensagem, primeira linha da pilha e contexto) sai uma vez
  // por sessão: um erro que se repete não gasta o limite que outro precisaria.
  var vistos = {};

  function captureError(err, context) {
    try {
      var entry = push('error', shape(err, context));
      if (cfg().obsErrorsEnabled === false) return;
      var d = entry.data;
      var chave = [d.message, d.stack.split('\n')[1], d.context.contexto].join('|');
      if (vistos[chave]) return;
      vistos[chave] = 1;
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
      window.addEventListener('online', enviarPendentes);
    } catch (e) { /* ambiente sem window */ }
  }

  return {
    start: start,
    captureError: captureError,
    contarSessao: contarSessao,
    track: track,
    enviarPendentes: enviarPendentes,
    getBuffer: function() { return buffer.slice(); }
  };
})();

// Auto-start: registra os listeners globais imediatamente (o envio remoto
// continua condicionado ao opt-in em config).
if (typeof window !== 'undefined') { OBS.start(); }

if (typeof module !== 'undefined' && module.exports) { module.exports = OBS; }
