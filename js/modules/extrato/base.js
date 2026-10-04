/**
 * extrato/base.js — o objeto INIT_EXTRATO com o estado do Extrato.
 *
 * As partes (filtros, resumo, lista, ações) acrescentam os métodos a ele; o
 * init-extrato.js junta tudo. Ficar num módulo próprio é o que deixa as
 * partes importarem o objeto sem import circular com o init-extrato.js.
 */

import { UTILS } from '../../core/utils.js';

// Soma de dinheiro em centavos inteiros: somar t.valor em reais com += acumula
// deriva de ponto flutuante (0,10 + 0,20 = 0,30000000000000004), e o saldo do
// extrato — número que abre a tela — passava a divergir do resumo por centavos
// após alguns lançamentos. Usa UTILS.paraCentavos quando presente; o fallback
// mantém os testes (que stubam UTILS sem paraCentavos) funcionando.
export function _extratoCent(v) {
  if (typeof UTILS !== 'undefined' && UTILS.paraCentavos) return UTILS.paraCentavos(v);
  var n = Number(v);
  return isFinite(n) ? Math.round(n * 100) : 0;
}

export const INIT_EXTRATO = {
  /**
   * Estado do extrato
   */
  state: {
    filtroTipo: 'todos',
    filtroCat: null,
    filtroTag: null,
    busca: '',
    mesOffset: 0, // 0 = mês atual, -1 = mês anterior, etc
    ordenacao: 'data-desc', // 'data-desc', 'data-asc', 'valor-desc', 'valor-asc'
    buscaAvancada: {
      valorMin: null,
      valorMax: null,
      dataInicio: null,
      dataFim: null
    },
    selecionados: [], // IDs de transações selecionadas
    pendenteExclusao: {}, // IDs ocultos até efetivar ou desfazer
    virtualScroll: {
      pageSize: 50,
      maxRendered: 500,
      virtualThreshold: 100,
      windowSize: 60,
      estimatedItemHeight: 76,
      overscan: 8,
      currentPage: 0,
      totalItems: 0
    }
  },
  listenerAttached: false,
  filtrosCategoriasListener: false,
  listaTransacoesListener: false,
  _scrollMaisObserver: null,
  _virtualScrollBound: false,
  _virtualAtivo: false,
  _virtualLastStart: -1,
  /** Lista filtrada do render atual — usada pelo handler delegado (carregar mais). */
  _listaTxsAtual: null,
  _gruposOrdenadosAtual: null,
  _ultimoResumoAnunciado: null,
};
