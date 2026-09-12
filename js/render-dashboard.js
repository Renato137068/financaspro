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
  DashboardRenderer._resumoMes = function(mes, ano, opts) {
    var ctx = this._ctx;
    var vazio = { saldo: 0, receitas: 0, despesas: 0 };
    if (!ctx) return vazio;
    if (!ctx.resumoCache) ctx.resumoCache = {};
    var key = ano + '-' + mes + (opts && opts.ate ? '@' + opts.ate : '');
    if (Object.prototype.hasOwnProperty.call(ctx.resumoCache, key)) {
      return ctx.resumoCache[key];
    }
    var resumo = (ctx.tx && typeof ctx.tx.obterResumoMes === 'function')
      ? ctx.tx.obterResumoMes(mes, ano, opts)
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

  // ============================================================
  // HOOKS DE PÓS-RENDER (P2.5) — módulos INIT_* se inscrevem via onRender
  // ============================================================

  var _onRenderFns = [];

  /**
   * Inscreve callback chamado ao final de cada render() do dashboard.
   * @param {Function} fn
   * @param {number} [ordem] — menor roda antes (padrão: ordem de inscrição)
   */
  DashboardRenderer.onRender = function(fn, ordem) {
    if (typeof fn !== 'function') return;
    _onRenderFns.push({
      fn: fn,
      ordem: typeof ordem === 'number' ? ordem : (_onRenderFns.length + 1) * 10
    });
    _onRenderFns.sort(function(a, b) { return a.ordem - b.ordem; });
  };

  DashboardRenderer.render = function() {
    /* Leituras de dados em bloco — evita chamadas duplicadas nos sub-renderers */
    var agora  = new Date();
    var mes    = agora.getMonth() + 1;
    var ano    = agora.getFullYear();
    var hoje   = (typeof UTILS !== 'undefined' && UTILS.dataLocalIso)
      ? UTILS.dataLocalIso(agora)
      : agora.toISOString().slice(0, 10);
    var tx     = _dadosTransacoes();
    var orc    = _dadosOrcamento();
    var config = (typeof DADOS !== 'undefined' && DADOS.getConfig) ? DADOS.getConfig() : {};

    this._ctx = {
      agora: agora, mes: mes, ano: ano, hoje: hoje, tx: tx, orc: orc, config: config,
      resumoCache: {}
    };
    this._ctx.resumo = this._resumoMes(mes, ano, { ate: hoje });
    this._ctx.resumoProjetado = this._resumoMes(mes, ano);

    this.renderGreeting();
    this.renderOnboarding();
    this.renderCardSaldo();
    this.renderResumo();
    this.renderComparacaoMesAnterior();
    this.renderAlertas();
    this.renderIndicadores();
    this.renderChartEvolucao();
    this.renderChartCategorias();
    this.renderOrcamento();
    this.renderUltimasTransacoes();

    for (var hi = 0; hi < _onRenderFns.length; hi++) {
      try {
        _onRenderFns[hi].fn();
      } catch (e) {
        _reportarErroRender('onRender:' + hi, e, null);
      }
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

  DashboardRenderer.renderOnboarding = function() {
    try {
      var el = document.getElementById('dashboard-onboarding');
      if (!el) return;
      var total = 0;
      if (typeof DADOS !== 'undefined' && DADOS.getTransacoes) {
        total = DADOS.getTransacoes().length;
      } else if (this._ctx && this._ctx.tx && typeof this._ctx.tx.obter === 'function') {
        total = this._ctx.tx.obter({}).length;
      }
      el.hidden = total > 0;
      if (!el.hidden && typeof renderLucideIconsNow === 'function') {
        renderLucideIconsNow(el);
      }
      if (typeof INIT_BILLING !== 'undefined' && INIT_BILLING.refreshUsageBanner) {
        INIT_BILLING.refreshUsageBanner();
      }
    } catch (e) {
      _reportarErroRender('onboarding', e, document.getElementById('dashboard-onboarding'));
    }
  };

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
      lbl.title = 'Soma apenas de lançamentos já ocorridos neste mês, sem contas futuras.';
      info.appendChild(lbl);

      var val = this.create('div', { class: 'saldo-valor' });
      val.textContent = this.money(saldo);
      info.appendChild(val);

      var proj = this._ctx.resumoProjetado;
      if (proj && Math.abs((proj.saldo || 0) - saldo) >= 0.005) {
        var hint = this.create('p', { class: 'saldo-projetado-hint' });
        hint.textContent = 'Projetado no mês (incl. futuros): ' + this.money(proj.saldo || 0);
        hint.title = 'Inclui lançamentos com data futura ainda não realizados.';
        info.appendChild(hint);
      }

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

      // Ritmo de gasto: média diária realizada no mês. Substitui o antigo
      // "Economia do mês", que repetia exatamente a cifra do card de Saldo
      // (receitas − despesas) — redundância apontada na auditoria de UI/UX.
      // O ritmo diário é uma leitura distinta e acionável, e não duplica nada.
      if (resumo.despesas > 0) {
        var diasDecorridos = Math.max(1, ctx.agora.getDate());
        var gastoDia = resumo.despesas / diasDecorridos;
        container.appendChild(UI.Indicador.render(
          'trending-down',
          this.money(gastoDia),
          'Gasto médio/dia',
          'neutro'
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

      // Janela analítica: o gráfico continua com seis colunas, mas as que
      // caem fora do plano vêm esmaecidas em vez de sumirem. Efeito de
      // demonstração — o usuário vê a FORMA do que está perdendo, e é isso
      // que converte; um gráfico que simplesmente encolhe não comunica nada.
      var janela = (typeof BILLING !== 'undefined' && BILLING.janelaAnalitica)
        ? BILLING.janelaAnalitica()
        : { limitado: false, desde: null };

      var dados = [];
      for (var i = 5; i >= 0; i--) {
        var d      = new Date(ctx.ano, ctx.mes - 1 - i, 1);
        var resumo = this._resumoMes(d.getMonth() + 1, d.getFullYear());
        var fora   = janela.limitado && janela.desde && d < janela.desde;
        dados.push({
          mes: NOMES_MESES[d.getMonth()],
          receitas: fora ? 0 : resumo.receitas,
          despesas: fora ? 0 : resumo.despesas,
          bloqueado: !!fora,
          // Altura só para dar silhueta ao mês bloqueado. Nunca é o valor real:
          // o número fica no Pro, a forma fica visível.
          silhueta: fora ? Math.max(0.25, Math.min(0.8, (resumo.despesas || 1) / 10000)) : 0
        });
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

      // Padronização de API: obterRecentes evita sort O(n log n) em históricos grandes
      if (tx && typeof tx.obterRecentes === 'function') {
        transacoes = tx.obterRecentes(3);
      } else if (tx && typeof tx.obter === 'function') {
        transacoes = tx.obter({});
      } else if (tx && typeof tx.getTodas === 'function') {
        transacoes = tx.getTodas();
      }

      if (transacoes.length === 0) {
        _setChildren(el, [UI.EmptyState.render({
          lucide: 'sparkles',
          titulo: 'Seu painel está pronto',
          subtitulo: 'Registre a primeira transação para ver saldo, gráficos e últimas movimentações.',
          aba: 'novo',
          ctaTexto: 'Registrar primeira transação',
          animado: true
        })]);
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
