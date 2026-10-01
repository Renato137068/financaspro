/**
 * init-extrato.js - Sistema de extrato e filtros
 *
 * Fachada do INIT_EXTRATO: o objeto e o estado nascem em extrato/base.js e
 * cada parte acrescenta os seus métodos — filtros (extrato/filtros.js),
 * resumo do mês (extrato/resumo.js), lista (extrato/lista.js) e ações e
 * exportação (extrato/acoes.js). Aqui ficam o init e os ouvintes da tela.
 *
 * ES Module (ADR 0005): chega sob demanda no chunk 'extrato'
 * (js/esm/chunks/extrato.js, via LAZY.load), que o publica em window.
 */

import { INIT_EXTRATO } from './extrato/base.js';
import './extrato/filtros.js';
import './extrato/resumo.js';
import './extrato/lista.js';
import './extrato/acoes.js';

Object.assign(INIT_EXTRATO, {

  /**
   * Inicializa sistema de extrato
   */
  init: function() {
    INIT_EXTRATO._carregarFiltrosSalvos();
    INIT_EXTRATO.setupExtratoListeners();
    INIT_EXTRATO.atualizarPeriodoLabel();
    INIT_EXTRATO._bindBusca();
    INIT_EXTRATO._bindKeyboardShortcuts();
    INIT_EXTRATO.atualizarBadgeFiltrosAvancados();
    INIT_EXTRATO._syncOrdenacaoUI();
    INIT_EXTRATO._bindVirtualScroll();
  },

  /**
   * Carrega filtros salvos do localStorage
   */
  _carregarFiltrosSalvos: function() {
    try {
      var filtrosSalvos = localStorage.getItem('extrato_filtros');
      if (filtrosSalvos) {
        var filtros = JSON.parse(filtrosSalvos);
        INIT_EXTRATO.state.filtroTipo = filtros.filtroTipo || 'todos';
        INIT_EXTRATO.state.ordenacao = filtros.ordenacao || 'data-desc';
        // Não restauramos busca e categoria para não confundir o usuário
      }
    } catch (e) {
      console.error('Erro ao carregar filtros salvos:', e);
    }
  },

  /**
   * Salva filtros no localStorage
   */
  _salvarFiltros: function() {
    try {
      var filtros = {
        filtroTipo: INIT_EXTRATO.state.filtroTipo,
        ordenacao: INIT_EXTRATO.state.ordenacao
      };
      localStorage.setItem('extrato_filtros', JSON.stringify(filtros));
    } catch (e) {
      console.error('Erro ao salvar filtros:', e);
    }
  },

  /**
   * Configura atalhos de teclado
   */
  _bindKeyboardShortcuts: function() {
    var self = INIT_EXTRATO;
    document.addEventListener('keydown', function(e) {
      // Só ativa se estiver na aba extrato
      var extratoAba = document.getElementById('aba-extrato');
      if (!extratoAba || !extratoAba.classList.contains('ativo')) return;
      
      // Ignora se estiver em input
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

      switch(e.key.toLowerCase()) {
        case 'f':
          e.preventDefault();
          var buscaInputFocus = document.getElementById('extrato-busca');
          if (buscaInputFocus) buscaInputFocus.focus();
          break;
        case 'arrowleft':
          if (e.altKey) {
            e.preventDefault();
            self.navegarPeriodo(-1);
          }
          break;
        case 'arrowright':
          if (e.altKey) {
            e.preventDefault();
            self.navegarPeriodo(1);
          }
          break;
        case 'escape':
          // Limpar filtros
          self.state.filtroTipo = 'todos';
          self.state.filtroCat = null;
          self.state.filtroTag = null;
          self.state.busca = '';
          var buscaInputReset = document.getElementById('extrato-busca');
          if (buscaInputReset) buscaInputReset.value = '';
          self.setFiltroTipo('todos');
          break;
      }
    });
  },

  _bindBusca: function() {
    var self = INIT_EXTRATO;
    var el = document.getElementById('extrato-busca');
    if (el) {
      var debounceTimer = null;
      el.addEventListener('input', function() {
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(function() { self.filtrarExtrato(); }, 300);
      });
    }
  },

  /**
   * Configura listeners do extrato
   */
  setupExtratoListeners: function() {
    if (INIT_EXTRATO.listenerAttached) return;
    INIT_EXTRATO.listenerAttached = true;

    // Listener para checkbox de transação (não tem data-action)
    var self = INIT_EXTRATO;
    document.addEventListener('click', function(e) {
      var checkbox = e.target.closest('.tx-checkbox');
      if (checkbox) {
        var txId = checkbox.dataset.txId;
        if (txId) {
          self.toggleSelecao(txId, checkbox.checked);
        }
      }
    });

    // Listener para mudança no date picker
    var datePicker = document.getElementById('periodo-date-picker');
    if (datePicker) {
      datePicker.addEventListener('change', function(e) {
        var value = e.target.value;
        if (value) {
          var parts = value.split('-');
          var ano = parseInt(parts[0]);
          var mes = parseInt(parts[1]);
          
          var d = new Date();
          var mesAtual = d.getMonth() + 1;
          var anoAtual = d.getFullYear();
          
          self.state.mesOffset = (ano - anoAtual) * 12 + (mes - mesAtual);
          self.atualizarPeriodoLabel();
          self.filtrarExtrato();
          
          e.target.style.display = 'none';
        }
      });

      // Fechar date picker ao perder foco
      datePicker.addEventListener('blur', function() {
        setTimeout(function() {
          datePicker.style.display = 'none';
        }, 200);
      });
    }
  },

  /**
   * P0.1: delegação de clique na lista — ligada uma única vez no container
   * persistente (#lista-transacoes), evitando handlers acumulados a cada render.
   */
  _bindListaTransacoesClick: function() {
    if (INIT_EXTRATO.listaTransacoesListener) return;
    var container = document.getElementById('lista-transacoes');
    if (!container) return;
    INIT_EXTRATO.listaTransacoesListener = true;
    container.addEventListener('click', function(e) {
      var btnTag = e.target.closest('[data-tag-filter]');
      var btnEdit = e.target.closest('.btn-editar');
      var btnDel = e.target.closest('.btn-deletar');
      var btnAnexo = e.target.closest('.btn-anexo');
      var btnCarregarMais = e.target.closest('.btn-carregar-mais');
      var btnLimparFiltros = e.target.closest('#extrato-empty-limpar-filtros');
      var txItem = e.target.closest('.ext-tx') || e.target.closest('.extrato-item');

      if (btnTag) {
        e.stopPropagation();
        INIT_EXTRATO.filtrarPorTag(btnTag.dataset.tagFilter);
      } else if (btnLimparFiltros) {
        e.stopPropagation();
        INIT_EXTRATO.limparFiltros();
      } else if (btnAnexo) {
        // O stopPropagation impede a linha de abrir a edição, mas também impede
        // o clique de chegar ao ouvinte do INIT_ANEXOS no document: o
        // visualizador tem de ser aberto daqui.
        e.stopPropagation();
        INIT_EXTRATO._verAnexos(btnAnexo.dataset.transacaoId);
      } else if (btnEdit) {
        e.stopPropagation();
        INIT_EXTRATO.editarTransacao(btnEdit.dataset.id);
      } else if (btnDel) {
        e.stopPropagation();
        INIT_EXTRATO.deletarTransacao(btnDel.dataset.id);
      } else if (btnCarregarMais) {
        e.stopPropagation();
        INIT_EXTRATO._carregarMais(INIT_EXTRATO._listaTxsAtual);
      } else if (txItem && !btnEdit && !btnDel && !btnAnexo && !e.target.closest('.tx-checkbox')) {
        INIT_EXTRATO.editarTransacao(txItem.dataset.id);
      }
    });
    container.addEventListener('keydown', function(e) {
      var txItem = e.target.closest('.ext-tx');
      if (!txItem || e.target.closest('.tx-checkbox')) return;
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        INIT_EXTRATO.editarTransacao(txItem.dataset.id);
      }
    });
  },
});

export { INIT_EXTRATO };
export default INIT_EXTRATO;
