/**
 * render.js - UI Rendering (Dashboard Enhanced)
 * Tier 1: Depends on config.js, dados.js, utils.js, transacoes.js, orcamento.js
 */

var RENDER = {
  CORES_CATEGORIAS: {
    alimentacao: '#ef6c00',
    transporte: '#1565c0',
    moradia: '#2e7d32',
    saude: '#c62828',
    lazer: '#7b1fa2',
    salario: '#00723F',
    outro: '#78909c'
  },

  NOMES_MESES: ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'],

  init: function() {
    // Usar renderização modular se disponível
    if (typeof RENDER_CORE !== 'undefined') {
      RENDER_CORE.renderAll();
    } else {
      // Fallback para renderização legada
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
    }
    
    // Sempre renderizar extrato (não modularizado ainda)
    this.renderExtrato();
    this.atualizarHeaderSaldo();
  },

  // === SAUDAÇÃO PERSONALIZADA ===
  renderGreeting: function() {
    var el = document.getElementById('dashboard-greeting');
    if (!el) return;
    var config = DADOS.getConfig();
    var nome = config.nome || 'Usuario';
    var agora = new Date();
    var hora = agora.getHours();
    var saudacao = hora < 12 ? 'Bom dia' : hora < 18 ? 'Boa tarde' : 'Boa noite';
    var mesNome = agora.toLocaleDateString('pt-BR', { month: 'long' });
    mesNome = mesNome.charAt(0).toUpperCase() + mesNome.slice(1);

    el.innerHTML = '<div class="greeting-text">' +
      '<span class="greeting-hello">' + saudacao + ', ' + UTILS.escapeHtml(nome) + '!</span>' +
      '<span class="greeting-context">Seu resumo de ' + mesNome + ' ' + agora.getFullYear() + '</span>' +
    '</div>';
  },

  // === CARD SALDO PRINCIPAL ===
  renderCardSaldo: function() {
    var el = document.getElementById('card-saldo-principal');
    if (!el) return;
    var agora = new Date();
    var resumo = TRANSACOES.obterResumoMes(agora.getMonth() + 1, agora.getFullYear());
    var saldo = resumo.saldo;
    var positivo = saldo >= 0;
    var classe = positivo ? 'saldo-positivo' : 'saldo-negativo';
    var emoji = positivo ? '📈' : '📉';

    el.className = 'card-saldo-principal ' + classe;
    el.innerHTML = '<div class="saldo-emoji">' + emoji + '</div>' +
      '<div class="saldo-info">' +
        '<div class="saldo-label">Saldo do mês</div>' +
        '<div class="saldo-valor">' + UTILS.formatarMoeda(saldo) + '</div>' +
      '</div>';
  },

  // === RESUMO RECEITAS/DESPESAS ===
  renderResumo: function() {
    var agora = new Date();
    var resumo = TRANSACOES.obterResumoMes(agora.getMonth() + 1, agora.getFullYear());
    var elRec = document.getElementById('resumo-receitas');
    var elDesp = document.getElementById('resumo-despesas');
    if (elRec) elRec.textContent = UTILS.formatarMoeda(resumo.receitas);
    if (elDesp) elDesp.textContent = UTILS.formatarMoeda(resumo.despesas);
  },

  // === COMPARAÇÃO MÊS ANTERIOR ===
  renderComparacaoMesAnterior: function() {
    var agora = new Date();
    var mesAtual = agora.getMonth() + 1;
    var anoAtual = agora.getFullYear();
    var mesAnt = mesAtual === 1 ? 12 : mesAtual - 1;
    var anoAnt = mesAtual === 1 ? anoAtual - 1 : anoAtual;

    var atual = TRANSACOES.obterResumoMes(mesAtual, anoAtual);
    var anterior = TRANSACOES.obterResumoMes(mesAnt, anoAnt);

    var elRec = document.getElementById('comp-receitas');
    var elDesp = document.getElementById('comp-despesas');

    if (elRec) elRec.innerHTML = this._formatarComparacao(atual.receitas, anterior.receitas);
    if (elDesp) elDesp.innerHTML = this._formatarComparacao(atual.despesas, anterior.despesas, true);
  },

  _formatarComparacao: function(atual, anterior, inverso) {
    return UI.ComparacaoMes.html(atual, anterior, inverso);
  },

  // === ALERTAS DE ORÇAMENTO ===
  renderAlertas: function() {
    var el = document.getElementById('dashboard-alertas');
    if (!el) return;
    var agora = new Date();
    var status = ORCAMENTO.obterStatusTodos(agora.getMonth() + 1, agora.getFullYear());
    var alertas = status.filter(function(s) { return s.status === 'excedido' || s.status === 'alerta'; });

    var btnOrc = document.querySelector('.nav-btn[data-aba="orcamento"]');
    if (btnOrc) btnOrc.classList.toggle('nav-alerta', alertas.length > 0);

    el.innerHTML = '';
    if (alertas.length === 0) return;

    var excedidos = alertas.filter(function(s) { return s.status === 'excedido'; });
    var avisos    = alertas.filter(function(s) { return s.status === 'alerta'; });
    var card = UI.AlertaCard.render(excedidos, avisos);
    if (card) el.appendChild(card);
  },

  // === INDICADORES: RENDA + DIAS RESTANTES ===
  renderIndicadores: function() {
    var el = document.getElementById('dashboard-indicadores');
    if (!el) return;
    var config = DADOS.getConfig();
    var agora = new Date();
    var resumo = TRANSACOES.obterResumoMes(agora.getMonth() + 1, agora.getFullYear());
    var html = '';

    // % Renda comprometida
    if (config.renda && config.renda > 0) {
      var pctRenda = Math.round((resumo.despesas / config.renda) * 100);
      var corRenda = pctRenda > 100 ? '#ef4444' : pctRenda > 80 ? '#f59e0b' : '#10b981';
      html += '<div class="indicador-card">' +
        '<div class="indicador-icone">💰</div>' +
        '<div class="indicador-info">' +
          '<div class="indicador-valor" style="color:' + corRenda + '">' + pctRenda + '%</div>' +
          '<div class="indicador-label">da renda comprometida</div>' +
        '</div>' +
        '<div class="indicador-barra"><div class="indicador-fill" style="width:' + Math.min(pctRenda, 100) + '%;background:' + corRenda + '"></div></div>' +
      '</div>';
    }

    // Dias restantes + orçamento diário
    var ultimoDia = new Date(agora.getFullYear(), agora.getMonth() + 1, 0).getDate();
    var diasRestantes = ultimoDia - agora.getDate();
    var saldoDisponivel = resumo.receitas - resumo.despesas;
    var porDia = diasRestantes > 0 ? saldoDisponivel / diasRestantes : 0;

    html += '<div class="indicador-card">' +
      '<div class="indicador-icone">📅</div>' +
      '<div class="indicador-info">' +
        '<div class="indicador-valor">' + diasRestantes + ' dias</div>' +
        '<div class="indicador-label">restam no mês</div>' +
      '</div>' +
      '<div class="indicador-extra">' +
        (porDia >= 0
          ? '<span class="comp-bom">' + UTILS.formatarMoeda(porDia) + '/dia disponível</span>'
          : '<span class="comp-ruim">Saldo negativo</span>') +
      '</div>' +
    '</div>';

    el.innerHTML = html;
  },

  // === MINI-CHART EVOLUÇÃO 6 MESES (SVG) ===
  renderChartEvolucao: function() {
    var el = document.getElementById('chart-evolucao');
    if (!el) return;
    var agora = new Date();
    var dados = [];
    for (var i = 5; i >= 0; i--) {
      var d = new Date(agora.getFullYear(), agora.getMonth() - i, 1);
      var mes = d.getMonth() + 1;
      var ano = d.getFullYear();
      var resumo = TRANSACOES.obterResumoMes(mes, ano);
      dados.push({ mes: this.NOMES_MESES[d.getMonth()], receitas: resumo.receitas, despesas: resumo.despesas });
    }

    var temDados = dados.some(function(d) { return d.receitas > 0 || d.despesas > 0; });
    if (!temDados) {
      el.innerHTML = this._emptyState('📈', 'Registre transações para ver a evolução dos seus gastos ao longo dos meses.', 'novo');
      return;
    }

    el.innerHTML = UI.BarChart6M.render(dados);
  },

  // === DONUT CHART CATEGORIAS (SVG) ===
  renderChartCategorias: function() {
    var el = document.getElementById('chart-categorias');
    if (!el) return;
    var agora = new Date();
    var resumoCat = TRANSACOES.obterResumoPorCategoria(agora.getMonth() + 1, agora.getFullYear());

    // Filtrar apenas despesas
    var cats = [];
    var totalDesp = 0;
    var self = this;
    Object.keys(resumoCat).forEach(function(cat) {
      var desp = resumoCat[cat].despesa || 0;
      if (desp > 0) {
        cats.push({ nome: cat, valor: desp, cor: self.CORES_CATEGORIAS[cat] || '#78909c' });
        totalDesp += desp;
      }
    });

    if (cats.length === 0) {
      el.innerHTML = this._emptyState('🍩', 'Registre despesas para ver a distribuição por categoria.', 'novo');
      return;
    }

    cats.sort(function(a, b) { return b.valor - a.valor; });
    el.innerHTML = '';
    el.appendChild(UI.DonutChart.render(cats, totalDesp));
  },

  // === ÚLTIMAS 5 TRANSAÇÕES ===
  renderUltimasTransacoes: function() {
    var transacoes = TRANSACOES.obter({});
    var ultimas = transacoes.slice(0, 3);
    var list = document.getElementById('resumo-list');
    if (!list) return;

    if (ultimas.length === 0) {
      list.innerHTML = this._emptyState('🕐', 'Nenhuma transação registrada ainda. Comece adicionando sua primeira!', 'novo');
      return;
    }

    var frag = document.createDocumentFragment();
    ultimas.forEach(function(t) { frag.appendChild(UI.CardTransacao.render(t)); });
    list.innerHTML = '';
    list.appendChild(frag);
  },

  // === EMPTY STATE HELPER ===
  _emptyState: function(emoji, texto, aba) {
    return UI.EmptyState.html(emoji, texto, aba);
  },

  // === EXTRATO (aba separada) ===
  renderExtrato: function() {
    // Delega para filtrarExtrato() que é a função unificada
    var container = document.getElementById('lista-transacoes');
    if (!container) return;
    var filtroAtual = container.dataset.filtroAtual || 'todos';
    filtrarExtrato(filtroAtual);
  },

  // === ORÇAMENTO (barras — somente leitura no Resumo) ===
  renderOrcamento: function() {
    var agora = new Date();
    var status = ORCAMENTO.obterStatusTodos(agora.getMonth() + 1, agora.getFullYear());
    var container = document.getElementById('resumo-orcamentos');
    if (!container) return;
    if (status.length === 0) {
      container.innerHTML = this._emptyState('📊', 'Defina limites mensais para acompanhar seus gastos por categoria.', 'orcamento');
      return;
    }
    var frag = document.createDocumentFragment();
    status.forEach(function(s) { frag.appendChild(UI.CardOrcamento.render(s)); });
    container.innerHTML = '';
    container.appendChild(frag);
  },

  renderFormCategories: function() {
    var tipoSelect = document.getElementById('tipo-transacao');
    if (!tipoSelect) return;
    var self = this;
    tipoSelect.addEventListener('change', function(e) { self.atualizarCategorias(e.target.value); });
    this.atualizarCategorias(CONFIG.TIPO_DESPESA);
  },

  atualizarCategorias: function(tipo) {
    var slugs = tipo === CONFIG.TIPO_RECEITA ? CONFIG.CATEGORIAS_RECEITA : CONFIG.CATEGORIAS_DESPESA;
    var select = document.getElementById('categoria-transacao');
    if (!select) return;
    select.innerHTML = '<option value="">Selecione a categoria</option>' +
      slugs.map(function(slug) { return '<option value="' + slug + '">' + CONFIG.getCatLabel(slug) + '</option>'; }).join('');
  },

  atualizarHeaderSaldo: function() {
    // Saldo exibido no card-saldo-principal do Resumo; header não replica mais.
  }
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = RENDER;
}
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     