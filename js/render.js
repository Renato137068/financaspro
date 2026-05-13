/**
 * render.js — Facade de renderização
 *
 * Responsabilidade: ponto único de entrada para RENDER.init() e RENDER.render*()
 * chamados de init.js, lifecycle.js e módulos. Toda implementação real vive em:
 *   - render-dashboard.js  → seção Resumo/Dashboard
 *   - render-core.js       → motor de renderização seletiva
 *
 * Manter este arquivo fino: apenas delegação, sem lógica de domínio.
 */

var RENDER = {

  init: function() {
    if (typeof RENDER_CORE !== 'undefined') {
      RENDER_CORE.renderAll();
    }
    this.renderExtrato();
    this.atualizarHeaderSaldo();
  },

  // ----------------------------------------------------------------
  // Métodos públicos de seção — delegam ao renderer do dashboard.
  // Chamados de init.js e módulos com guards (if RENDER.X) para
  // compatibilidade; scheduleRender colapsa chamadas no mesmo frame.
  // ----------------------------------------------------------------

  renderGreeting:              function() { if (typeof RENDER_CORE !== 'undefined') RENDER_CORE.scheduleRender('dashboard'); },
  renderCardSaldo:             function() { if (typeof RENDER_CORE !== 'undefined') RENDER_CORE.scheduleRender('dashboard'); },
  renderResumo:                function() { if (typeof RENDER_CORE !== 'undefined') RENDER_CORE.scheduleRender('dashboard'); },
  renderComparacaoMesAnterior: function() { if (typeof RENDER_CORE !== 'undefined') RENDER_CORE.scheduleRender('dashboard'); },
  renderAlertas:               function() { if (typeof RENDER_CORE !== 'undefined') RENDER_CORE.scheduleRender('dashboard'); },
  renderIndicadores:           function() { if (typeof RENDER_CORE !== 'undefined') RENDER_CORE.scheduleRender('dashboard'); },
  renderChartEvolucao:         function() { if (typeof RENDER_CORE !== 'undefined') RENDER_CORE.scheduleRender('dashboard'); },
  renderChartCategorias:       function() { if (typeof RENDER_CORE !== 'undefined') RENDER_CORE.scheduleRender('dashboard'); },
  renderOrcamento:             function() { if (typeof RENDER_CORE !== 'undefined') RENDER_CORE.scheduleRender('dashboard'); },
  renderUltimasTransacoes:     function() { if (typeof RENDER_CORE !== 'undefined') RENDER_CORE.scheduleRender('dashboard'); },

  // ----------------------------------------------------------------
  // Extrato — chama o módulo INIT_EXTRATO se disponível, com fallback
  // para a função global filtrarExtrato() ainda presente em init.js.
  // ----------------------------------------------------------------

  renderExtrato: function() {
    if (typeof INIT_EXTRATO !== 'undefined' && typeof INIT_EXTRATO.filtrarExtrato === 'function') {
      INIT_EXTRATO.filtrarExtrato();
      return;
    }
    if (typeof filtrarExtrato === 'function') {
      var container = document.getElementById('lista-transacoes');
      filtrarExtrato(container ? container.dataset.filtroAtual || 'todos' : 'todos');
    }
  },

  // Mantido por compatibilidade — header não replica saldo atualmente.
  atualizarHeaderSaldo: function() {}
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = RENDER;
}
