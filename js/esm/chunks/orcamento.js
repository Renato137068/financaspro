/**
 * chunks/orcamento.js — chunk sob demanda 'orcamento' (ADR 0005).
 *
 * A tela de Orçamento, ao abrir a aba ou uma sub-aba (o cálculo, ORCAMENTO,
 * é do boot: o painel usa). LAZY.load o importa com import() dinâmico. A tela
 * gerada vem primeiro; as funções de topo vão para window porque a navegação
 * e o event-bus as chamam pelo nome.
 */
import '../../telas/orcamento.js';
import {
  INIT_ORCAMENTO, salvarRendaOrcamento, editarRendaOrcamento, editarRegra503020,
  toggleDetalhesCategorias, renderOrcamentoDashboard, mudarSubAbaOrcamento,
  classificarCategoriaOrcamento,
} from '../../modules/init-orcamento.js';

window.INIT_ORCAMENTO = INIT_ORCAMENTO;
window.salvarRendaOrcamento = salvarRendaOrcamento;
window.editarRendaOrcamento = editarRendaOrcamento;
window.editarRegra503020 = editarRegra503020;
window.toggleDetalhesCategorias = toggleDetalhesCategorias;
window.renderOrcamentoDashboard = renderOrcamentoDashboard;
window.mudarSubAbaOrcamento = mudarSubAbaOrcamento;
window.classificarCategoriaOrcamento = classificarCategoriaOrcamento;
