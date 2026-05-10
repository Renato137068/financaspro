/**
 * render-dashboard.js - Renderer da seção Dashboard/Resumo
 * Modularizado — usa componentes UI.* de js/components/
 */

(function() {
  var DashboardRenderer = Object.create(RENDERER_BASE);

  var CORES_CATEGORIAS = {
    alimentacao: '#ef6c00',
    transporte:  '#1565c0',
    moradia:     '#2e7d32',
    saude:       '#c62828',
    lazer:       '#7b1fa2',
    salario:     '#00723F',
    outro:       '#78909c'
  };

  var NOMES_MESES = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];

  // ============================================================
  // HELPERS INTERNOS
  // ============================================================

  function _dadosTransacoes() {
    return (typeof TRANSACOES !== 'undefined' && TRANSACOES.obterResumoMes)
      ? TRANSACOES
      : null;
  }

  function _dadosOrcamento() {
    return (typeof ORCAMENTO !== 'undefined' && ORCAMENTO.obterStatusTodos)
      ? ORCAMENTO
      : null;
  }

  function _setChildren(el, nodes) {
    el.innerHTML = '';
    nodes.forEach(function(n) { if (n) el.appendChild(n); });
  }

  // ============================================================
  // MÉTODO PRINCIPAL
  // ============================================================

  DashboardRenderer.render = function() {
    this.renderGreeting();
    this.renderCardSaldo();
    this.renderResumo();
    this.renderComparacaoMesAnterior();
    this.renderAlertas();
    this.renderIndicadores();
    this.renderChartEvolucao();
    this.renderChartCategorias();
    this.renderOrcamento();
    this.renderUltimasTransacoes();
  };

  // ============================================================
  // SUB-RENDERERS
  // ============================================================

  DashboardRenderer.renderGreeting = function() {
    var el = this.getEl('dashboard-greeting');
    if (!el) return;

    var config = (typeof DADOS !== 'undefined' && DADOS.getConfig) ? DADOS.getConfig() : {};
    var nome   = config.nome || 'Usuario';
    var agora  = new Date();
    var hora   = agora.getHours();
    var saudacao = hora < 12 ? 'Bom dia' : hora < 18 ? 'Boa tarde' : 'Boa noite';
    var mesNome  = agora.toLocaleDateString('pt-BR', { month: 'long' });
    mesNome = mesNome.charAt(0).toUpperCase() + mesNome.slice(1);

    var container = this.create('div', { class: 'greeting-text' });

    var hello = this.create('span', { class: 'greeting-hello' });
    hello.textContent = saudacao + ', ' + nome + '!';
    container.appendChild(hello);

    var ctx = this.create('span', { class: 'greeting-context' });
    ctx.textContent = 'Seu resumo de ' + mesNome + ' ' + agora.getFullYear();
    container.appendChild(ctx);

    el.innerHTML = '';
    el.appendChild(container);
  };

  DashboardRenderer.renderCardSaldo = function() {
    var el = this.getEl('card-saldo-principal');
    if (!el) return;

    var agora  = new Date();
    var tx     = _dadosTransacoes();
    var resumo = tx ? tx.obterResumoMes(agora.getMonth() + 1, agora.getFullYear()) : { saldo: 0 };
    var saldo  = resumo.saldo || 0;
    var positivo = saldo >= 0;

    el.className = 'card-saldo-principal ' + (positivo ? 'saldo-positivo' : 'saldo-negativo');
    el.innerHTML = '';

    var emojiEl = this.create('div', { class: 'saldo-emoji' });
    emojiEl.textContent = positivo ? '📈' : '📉';
    el.appendChild(emojiEl);

    var info = this.create('div', { class: 'saldo-info' });
    var lbl  = this.create('div', { class: 'saldo-label' });
    lbl.textContent = 'Saldo do mês';
    info.appendChild(lbl);

    var val = this.create('div', { class: 'saldo-valor' });
    val.textContent = this.money(saldo);
    info.appendChild(val);

    el.appendChild(info);
  };

  DashboardRenderer.renderResumo = function() {
    var agora  = new Date();
    var tx     = _dadosTransacoes();
    var resumo = tx ? tx.obterResumoMes(agora.getMonth() + 1, agora.getFullYear()) : { receitas: 0, despesas: 0 };

    var elRec  = this.getEl('resumo-receitas');
    var elDesp = this.getEl('resumo-despesas');
    if (elRec)  elRec.textContent  = this.money(resumo.receitas  || 0);
    if (elDesp) elDesp.textContent = this.money(resumo.despesas  || 0);
  };

  DashboardRenderer.renderComparacaoMesAnterior = function() {
    var tx = _dadosTransacoes();
    if (!tx) return;

    var agora   = new Date();
    var mesAtual = agora.getMonth() + 1;
    var anoAtual = agora.getFullYear();
    var mesAnt  = mesAtual === 1 ? 12 : mesAtual - 1;
    var anoAnt  = mesAtual === 1 ? anoAtual - 1 : anoAtual;

    var atual   = tx.obterResumoMes(mesAtual, anoAtual);
    var anterior = tx.obterResumoMes(mesAnt, anoAnt);

    var elRec  = this.getEl('comp-receitas');
    var elDesp = this.getEl('comp-despesas');

    if (elRec)  elRec.innerHTML  = UI.ComparacaoMes.html(atual.receitas,  anterior.receitas);
    if (elDesp) elDesp.innerHTML = UI.ComparacaoMes.html(atual.despesas, anterior.despesas, true);
  };

  DashboardRenderer.renderAlertas = function() {
    var el = this.getEl('dashboard-alertas');
    if (!el) return;

    var orc = _dadosOrcamento();
    if (!orc) { el.innerHTML = ''; return; }

    var agora   = new Date();
    var status  = orc.obterStatusTodos(agora.getMonth() + 1, agora.getFullYear());
    var alertas = status.filter(function(s) { return s.status === 'excedido' || s.status === 'alerta'; });

    var btnOrc = document.querySelector('.nav-btn[data-aba="orcamento"]');
    if (btnOrc) btnOrc.classList.toggle('nav-alerta', alertas.length > 0);

    el.innerHTML = '';
    if (alertas.length === 0) return;

    var excedidos = alertas.filter(function(s) { return s.status === 'excedido'; });
    var avisos    = alertas.filter(function(s) { return s.status === 'alerta'; });
    var card = UI.AlertaCard.render(excedidos, avisos);
    if (card) el.appendChild(card);
  };

  DashboardRenderer.renderIndicadores = function() {
    var el = this.getEl('dashboard-indicadores');
    if (!el) return;

    var config = (typeof DADOS !== 'undefined' && DADOS.getConfig) ? DADOS.getConfig() : {};
    var agora  = new Date();
    var tx     = _dadosTransacoes();
    var resumo = tx ? tx.obterResumoMes(agora.getMonth() + 1, agora.getFullYear()) : { receitas: 0, despesas: 0 };

    var renda         = config.renda || 0;
    var diasNoMes     = new Date(agora.getFullYear(), agora.getMonth() + 1, 0).getDate();
    var diasRestantes = diasNoMes - agora.getDate();

    var container = this.create('div', { class: 'indicadores-grid' });

    if (renda > 0) {
      var pctGasto = (resumo.despesas / renda) * 100;
      var tipo1 = pctGasto > 100 ? 'negativo' : 'positivo';
      container.appendChild(UI.Indicador.render(
        '💰',
        pctGasto.toFixed(0) + '% da renda',
        pctGasto > 100 ? 'Indicador alerta' : 'Indicador ok',
        tipo1,
        { pct: Math.min(pctGasto, 100), cor: pctGasto > 100 ? '#ef4444' : pctGasto > 80 ? '#f59e0b' : '#10b981' }
      ));
    }

    container.appendChild(UI.Indicador.render(
      '📅',
      diasRestantes + ' dias restantes',
      diasRestantes < 5 ? 'Fim do mês próximo' : 'Tempo até fechamento',
      diasRestantes < 5 ? 'alerta' : 'neutro'
    ));

    if (renda > 0) {
      var economia = renda - resumo.despesas;
      container.appendChild(UI.Indicador.render(
        economia >= 0 ? '💚' : '❤️',
        this.money(Math.abs(economia)),
        economia >= 0 ? 'Economia prevista' : 'Déficit estimado',
        economia >= 0 ? 'positivo' : 'negativo'
      ));
    }

    el.innerHTML = '';
    el.appendChild(container);
  };

  DashboardRenderer.renderChartEvolucao = function() {
    var el = this.getEl('chart-evolucao');
    if (!el) return;

    var tx = _dadosTransacoes();
    if (!tx) {
      el.innerHTML = UI.EmptyState.html('📈', 'Registre transações para ver a evolução dos seus gastos ao longo dos meses.', 'novo');
      return;
    }

    var agora = new Date();
    var dados = [];
    for (var i = 5; i >= 0; i--) {
      var d      = new Date(agora.getFullYear(), agora.getMonth() - i, 1);
      var resumo = tx.obterResumoMes(d.getMonth() + 1, d.getFullYear());
      dados.push({ mes: NOMES_MESES[d.getMonth()], receitas: resumo.receitas, despesas: resumo.despesas });
    }

    var temDados = dados.some(function(d) { return d.receitas > 0 || d.despesas > 0; });
    if (!temDados) {
      el.innerHTML = UI.EmptyState.html('📈', 'Registre transações para ver a evolução dos seus gastos ao longo dos meses.', 'novo');
      return;
    }

    el.innerHTML = UI.BarChart6M.render(dados);
  };

  DashboardRenderer.renderChartCategorias = function() {
    var el = this.getEl('chart-categorias');
    if (!el) return;

    var tx = _dadosTransacoes();
    if (!tx || !tx.obterResumoPorCategoria) {
      el.innerHTML = UI.EmptyState.html('🍩', 'Registre despesas para ver a distribuição por categoria.', 'novo');
      return;
    }

    var agora     = new Date();
    var resumoCat = tx.obterResumoPorCategoria(agora.getMonth() + 1, agora.getFullYear());
    var cats      = [];
    var totalDesp = 0;

    Object.keys(resumoCat).forEach(function(cat) {
      var desp = resumoCat[cat].despesa || 0;
      if (desp > 0) {
        cats.push({ nome: cat, valor: desp, cor: CORES_CATEGORIAS[cat] || '#78909c' });
        totalDesp += desp;
      }
    });

    if (cats.length === 0) {
      el.innerHTML = UI.EmptyState.html('🍩', 'Registre despesas para ver a distribuição por categoria.', 'novo');
      return;
    }

    cats.sort(function(a, b) { return b.valor - a.valor; });

    el.innerHTML = '';
    el.appendChild(UI.DonutChart.render(cats, totalDesp));
  };

  DashboardRenderer.renderOrcamento = function() {
    var el = this.getEl('resumo-orcamentos');
    if (!el) return;

    var orc = _dadosOrcamento();
    if (!orc) {
      _setChildren(el, [UI.EmptyState.render('📊', 'Defina limites mensais para acompanhar seus gastos por categoria.', 'orcamento')]);
      return;
    }

    var agora  = new Date();
    var status = orc.obterStatusTodos(agora.getMonth() + 1, agora.getFullYear());

    if (status.length === 0) {
      _setChildren(el, [UI.EmptyState.render('📊', 'Defina limites mensais para acompanhar seus gastos por categoria.', 'orcamento')]);
      return;
    }

    var lista = this.create('div', { class: 'orcamento-lista-resumo' });
    status.slice(0, 3).forEach(function(s) {
      lista.appendChild(UI.CardOrcamento.renderResumo(s));
    });

    el.innerHTML = '';
    el.appendChild(lista);
  };

  DashboardRenderer.renderUltimasTransacoes = function() {
    var el = this.getEl('resumo-list');
    if (!el) return;

    var tx = _dadosTransacoes();
    var transacoes = [];

    // Tenta TRANSACOES.obter({}) primeiro (API canônica); fallback para getTodas()
    if (tx && typeof tx.obter === 'function') {
      transacoes = tx.obter({});
    } else if (tx && typeof tx.getTodas === 'function') {
      transacoes = tx.getTodas();
    }

    if (transacoes.length === 0) {
      _setChildren(el, [UI.EmptyState.render('🕐', 'Nenhuma transação registrada ainda. Comece adicionando sua primeira!', 'novo')]);
      return;
    }

    var ultimas = transacoes.slice(0, 3);
    var lista   = this.create('div', { class: 'lista-transacoes-resumo' });
    ultimas.forEach(function(t) {
      lista.appendChild(UI.CardTransacao.renderResumo(t));
    });

    el.innerHTML = '';
    el.appendChild(lista);
  };

  // ============================================================
  // REGISTRAR NO CORE
  // ============================================================

  if (typeof RENDER_CORE !== 'undefined') {
    RENDER_CORE.register('dashboard', DashboardRenderer);
  }

  window.RENDER_DASHBOARD = DashboardRenderer;
})();
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 