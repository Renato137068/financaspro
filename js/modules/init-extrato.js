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
    pendenteExclusao: {}, // IDs ocultos até efetivar ou desfazer
    virtualScroll: {
      pageSize: 50,
      maxRendered: 500,
      currentPage: 0,
      totalItems: 0
    }
  },
  listenerAttached: false,
  filtrosCategoriasListener: false,
  listaTransacoesListener: false,
  _carregarMaisObserver: null,
  /** Lista filtrada do render atual — usada pelo handler delegado (carregar mais). */
  _listaTxsAtual: null,
  _gruposOrdenadosAtual: null,
  _ultimoResumoAnunciado: null,

  /**
   * Inicializa sistema de extrato
   */
  init: function() {
    this._carregarFiltrosSalvos();
    this.setupExtratoListeners();
    this.atualizarPeriodoLabel();
    this._bindBusca();
    this._bindKeyboardShortcuts();
    this.atualizarBadgeFiltrosAvancados();
    this._syncOrdenacaoUI();
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
          self.state.busca = '';
          var buscaInputReset = document.getElementById('extrato-busca');
          if (buscaInputReset) buscaInputReset.value = '';
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
   * P0.1: delegação de clique na lista — ligada uma única vez no container
   * persistente (#lista-transacoes), evitando handlers acumulados a cada render.
   */
  _bindListaTransacoesClick: function() {
    if (this.listaTransacoesListener) return;
    var container = document.getElementById('lista-transacoes');
    if (!container) return;
    this.listaTransacoesListener = true;
    container.addEventListener('click', function(e) {
      var btnEdit = e.target.closest('.btn-editar');
      var btnDel = e.target.closest('.btn-deletar');
      var btnAnexo = e.target.closest('.btn-anexo');
      var btnCarregarMais = e.target.closest('.btn-carregar-mais');
      var btnLimparFiltros = e.target.closest('#extrato-empty-limpar-filtros');
      var txItem = e.target.closest('.ext-tx') || e.target.closest('.extrato-item');

      if (btnLimparFiltros) {
        e.stopPropagation();
        INIT_EXTRATO.limparFiltros();
      } else if (btnAnexo) {
        e.stopPropagation();
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
    this.atualizarBadgeFiltrosAvancados();
    
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
    if (this.state.filtroCat) n += 1;
    if (this.state.ordenacao && this.state.ordenacao !== 'data-desc') n += 1;
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

    var self = this;
    var qtd = this.state.selecionados.length;
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
    document.querySelectorAll('.filtro-chip').forEach(function(b) {
      var isActive = b.dataset.filtro === tipo;
      b.classList.toggle('ativo', isActive);
      b.setAttribute('aria-pressed', isActive ? 'true' : 'false');
    });
    this._salvarFiltros();
    this.filtrarExtrato();
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
    var parsed = this._parseOrdenacao(this.state.ordenacao);
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
    var parsed = this._parseOrdenacao(this.state.ordenacao);
    this.setOrdenacao(this._comporOrdenacao(campo, parsed.dir));
  },

  toggleOrdenacaoDir: function() {
    var parsed = this._parseOrdenacao(this.state.ordenacao);
    var novaDir = parsed.dir === 'desc' ? 'asc' : 'desc';
    this.setOrdenacao(this._comporOrdenacao(parsed.campo, novaDir));
  },

  setOrdenacao: function(ordenacao) {
    this.state.ordenacao = ordenacao;
    this._syncOrdenacaoUI();
    this._salvarFiltros();
    this.atualizarBadgeFiltrosAvancados();
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
      var isActive = b.dataset.cat === this.state.filtroCat;
      b.classList.toggle('ativo', isActive);
      b.setAttribute('aria-pressed', isActive ? 'true' : 'false');
    }.bind(this));
    this.atualizarBadgeFiltrosAvancados();
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
      var isActive = this.state.filtroCat === cat;
      var ativo = isActive ? ' ativo' : '';
      var pressed = isActive ? 'true' : 'false';
      return '<button type="button" class="filtro-cat-chip' + ativo + '" data-cat="' + UTILS.escapeHtml(cat) + '" aria-pressed="' + pressed + '">' +
        INIT_EXTRATO.getCatIcon(cat) + ' ' + UTILS.escapeHtml(CONFIG.getCatLabel(cat)) + ' <span class="cat-count">' + cats[cat] + '</span></button>';
    }.bind(this)).join('');

    if (typeof renderLucideIconsNow === 'function') renderLucideIconsNow(container);

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
   * Renderiza o resumo do extrato
   */
  renderExtratoResumo: function(txs) {
    var rec = 0, desp = 0;
    txs.forEach(function(t) {
      if (t.tipo === CONFIG.TIPO_RECEITA) rec += t.valor;
      else if (t.tipo === CONFIG.TIPO_DESPESA) desp += t.valor;
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
      else if (t.tipo === CONFIG.TIPO_DESPESA) saldoAnterior -= t.valor;
    });

    var trendValue = 0;
    var trendIcon = '<i data-lucide="trending-up" aria-hidden="true"></i>';
    if (saldoAnterior !== 0) {
      trendValue = ((saldo - saldoAnterior) / Math.abs(saldoAnterior)) * 100;
      trendIcon = trendValue >= 0 ? '<i data-lucide="trending-up" aria-hidden="true"></i>' : '<i data-lucide="trending-down" aria-hidden="true"></i>';
    }

    var trendEl = document.getElementById('trend-value');
    var trendIconEl = document.getElementById('trend-icon');
    if (trendEl) trendEl.textContent = (trendValue >= 0 ? '+' : '') + trendValue.toFixed(1) + '%';
    if (trendIconEl) {
      // innerHTML (não textContent) para o markup do ícone ser interpretado,
      // seguido de re-render do Lucide para transformar <i data-lucide> em SVG.
      trendIconEl.innerHTML = trendIcon;
      if (typeof renderLucideIconsNow === 'function') renderLucideIconsNow(trendIconEl);
    }

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

    var anuncio = document.getElementById('extrato-resumo-anuncio');
    if (anuncio) {
      var periodoTxt = periodEl ? periodEl.textContent : '';
      var resumoTxt = periodoTxt + ': saldo ' + UTILS.formatarMoeda(saldo) +
        ', entradas ' + UTILS.formatarMoeda(rec) +
        ', saídas ' + UTILS.formatarMoeda(desp) +
        ', ' + txs.length + ' movimentações';
      if (resumoTxt !== this._ultimoResumoAnunciado) {
        this._ultimoResumoAnunciado = resumoTxt;
        anuncio.textContent = resumoTxt;
      }
    }
  },

  /**
   * Renderiza a lista de transações com agrupamento por data
   */
  renderExtratoLista: function(txs) {
    var container = document.getElementById('lista-transacoes');
    if (!container) return;
    
    if (txs.length === 0) {
      container.innerHTML = this._renderEmptyState();
      this._atualizarContadorExtrato(0, 0);
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
   * Ordena grupos temporais (HOJE, ONTEM, ESTA SEMANA, depois meses).
   */
  _ordenarGrupos: function(grupos) {
    var ordemGrupos = ['HOJE', 'ONTEM', 'ESTA SEMANA'];
    var gruposOrdenados = {};
    ordemGrupos.forEach(function(g) {
      if (grupos[g]) gruposOrdenados[g] = grupos[g];
    });
    Object.keys(grupos).filter(function(g) {
      return ordemGrupos.indexOf(g) === -1;
    }).sort(function(a, b) {
      return new Date(b) - new Date(a);
    }).forEach(function(g) {
      gruposOrdenados[g] = grupos[g];
    });
    return gruposOrdenados;
  },

  /**
   * Gera HTML de grupos a partir de um offset global (paginação).
   * @returns {{ html: string, rendered: number }}
   */
  _renderGruposHtml: function(gruposOrdenados, startItem, maxItems) {
    var html = '';
    var skipped = 0;
    var rendered = 0;
    var grupoKeys = Object.keys(gruposOrdenados);
    var self = this;

    for (var i = 0; i < grupoKeys.length; i++) {
      if (rendered >= maxItems) break;
      var grupo = grupoKeys[i];
      var grupoTxs = gruposOrdenados[grupo];

      var subtotal = 0;
      grupoTxs.forEach(function(t) {
        subtotal += t.tipo === CONFIG.TIPO_RECEITA ? t.valor : -t.valor;
      });

      var itemsHtml = '';
      for (var j = 0; j < grupoTxs.length; j++) {
        if (skipped < startItem) {
          skipped++;
          continue;
        }
        if (rendered >= maxItems) break;
        itemsHtml += self._renderTransacaoItem(grupoTxs[j]);
        rendered++;
      }

      if (!itemsHtml) continue;

      html += '<div class="ext-grupo" role="group" aria-label="' + UTILS.escapeHtml(grupo) + '">';
      html += '<div class="ext-grupo-header">';
      html += '<span class="ext-grupo-data">' + grupo + '</span>';
      html += '<span class="ext-grupo-subtotal ' + (subtotal >= 0 ? 'positivo' : 'negativo') + '">' +
        (subtotal >= 0 ? '+' : '') + UTILS.formatarMoeda(subtotal) + '</span>';
      html += '</div>';
      html += '<div class="ext-grupo-list" role="list">';
      html += itemsHtml;
      html += '</div></div>';
    }

    return { html: html, rendered: rendered };
  },

  _atualizarContadorExtrato: function(total, mostrados) {
    var el = document.getElementById('extrato-lista-meta');
    if (!el) return;
    if (!total) {
      el.textContent = '';
      el.hidden = true;
      return;
    }
    var maxRendered = this._maxRenderedExtrato();
    var exibidos = Math.min(mostrados, total, maxRendered);
    el.hidden = false;
    if (total > maxRendered && exibidos >= maxRendered) {
      el.textContent = 'Mostrando ' + exibidos + ' de ' + total
        + ' transações (limite de exibição — use filtros)';
    } else {
      el.textContent = 'Mostrando ' + exibidos + ' de ' + total + ' transações';
    }
  },

  _maxRenderedExtrato: function() {
    return this.state.virtualScroll.maxRendered || 500;
  },

  _desconectarCarregarMaisObserver: function() {
    if (this._carregarMaisObserver) {
      this._carregarMaisObserver.disconnect();
      this._carregarMaisObserver = null;
    }
  },

  _vincularCarregarMaisObserver: function(txs) {
    var self = this;
    this._desconectarCarregarMaisObserver();
    if (typeof IntersectionObserver === 'undefined') return;
    var btn = document.getElementById('btn-carregar-mais');
    if (!btn) return;
    this._carregarMaisObserver = new IntersectionObserver(function(entries) {
      entries.forEach(function(entry) {
        if (entry.isIntersecting) self._carregarMais(txs);
      });
    }, { root: null, rootMargin: '160px', threshold: 0 });
    this._carregarMaisObserver.observe(btn);
  },

  _appendControlesPaginacao: function(html, txs, totalShown) {
    var maxRendered = this._maxRenderedExtrato();
    if (totalShown < txs.length && totalShown < maxRendered) {
      var restantes = Math.min(txs.length, maxRendered) - totalShown;
      html += '<button type="button" class="btn-carregar-mais" id="btn-carregar-mais">Carregar mais ('
        + restantes + ')</button>';
    } else if (txs.length > maxRendered && totalShown >= maxRendered) {
      html += '<p class="extrato-lista-limite" role="status">Mostrando os primeiros ' + maxRendered
        + ' de ' + txs.length + ' transações. Use filtros ou exporte o período para refinar.</p>';
    }
    return html;
  },

  /**
   * Renderiza grupos de transações (primeira página ou re-render completo).
   */
  _renderGrupos: function(grupos, txs) {
    var container = document.getElementById('lista-transacoes');
    if (!container) return;

    this._listaTxsAtual = txs;
    this._bindListaTransacoesClick();

    var gruposOrdenados = this._ordenarGrupos(grupos);
    this._gruposOrdenadosAtual = gruposOrdenados;

    var pageSize = this.state.virtualScroll.pageSize;
    var maxRendered = this._maxRenderedExtrato();
    var startItem = this.state.virtualScroll.currentPage * pageSize;
    var limit = Math.min(pageSize, Math.max(0, maxRendered - startItem));
    var slice = this._renderGruposHtml(gruposOrdenados, startItem, limit || pageSize);
    var html = slice.html;
    var totalShown = startItem + slice.rendered;

    html = this._appendControlesPaginacao(html, txs, totalShown);

    container.innerHTML = html;
    this._atualizarContadorExtrato(txs.length, totalShown);
    this._vincularCarregarMaisObserver(txs);

    if (typeof renderLucideIconsNow === 'function') renderLucideIconsNow(container);
  },

  /**
   * Renderiza um item de transação
   */
  _anexoBtnHtml: function(t) {
    if (!t.anexoCount || typeof INIT_ANEXOS === 'undefined') return '';
    return INIT_ANEXOS.botaoVerHtml(t.id, t.anexoCount);
  },

  _renderTransacaoItem: function(t) {
    var data = new Date(t.data + 'T00:00:00');
    var dataStr = data.toLocaleDateString('pt-BR');
    var catIcon = INIT_EXTRATO.getCatIcon(t.categoria);
    var catCor = INIT_EXTRATO.getCatCor(t.categoria);
    var isChecked = this.state.selecionados.indexOf(String(t.id)) > -1 ? 'checked' : '';
    var desc = t.descricao || t.categoria;

    return '<div class="ext-tx" role="listitem" tabindex="0" data-id="' + UTILS.escapeHtml(String(t.id)) + '" aria-label="Transação: ' + UTILS.escapeHtml(desc) + '">' +
      '<input type="checkbox" class="tx-checkbox" data-tx-id="' + UTILS.escapeHtml(String(t.id)) + '" ' + isChecked +
        ' aria-label="Selecionar: ' + UTILS.escapeHtml(desc) + '">' +
      '<div class="ext-tx-icon" style="background: ' + catCor + '20; color: ' + catCor + '">' + catIcon + '</div>' +
      '<div class="ext-tx-info">' +
        '<div class="ext-tx-desc">' + UTILS.escapeHtml(t.descricao || t.categoria) + '</div>' +
        '<div class="ext-tx-meta">' +
          '<span class="ext-tx-meta-tag">' + UTILS.escapeHtml(CONFIG.getCatLabel(t.categoria)) + '</span>' +
          '<span>' + dataStr + '</span>' +
          (t.anexoCount ? '<span class="ext-tx-anexo-badge" aria-hidden="true"><i data-lucide="paperclip"></i></span>' : '') +
        '</div>' +
      '</div>' +
      '<div class="ext-tx-valor ' + UTILS.escapeHtml(t.tipo) + '">' +
        (t.tipo === CONFIG.TIPO_RECEITA ? '+' : '-') + UTILS.formatarMoeda(t.valor) +
      '</div>' +
    '</div>';
  },

  /**
   * Renderiza o estado vazio
   */
  _renderEmptyState: function() {
    var totalReal = (typeof DADOS !== 'undefined' && DADOS.getTransacoes) ? DADOS.getTransacoes().length : 0;
    var filtrosAtivos = this.state.filtroTipo !== 'todos' || this.state.filtroCat
      || this.state.busca
      || this.state.buscaAvancada.valorMin != null
      || this.state.buscaAvancada.valorMax != null
      || this.state.buscaAvancada.dataInicio
      || this.state.buscaAvancada.dataFim;
    var opts = totalReal === 0
      ? {
          lucide: 'wallet',
          titulo: 'Seu extrato começa aqui',
          subtitulo: 'Adicione sua primeira transação para ver tudo organizado por dia.',
          aba: 'novo',
          ctaTexto: 'Adicionar primeira transação',
          animado: true,
        }
      : {
          lucide: 'search-x',
          titulo: 'Nenhuma movimentação encontrada',
          subtitulo: filtrosAtivos
            ? 'Nenhum lançamento combina com os filtros atuais.'
            : 'Tente selecionar outro intervalo de período.',
          aba: filtrosAtivos ? null : 'novo',
          ctaTexto: filtrosAtivos ? null : 'Registrar transação',
          animado: true,
        };
    if (typeof UI !== 'undefined' && UI.EmptyState && typeof UI.EmptyState.render === 'function') {
      var el = UI.EmptyState.render(opts);
      if (el) {
        el.setAttribute('role', 'status');
        if (filtrosAtivos && totalReal > 0) {
          var btnLimpar = document.createElement('button');
          btnLimpar.type = 'button';
          btnLimpar.className = 'btn-empty-cta btn-empty-cta--secundario';
          btnLimpar.id = 'extrato-empty-limpar-filtros';
          btnLimpar.innerHTML = '<i data-lucide="rotate-ccw" aria-hidden="true"></i> Limpar filtros';
          btnLimpar.addEventListener('click', function() { INIT_EXTRATO.limparFiltros(); });
          el.appendChild(btnLimpar);
          if (typeof renderLucideIcons === 'function') renderLucideIcons(el);
        }
        return el.outerHTML;
      }
    }
    var html = '<div class="empty-state" role="status">' +
      '<div class="empty-state-title">' + opts.titulo + '</div>' +
      '<div class="empty-state-message">' + opts.subtitulo + '</div>';
    if (filtrosAtivos && totalReal > 0) {
      html += '<button type="button" class="btn-empty-cta btn-empty-cta--secundario" id="extrato-empty-limpar-filtros">' +
        'Limpar filtros</button>';
    } else if (opts.aba) {
      html += '<button type="button" class="btn-empty-cta" data-mudar-aba="' + opts.aba + '">' +
        (opts.ctaTexto || 'Começar') + '</button>';
    }
    html += '</div>';
    return html;
  },

  /**
   * Carrega mais itens na lista (virtual scrolling)
   */
  _carregarMais: function(txs) {
    var maxRendered = this._maxRenderedExtrato();
    var pageSize = this.state.virtualScroll.pageSize;
    var proximoStart = (this.state.virtualScroll.currentPage + 1) * pageSize;
    if (proximoStart >= maxRendered) return;

    this.state.virtualScroll.currentPage++;
    var container = document.getElementById('lista-transacoes');
    if (!container) return;

    var btnCarregarMais = document.getElementById('btn-carregar-mais');
    if (btnCarregarMais) btnCarregarMais.remove();

    var startItem = this.state.virtualScroll.currentPage * pageSize;
    var limit = Math.min(pageSize, Math.max(0, maxRendered - startItem));
    var gruposOrdenados = this._gruposOrdenadosAtual || {};
    var slice = this._renderGruposHtml(gruposOrdenados, startItem, limit || pageSize);
    var html = slice.html;
    var totalShown = startItem + slice.rendered;

    html = this._appendControlesPaginacao(html, txs, totalShown);

    container.insertAdjacentHTML('beforeend', html);
    this._atualizarContadorExtrato(txs.length, totalShown);
    this._vincularCarregarMaisObserver(txs);
    if (typeof renderLucideIconsNow === 'function') renderLucideIconsNow(container);
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

    if (this.state.pendenteExclusao) {
      txs = txs.filter(function(t) { return !INIT_EXTRATO.state.pendenteExclusao[t.id]; });
    }

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

    if (typeof INIT_ANEXOS !== 'undefined') {
      INIT_ANEXOS.limparPendentes();
      INIT_ANEXOS.carregarParaTransacao(id);
    }

    UTILS.mostrarToast('Edite a transação e clique em Atualizar', 'info');
  },

  /**
   * Deleta transação
   */
  deletarTransacao: function(id) {
    var self = this;
    INIT_MODALS.confirm('Tem certeza que deseja deletar esta transação?', function() {
      if (!TRANSACOES.obterPorId(id)) return;
      self.state.pendenteExclusao[id] = true;
      self.filtrarExtrato();
      RENDER.init();

      UTILS.agendarExclusao('tx-' + id, function() {
        TRANSACOES.deletar(id);
        delete self.state.pendenteExclusao[id];
        self.filtrarExtrato();
        RENDER.init();
      }, {
        mensagem: 'Excluído',
        duracaoMs: 5000,
        aoDesfazer: function() {
          delete self.state.pendenteExclusao[id];
          self.filtrarExtrato();
          RENDER.init();
        }
      });
    });
  },

  /**
   * Neutraliza fórmulas CSV (= + - @ tab CR) prefixando apóstrofo.
   */
  _neutralizarCsvCelula: function(val) {
    var s = String(val == null ? '' : val);
    if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
    return s.replace(/"/g, '""');
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
      // Explícito e não `else`: transferência entre contas não é gasto.
      else if (t.tipo === CONFIG.TIPO_DESPESA) despesas += t.valor;
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
      var descricao = this._neutralizarCsvCelula(t.descricao || '');
      var categoria = this._neutralizarCsvCelula(t.categoria);
      
      csv += data + ',"' + descricao + '","' + categoria + '",' + tipoStr + ',' + valor.toFixed(2) + ',' + saldoAcumulado.toFixed(2) + '\n';
    });

    // Total de transações
    csv += '\nTotal de transações,' + txs.length + '\n';

    var blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    var link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = 'extrato_' + mesNome.toLowerCase() + '_' + info.ano + '.csv';
    link.click();
    
    UTILS.mostrarToast('Planilha exportada', 'success');
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
      // Explícito e não `else`: transferência entre contas não é gasto.
      else if (t.tipo === CONFIG.TIPO_DESPESA) despesas += t.valor;
    });
    var saldo = receitas - despesas;

    var nomes = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];
    var mesNome = nomes[info.mes - 1];

    var html = '<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Extrato FinançasPro - ' + mesNome + ' ' + info.ano + '</title>';
    html += '<style>';
    html += '@page { margin: 20mm; size: A4; }';
    html += 'body { font-family: "Segoe UI", Arial, sans-serif; margin: 0; padding: 20px; color: #242a27; }';
    html += '.header { text-align: center; margin-bottom: 30px; border-bottom: 2px solid #12694E; padding-bottom: 20px; }';
    html += '.header h1 { color: #12694E; margin: 0 0 10px 0; font-size: 28px; }';
    html += '.header p { color: #6e7a74; margin: 5px 0; font-size: 14px; }';
    html += '.summary { display: flex; justify-content: space-between; margin-bottom: 30px; gap: 20px; }';
    html += '.summary-card { flex: 1; padding: 15px; border-radius: 8px; text-align: center; }';
    html += '.summary-card.receitas { background: #dcfce7; border: 1px solid #86efac; }';
    html += '.summary-card.despesas { background: #fee2e2; border: 1px solid #fca5a5; }';
    html += '.summary-card.saldo { background: #dbeafe; border: 1px solid #93c5fd; }';
    html += '.summary-card h3 { margin: 0 0 10px 0; font-size: 12px; text-transform: uppercase; color: #6e7a74; }';
    html += '.summary-card .value { font-size: 24px; font-weight: bold; }';
    html += '.receitas .value { color: #16a34a; }';
    html += '.despesas .value { color: #dc2626; }';
    html += '.saldo .value { color: #2c6e8f; }';
    html += 'table { width: 100%; border-collapse: collapse; margin-bottom: 20px; }';
    html += 'th { background: #f3f5f4; padding: 12px; text-align: left; font-weight: 600; font-size: 12px; text-transform: uppercase; color: #6e7a74; border-bottom: 2px solid #e5e9e7; }';
    html += 'td { padding: 12px; border-bottom: 1px solid #e5e9e7; font-size: 13px; }';
    html += 'tr:hover { background: #fbfcfb; }';
    html += '.receita { color: #16a34a; font-weight: 600; }';
    html += '.despesa { color: #dc2626; font-weight: 600; }';
    html += '.categoria { font-weight: 500; color: #55605a; }';
    html += '.footer { margin-top: 40px; padding-top: 20px; border-top: 1px solid #e5e9e7; text-align: center; color: #98a39d; font-size: 12px; }';
    html += '@media print { body { -webkit-print-color-adjust: exact; print-color-adjust: exact; } }';
    html += '</style>';
    html += '</head><body>';
    
    // Header
    html += '<div class="header">';
    html += '<h1>FinançasPro</h1>';
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
      UTILS.mostrarToast('O navegador bloqueou a janela de impressão. Libere pop-ups para este site.', 'error');
    }
  },

  /**
   * Obtém ícone da categoria
   */
  getCatIcon: function(cat) {
    var icon = this.CATEGORIA_ICONES[cat] || this.CATEGORIA_ICONES[cat.toLowerCase()] || 'pin';
    if (typeof lucideIconHtml === 'function') return lucideIconHtml(icon);
    return '<i data-lucide="' + icon + '" aria-hidden="true"></i>';
  },

  /**
   * Obtém cor da categoria
   */
  getCatCor: function(cat) { 
    return this.CATEGORIA_CORES[cat] || this.CATEGORIA_CORES[cat.toLowerCase()] || '#98a39d'; 
  }
};

// Ícones por categoria
INIT_EXTRATO.CATEGORIA_ICONES = {
  'salario': 'wallet', 'freelance': 'laptop', 'investimentos': 'trending-up', 'vendas': 'shopping-cart',
  'alimentacao': 'utensils', 'transporte': 'car', 'utilities': 'zap', 'moradia': 'home',
  'saude': 'pill', 'educacao': 'book-open', 'entretenimento': 'gamepad-2', 'lazer': 'film',
  'compras': 'shopping-bag', 'vestuario': 'shirt', 'viagem': 'plane', 'pet': 'paw',
  'assinaturas': 'tv', 'outro': 'pin', 'outros': 'pin',
  /* Labels com acento (fallback) */
  'Salário': 'wallet', 'Alimentação': 'utensils', 'Transporte': 'car', 'Saúde': 'pill',
  'Educação': 'book-open', 'Moradia': 'home', 'Lazer': 'film', 'Freelance': 'laptop',
  'Investimentos': 'trending-up', 'Vendas': 'shopping-cart', 'Entretenimento': 'gamepad-2', 'Outros': 'pin',
  'Utilidades': 'zap'
};

// Cores por categoria
INIT_EXTRATO.CATEGORIA_CORES = {
  'salario': '#2f9c6d', 'freelance': '#6366f1', 'investimentos': '#0ea5e9', 'vendas': '#c98a1e',
  'alimentacao': '#c9573a', 'transporte': '#8b5cf6', 'utilities': '#06b6d4', 'moradia': '#14b8a6',
  'saude': '#ec4899', 'educacao': '#3c86a8', 'entretenimento': '#f97316', 'lazer': '#a855f7',
  'compras': '#e11d48', 'vestuario': '#7c3aed', 'viagem': '#0284c7', 'pet': '#84cc16',
  'assinaturas': '#6366f1', 'outro': '#98a39d', 'outros': '#98a39d',
  'Salário': '#2f9c6d', 'Alimentação': '#c9573a', 'Transporte': '#8b5cf6', 'Saúde': '#ec4899',
  'Educação': '#3c86a8', 'Moradia': '#14b8a6', 'Lazer': '#a855f7', 'Freelance': '#6366f1',
  'Investimentos': '#0ea5e9', 'Vendas': '#c98a1e', 'Entretenimento': '#f97316', 'Outros': '#98a39d'
};

// Export para compatibilidade
if (typeof module !== 'undefined' && module.exports) {
  module.exports = INIT_EXTRATO;
}
