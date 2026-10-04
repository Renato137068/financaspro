/**
 * insight-acoes.js — o que acontece ao tocar num botão de insight ou alerta.
 *
 * Morava em INIT_CONFIG (a tela do Perfil), mas os insights aparecem no
 * dashboard e no orçamento. Com o Perfil carregado sob demanda (chunk
 * 'config'), os botões do dashboard ficariam mudos até alguém abrir o Perfil.
 * Aqui fica no carregamento inicial. INIT_CONFIG mantém os nomes antigos
 * (handleInsightAction, executarInsight) delegando para cá.
 *
 * ES Module (ADR 0005): os scripts clássicos o recebem como global por
 * js/esm/ponte.js.
 */

import { UTILS } from '../core/utils.js';
import { ORCAMENTO } from '../orcamento.js';
import { INSIGHTS } from '../insights.js';
import { INIT_NAVIGATION, mudarAba } from './init-navigation.js';
import { DADOS } from '../core/dados.js';
const INSIGHT_ACOES = {
  _ligado: false,

  /** Um listener delegado no documento para todo [data-insight-action]. */
  init: function() {
    if (INSIGHT_ACOES._ligado) return;
    INSIGHT_ACOES._ligado = true;
    var self = INSIGHT_ACOES;
    document.addEventListener('click', function(e) {
      var btn = e.target.closest('[data-insight-action]');
      if (!btn) return;
      var parametros = {};
      try {
        parametros = JSON.parse(btn.getAttribute('data-insight-params') || '{}');
      } catch (_err) {
        parametros = {};
      }
      self.handle(btn.getAttribute('data-insight-action'), btn, parametros);
    });
  },

  handle: function(acao, btn, parametros) {
    parametros = parametros || {};
    var nav = typeof INIT_NAVIGATION !== 'undefined' ? INIT_NAVIGATION : null;
    switch (acao) {
      case 'filtrar-categoria':
        var cat = btn.dataset.cat;
        mudarAba('extrato');
        // Wrapper global: carrega o chunk 'extrato' se ainda não chegou.
        setTimeout(function() { setFiltroCat(cat); }, 100);
        break;

      case 'criar-orcamento':
        mudarAba('orcamento');
        var focar = function() {
          setTimeout(function() {
            var input = document.getElementById('limit-' + btn.dataset.cat);
            if (input) input.focus();
          }, 100);
        };
        // A tela vem no chunk 'orcamento': foca só depois de ela existir.
        if (nav && nav.carregarChunkOrcamento) nav.carregarChunkOrcamento(focar);
        else focar();
        break;

      case 'abrirPaywall':
        // Teaser de insight levando ao paywall com o contexto que o gerou. O
        // paywall mora no chunk 'conta'; sem pedi-lo, o botão não fazia nada
        // para quem ainda não tinha aberto o Perfil.
        var abrir = function() {
          if (typeof INIT_BILLING !== 'undefined' && INIT_BILLING.abrirPaywall) {
            INIT_BILLING.abrirPaywall(parametros.message);
          }
        };
        if (typeof INIT_BILLING === 'undefined' && nav && nav.carregarChunkConta) nav.carregarChunkConta(abrir);
        else abrir();
        break;

      case 'irParaMetas':
        if (typeof mudarAba === 'function') mudarAba('orcamento', { orcSub: 'metas' });
        break;

      case 'ver-detalhes':
        break;

      default:
        INSIGHT_ACOES.executar(acao, parametros);
    }
  },

  executar: function(acao, parametros) {
    parametros = parametros || {};
    if (acao === 'aumentarLimite') {
      try {
        ORCAMENTO.definirLimite(parametros.categoria, parametros.novoLimite);
        UTILS.mostrarToast('Limite de ' + UTILS.labelCategoria(parametros.categoria) +
          ' → R$ ' + parametros.novoLimite.toFixed(2), 'success');
      } catch (_e) {
        UTILS.mostrarToast('Não foi possível atualizar o limite. Tente de novo.', 'error');
      }
    }

    if (acao === 'marcarRecorrente') {
      var catEl = document.getElementById('novo-categoria');
      var cat = (parametros && parametros.categoria) || (catEl ? catEl.value : '') || 'outro';
      var valorRec = parametros && parametros.valor ? parseFloat(parametros.valor) : 0;
      DADOS.salvarRecorrente({
        tipo: parametros.tipo || 'despesa',
        categoria: cat,
        descricao: parametros.descricao || 'Recorrente',
        frequencia: parametros.frequencia || 'mensal',
        valor: isNaN(valorRec) ? 0 : valorRec,
        dataInicio: UTILS.dataLocalIso(),
        ativo: true
      });
      UTILS.mostrarToast('"' + (parametros.descricao || 'Lançamento') + '" marcado como recorrente', 'success');
    }

    if (typeof INSIGHTS !== 'undefined') {
      setTimeout(function() { INSIGHTS.mostrar(); }, 150);
    }
  }
};

export { INSIGHT_ACOES };
export default INSIGHT_ACOES;
