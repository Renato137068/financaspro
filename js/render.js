/**
 * render.js — Facade de renderização
 *
 * Responsabilidade: ponto único de entrada para RENDER.init() e RENDER.render*()
 * chamados de init.js, lifecycle.js e módulos. Toda implementação real vive em:
 *   - render-dashboard.js  → seção Resumo/Dashboard
 *   - render-core.js       → motor de renderização seletiva
 *
 * Manter este arquivo fino: apenas delegação, sem lógica de domínio.
 *
 * ES Module (ADR 0005): os scripts clássicos o recebem como global por
 * js/esm/ponte.js.
 */

import { RENDER_CORE } from './render-core.js';

const RENDER = {

  init: function() {
    if (typeof RENDER_CORE !== 'undefined') {
      RENDER_CORE.renderAll();
    }
    RENDER.renderExtrato();
    RENDER.atualizarHeaderSaldo();
    if (typeof OBS !== 'undefined' && OBS.markRender) OBS.markRender();
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
  // Extrato — só redesenha se o módulo já estiver carregado. Em produção
  // ele vem no chunk 'extrato' e se desenha sozinho ao abrir a aba; chamar o
  // wrapper global aqui baixaria o chunk no primeiro render do dashboard.
  // ----------------------------------------------------------------

  renderExtrato: function() {
    if (typeof INIT_EXTRATO !== 'undefined' && typeof INIT_EXTRATO.filtrarExtrato === 'function') {
      INIT_EXTRATO.filtrarExtrato();
    }
  },

  // Mantido por compatibilidade — header não replica saldo atualmente.
  atualizarHeaderSaldo: function() {}
};

export { RENDER };
export default RENDER;
