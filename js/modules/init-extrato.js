/**
 * init-extrato.js - Sistema de extrato e filtros
 * Extraído do init.js para modularização
 * Responsabilidades: estado do extrato, filtros, renderização
 */

const INIT_EXTRATO = {
  /**
   * Estado do extrato
   */
  state: {
    filtroTipo: 'todos',
    filtroCat: null,
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
    virtualScroll: {
      pageSize: 50,
      currentPage: 0,
      totalItems: 0
    }
  },
  listenerAttached: false,
  filtrosCategoriasListener: false,

  /**
   * Inicializa sistema de extrato
   */
  init: function() {
    this._carregarFiltrosSalvos();
    this.setupExtratoListeners();
    this.atualizarPeriodoLabel();
    this._bindBusca();
    this._bindKeyboardShortcuts();
  },

  /**
   * Carrega filtros salvos do localStorage
   */
  _carregarFiltrosSalvos: function() {
    try {
      var filtrosSalvos = localStorage.getItem('extrato_filtros');
      if (filtrosSalvos) {
        var filtros = JSON.parse(filtrosSalvos);
        this.state.filtroTipo = filtros.filtroTipo || 'todos';
        this.state.ordenacao = filtros.ordenacao || 'data-desc';
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
        filtroTipo: this.state.filtroTipo,
        ordenacao: this.state.ordenacao
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
    var self = this;
    document.addEventListener('keydown', function(e) {
      // Só ativa se estiver na aba extrato
      var extratoAba = document.getElementById('aba-extrato');
      if (!extratoAba || !extratoAba.classList.contains('ativo')) return;
      
      // Ignora se estiver em input
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

      switch(e.key.toLowerCase()) {
        case 'f':
          e.preventDefault();
          var buscaInput = document.getElementById('extrato-busca');
          if (buscaInput) buscaInput.focus();
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
          self.state.busca = '';
          var buscaInput = document.getElementById('extrato-busca');
          if (buscaInput) buscaInput.value = '';
          self.setFiltroTipo('todos');
          break;
      }
    });
  },

  _bindBusca: function() {
    var self = this;
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
    if (this.listenerAttached) return;
    this.listenerAttached = true;

    // Listener para checkbox de transação (não tem data-action)
    var self = this;
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
   * Limpa todos os filtros aplicados
   */
  limparFiltros: function() {
    this.state.filtroTipo = 'todos';
    this.state.filtroCat = null;
    this.state.busca = '';
    this.state.ordenacao = 'data-desc';
    this.state.buscaAvancada = {
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
    
    this.setFiltroTipo('todos');
    this.setOrdenacao('data-desc');
    
    UTILS.mostrarToast('Filtros limpos', 'info');
  },

  /**
   * Aplica filtros de busca avançada
   */
  aplicarBuscaAvancada: function() {
    var valorMin = document.getElementById('valor-min');
    var valorMax = document.getElementById('valor-max');
    var dataInicio = document.getElementById('data-inicio');
    var dataFim = document.getElementById('data-fim');
    
    this.state.buscaAvancada.valorMin = valorMin && valorMin.value ? parseFloat(valorMin.value) : null;
    this.state.buscaAvancada.valorMax = valorMax && valorMax.value ? parseFloat(valorMax.value) : null;
    this.state.buscaAvancada.dataInicio = dataInicio && dataInicio.value ? dataInicio.value : null;
    this.state.buscaAvancada.dataFim = dataFim && dataFim.value ? dataFim.value : null;
    
    this.filtrarExtrato();
    UTILS.mostrarToast('Filtros avançados aplicados', 'success');
    
    // Fechar painel
    var container = document.getElementById('busca-avancada-container');
    if (container) container.style.display = 'none';
  },

  /**
   * Toggle seleção de transação
   */
  toggleSelecao: function(txId, checked) {
    if (checked) {
      if (this.state.selecionados.indexOf(txId) === -1) {
        this.state.selecionados.push(txId);
      }
    } else {
      var index = this.state.selecionados.indexOf(txId);
      if (index > -1) {
        this.state.selecionados.splice(index, 1);
      }
    }
    this._atualizarBarraAcoesMassa();
  },

  /**
   * Atualiza barra de ações em massa
   */
  _atualizarBarraAcoesMassa: function() {
    var barra = document.getElementById('acoes-massa-bar');
    var count = document.getElementById('acoes-massa-count');
    
    if (this.state.selecionados.length > 0) {
      if (barra) barra.style.display = 'flex';
      if (count) count.textContent = this.state.selecionados.length + ' selecionada' + (this.state.selecionados.length > 1 ? 's' : '');
    } else {
      if (barra) barra.style.display = 'none';
    }
  },

  /**
   * Cancela seleção de transações
   */
  cancelarSelecao: function() {
    this.state.selecionados = [];
    this._atualizarBarraAcoesMassa();
    
    // Desmarcar todos os checkboxes
    document.querySelectorAll('.tx-checkbox').forEach(function(cb) {
      cb.checked = false;
    });
  },

  /**
   * Deleta transações selecionadas
   */
  deletarSelecionados: function() {
    if (this.state.selecionados.length === 0) return;
    
    if (!confirm('Deseja realmente deletar ' + this.state.selecionados.length + ' transação(ões)?')) {
      return;
    }
    
    var self = this;
    var deletadas = 0;
    
    this.state.selecionados.forEach(function(txId) {
      var tx = TRANSACOES.obterPorId(txId);
      if (tx) {
        TRANSACOES.deletar(txId);
        deletadas++;
      }
    });
    
    this.state.selecionados = [];
    this._atualizarBarraAcoesMassa();
    this.filtrarExtrato();
    
    UTILS.mostrarToast(deletadas + ' transação(ões) deletada(s)', 'success');
  },

  /**
   * Obtém informação do mês/ano atual baseado no offset
   */
  getExtratoMesAno: function() {
    var d = new Date();
    d.setMonth(d.getMonth() + this.state.mesOffset);
    return { mes: d.getMonth() + 1, ano: d.getFullYear(), date: d };
  },

  /**
   * Navega para período anterior/próximo
   */
  navegarPeriodo: function(dir) {
    this.state.mesOffset += dir;
    this.atualizarPeriodoLabel();
    this.filtrarExtrato();
  },

  /**
   * Atualiza label do período no UI
   */
  atualizarPeriodoLabel: function() {
    var info = this.getExtratoMesAno();
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
    if (btnNext) btnNext.style.visibility = this.state.mesOffset >= 0 ? 'hidden' : 'visible';
  },

  /**
   * Define filtro por tipo
   */
  setFiltroTipo: function(tipo) {
    this.state.filtroTipo = tipo;
    document.querySelectorAll('.filtro-chip-premium').forEach(function(b) { b.classList.remove('ativo'); });
    var btn = document.querySelector('.filtro-chip-premium[data-filtro="' + tipo + '"]');
    if (btn) btn.classList.add('ativo');
    this._salvarFiltros();
    this.filtrarExtrato();
  },

  /**
   * Define ordenação de transações
   */
  setOrdenacao: function(ordenacao) {
    this.state.ordenacao = ordenacao;
    document.querySelectorAll('.ordenacao-btn').forEach(function(b) { b.classList.remove('ativo'); });
    var btn = document.querySelector('.ordenacao-btn[data-ordenacao="' + ordenacao + '"]');
    if (btn) btn.classList.add('ativo');
    this._salvarFiltros();
    this.filtrarExtrato();
  },

  /**
   * Aplica ordenação nas transações
   */
  _aplicarOrdenacao: function(txs) {
    var ordem = this.state.ordenacao;
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
    if (this.state.filtroCat === cat) {
      this.state.filtroCat = null;
    } else {
      this.state.filtroCat = cat;
    }
    document.querySelectorAll('.filtro-cat-chip').forEach(function(b) {
      b.classList.toggle('ativo', b.dataset.cat === this.state.filtroCat);
    }.bind(this));
    this.filtrarExtrato();
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
      var ativo = this.state.filtroCat === cat ? ' ativo' : '';
      return '<button class="filtro-cat-chip' + ativo + '" data-cat="' + UTILS.escapeHtml(cat) + '">' +
        INIT_EXTRATO.getCatIcon(cat) + ' ' + UTILS.escapeHtml(cat) + ' <span class="cat-count">' + cats[cat] + '</span></button>';
    }.bind(this)).join('');

    if (!this.filtrosCategoriasListener) {
      this.filtrosCategoriasListener = true;
      container.addEventListener('click', function(ev) {
        var btn = ev.target.closest('[data-cat]');
        if (!btn) return;
        this.setFiltroCat(btn.dataset.cat);
      }.bind(this));
    }
  },

  /**
   * Renderiza resumo do extrato premium
   */
  renderExtratoResumo: function(txs) {
    var rec = 0, desp = 0;
    txs.forEach(function(t) {
      if (t.tipo === CONFIG.TIPO_RECEITA) rec += t.valor;
      else desp += t.valor;
    });
    var saldo = rec - desp;

    // Atualizar card principal de saldo
    var saldoEl = document.getElementById('saldo-valor');
    if (saldoEl) saldoEl.textContent = UTILS.formatarMoeda(saldo);

    // Calcular tendência vs mês anterior
    var info = this.getExtratoMesAno();
    var mesAnterior = new Date(info.date);
    mesAnterior.setMonth(mesAnterior.getMonth() - 1);
    var txsAnterior = TRANSACOES.obter({
      mes: mesAnterior.getMonth() + 1,
      ano: mesAnterior.getFullYear()
    });
    var saldoAnterior = 0;
    txsAnterior.forEach(function(t) {
      if (t.tipo === CONFIG.TIPO_RECEITA) saldoAnterior += t.valor;
      else saldoAnterior -= t.valor;
    });

    var trendValue = 0;
    var trendIcon = '📈';
    if (saldoAnterior !== 0) {
      trendValue = ((saldo - saldoAnterior) / Math.abs(saldoAnterior)) * 100;
      trendIcon = trendValue >= 0 ? '📈' : '📉';
    }

    var trendEl = document.getElementById('trend-value');
    var trendIconEl = document.getElementById('trend-icon');
    if (trendEl) trendEl.textContent = (trendValue >= 0 ? '+' : '') + trendValue.toFixed(1) + '%';
    if (trendIconEl) trendIconEl.textContent = trendIcon;

    // Atualizar período
    var periodEl = document.getElementById('saldo-period');
    if (periodEl) {
      var ultimoDia = new Date(info.ano, info.mes, 0).getDate();
      var nomes = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];
      periodEl.textContent = '1 a ' + ultimoDia + ' de ' + nomes[info.mes - 1];
    }

    // Atualizar KPIs
    var kpiEntradas = document.getElementById('kpi-entradas');
    var kpiSaidas = document.getElementById('kpi-saidas');
    var kpiMovimentacoes = document.getElementById('kpi-movimentacoes');
    if (kpiEntradas) kpiEntradas.textContent = UTILS.formatarMoeda(rec);
    if (kpiSaidas) kpiSaidas.textContent = UTILS.formatarMoeda(desp);
    if (kpiMovimentacoes) kpiMovimentacoes.textContent = txs.length;
  },

  /**
   * Renderiza lista de transações do extrato com agrupamento temporal premium
   */
  renderExtratoLista: function(txs) {
    var container = document.getElementById('lista-transacoes');
    if (!container) return;
    
    if (txs.length === 0) {
      container.innerHTML = this._renderEmptyState();
      return;
    }

    // Agrupar transações por período temporal
    var grupos = this._agruparTransacoesPorPeriodo(txs);
    
    // Reset paginação quando mudam os filtros
    this.state.virtualScroll.totalItems = txs.length;
    this.state.virtualScroll.currentPage = 0;

    // Renderizar grupos
    this._renderGrupos(grupos, txs);
  },

  /**
   * Agrupa transações por período temporal (HOJE, ONTEM, ESTA SEMANA, MÊS)
   */
  _agruparTransacoesPorPeriodo: function(txs) {
    var grupos = {};
    var hoje = new Date();
    hoje.setHours(0, 0, 0, 0);
    var ontem = new Date(hoje);
    ontem.setDate(ontem.getDate() - 1);
    var inicioSemana = new Date(hoje);
    inicioSemana.setDate(hoje.getDate() - hoje.getDay());
    var inicioMes = new Date(hoje.getFullYear(), hoje.getMonth(), 1);

    txs.forEach(function(t) {
      var dataTx = new Date(t.data + 'T00:00:00');
      dataTx.setHours(0, 0, 0, 0);
      var grupo = '';

      if (dataTx.getTime() === hoje.getTime()) {
        grupo = 'HOJE';
      } else if (dataTx.getTime() === ontem.getTime()) {
        grupo = 'ONTEM';
      } else if (dataTx >= inicioSemana && dataTx < hoje) {
        grupo = 'ESTA SEMANA';
      } else {
        var nomes = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];
        grupo = nomes[dataTx.getMonth()].toUpperCase() + ' ' + dataTx.getFullYear();
      }

      if (!grupos[grupo]) grupos[grupo] = [];
      grupos[grupo].push(t);
    });

    return grupos;
  },

  /**
   * Renderiza grupos de transações com saldo progressivo
   */
  _renderGrupos: function(grupos, txs) {
    var container = document.getElementById('lista-transacoes');
    if (!container) return;

    var ordemGrupos = ['HOJE', 'ONTEM', 'ESTA SEMANA'];
    var gruposOrdenados = {};

    // Adicionar grupos fixos na ordem correta
    ordemGrupos.forEach(function(g) {
      if (grupos[g]) gruposOrdenados[g] = grupos[g];
    });

    // Adicionar grupos restantes ordenados por data (mais recente primeiro)
    var gruposRestantes = Object.keys(grupos).filter(function(g) {
      return ordemGrupos.indexOf(g) === -1;
    }).sort(function(a, b) {
      return new Date(b) - new Date(a);
    });

    gruposRestantes.forEach(function(g) {
      gruposOrdenados[g] = grupos[g];
    });

    var html = '';
    var grupoKeys = Object.keys(gruposOrdenados);
    var itensRenderizados = 0;
    var pageSize = this.state.virtualScroll.pageSize;
    
    // Calcular saldo inicial (total de transações antes do período atual)
    var saldoAcumulado = 0;
    var info = this.getExtratoMesAno();
    var todasTxs = TRANSACOES.obter({});
    todasTxs.forEach(function(t) {
      var dataTx = new Date(t.data + 'T00:00:00');
      if (dataTx < new Date(info.ano, info.mes - 1, 1)) {
        saldoAcumulado += t.tipo === CONFIG.TIPO_RECEITA ? t.valor : -t.valor;
      }
    });

    for (var i = 0; i < grupoKeys.length; i++) {
      var grupo = grupoKeys[i];
      var grupoTxs = gruposOrdenados[grupo];

      // Calcular subtotal do grupo
      var subtotal = 0;
      grupoTxs.forEach(function(t) {
        subtotal += t.tipo === CONFIG.TIPO_RECEITA ? t.valor : -t.valor;
      });

      html += '<div class="ext-grupo">';
      html += '<div class="ext-grupo-header">';
      html += '<span class="ext-grupo-data">' + grupo + '</span>';
      html += '<span class="ext-grupo-subtotal ' + (subtotal >= 0 ? 'positivo' : 'negativo') + '">' +
        (subtotal >= 0 ? '+' : '') + UTILS.formatarMoeda(subtotal) + '</span>';
      html += '</div>';
      html += '<div class="ext-grupo-list">';

      // Renderizar itens do grupo (respeitando paginação)
      var itensParaRenderizar = grupoTxs.slice(0, pageSize - itensRenderizados);
      itensParaRenderizar.forEach(function(t) {
        saldoAcumulado += t.tipo === CONFIG.TIPO_RECEITA ? t.valor : -t.valor;
        html += this._renderTransacaoItem(t, saldoAcumulado);
        itensRenderizados++;
      }.bind(this));

      html += '</div>';
      html += '</div>';

      // Parar se atingiu o limite da página
      if (itensRenderizados >= pageSize) break;
    }

    // Adicionar botão "carregar mais" se houver mais itens
    if (itensRenderizados < txs.length) {
      html += '<button class="btn-carregar-mais" id="btn-carregar-mais">Carregar mais (' + (txs.length - itensRenderizados) + ')</button>';
    }

    container.innerHTML = html;

    // Adicionar listeners de ações para grupos premium
    container.addEventListener('click', function(e) {
      var btnEdit = e.target.closest('.btn-editar') || e.target.closest('.btn-editar-premium');
      var btnDel = e.target.closest('.btn-deletar') || e.target.closest('.btn-deletar-premium');
      var btnCarregarMais = e.target.closest('.btn-carregar-mais');
      var txItem = e.target.closest('.ext-tx') || e.target.closest('.extrato-item-premium') || e.target.closest('.extrato-item');
      
      if (btnEdit) {
        e.stopPropagation();
        var id = btnEdit.dataset.id;
        INIT_EXTRATO.editarTransacao(id);
      } else if (btnDel) {
        e.stopPropagation();
        var id = btnDel.dataset.id;
        INIT_EXTRATO.deletarTransacao(id);
      } else if (btnCarregarMais) {
        e.stopPropagation();
        INIT_EXTRATO._carregarMais(txs);
      } else if (txItem && !btnEdit && !btnDel) {
        var id = txItem.dataset.id;
        INIT_EXTRATO.editarTransacao(id);
      }
    });
  },

  /**
   * Renderiza item individual de transação com design premium
   */
  _renderTransacaoItem: function(t, saldoAcumulado) {
    var data = new Date(t.data + 'T00:00:00');
    var dataStr = data.toLocaleDateString('pt-BR');
    var catIcon = INIT_EXTRATO.getCatIcon(t.categoria);
    var catCor = INIT_EXTRATO.getCatCor(t.categoria);
    var isChecked = this.state.selecionados.indexOf(String(t.id)) > -1 ? 'checked' : '';
    
    return '<button class="ext-tx" data-id="' + UTILS.escapeHtml(String(t.id)) + '" aria-label="Transação: ' + UTILS.escapeHtml(t.descricao || t.categoria) + '">' +
      '<input type="checkbox" class="tx-checkbox" data-tx-id="' + UTILS.escapeHtml(String(t.id)) + '" ' + isChecked + ' aria-label="Selecionar transação">' +
      '<div class="ext-tx-icon" style="background: ' + catCor + '20; color: ' + catCor + '">' + catIcon + '</div>' +
      '<div class="ext-tx-info">' +
        '<div class="ext-tx-desc">' + UTILS.escapeHtml(t.descricao || t.categoria) + '</div>' +
        '<div class="ext-tx-meta">' +
          '<span class="ext-tx-meta-tag">' + UTILS.escapeHtml(t.categoria) + '</span>' +
          '<span>' + dataStr + '</span>' +
        '</div>' +
      '</div>' +
      '<div class="ext-tx-valor ' + UTILS.escapeHtml(t.tipo) + '">' +
        (t.tipo === CONFIG.TIPO_RECEITA ? '+' : '-') + UTILS.formatarMoeda(t.valor) +
      '</div>' +
    '</button>';
  },

  /**
   * Renderiza estado vazio premium
   */
  _renderEmptyState: function() {
    return '<div class="empty-state">' +
      '<div class="empty-state-icon">📋</div>' +
      '<div class="empty-state-title">Nenhuma movimentação encontrada</div>' +
      '<div class="empty-state-message">Tente ajustar os filtros ou selecionar outro intervalo de período.</div>' +
    '</div>';
  },

  /**
   * Renderiza uma página específica de transações
   */
  _renderPage: function(txs, pageNumber) {
    var container = document.getElementById('lista-transacoes');
    if (!container) return;

    var pageSize = this.state.virtualScroll.pageSize;
    var startIndex = pageNumber * pageSize;
    var endIndex = Math.min(startIndex + pageSize, txs.length);
    var pageItems = txs.slice(startIndex, endIndex);

    var html = '';
    pageItems.forEach(function(t) {
      var data = new Date(t.data + 'T00:00:00');
      var dataStr = data.toLocaleDateString('pt-BR');
      var catIcon = INIT_EXTRATO.getCatIcon(t.categoria);
      var catCor = INIT_EXTRATO.getCatCor(t.categoria);
      
      html += '<button class="extrato-item ' + UTILS.escapeHtml(t.tipo) + '" data-id="' + UTILS.escapeHtml(String(t.id)) + '" aria-label="Transação: ' + UTILS.escapeHtml(t.descricao || t.categoria) + '">' +
        '<div class="extrato-data">' + dataStr + '</div>' +
        '<div class="extrato-desc">' +
          '<div class="extrato-categoria" style="color:' + catCor + '" aria-hidden="true">' + catIcon + ' ' + UTILS.escapeHtml(t.categoria) + '</div>' +
          '<div class="extrato-nome">' + UTILS.escapeHtml(t.descricao || '') + '</div>' +
        '</div>' +
        '<div class="extrato-valor ' + UTILS.escapeHtml(t.tipo) + '">' +
          (t.tipo === CONFIG.TIPO_RECEITA ? '+' : '-') + UTILS.formatarMoeda(t.valor) +
        '</div>' +
        '<div class="extrato-actions">' +
          '<button class="btn-editar" data-id="' + UTILS.escapeHtml(String(t.id)) + '" title="Editar transação" aria-label="Editar transação">✏️</button>' +
          '<button class="btn-deletar" data-id="' + UTILS.escapeHtml(String(t.id)) + '" title="Deletar transação" aria-label="Deletar transação">🗑️</button>' +
        '</div>' +
      '</button>';
    });

    // Adicionar botão "carregar mais" se houver mais itens
    if (endIndex < txs.length) {
      html += '<button class="btn-carregar-mais" id="btn-carregar-mais">Carregar mais (' + (txs.length - endIndex) + ')</button>';
    }

    container.innerHTML = html;

    // Adicionar listeners de ações
    container.addEventListener('click', function(e) {
      var btnEdit = e.target.closest('.btn-editar');
      var btnDel = e.target.closest('.btn-deletar');
      var btnCarregarMais = e.target.closest('.btn-carregar-mais');
      var txItem = e.target.closest('.ext-tx') || e.target.closest('.extrato-item');
      
      if (btnEdit) {
        e.stopPropagation();
        var id = btnEdit.dataset.id;
        INIT_EXTRATO.editarTransacao(id);
      } else if (btnDel) {
        e.stopPropagation();
        var id = btnDel.dataset.id;
        INIT_EXTRATO.deletarTransacao(id);
      } else if (btnCarregarMais) {
        e.stopPropagation();
        INIT_EXTRATO._carregarMais(txs);
      } else if (txItem && !btnEdit && !btnDel) {
        var id = txItem.dataset.id;
        INIT_EXTRATO.editarTransacao(id);
      }
    });
  },

  /**
   * Carrega mais itens na lista (virtual scrolling)
   */
  _carregarMais: function(txs) {
    this.state.virtualScroll.currentPage++;
    var container = document.getElementById('lista-transacoes');
    if (!container) return;

    // Remover botão "carregar mais"
    var btnCarregarMais = document.getElementById('btn-carregar-mais');
    if (btnCarregarMais) btnCarregarMais.remove();

    // Renderizar próxima página e adicionar ao container
    var pageSize = this.state.virtualScroll.pageSize;
    var startIndex = this.state.virtualScroll.currentPage * pageSize;
    var endIndex = Math.min(startIndex + pageSize, txs.length);
    var pageItems = txs.slice(startIndex, endIndex);

    var html = '';
    pageItems.forEach(function(t) {
      var data = new Date(t.data + 'T00:00:00');
      var dataStr = data.toLocaleDateString('pt-BR');
      var catIcon = INIT_EXTRATO.getCatIcon(t.categoria);
      var catCor = INIT_EXTRATO.getCatCor(t.categoria);
      
      html += '<button class="extrato-item ' + UTILS.escapeHtml(t.tipo) + '" data-id="' + UTILS.escapeHtml(String(t.id)) + '" aria-label="Transação: ' + UTILS.escapeHtml(t.descricao || t.categoria) + '">' +
        '<div class="extrato-data">' + dataStr + '</div>' +
        '<div class="extrato-desc">' +
          '<div class="extrato-categoria" style="color:' + catCor + '" aria-hidden="true">' + catIcon + ' ' + UTILS.escapeHtml(t.categoria) + '</div>' +
          '<div class="extrato-nome">' + UTILS.escapeHtml(t.descricao || '') + '</div>' +
        '</div>' +
        '<div class="extrato-valor ' + UTILS.escapeHtml(t.tipo) + '">' +
          (t.tipo === CONFIG.TIPO_RECEITA ? '+' : '-') + UTILS.formatarMoeda(t.valor) +
        '</div>' +
        '<div class="extrato-actions">' +
          '<button class="btn-editar" data-id="' + UTILS.escapeHtml(String(t.id)) + '" title="Editar transação" aria-label="Editar transação">✏️</button>' +
          '<button class="btn-deletar" data-id="' + UTILS.escapeHtml(String(t.id)) + '" title="Deletar transação" aria-label="Deletar transação">🗑️</button>' +
        '</div>' +
      '</button>';
    });

    // Adicionar botão "carregar mais" se houver mais itens
    if (endIndex < txs.length) {
      html += '<button class="btn-carregar-mais" id="btn-carregar-mais">Carregar mais (' + (txs.length - endIndex) + ')</button>';
    }

    container.insertAdjacentHTML('beforeend', html);
  },

  /**
   * Filtra e renderiza extrato completo com skeleton loading
   */
  filtrarExtrato: function() {
    var container = document.getElementById('lista-transacoes');
    if (container) {
      container.innerHTML = this._renderSkeleton();
    }

    // Renderização imediata sem delay artificial
    var info = this.getExtratoMesAno();
    var txs = TRANSACOES.obter({
      mes: info.mes,
      ano: info.ano,
      tipo: this.state.filtroTipo === 'todos' ? null : this.state.filtroTipo,
      categoria: this.state.filtroCat,
      busca: document.getElementById('extrato-busca')?.value || ''
    });

    // Aplicar filtros avançados
    txs = this._aplicarFiltrosAvancados(txs);

    // Aplicar ordenação
    txs = this._aplicarOrdenacao(txs);

    this.renderFiltrosCategorias(txs);
    this.renderExtratoResumo(txs);
    this.renderExtratoLista(txs);
  },

  /**
   * Aplica filtros avançados de valor e data
   */
  _aplicarFiltrosAvancados: function(txs) {
    var filtros = this.state.buscaAvancada;
    
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
        var dataTx = new Date(t.data + 'T00:00:00');
        var dataInicio = new Date(filtros.dataInicio + 'T00:00:00');
        if (dataTx < dataInicio) {
          return false;
        }
      }
      
      // Filtro por data fim
      if (filtros.dataFim) {
        var dataTx = new Date(t.data + 'T00:00:00');
        var dataFim = new Date(filtros.dataFim + 'T00:00:00');
        if (dataTx > dataFim) {
          return false;
        }
      }
      
      return true;
    });
  },

  /**
   * Renderiza skeleton loading
   */
  _renderSkeleton: function() {
    var skeleton = '<div class="skeleton-loading">';
    for (var i = 0; i < 5; i++) {
      skeleton += '<div class="skeleton-item">' +
        '<div class="skeleton-icon"></div>' +
        '<div class="skeleton-content">' +
          '<div class="skeleton-header">' +
            '<div class="skeleton-line skeleton-category"></div>' +
            '<div class="skeleton-line skeleton-date"></div>' +
          '</div>' +
          '<div class="skeleton-line skeleton-description"></div>' +
          '<div class="skeleton-line skeleton-meta"></div>' +
        '</div>' +
        '<div class="skeleton-valor"></div>' +
      '</div>';
    }
    skeleton += '</div>';
    return skeleton;
  },

  /**
   * Edita transação
   */
  editarTransacao: function(id) {
    var tx = TRANSACOES.obterPorId(id);
    if (!tx) return;

    // Preencher formulário com dados da transação
    document.getElementById('novo-valor').value = UTILS.formatarMoeda(tx.valor);
    document.getElementById('novo-descricao').value = tx.descricao || '';
    document.getElementById('novo-categoria').value = tx.categoria;
    document.getElementById('novo-tipo').value = tx.tipo;
    document.getElementById('novo-data').value = tx.data;

    // Atualizar UI
    INIT_FORM.atualizarTipoIndicator(tx.tipo);
    INIT_FORM.renderCategoriasBtns(tx.tipo);
    INIT_FORM.atualizarOrcamentoPreview();

    // Navegar para aba de edição
    mudarAba('novo');

    // Marcar como edição
    document.getElementById('form-transacao').dataset.editId = id;
    
    // Mudar texto do botão
    var btnReg = document.querySelector('.btn-registrar');
    if (btnReg) btnReg.textContent = 'Atualizar';

    UTILS.mostrarToast('Edite a transação e clique em Atualizar', 'info');
  },

  /**
   * Deleta transação
   */
  deletarTransacao: function(id) {
    INIT_MODALS.confirm('Tem certeza que deseja deletar esta transação?', function() {
      TRANSACOES.deletar(id);
      INIT_EXTRATO.filtrarExtrato();
      RENDER.init();
      UTILS.mostrarToast('Transação deletada', 'success');
    });
  },

  /**
   * Exporta extrato para Excel (CSV melhorado)
   */
  exportarExcel: function() {
    var info = this.getExtratoMesAno();
    var txs = TRANSACOES.obter({ mes: info.mes, ano: info.ano });
    
    if (txs.length === 0) {
      UTILS.mostrarToast('Nenhuma transação para exportar', 'warning');
      return;
    }

    // Calcular totais
    var receitas = 0, despesas = 0;
    txs.forEach(function(t) {
      if (t.tipo === CONFIG.TIPO_RECEITA) receitas += t.valor;
      else despesas += t.valor;
    });
    var saldo = receitas - despesas;

    var nomes = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];
    var mesNome = nomes[info.mes - 1];

    // CSV com BOM para Excel reconhecer UTF-8
    var csv = '\uFEFF'; // BOM
    
    // Header informativo
    csv += 'Extrato FinançasPro\n';
    csv += 'Período: ' + mesNome + ' de ' + info.ano + '\n';
    csv += 'Gerado em: ' + new Date().toLocaleDateString('pt-BR') + ' às ' + new Date().toLocaleTimeString('pt-BR') + '\n';
    csv += '\n';
    
    // Resumo
    csv += 'RESUMO FINANCEIRO\n';
    csv += 'Receitas Total,' + UTILS.formatarMoeda(receitas).replace('R$ ', '') + '\n';
    csv += 'Despesas Total,' + UTILS.formatarMoeda(despesas).replace('R$ ', '') + '\n';
    csv += 'Saldo do Período,' + UTILS.formatarMoeda(saldo).replace('R$ ', '') + '\n';
    csv += '\n';
    
    // Header da tabela
    csv += 'Data,Descrição,Categoria,Tipo,Valor,Saldo Acumulado\n';
    
    // Dados das transações com saldo acumulado
    var saldoAcumulado = 0;
    txs.forEach(function(t) {
      var data = new Date(t.data + 'T00:00:00').toLocaleDateString('pt-BR');
      var valor = t.tipo === CONFIG.TIPO_RECEITA ? t.valor : -t.valor;
      saldoAcumulado += valor;
      
      var tipoStr = t.tipo === CONFIG.TIPO_RECEITA ? 'Receita' : 'Despesa';
      var descricao = (t.descricao || '').replace(/"/g, '""'); // Escapar aspas
      var categoria = t.categoria.replace(/"/g, '""');
      
      csv += data + ',"' + descricao + '","' + categoria + '",' + tipoStr + ',' + valor.toFixed(2) + ',' + saldoAcumulado.toFixed(2) + '\n';
    });

    // Total de transações
    csv += '\nTotal de transações,' + txs.length + '\n';

    var blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    var link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = 'extrato_' + mesNome.toLowerCase() + '_' + info.ano + '.csv';
    link.click();
    
    UTILS.mostrarToast('Extrato exportado com sucesso!', 'success');
  },

  /**
   * Exporta extrato para PDF
   */
  exportarExtrato: function() {
    var info = this.getExtratoMesAno();
    var txs = TRANSACOES.obter({ mes: info.mes, ano: info.ano });
    
    if (txs.length === 0) {
      UTILS.mostrarToast('Nenhuma transação para exportar', 'warning');
      return;
    }

    // Calcular totais
    var receitas = 0, despesas = 0;
    txs.forEach(function(t) {
      if (t.tipo === CONFIG.TIPO_RECEITA) receitas += t.valor;
      else despesas += t.valor;
    });
    var saldo = receitas - despesas;

    var nomes = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];
    var mesNome = nomes[info.mes - 1];

    var html = '<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Extrato FinançasPro - ' + mesNome + ' ' + info.ano + '</title>';
    html += '<style>';
    html += '@page { margin: 20mm; size: A4; }';
    html += 'body { font-family: "Segoe UI", Arial, sans-serif; margin: 0; padding: 20px; color: #1e293b; }';
    html += '.header { text-align: center; margin-bottom: 30px; border-bottom: 2px solid #00723F; padding-bottom: 20px; }';
    html += '.header h1 { color: #00723F; margin: 0 0 10px 0; font-size: 28px; }';
    html += '.header p { color: #64748b; margin: 5px 0; font-size: 14px; }';
    html += '.summary { display: flex; justify-content: space-between; margin-bottom: 30px; gap: 20px; }';
    html += '.summary-card { flex: 1; padding: 15px; border-radius: 8px; text-align: center; }';
    html += '.summary-card.receitas { background: #dcfce7; border: 1px solid #86efac; }';
    html += '.summary-card.despesas { background: #fee2e2; border: 1px solid #fca5a5; }';
    html += '.summary-card.saldo { background: #dbeafe; border: 1px solid #93c5fd; }';
    html += '.summary-card h3 { margin: 0 0 10px 0; font-size: 12px; text-transform: uppercase; color: #64748b; }';
    html += '.summary-card .value { font-size: 24px; font-weight: bold; }';
    html += '.receitas .value { color: #16a34a; }';
    html += '.despesas .value { color: #dc2626; }';
    html += '.saldo .value { color: #2563eb; }';
    html += 'table { width: 100%; border-collapse: collapse; margin-bottom: 20px; }';
    html += 'th { background: #f1f5f9; padding: 12px; text-align: left; font-weight: 600; font-size: 12px; text-transform: uppercase; color: #64748b; border-bottom: 2px solid #e2e8f0; }';
    html += 'td { padding: 12px; border-bottom: 1px solid #e2e8f0; font-size: 13px; }';
    html += 'tr:hover { background: #f8fafc; }';
    html += '.receita { color: #16a34a; font-weight: 600; }';
    html += '.despesa { color: #dc2626; font-weight: 600; }';
    html += '.categoria { font-weight: 500; color: #475569; }';
    html += '.footer { margin-top: 40px; padding-top: 20px; border-top: 1px solid #e2e8f0; text-align: center; color: #94a3b8; font-size: 12px; }';
    html += '@media print { body { -webkit-print-color-adjust: exact; print-color-adjust: exact; } }';
    html += '</style>';
    html += '</head><body>';
    
    // Header
    html += '<div class="header">';
    html += '<h1>💰 FinançasPro</h1>';
    html += '<p>Extrato de ' + mesNome + ' de ' + info.ano + '</p>';
    html += '<p>Gerado em ' + new Date().toLocaleDateString('pt-BR') + ' às ' + new Date().toLocaleTimeString('pt-BR') + '</p>';
    html += '</div>';
    
    // Summary cards
    html += '<div class="summary">';
    html += '<div class="summary-card receitas"><h3>Receitas</h3><div class="value">' + UTILS.formatarMoeda(receitas) + '</div></div>';
    html += '<div class="summary-card despesas"><h3>Despesas</h3><div class="value">' + UTILS.formatarMoeda(despesas) + '</div></div>';
    html += '<div class="summary-card saldo"><h3>Saldo</h3><div class="value">' + UTILS.formatarMoeda(saldo) + '</div></div>';
    html += '</div>';
    
    // Table
    html += '<table>';
    html += '<thead><tr><th>Data</th><th>Descrição</th><th>Categoria</th><th>Tipo</th><th>Valor</th></tr></thead>';
    html += '<tbody>';
    
    txs.forEach(function(t) {
      var data = new Date(t.data + 'T00:00:00').toLocaleDateString('pt-BR');
      var valor = (t.tipo === CONFIG.TIPO_RECEITA ? '+' : '-') + UTILS.formatarMoeda(t.valor);
      var valorClass = t.tipo === CONFIG.TIPO_RECEITA ? 'receita' : 'despesa';
      html += '<tr>';
      html += '<td>' + data + '</td>';
      html += '<td>' + UTILS.escapeHtml(t.descricao || '') + '</td>';
      html += '<td class="categoria">' + INIT_EXTRATO.getCatIcon(t.categoria) + ' ' + UTILS.escapeHtml(t.categoria) + '</td>';
      html += '<td>' + (t.tipo === CONFIG.TIPO_RECEITA ? 'Receita' : 'Despesa') + '</td>';
      html += '<td class="' + valorClass + '">' + valor + '</td>';
      html += '</tr>';
    });
    
    html += '</tbody></table>';
    
    // Footer
    html += '<div class="footer">';
    html += '<p>FinançasPro - Controle suas finanças com simplicidade</p>';
    html += '<p>Total de ' + txs.length + ' transações neste período</p>';
    html += '</div>';
    
    html += '</body></html>';

    var win = window.open('', '_blank');
    if (win) {
      win.document.write(html);
      win.document.close();
      win.focus();
      setTimeout(function() { win.print(); }, 250);
      UTILS.mostrarToast('Extrato gerado para impressão/PDF', 'success');
    } else {
      UTILS.mostrarToast('Não foi possível abrir janela de impressão. Verifique o bloqueador de pop-ups.', 'error');
    }
  },

  /**
   * Obtém ícone da categoria
   */
  getCatIcon: function(cat) { 
    return this.CATEGORIA_ICONES[cat] || this.CATEGORIA_ICONES[cat.toLowerCase()] || '📌'; 
  },

  /**
   * Obtém cor da categoria
   */
  getCatCor: function(cat) { 
    return this.CATEGORIA_CORES[cat] || this.CATEGORIA_CORES[cat.toLowerCase()] || '#94a3b8'; 
  }
};

// Ícones por categoria
INIT_EXTRATO.CATEGORIA_ICONES = {
  'salario': '💰', 'freelance': '💻', 'investimentos': '📈', 'vendas': '🛒',
  'alimentacao': '🍔', 'transporte': '🚗', 'utilities': '🏠', 'moradia': '🏠',
  'saude': '💊', 'educacao': '📚', 'entretenimento': '🎮', 'lazer': '🎬',
  'compras': '🛍️', 'vestuario': '👕', 'viagem': '✈️', 'pet': '🐾',
  'assinaturas': '📺', 'outro': '📌', 'outros': '📌',
  /* Labels com acento (fallback) */
  'Salário': '💰', 'Alimentação': '🍔', 'Transporte': '🚗', 'Saúde': '💊',
  'Educação': '📚', 'Moradia': '🏠', 'Lazer': '🎬', 'Freelance': '💻',
  'Investimentos': '📈', 'Vendas': '🛒', 'Entretenimento': '🎮', 'Outros': '📌'
};

// Cores por categoria
INIT_EXTRATO.CATEGORIA_CORES = {
  'salario': '#10b981', 'freelance': '#6366f1', 'investimentos': '#0ea5e9', 'vendas': '#f59e0b',
  'alimentacao': '#ef4444', 'transporte': '#8b5cf6', 'utilities': '#06b6d4', 'moradia': '#14b8a6',
  'saude': '#ec4899', 'educacao': '#3b82f6', 'entretenimento': '#f97316', 'lazer': '#a855f7',
  'compras': '#e11d48', 'vestuario': '#7c3aed', 'viagem': '#0284c7', 'pet': '#84cc16',
  'assinaturas': '#6366f1', 'outro': '#94a3b8', 'outros': '#94a3b8',
  'Salário': '#10b981', 'Alimentação': '#ef4444', 'Transporte': '#8b5cf6', 'Saúde': '#ec4899',
  'Educação': '#3b82f6', 'Moradia': '#14b8a6', 'Lazer': '#a855f7', 'Freelance': '#6366f1',
  'Investimentos': '#0ea5e9', 'Vendas': '#f59e0b', 'Entretenimento': '#f97316', 'Outros': '#94a3b8'
};

// Export para compatibilidade
if (typeof module !== 'undefined' && module.exports) {
  module.exports = INIT_EXTRATO;
}
