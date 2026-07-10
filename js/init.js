/**
 * init.js - Globals de compatibilidade + delegadores (v3)
 * Lógica principal: INIT_FORM, INIT_EXTRATO, INIT_CONFIG, INIT_MODALS, INIT_NAVIGATION
 */

document.addEventListener('DOMContentLoaded', function() {
  APP_BOOTSTRAP.inicializar();
});

/* ── Helpers de delegação ── */

function _lucideHtml(name) {
  if (typeof lucideIconHtml === 'function') return lucideIconHtml(name);
  return '<i data-lucide="' + (name || 'pin') + '" aria-hidden="true"></i>';
}

function _extrato(fn) {
  var args = Array.prototype.slice.call(arguments, 1);
  if (typeof INIT_EXTRATO !== 'undefined' && typeof INIT_EXTRATO[fn] === 'function') {
    return INIT_EXTRATO[fn].apply(INIT_EXTRATO, args);
  }
}

function _form(fn) {
  var args = Array.prototype.slice.call(arguments, 1);
  if (typeof INIT_FORM !== 'undefined' && typeof INIT_FORM[fn] === 'function') {
    return INIT_FORM[fn].apply(INIT_FORM, args);
  }
}

function _config(fn) {
  var args = Array.prototype.slice.call(arguments, 1);
  if (typeof INIT_CONFIG !== 'undefined' && typeof INIT_CONFIG[fn] === 'function') {
    return INIT_CONFIG[fn].apply(INIT_CONFIG, args);
  }
}

function _modals(fn) {
  var args = Array.prototype.slice.call(arguments, 1);
  if (typeof INIT_MODALS !== 'undefined' && typeof INIT_MODALS[fn] === 'function') {
    return INIT_MODALS[fn].apply(INIT_MODALS, args);
  }
}

/* ── Extrato → INIT_EXTRATO ── */

function getCatIcon(cat) { return _extrato('getCatIcon', cat) || ''; }
function getCatCor(cat) { return _extrato('getCatCor', cat) || '#94a3b8'; }
function getExtratoMesAno() { return _extrato('getExtratoMesAno'); }
function navegarPeriodo(dir) { _extrato('navegarPeriodo', dir); }
function atualizarPeriodoLabel() { _extrato('atualizarPeriodoLabel'); }
function setFiltroTipo(tipo) { _extrato('setFiltroTipo', tipo); }
function setFiltroCat(cat) { _extrato('setFiltroCat', cat); }
function filtrarExtrato() { _extrato('filtrarExtrato'); }
function abrirEdicaoTransacao(id) { _extrato('editarTransacao', id); }
function exportarExcel() { _extrato('exportarExcel'); }
function exportarExtrato() { _extrato('exportarExtrato'); }
function exportarPDF() { exportarExtrato(); }

/* ── Formulário → INIT_FORM ── */

function renderQuickEntries() { _form('renderQuickEntries'); }
function renderCategoriasBtns(tipo) { _form('renderCategoriasBtns', tipo); }
function filtrarCategoriasPorTipo(tipo) { _form('filtrarCategoriasPorTipo', tipo); }
function atualizarTipoIndicator(tipo) { _form('atualizarTipoIndicator', tipo); }
function atualizarOrcamentoPreview() { _form('atualizarOrcamentoPreview'); }
function abrirEntradaRapida() { _form('abrirEntradaRapida'); }
function renderizarSelects() { _form('renderizarSelects'); }
function atualizarBadgeConfianca(confianca) { _form('atualizarBadgeConfianca', confianca); }

/* ── Dashboard ── */

function atualizarDashboard() {
  if (RENDER.renderGreeting) RENDER.renderGreeting();
  if (RENDER.renderCardSaldo) RENDER.renderCardSaldo();
  if (RENDER.renderResumo) RENDER.renderResumo();
  if (RENDER.renderComparacaoMesAnterior) RENDER.renderComparacaoMesAnterior();
  if (RENDER.renderAlertas) RENDER.renderAlertas();
  if (RENDER.renderChartEvolucao) RENDER.renderChartEvolucao();
  if (RENDER.renderChartCategorias) RENDER.renderChartCategorias();
  if (RENDER.renderOrcamento) RENDER.renderOrcamento();
  if (RENDER.renderUltimasTransacoes) RENDER.renderUltimasTransacoes();
  if (RENDER.atualizarHeaderSaldo) RENDER.atualizarHeaderSaldo();
}

/* ── Config / Perfil → INIT_CONFIG ── */

function renderConfigTab() { _config('refreshPerfil'); }
function renderConfigStats() { _config('renderConfigStats'); }
function abrirEditarPerfil() { _config('abrirEditarPerfil'); }
function abrirEditarRenda() { _config('abrirEditarRenda'); }
function abrirConfigBancos() { _config('abrirConfigBancos'); }
function abrirGerenciarCategorias(tipo) { _config('abrirGerenciarCategorias', tipo); }
function toggleAlertaOrcamento() { _config('toggleAlertaOrcamento'); }
function toggleLembreteDiario() { _config('toggleLembreteDiario'); }
function exportarDados() { _config('exportarDados'); }
function executarInsight(acao, parametros) { _config('executarInsight', acao, parametros); }

/* ── Modais → INIT_MODALS ── */

function fpAlert(htmlContent, options) {
  if (typeof INIT_MODALS !== 'undefined' && INIT_MODALS.fpAlert) {
    INIT_MODALS.fpAlert(htmlContent, options);
    return;
  }
  options = options || {};
  var body = options.trustedHtml ? htmlContent : '<p>' + UTILS.escapeHtml(htmlContent) + '</p>';
  var ov = document.createElement('div');
  ov.className = 'modal-overlay';
  ov.innerHTML = '<div class="modal-box">' + body +
    '<div class="modal-actions"><button class="modal-btn btn-principal" type="button">OK</button></div></div>';
  document.body.appendChild(ov);
  ov.querySelector('.modal-btn').addEventListener('click', function() { ov.remove(); });
}

function fpConfirm(msg, onOk, onNo) {
  if (typeof INIT_MODALS !== 'undefined' && INIT_MODALS.fpConfirm) {
    INIT_MODALS.fpConfirm(msg, onOk, onNo);
    return;
  }
  if (window.confirm(msg)) { if (onOk) onOk(); }
  else if (onNo) onNo();
}

function abrirChangelog() { _modals('abrirChangelog'); }
function abrirFeedback() { _modals('abrirFeedback'); }

/* Cache LRU do score — limpeza periódica */
setInterval(function() {
  if (typeof SCORE !== 'undefined') SCORE.limparCache();
}, 300000);
