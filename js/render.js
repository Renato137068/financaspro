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
    var elSaldo = document.getElementById('saldo-header-txt');
    if (elRec) elRec.textContent = UTILS.formatarMoeda(resumo.receitas);
    if (elDesp) elDesp.textContent = UTILS.formatarMoeda(resumo.despesas);
    if (elSaldo) elSaldo.textContent = 'Saldo: ' + UTILS.formatarMoeda(resumo.saldo);
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
    if (anterior === 0) return '<span class="comp-neutro">—</span>';
    var diff = ((atual - anterior) / anterior) * 100;
    var diffStr = (diff >= 0 ? '+' : '') + diff.toFixed(0) + '%';
    // Para despesas, subir é ruim (inverso)
    var bom = inverso ? diff <= 0 : diff >= 0;
    var classe = bom ? 'comp-bom' : 'comp-ruim';
    var seta = diff >= 0 ? '↑' : '↓';
    return '<span class="' + classe + '">' + seta + ' ' + diffStr + ' vs mês ant.</span>';
  },

  // === ALERTAS DE ORÇAMENTO ===
  renderAlertas: function() {
    var el = document.getElementById('dashboard-alertas');
    if (!el) return;
    var agora = new Date();
    var status = ORCAMENTO.obterStatusTodos(agora.getMonth() + 1, agora.getFullYear());
    var alertas = status.filter(function(s) { return s.status === 'excedido' || s.status === 'alerta'; });

    if (alertas.length === 0) { el.innerHTML = ''; return; }

    var excedidos = alertas.filter(function(s) { return s.status === 'excedido'; });
    var avisos = alertas.filter(function(s) { return s.status === 'alerta'; });
    var html = '<div class="alerta-card">';
    html += '<div class="alerta-icon">⚠️</div><div class="alerta-content">';

    if (excedidos.length > 0) {
      html += '<div class="alerta-linha alerta-danger">' + excedidos.length + ' categoria(s) estourou o limite: ' +
        excedidos.map(function(s) { return '<strong>' + UTILS.escapeHtml(s.categoria) + '</strong>'; }).join(', ') +
      '</div>';
    }
    if (avisos.length > 0) {
      html += '<div class="alerta-linha alerta-warning">' + avisos.length + ' categoria(s) acima de 80%: ' +
        avisos.map(function(s) { return '<strong>' + UTILS.escapeHtml(s.categoria) + '</strong> (' + s.percentual + '%)'; }).join(', ') +
      '</div>';
    }
    html += '</div></div>';
    el.innerHTML = html;
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

    var maxVal = 0;
    dados.forEach(function(d) { maxVal = Math.max(maxVal, d.receitas, d.despesas); });
    if (maxVal === 0) maxVal = 100;

    var w = 340, h = 180, padding = 30, barW = 18, gap = 6;
    var chartH = h - padding - 20;
    var svg = '<svg viewBox="0 0 ' + w + ' ' + h + '" class="chart-svg" role="img" aria-label="Gráfico de evolução financeira">';

    // Linhas de grade
    for (var g = 0; g <= 4; g++) {
      var gy = padding + (chartH / 4) * g;
      var gVal = maxVal - (maxVal / 4) * g;
      svg += '<line x1="40" y1="' + gy + '" x2="' + (w - 10) + '" y2="' + gy + '" stroke="#e5e7eb" stroke-width="0.5" stroke-dasharray="3,3"/>';
      svg += '<text x="36" y="' + (gy + 3) + '" text-anchor="end" fill="#999" font-size="8">' + (gVal >= 1000 ? (gVal/1000).toFixed(0) + 'k' : gVal.toFixed(0)) + '</text>';
    }

    // Barras
    var groupW = barW * 2 + gap;
    var totalGroupW = dados.length * groupW + (dados.length - 1) * 12;
    var startX = 40 + ((w - 50 - totalGroupW) / 2);

    for (var j = 0; j < dados.length; j++) {
      var x = startX + j * (groupW + 12);
      var hRec = (dados[j].receitas / maxVal) * chartH;
      var hDesp = (dados[j].despesas / maxVal) * chartH;

      svg += '<rect x="' + x + '" y="' + (padding + chartH - hRec) + '" width="' + barW + '" height="' + hRec + '" rx="3" fill="#10b981" opacity="0.85"><title>Receita ' + dados[j].mes + ': ' + UTILS.formatarMoeda(dados[j].receitas) + '</title></rect>';
      svg += '<rect x="' + (x + barW + gap) + '" y="' + (padding + chartH - hDesp) + '" width="' + barW + '" height="' + hDesp + '" rx="3" fill="#ef4444" opacity="0.85"><title>Despesa ' + dados[j].mes + ': ' + UTILS.formatarMoeda(dados[j].despesas) + '</title></rect>';
      svg += '<text x="' + (x + groupW / 2) + '" y="' + (h - 4) + '" text-anchor="middle" fill="#666" font-size="9" font-weight="600">' + dados[j].mes + '</text>';
    }

    // Legenda
    svg += '<rect x="' + (w - 120) + '" y="4" width="8" height="8" rx="2" fill="#10b981"/>';
    svg += '<text x="' + (w - 108) + '" y="12" fill="#666" font-size="8">Receitas</text>';
    svg += '<rect x="' + (w - 60) + '" y="4" width="8" height="8" rx="2" fill="#ef4444"/>';
    svg += '<text x="' + (w - 48) + '" y="12" fill="#666" font-size="8">Despesas</text>';

    svg += '</svg>';
    el.innerHTML = svg;
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

    // Ordenar por valor desc
    cats.sort(function(a, b) { return b.valor - a.valor; });

    var size = 160, cx = 80, cy = 80, r = 60, innerR = 38;
    var svg = '<div class="donut-container">';
    svg += '<svg viewBox="0 0 ' + size + ' ' + size + '" class="donut-svg" role="img" aria-label="Gráfico de despesas por categoria">';

    var startAngle = -90;
    for (var i = 0; i < cats.length; i++) {
      var pct = cats[i].valor / totalDesp;
      var angle = pct * 360;
      var endAngle = startAngle + angle;
      var largeArc = angle > 180 ? 1 : 0;

      var x1 = cx + r * Math.cos(startAngle * Math.PI / 180);
      var y1 = cy + r * Math.sin(startAngle * Math.PI / 180);
      var x2 = cx + r * Math.cos(endAngle * Math.PI / 180);
      var y2 = cy + r * Math.sin(endAngle * Math.PI / 180);
      var ix1 = cx + innerR * Math.cos(endAngle * Math.PI / 180);
      var iy1 = cy + innerR * Math.sin(endAngle * Math.PI / 180);
      var ix2 = cx + innerR * Math.cos(startAngle * Math.PI / 180);
      var iy2 = cy + innerR * Math.sin(startAngle * Math.PI / 180);

      var path = 'M ' + x1 + ' ' + y1 +
        ' A ' + r + ' ' + r + ' 0 ' + largeArc + ' 1 ' + x2 + ' ' + y2 +
        ' L ' + ix1 + ' ' + iy1 +
        ' A ' + innerR + ' ' + innerR + ' 0 ' + largeArc + ' 0 ' + ix2 + ' ' + iy2 + ' Z';

      svg += '<path d="' + path + '" fill="' + cats[i].cor + '" opacity="0.9"><title>' + cats[i].nome + ': ' + UTILS.formatarMoeda(cats[i].valor) + ' (' + Math.round(pct * 100) + '%)</title></path>';
      startAngle = endAngle;
    }

    // Centro
    svg += '<text x="' + cx + '" y="' + (cy - 4) + '" text-anchor="middle" fill="#333" font-size="10" font-weight="700">Total</text>';
    svg += '<text x="' + cx + '" y="' + (cy + 10) + '" text-anchor="middle" fill="#666" font-size="8">' + UTILS.formatarMoeda(totalDesp) + '</text>';
    svg += '</svg>';

    // Legenda lateral
    svg += '<div class="donut-legenda">';
    for (var k = 0; k < cats.length; k++) {
      var pctCat = Math.round((cats[k].valor / totalDesp) * 100);
      svg += '<div class="legenda-item">' +
        '<span class="legenda-cor" style="background:' + cats[k].cor + '"></span>' +
        '<span class="legenda-nome">' + UTILS.escapeHtml(cats[k].nome) + '</span>' +
        '<span class="legenda-pct">' + pctCat + '%</span>' +
      '</div>';
    }
    svg += '</div></div>';
    el.innerHTML = svg;
  },

  // === ÚLTIMAS 5 TRANSAÇÕES ===
  renderUltimasTransacoes: function() {
    var transacoes = TRANSACOES.obter({});
    var ultimas = transacoes.slice(0, 5);
    var list = document.getElementById('resumo-list');
    if (!list) return;

    if (ultimas.length === 0) {
      list.innerHTML = this._emptyState('🕐', 'Nenhuma transação registrada ainda. Comece adicionando sua primeira!', 'novo');
      return;
    }

    list.innerHTML = ultimas.map(function(t) {
      return '<div class="transacao-item">' +
        '<div class="transacao-info">' +
          '<div class="transacao-descricao">' + UTILS.escapeHtml(t.descricao || t.categoria) + '</div>' +
          '<div class="transacao-data">' + UTILS.escapeHtml(t.categoria) + ' · ' + UTILS.formatarData(t.data) + '</div>' +
        '</div>' +
        '<div class="transacao-valor ' + t.tipo + '">' +
          (t.tipo === CONFIG.TIPO_RECEITA ? '+' : '-') + ' ' + UTILS.formatarMoeda(t.valor) +
        '</div>' +
      '</div>';
    }).join('') +
    '<button class="btn-ver-todos" type="button" onclick="mudarAba(\'extrato\')">Ver todas →</button>';
  },

  // === EMPTY STATE HELPER ===
  _emptyState: function(emoji, texto, aba) {
    return '<div class="empty-state">' +
      '<div class="empty-emoji">' + emoji + '</div>' +
      '<p class="empty-texto">' + texto + '</p>' +
      (aba ? '<button class="btn-empty-cta" type="button" onclick="mudarAba(\'' + aba + '\')">➕ Começar agora</button>' : '') +
    '</div>';
  },

  // === EXTRATO (aba separada) ===
  renderExtrato: function() {
    // Delega para filtrarExtrato() que é a função unificada
    var container = document.getElementById('lista-transacoes');
    if (!container) return;
    var filtroAtual = container.dataset.filtroAtual || 'todos';
    filtrarExtrato(filtroAtual);
  },

  // === ORÇAMENTO (barras) ===
  _orcamentoListenerAttached: false,

  renderOrcamento: function() {
    var agora = new Date();
    var status = ORCAMENTO.obterStatusTodos(agora.getMonth() + 1, agora.getFullYear());
    var container = document.getElementById('resumo-orcamentos');
    if (!container) return;
    if (status.length === 0) {
      container.innerHTML = this._emptyState('📊', 'Defina limites mensais para acompanhar seus gastos por categoria.', 'orcamento');
      return;
    }
    container.innerHTML = status.map(function(s) {
      var pct = s.percentual;
      var cor = s.status === 'excedido' ? '#ef5350' : s.status === 'alerta' ? '#ffa726' : '#66bb6a';
      return '<div class="orcamento-item" data-categoria="' + UTILS.escapeHtml(s.categoria) + '">' +
        '<div class="orcamento-header"><span class="orcamento-categoria">' + UTILS.escapeHtml(s.categoria) + '</span>' +
        '<span class="orcamento-valor">' + UTILS.formatarMoeda(s.gasto) + ' / ' + UTILS.formatarMoeda(s.limite) + '</span></div>' +
        '<div class="progress-bar"><div class="progress-fill" style="width:' + Math.min(pct, 100) + '%;background-color:' + cor + ';"></div></div>' +
        '<div class="orcamento-footer"><span class="status-' + s.status + '">' + pct + '%</span>' +
        '<button class="btn-small" type="button">Remover</button></div></div>';
    }).join('');

    if (!this._orcamentoListenerAttached) {
      var self = this;
      container.addEventListener('click', function(e) {
        var removeBtn = e.target.closest('.btn-small');
        if (!removeBtn) return;
        var item = removeBtn.closest('[data-categoria]');
        var cat = item ? item.dataset.categoria : null;
        if (!cat) return;
        fpConfirm('Remover limite de "' + cat + '"?', function() {
          ORCAMENTO.deletarLimite(cat);
          self.renderOrcamento();
          UTILS.mostrarToast('Limite removido', 'info');
        });
      });
      this._orcamentoListenerAttached = true;
    }
  },

  renderFormCategories: function() {
    var tipoSelect = document.getElementById('tipo-transacao');
    if (!tipoSelect) return;
    var self = this;
    tipoSelect.addEventListener('change', function(e) { self.atualizarCategorias(e.target.value); });
    this.atualizarCategorias(CONFIG.TIPO_DESPESA);
  },

  atualizarCategorias: function(tipo) {
    var categorias = tipo === CONFIG.TIPO_RECEITA ? CONFIG.CATEGORIAS_RECEITA : CONFIG.CATEGORIAS_DESPESA;
    var select = document.getElementById('categoria-transacao');
    if (!select) return;
    select.innerHTML = '<option value="">Selecione a categoria</option>' +
      categorias.map(function(cat) { return '<option value="' + cat + '">' + cat + '</option>'; }).join('');
  },

  atualizarHeaderSaldo: function() {
    var saldo = UTILS.calcularSaldo(TRANSACOES.obter({}));
    var el = document.getElementById('saldo-header-txt');
    if (el) el.textContent = 'Saldo: ' + UTILS.formatarMoeda(saldo);
  }
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = RENDER;
}
