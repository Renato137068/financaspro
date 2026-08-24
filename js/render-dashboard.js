/**
 * render-dashboard.js - Renderer da seção Dashboard/Resumo
 * Modularizado — usa componentes UI.* de js/components/
 */

(function() {
  var DashboardRenderer = Object.create(RENDERER_BASE);

  // Constantes compartilhadas — fonte única em core/config.js
  var CORES_CATEGORIAS = (typeof CONFIG !== 'undefined' && CONFIG.CORES_CATEGORIAS) ||
    { alimentacao: '#ef6c00', transporte: '#1565c0', moradia: '#2e7d32', saude: '#c62828', lazer: '#7b1fa2', salario: '#12694E', outro: '#78909c' };
  var NOMES_MESES = (typeof CONFIG !== 'undefined' && CONFIG.NOMES_MESES) ||
    ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];

  // ============================================================
  // HELPERS INTERNOS
  // ============================================================

  // Cache de referências para evitar verificações repetidas
  var _cachedTransacoes = null;
  var _cachedOrcamento = null;
  
  // Cache de elementos DOM para evitar consultas repetidas
  var _cachedElements = {};
  var _lastFingerprint = null;
  var _ultimoSaldoAnunciado = null;

  function _fingerprintDados() {
    if (typeof APP_STORE === 'undefined') return null;
    var d = APP_STORE.get('dados') || {};
    var ui = APP_STORE.get('ui') || {};
    return [
      d.transacoesVer || 0,
      d.configVer || 0,
      d.contasVer || 0,
      d.orcamentosVer || 0,
      ui.abaAtiva || 'resumo'
    ].join(':');
  }

  function _nomeExibicao(nome) {
    if (!nome || nome === 'Usuario') return 'Usuário';
    return nome;
  }

  function _dadosTransacoes() {
    if (_cachedTransacoes === null) {
      _cachedTransacoes = (typeof TRANSACOES !== 'undefined' && TRANSACOES.obterResumoMes)
        ? TRANSACOES
        : null;
    }
    return _cachedTransacoes;
  }

  function _dadosOrcamento() {
    if (_cachedOrcamento === null) {
      _cachedOrcamento = (typeof ORCAMENTO !== 'undefined' && ORCAMENTO.obterStatusTodos)
        ? ORCAMENTO
        : null;
    }
    return _cachedOrcamento;
  }

  function _clearEl(el) {
    el.textContent = '';
  }

  function _setChildren(el, nodes) {
    _clearEl(el);
    nodes.forEach(function(n) { if (n) el.appendChild(n); });
  }

  /**
   * P2.3: catch de sub-renderer deixa rastro (console + OBS) e, se houver
   * container próprio, um estado discreto em vez de seção vazia/quebrada.
   */
  var MSG_SECAO_FALHOU = 'Não foi possível carregar esta seção';

  function _reportarErroRender(nome, e, el) {
    console.error('Erro ao renderizar ' + nome + ':', e);
    try {
      if (typeof OBS !== 'undefined' && OBS && typeof OBS.captureError === 'function') {
        OBS.captureError(e, { contexto: 'render:' + nome });
      }
    } catch (_obs) { /* observabilidade nunca pode quebrar o render */ }
    if (el) {
      try {
        el.textContent = MSG_SECAO_FALHOU;
      } catch (_ui) { /* noop */ }
    }
  }

  // ============================================================
  // CONTROLE DE RENDERIZAÇÃO
  // ============================================================

  // Sobrescrever getEl para usar cache de elementos
  DashboardRenderer.getEl = function(id) {
    if (!_cachedElements[id]) {
      _cachedElements[id] = document.getElementById(id);
    }
    return _cachedElements[id];
  };

  // Limpar cache quando necessário (ex: após mudanças no DOM)
  DashboardRenderer.clearElementCache = function() {
    _cachedElements = {};
  };

  /**
   * P2.1: resumo mensal memoizado no ciclo de render (this._ctx.resumoCache).
   * Evita refiltrar TRANSACOES.obterResumoMes para o mesmo ano-mes.
   */
  DashboardRenderer._resumoMes = function(mes, ano) {
    var ctx = this._ctx;
    var vazio = { saldo: 0, receitas: 0, despesas: 0 };
    if (!ctx) return vazio;
    if (!ctx.resumoCache) ctx.resumoCache = {};
    var key = ano + '-' + mes;
    if (Object.prototype.hasOwnProperty.call(ctx.resumoCache, key)) {
      return ctx.resumoCache[key];
    }
    var resumo = (ctx.tx && typeof ctx.tx.obterResumoMes === 'function')
      ? ctx.tx.obterResumoMes(mes, ano)
      : vazio;
    ctx.resumoCache[key] = resumo;
    return resumo;
  };

  DashboardRenderer.shouldRender = function() {
    if (typeof APP_STORE !== 'undefined') {
      var aba = APP_STORE.get('ui.abaAtiva');
      if (aba && aba !== 'resumo') return false;
    }
    var fp = _fingerprintDados();
    if (fp && fp === _lastFingerprint) return false;
    return true;
  };

  // ============================================================
  // MÉTODO PRINCIPAL
  // ============================================================

  DashboardRenderer.render = function() {
    /* Leituras de dados em bloco — evita chamadas duplicadas nos sub-renderers */
    var agora  = new Date();
    var mes    = agora.getMonth() + 1;
    var ano    = agora.getFullYear();
    var tx     = _dadosTransacoes();
    var orc    = _dadosOrcamento();
    var config = (typeof DADOS !== 'undefined' && DADOS.getConfig) ? DADOS.getConfig() : {};

    this._ctx = {
      agora: agora, mes: mes, ano: ano, tx: tx, orc: orc, config: config,
      resumoCache: {}
    };
    this._ctx.resumo = this._resumoMes(mes, ano);

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
    if (typeof INIT_METAS !== 'undefined' && INIT_METAS.renderResumo) {
      INIT_METAS.renderResumo();
    }
    if (typeof INIT_CONTAS_PAGAR !== 'undefined') {
      INIT_CONTAS_PAGAR.render();
      INIT_CONTAS_PAGAR.renderResumo();
    }
    if (typeof INIT_ASSINATURAS !== 'undefined') {
      INIT_ASSINATURAS.renderResumo();
    }
    if (typeof INIT_PATRIMONIO !== 'undefined') {
      INIT_PATRIMONIO.renderResumo();
    }
    if (typeof INIT_RELATORIOS !== 'undefined' && INIT_RELATORIOS.render) {
      INIT_RELATORIOS.render();
    }

    this._ctx = null;

    /* Fase 7: Remove skeleton após primeiro render */
    if (typeof SKELETON !== 'undefined' && SKELETON.esconder) {
      SKELETON.esconder();
    }

    if (typeof renderLucideIconsNow === 'function') {
      renderLucideIconsNow();
    }

    var abaResumo = document.getElementById('aba-resumo');
    if (abaResumo) abaResumo.setAttribute('data-dashboard-ready', '1');

    _lastFingerprint = _fingerprintDados();
  };

  // ============================================================
  // SUB-RENDERERS
  // ============================================================

  DashboardRenderer.renderGreeting = function() {
    try {
      var el = this.getEl('dashboard-greeting');
      if (!el) return;

      var ctx    = this._ctx;
      var nome   = _nomeExibicao(ctx.config.nome);
      var hora   = ctx.agora.getHours();
      var saudacao = hora < 12 ? 'Bom dia' : hora < 18 ? 'Boa tarde' : 'Boa noite';
      var mesNome  = ctx.agora.toLocaleDateString('pt-BR', { month: 'long' });
      mesNome = mesNome.charAt(0).toUpperCase() + mesNome.slice(1);

      var container = this.create('div', { class: 'greeting-text greeting-text--resumo' });

      var hello = this.create('span', { class: 'greeting-hello' });
      hello.textContent = saudacao + ', ' + nome + '!';
      container.appendChild(hello);

      var sub = this.create('span', { class: 'greeting-context' });
      sub.textContent = 'Resumo de ' + mesNome + ' ' + ctx.ano;
      container.appendChild(sub);

      _clearEl(el);
      el.appendChild(container);
    } catch (e) {
      _reportarErroRender('greeting', e, el);
    }
  };

  DashboardRenderer.renderCardSaldo = function() {
    try {
      var el = this.getEl('card-saldo-principal');
      if (!el) return;

      var saldo    = this._ctx.resumo.saldo || 0;
      var positivo = saldo >= 0;

      el.className = 'card-saldo-principal ' + (positivo ? 'saldo-positivo' : 'saldo-negativo');
      _clearEl(el);

      var emojiEl = this.create('div', { class: 'saldo-emoji' });
      emojiEl.innerHTML = positivo ? '<i data-lucide="trending-up" aria-hidden="true"></i>' : '<i data-lucide="trending-down" aria-hidden="true"></i>';
      el.appendChild(emojiEl);

      // Re-renderizar ícones Lucide dinâmicos

      var info = this.create('div', { class: 'saldo-info' });
      var lbl  = this.create('div', { class: 'saldo-label' });
      lbl.textContent = 'Saldo do mês (realizado)';
      info.appendChild(lbl);

      var val = this.create('div', { class: 'saldo-valor' });
      val.textContent = this.money(saldo);
      info.appendChild(val);

      el.appendChild(info);

      // Anuncia só quando o valor numérico muda — o cartão visual atualiza
      // sempre, mas o leitor de tela não precisa reler a cada re-render.
      var anuncio = document.getElementById('saldo-anuncio');
      if (anuncio && saldo !== _ultimoSaldoAnunciado) {
        _ultimoSaldoAnunciado = saldo;
        anuncio.textContent = 'Saldo do mês (realizado): ' + this.money(saldo);
      }
    } catch (e) {
      _reportarErroRender('cardSaldo', e, el);
    }
  };

  DashboardRenderer.renderResumo = function() {
    try {
      var resumo = this._ctx.resumo;
      var elRec  = this.getEl('resumo-receitas');
      var elDesp = this.getEl('resumo-despesas');
      if (elRec)  elRec.textContent  = this.money(resumo.receitas  || 0);
      if (elDesp) elDesp.textContent = this.money(resumo.despesas  || 0);
    } catch (e) {
      _reportarErroRender('resumo', e, elRec || elDesp);
    }
  };

  DashboardRenderer.renderComparacaoMesAnterior = function() {
    try {
      var ctx = this._ctx;
      var tx  = ctx.tx;
      if (!tx) return;

      var mesAnt  = ctx.mes === 1 ? 12 : ctx.mes - 1;
      var anoAnt  = ctx.mes === 1 ? ctx.ano - 1 : ctx.ano;

      var atual    = ctx.resumo;
      var anterior = this._resumoMes(mesAnt, anoAnt);

      var elRec  = this.getEl('comp-receitas');
      var elDesp = this.getEl('comp-despesas');

      if (elRec)  elRec.innerHTML  = UI.ComparacaoMes.html(atual.receitas,  anterior.receitas);
      if (elDesp) elDesp.innerHTML = UI.ComparacaoMes.html(atual.despesas, anterior.despesas, true);
    } catch (e) {
      _reportarErroRender('comparacaoMesAnterior', e, elRec || elDesp);
    }
  };

  DashboardRenderer.renderAlertas = function() {
    try {
      var el = this.getEl('dashboard-alertas');
      if (!el) return;

      var ctx = this._ctx;
      var orc = ctx.orc;
      if (!orc) { _clearEl(el); return; }

      var status  = orc.obterStatusTodos(ctx.mes, ctx.ano);
      var alertas = status.filter(function(s) { return s.status === 'excedido' || s.status === 'alerta'; });

      var btnOrc = document.querySelector('.nav-btn[data-aba="orcamento"]');
      if (btnOrc) btnOrc.classList.toggle('nav-alerta', alertas.length > 0);

      _clearEl(el);
      if (alertas.length === 0) return;

      var excedidos = alertas.filter(function(s) { return s.status === 'excedido'; });
      var avisos    = alertas.filter(function(s) { return s.status === 'alerta'; });
      var card = UI.AlertaCard.render(excedidos, avisos);
      if (card) el.appendChild(card);
    } catch (e) {
      _reportarErroRender('alertas', e, el);
    }
  };

  DashboardRenderer.renderIndicadores = function() {
    try {
      var el = this.getEl('dashboard-indicadores');
      if (!el) return;

      var ctx    = this._ctx;
      var resumo = ctx.resumo;
      var renda  = ctx.config.renda || 0;
      var diasNoMes     = new Date(ctx.ano, ctx.mes, 0).getDate();
      var diasRestantes = diasNoMes - ctx.agora.getDate();

      var container = this.create('div', { class: 'indicadores-grid' });

      if (renda > 0) {
        var pctGasto = (resumo.despesas / renda) * 100;
        var tipo1 = pctGasto > 100 ? 'negativo' : 'positivo';
        container.appendChild(UI.Indicador.render(
          'wallet',
          pctGasto.toFixed(0) + '% da renda',
          pctGasto > 100 ? 'Indicador alerta' : 'Indicador ok',
          tipo1,
          { pct: Math.min(pctGasto, 100), cor: pctGasto > 100 ? '#c9573a' : pctGasto > 80 ? '#c98a1e' : '#2f9c6d' }
        ));
      }

      container.appendChild(UI.Indicador.render(
        'calendar',
        diasRestantes + ' dias restantes',
        diasRestantes < 5 ? 'Fim do mês próximo' : 'Tempo até fechamento',
        diasRestantes < 5 ? 'alerta' : 'neutro'
      ));

      // Base: receitas REAIS do mês (não a renda configurada). Quem tem renda
      // variável ou lança valores diferentes do config veria um número enganoso.
      if (resumo.receitas > 0 || resumo.despesas > 0) {
        var economia = resumo.receitas - resumo.despesas;
        container.appendChild(UI.Indicador.render(
          economia >= 0 ? 'trending-up' : 'trending-down',
          this.money(Math.abs(economia)),
          economia >= 0 ? 'Economia do mês' : 'Déficit do mês',
          economia >= 0 ? 'positivo' : 'negativo'
        ));
      }

      _clearEl(el);
      el.appendChild(container);
    } catch (e) {
      _reportarErroRender('indicadores', e, el);
    }
  };

  DashboardRenderer.renderChartEvolucao = function() {
    try {
      var el = this.getEl('chart-evolucao');
      if (!el) return;

      // Lazy render: só renderiza se o painel estiver visível
      var panel = document.getElementById('graficos-panel');
      if (panel && panel.style.display === 'none') {
        return;
      }

      var ctx = this._ctx;
      var tx  = ctx.tx;
      if (!tx) {
        el.innerHTML = UI.EmptyState.html({ lucide: 'trending-up', titulo: 'Registre transações para ver a evolução dos seus gastos ao longo dos meses.', aba: 'novo' });
        return;
      }

      var dados = [];
      for (var i = 5; i >= 0; i--) {
        var d      = new Date(ctx.ano, ctx.mes - 1 - i, 1);
        var resumo = this._resumoMes(d.getMonth() + 1, d.getFullYear());
        dados.push({ mes: NOMES_MESES[d.getMonth()], receitas: resumo.receitas, despesas: resumo.despesas });
      }

      var temDados = dados.some(function(d) { return d.receitas > 0 || d.despesas > 0; });
      if (!temDados) {
        el.innerHTML = UI.EmptyState.html({ lucide: 'trending-up', titulo: 'Registre transações para ver a evolução dos seus gastos ao longo dos meses.', aba: 'novo' });
        return;
      }

      _clearEl(el);
      el.appendChild(UI.BarChart6M.render(dados));
    } catch (e) {
      _reportarErroRender('chartEvolucao', e, el);
    }
  };

  DashboardRenderer.renderChartCategorias = function() {
    try {
      var el = this.getEl('chart-categorias');
      if (!el) return;

      // Lazy render: só renderiza se o painel estiver visível
      var panel = document.getElementById('graficos-panel');
      if (panel && panel.style.display === 'none') {
        return;
      }

      var ctx = this._ctx;
      var tx  = ctx.tx;
      if (!tx || !tx.obterResumoPorCategoria) {
        el.innerHTML = UI.EmptyState.html({ lucide: 'pie-chart', titulo: 'Registre despesas para ver a distribuição por categoria.', aba: 'novo' });
        return;
      }

      var resumoCat = tx.obterResumoPorCategoria(ctx.mes, ctx.ano);
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
        el.innerHTML = UI.EmptyState.html({ lucide: 'pie-chart', titulo: 'Registre despesas para ver a distribuição por categoria.', aba: 'novo' });
        return;
      }

      cats.sort(function(a, b) { return b.valor - a.valor; });

      _clearEl(el);
      el.appendChild(UI.DonutChart.render(cats, totalDesp));
    } catch (e) {
      _reportarErroRender('chartCategorias', e, el);
    }
  };

  DashboardRenderer.renderOrcamento = function() {
    try {
      var el = this.getEl('resumo-orcamentos');
      if (!el) return;

      var ctx = this._ctx;
      var orc = ctx.orc;
      if (!orc) {
        _setChildren(el, [UI.EmptyState.render({ lucide: 'bar-chart', titulo: 'Defina limites mensais para acompanhar seus gastos por categoria.', aba: 'orcamento' })]);
        return;
      }

      var status = orc.obterStatusTodos(ctx.mes, ctx.ano);

      if (status.length === 0) {
        _setChildren(el, [UI.EmptyState.render({ lucide: 'bar-chart', titulo: 'Defina limites mensais para acompanhar seus gastos por categoria.', aba: 'orcamento' })]);
        return;
      }

      var lista = this.create('div', { class: 'orcamento-lista-resumo' });
      status.slice(0, 3).forEach(function(s) {
        lista.appendChild(UI.CardOrcamento.renderResumo(s));
      });

      _clearEl(el);
      el.appendChild(lista);
    } catch (e) {
      _reportarErroRender('orcamento', e, el);
    }
  };

  DashboardRenderer.renderUltimasTransacoes = function() {
    try {
      var el = this.getEl('resumo-list');
      if (!el) return;

      var tx = this._ctx.tx;
      var transacoes = [];

      // Padronização de API: usar obter() se disponível, senão getTodas()
      if (tx && typeof tx.obter === 'function') {
        transacoes = tx.obter({});
      } else if (tx && typeof tx.getTodas === 'function') {
        transacoes = tx.getTodas();
      }

      if (transacoes.length === 0) {
        _setChildren(el, [UI.EmptyState.render({ lucide: 'clock', titulo: 'Nenhuma transação registrada ainda. Comece adicionando sua primeira!', aba: 'novo' })]);
        return;
      }

      /* DocumentFragment: uma única inserção no DOM em vez de N */
      var frag  = document.createDocumentFragment();
      var lista = this.create('div', { class: 'lista-transacoes-resumo' });
      transacoes.slice(0, 3).forEach(function(t) {
        lista.appendChild(UI.CardTransacao.renderResumo(t));
      });
      frag.appendChild(lista);

      _clearEl(el);
      el.appendChild(frag);
    } catch (e) {
      _reportarErroRender('ultimasTransacoes', e, el);
    }
  };

  // ============================================================
  // REGISTRAR NO CORE
  // ============================================================

  if (typeof RENDER_CORE !== 'undefined') {
    RENDER_CORE.register('dashboard', DashboardRenderer);
  }

  window.RENDER_DASHBOARD = DashboardRenderer;
})();
