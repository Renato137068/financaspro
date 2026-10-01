/**
 * extrato/filtros.js — filtros, busca avançada, período, ordenação, seleção em massa e o filtrarExtrato que junta tudo.
 *
 * Parte de INIT_EXTRATO (js/modules/init-extrato.js, que importa todas as
 * partes): cada uma acrescenta seus métodos ao mesmo objeto, criado em
 * extrato/base.js. Os métodos continuam se chamando por INIT_EXTRATO.x.
 */

import { INIT_EXTRATO } from './base.js';
import { CONFIG } from '../../core/config.js';
import { UTILS } from '../../core/utils.js';
import { TRANSACOES } from '../../transacoes.js';
import { RENDER } from '../../render.js';
import { INIT_MODALS } from '../init-modals.js';

Object.assign(INIT_EXTRATO, {

  /**
   * Filtra o extrato por uma tag. Clicar na tag já ativa desliga o filtro.
   */
  filtrarPorTag: function(tag) {
    var alvo = (typeof TRANSACOES !== 'undefined' && TRANSACOES.normalizarTags)
      ? TRANSACOES.normalizarTags(tag)[0]
      : String(tag == null ? '' : tag).trim().toLowerCase();
    INIT_EXTRATO.state.filtroTag = (INIT_EXTRATO.state.filtroTag === alvo) ? null : (alvo || null);
    INIT_EXTRATO.filtrarExtrato();
  },

  /**
   * Limpa todos os filtros aplicados
   */
  limparFiltros: function() {
    INIT_EXTRATO.state.filtroTipo = 'todos';
    INIT_EXTRATO.state.filtroCat = null;
    INIT_EXTRATO.state.filtroTag = null;
    INIT_EXTRATO.state.busca = '';
    INIT_EXTRATO.state.ordenacao = 'data-desc';
    INIT_EXTRATO.state.buscaAvancada = {
      valorMin: null,
      valorMax: null,
      dataInicio: null,
      dataFim: null
    };
    
    var buscaInput = document.getElementById('extrato-busca');
    if (buscaInput) buscaInput.value = '';
    
    // Limpar campos de busca avançada
    var valorMin = document.getElementById('valor-min');
    var valorMax = document.getElementById('valor-max');
    var dataInicio = document.getElementById('data-inicio');
    var dataFim = document.getElementById('data-fim');
    if (valorMin) valorMin.value = '';
    if (valorMax) valorMax.value = '';
    if (dataInicio) dataInicio.value = '';
    if (dataFim) dataFim.value = '';
    
    INIT_EXTRATO.setFiltroTipo('todos');
    INIT_EXTRATO.setOrdenacao('data-desc');
    INIT_EXTRATO.atualizarBadgeFiltrosAvancados();
    
    UTILS.mostrarToast('Filtros limpos', 'info');
  },

  /**
   * Abre/fecha painel de filtros avançados (categoria, ordenação, limpar).
   */
  toggleFiltrosAvancados: function() {
    var panel = document.getElementById('extrato-filtros-avancados');
    var btn = document.getElementById('btn-filtros-avancados');
    if (!panel || !btn) return;
    var aberto = panel.hasAttribute('hidden');
    if (aberto) {
      panel.removeAttribute('hidden');
      btn.setAttribute('aria-expanded', 'true');
    } else {
      panel.setAttribute('hidden', '');
      btn.setAttribute('aria-expanded', 'false');
    }
    if (typeof renderLucideIconsNow === 'function') renderLucideIconsNow(btn);
  },

  /**
   * Selinho no botão "Filtros" quando há categoria ou ordenação ≠ padrão.
   */
  atualizarBadgeFiltrosAvancados: function() {
    var badge = document.getElementById('filtro-avancados-count');
    var btn = document.getElementById('btn-filtros-avancados');
    if (!badge) return;
    var n = 0;
    if (INIT_EXTRATO.state.filtroCat) n += 1;
    if (INIT_EXTRATO.state.ordenacao && INIT_EXTRATO.state.ordenacao !== 'data-desc') n += 1;
    if (n > 0) {
      badge.textContent = String(n);
      badge.hidden = false;
      badge.removeAttribute('hidden');
      if (btn) btn.classList.add('tem-avancados');
    } else {
      badge.textContent = '0';
      badge.hidden = true;
      badge.setAttribute('hidden', '');
      if (btn) btn.classList.remove('tem-avancados');
    }
  },

  /**
   * Aplica filtros de busca avançada
   */
  aplicarBuscaAvancada: function() {
    var valorMin = document.getElementById('valor-min');
    var valorMax = document.getElementById('valor-max');
    var dataInicio = document.getElementById('data-inicio');
    var dataFim = document.getElementById('data-fim');
    
    // parseMoeda (BR-aware) em vez de parseFloat: aceita "1.500,00", "1500",
    // "1500,50" etc. Com type=number o campo rejeitava a vírgula do teclado BR.
    INIT_EXTRATO.state.buscaAvancada.valorMin = valorMin && valorMin.value.trim() ? UTILS.parseMoeda(valorMin.value) : null;
    INIT_EXTRATO.state.buscaAvancada.valorMax = valorMax && valorMax.value.trim() ? UTILS.parseMoeda(valorMax.value) : null;
    INIT_EXTRATO.state.buscaAvancada.dataInicio = dataInicio && dataInicio.value ? dataInicio.value : null;
    INIT_EXTRATO.state.buscaAvancada.dataFim = dataFim && dataFim.value ? dataFim.value : null;
    
    INIT_EXTRATO.filtrarExtrato();
    UTILS.mostrarToast('Filtros avançados aplicados', 'success');
    // Valor/período vive dentro de #extrato-filtros-avancados — não esconder o bloco
  },

  /**
   * Toggle seleção de transação
   */
  toggleSelecao: function(txId, checked) {
    if (checked) {
      if (INIT_EXTRATO.state.selecionados.indexOf(txId) === -1) {
        INIT_EXTRATO.state.selecionados.push(txId);
      }
    } else {
      var index = INIT_EXTRATO.state.selecionados.indexOf(txId);
      if (index > -1) {
        INIT_EXTRATO.state.selecionados.splice(index, 1);
      }
    }
    INIT_EXTRATO._atualizarBarraAcoesMassa();
  },

  /**
   * Atualiza barra de ações em massa
   */
  _atualizarBarraAcoesMassa: function() {
    var barra = document.getElementById('acoes-massa-bar');
    var count = document.getElementById('acoes-massa-count');
    
    if (INIT_EXTRATO.state.selecionados.length > 0) {
      if (barra) barra.style.display = 'flex';
      if (count) count.textContent = INIT_EXTRATO.state.selecionados.length + ' selecionada' + (INIT_EXTRATO.state.selecionados.length > 1 ? 's' : '');
    } else {
      if (barra) barra.style.display = 'none';
    }
  },

  /**
   * Cancela seleção de transações
   */
  cancelarSelecao: function() {
    INIT_EXTRATO.state.selecionados = [];
    INIT_EXTRATO._atualizarBarraAcoesMassa();
    
    // Desmarcar todos os checkboxes
    document.querySelectorAll('.tx-checkbox').forEach(function(cb) {
      cb.checked = false;
    });
  },

  /**
   * Deleta transações selecionadas
   */
  deletarSelecionados: function() {
    if (INIT_EXTRATO.state.selecionados.length === 0) return;

    var self = INIT_EXTRATO;
    var qtd = INIT_EXTRATO.state.selecionados.length;
    INIT_MODALS.confirm('Deseja realmente deletar ' + qtd + ' transação(ões)?', function() {
      var ids = self.state.selecionados.slice();
      self.state.selecionados = [];
      self._atualizarBarraAcoesMassa();

      ids.forEach(function(txId) {
        if (!TRANSACOES.obterPorId(txId)) return;
        self.state.pendenteExclusao[txId] = true;
        UTILS.agendarExclusao('tx-' + txId, function() {
          TRANSACOES.deletar(txId);
          delete self.state.pendenteExclusao[txId];
          RENDER.init();
        }, {
          mensagem: 'Excluído',
          duracaoMs: 5000,
          aoDesfazer: function() {
            delete self.state.pendenteExclusao[txId];
            self.filtrarExtrato();
            RENDER.init();
          }
        });
      });

      self.filtrarExtrato();
    });
  },

  /**
   * Obtém informação do mês/ano atual baseado no offset
   */
  getExtratoMesAno: function() {
    var d = new Date();
    d.setMonth(d.getMonth() + INIT_EXTRATO.state.mesOffset);
    return { mes: d.getMonth() + 1, ano: d.getFullYear(), date: d };
  },

  /**
   * Navega para período anterior/próximo
   */
  navegarPeriodo: function(dir) {
    INIT_EXTRATO.state.mesOffset += dir;
    INIT_EXTRATO.atualizarPeriodoLabel();
    INIT_EXTRATO.filtrarExtrato();
  },

  /**
   * Atualiza label do período no UI
   */
  atualizarPeriodoLabel: function() {
    var info = INIT_EXTRATO.getExtratoMesAno();
    var labelBtn = document.getElementById('periodo-label-btn');
    var datePicker = document.getElementById('periodo-date-picker');
    
    if (labelBtn) {
      var nomes = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];
      labelBtn.textContent = nomes[info.mes - 1] + ' ' + info.ano;
    }
    
    // Atualizar date picker
    if (datePicker) {
      var mesStr = String(info.mes).padStart(2, '0');
      datePicker.value = info.ano + '-' + mesStr;
    }
    
    // Esconder botão "próximo" se já no mês atual
    var btnNext = document.getElementById('periodo-next');
    if (btnNext) btnNext.style.visibility = INIT_EXTRATO.state.mesOffset >= 0 ? 'hidden' : 'visible';
  },

  /**
   * Define filtro por tipo
   */
  setFiltroTipo: function(tipo) {
    INIT_EXTRATO.state.filtroTipo = tipo;
    document.querySelectorAll('#aba-extrato .filtro-chip[data-filtro]').forEach(function(b) {
      var isActive = b.dataset.filtro === tipo;
      b.classList.toggle('ativo', isActive);
      b.setAttribute('aria-pressed', isActive ? 'true' : 'false');
    });
    INIT_EXTRATO._salvarFiltros();
    INIT_EXTRATO.filtrarExtrato();
  },

  /**
   * Define ordenação de transações
   */
  _parseOrdenacao: function(ord) {
    var m = (ord || 'data-desc').match(/^(data|valor)-(asc|desc)$/);
    return { campo: m ? m[1] : 'data', dir: m ? m[2] : 'desc' };
  },

  _comporOrdenacao: function(campo, dir) {
    return campo + '-' + dir;
  },

  _syncOrdenacaoUI: function() {
    var parsed = INIT_EXTRATO._parseOrdenacao(INIT_EXTRATO.state.ordenacao);
    document.querySelectorAll('.ordenacao-campo-btn').forEach(function(b) {
      var on = b.dataset.ordenacaoCampo === parsed.campo;
      b.classList.toggle('ativo', on);
      b.setAttribute('aria-pressed', on ? 'true' : 'false');
    });
    var dirBtn = document.querySelector('.ordenacao-dir-btn');
    if (dirBtn) {
      var desc = parsed.dir === 'desc';
      dirBtn.setAttribute('aria-label', desc ? 'Ordenação descendente' : 'Ordenação ascendente');
      dirBtn.setAttribute('aria-pressed', desc ? 'true' : 'false');
      dirBtn.title = desc ? 'Maior ou mais recente primeiro' : 'Menor ou mais antiga primeiro';
      var icon = dirBtn.querySelector('[data-lucide]');
      if (icon) {
        icon.setAttribute('data-lucide', desc ? 'arrow-down' : 'arrow-up');
        if (typeof renderLucideIcons === 'function') renderLucideIcons(dirBtn);
      }
    }
    var hint = document.getElementById('ordenacao-hint');
    if (hint) {
      var campoTxt = parsed.campo === 'valor' ? 'valor' : 'data';
      var dirTxt = parsed.campo === 'valor'
        ? (parsed.dir === 'desc' ? 'Maior valor primeiro' : 'Menor valor primeiro')
        : (parsed.dir === 'desc' ? 'Data mais recente primeiro' : 'Data mais antiga primeiro');
      hint.textContent = dirTxt + '. Toque em Data, Valor ou na seta para mudar a ordenação por ' + campoTxt + '.';
    }
  },

  setOrdenacaoCampo: function(campo) {
    var parsed = INIT_EXTRATO._parseOrdenacao(INIT_EXTRATO.state.ordenacao);
    INIT_EXTRATO.setOrdenacao(INIT_EXTRATO._comporOrdenacao(campo, parsed.dir));
  },

  toggleOrdenacaoDir: function() {
    var parsed = INIT_EXTRATO._parseOrdenacao(INIT_EXTRATO.state.ordenacao);
    var novaDir = parsed.dir === 'desc' ? 'asc' : 'desc';
    INIT_EXTRATO.setOrdenacao(INIT_EXTRATO._comporOrdenacao(parsed.campo, novaDir));
  },

  setOrdenacao: function(ordenacao) {
    INIT_EXTRATO.state.ordenacao = ordenacao;
    INIT_EXTRATO._syncOrdenacaoUI();
    INIT_EXTRATO._salvarFiltros();
    INIT_EXTRATO.atualizarBadgeFiltrosAvancados();
    INIT_EXTRATO.filtrarExtrato();
  },

  /**
   * Aplica ordenação nas transações
   */
  _aplicarOrdenacao: function(txs) {
    var ordem = INIT_EXTRATO.state.ordenacao;
    if (!ordem || ordem === 'data-desc') {
      // Ordenação padrão: data descendente (mais recente primeiro)
      return txs.sort(function(a, b) {
        return new Date(b.data + 'T00:00:00') - new Date(a.data + 'T00:00:00');
      });
    } else if (ordem === 'data-asc') {
      return txs.sort(function(a, b) {
        return new Date(a.data + 'T00:00:00') - new Date(b.data + 'T00:00:00');
      });
    } else if (ordem === 'valor-desc') {
      return txs.sort(function(a, b) { return b.valor - a.valor; });
    } else if (ordem === 'valor-asc') {
      return txs.sort(function(a, b) { return a.valor - b.valor; });
    }
    return txs;
  },

  /**
   * Define filtro por categoria
   */
  setFiltroCat: function(cat) {
    if (INIT_EXTRATO.state.filtroCat === cat) {
      INIT_EXTRATO.state.filtroCat = null;
    } else {
      INIT_EXTRATO.state.filtroCat = cat;
    }
    document.querySelectorAll('.filtro-cat-chip').forEach(function(b) {
      var isActive = b.dataset.cat === INIT_EXTRATO.state.filtroCat;
      b.classList.toggle('ativo', isActive);
      b.setAttribute('aria-pressed', isActive ? 'true' : 'false');
    }.bind(INIT_EXTRATO));
    INIT_EXTRATO.atualizarBadgeFiltrosAvancados();
    INIT_EXTRATO.filtrarExtrato();
  },

  /**
   * Renderiza filtros de categorias
   */
  renderFiltrosCategorias: function(txs) {
    var container = document.getElementById('filtros-categoria');
    if (!container) return;
    
    var cats = {};
    txs.forEach(function(t) { cats[t.categoria] = (cats[t.categoria] || 0) + 1; });
    var sorted = Object.keys(cats).sort(function(a, b) { return cats[b] - cats[a]; });
    
    container.innerHTML = sorted.map(function(cat) {
      var isActive = INIT_EXTRATO.state.filtroCat === cat;
      var ativo = isActive ? ' ativo' : '';
      var pressed = isActive ? 'true' : 'false';
      return '<button type="button" class="filtro-cat-chip' + ativo + '" data-cat="' + UTILS.escapeHtml(cat) + '" aria-pressed="' + pressed + '">' +
        INIT_EXTRATO.getCatIcon(cat) + ' ' + UTILS.escapeHtml(CONFIG.getCatLabel(cat)) + ' <span class="cat-count">' + cats[cat] + '</span></button>';
    }.bind(INIT_EXTRATO)).join('');

    if (typeof renderLucideIconsNow === 'function') renderLucideIconsNow(container);

    if (!INIT_EXTRATO.filtrosCategoriasListener) {
      INIT_EXTRATO.filtrosCategoriasListener = true;
      container.addEventListener('click', function(ev) {
        var btn = ev.target.closest('[data-cat]');
        if (!btn) return;
        INIT_EXTRATO.setFiltroCat(btn.dataset.cat);
      }.bind(INIT_EXTRATO));
    }
  },

  /**
   * Filtra e renderiza extrato completo com skeleton loading
   */
  filtrarExtrato: function() {
    var container = document.getElementById('lista-transacoes');
    if (container) {
      container.innerHTML = INIT_EXTRATO._renderSkeleton();
    }

    // Renderização imediata sem delay artificial
    var info = INIT_EXTRATO.getExtratoMesAno();
    var txs = TRANSACOES.obter({
      mes: info.mes,
      ano: info.ano,
      tipo: INIT_EXTRATO.state.filtroTipo === 'todos' ? null : INIT_EXTRATO.state.filtroTipo,
      categoria: INIT_EXTRATO.state.filtroCat,
      busca: document.getElementById('extrato-busca')?.value || ''
    });

    // Aplicar filtros avançados
    txs = INIT_EXTRATO._aplicarFiltrosAvancados(txs);

    if (INIT_EXTRATO.state.pendenteExclusao) {
      txs = txs.filter(function(t) { return !INIT_EXTRATO.state.pendenteExclusao[t.id]; });
    }

    // Aplicar ordenação
    txs = INIT_EXTRATO._aplicarOrdenacao(txs);

    INIT_EXTRATO.renderFiltrosCategorias(txs);
    INIT_EXTRATO.renderExtratoResumo(txs);
    INIT_EXTRATO.renderExtratoLista(txs);
  },

  /**
   * Aplica filtros avançados de valor e data
   */
  _aplicarFiltrosAvancados: function(txs) {
    var filtros = INIT_EXTRATO.state.buscaAvancada;

    if (INIT_EXTRATO.state.filtroTag) {
      var alvoTag = INIT_EXTRATO.state.filtroTag;
      txs = txs.filter(function(t) {
        return Array.isArray(t.tags) && t.tags.indexOf(alvoTag) !== -1;
      });
    }

    return txs.filter(function(t) {
      // Filtro por valor mínimo
      if (filtros.valorMin !== null && t.valor < filtros.valorMin) {
        return false;
      }
      
      // Filtro por valor máximo
      if (filtros.valorMax !== null && t.valor > filtros.valorMax) {
        return false;
      }
      
      // Filtro por data início
      if (filtros.dataInicio) {
        var dataTxInicio = new Date(t.data + 'T00:00:00');
        var dataInicio = new Date(filtros.dataInicio + 'T00:00:00');
        if (dataTxInicio < dataInicio) {
          return false;
        }
      }
      
      // Filtro por data fim
      if (filtros.dataFim) {
        var dataTxFim = new Date(t.data + 'T00:00:00');
        var dataFim = new Date(filtros.dataFim + 'T00:00:00');
        if (dataTxFim > dataFim) {
          return false;
        }
      }
      
      return true;
    });
  },
});
