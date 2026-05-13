/**
 * alertas.js — Sistema de alertas automáticos inteligentes
 * v11.0 — Fase 8: alertas baseados em AI_ENGINE
 * Depende de: ai-engine.js, dados.js, utils.js
 */

var ALERTAS = {
  _ativos:         [],
  _dispensados:    null,   // Set lazy-init
  _lastCheck:      0,
  _CHECK_INTERVAL: 5 * 60 * 1000, // Reprocessar a cada 5 min

  // ─────────────────────────────────────────────────────────────────
  // ESTADO PERSISTIDO
  // ─────────────────────────────────────────────────────────────────

  _STORAGE_KEY: 'fp-alertas-dispensados',

  _carregarDispensados: function() {
    if (this._dispensados) return;
    try {
      var raw = localStorage.getItem(this._STORAGE_KEY);
      var arr = raw ? JSON.parse(raw) : [];
      // Limpa dispensados com mais de 7 dias
      var limite = Date.now() - 7 * 24 * 60 * 60 * 1000;
      arr = arr.filter(function(d) { return d.ts > limite; });
      this._dispensados = new Set(arr.map(function(d) { return d.id; }));
      this._dispensadosMeta = arr;
    } catch (e) {
      this._dispensados = new Set();
      this._dispensadosMeta = [];
    }
  },

  _salvarDispensados: function() {
    try {
      localStorage.setItem(this._STORAGE_KEY, JSON.stringify(this._dispensadosMeta || []));
    } catch (e) { /* silencioso */ }
  },

  // ─────────────────────────────────────────────────────────────────
  // VERIFICAÇÃO
  // ─────────────────────────────────────────────────────────────────

  /**
   * Verifica e atualiza os alertas ativos.
   * Respeitando intervalo mínimo entre verificações.
   * @param {boolean} forcar — ignora intervalo mínimo
   * @returns {Array} alertas ativos
   */
  verificar: function(forcar) {
    var agora = Date.now();
    if (!forcar && agora - this._lastCheck < this._CHECK_INTERVAL) {
      return this._ativos;
    }
    this._lastCheck = agora;
    this._carregarDispensados();

    var txs    = typeof DADOS !== 'undefined' ? DADOS.getTransacoes() : [];
    var config = typeof DADOS !== 'undefined' ? DADOS.getConfig() : {};

    // Alertas do AI_ENGINE
    var alertas = AI_ENGINE.gerarAlertas(txs, config);

    // Anomalias de transações
    var anomalias = AI_ENGINE.detectarAnomalias(txs);
    anomalias.forEach(function(a) {
      alertas.push({
        id:        'anomalia-' + a.transacao.id,
        tipo:      'anomalia',
        titulo:    '🔍 Gasto incomum detectado',
        msg:       '"' + (a.transacao.descricao || 'Transação') + '" — ' + a.motivo,
        gravidade: 'media',
        acao:      'editarTransacao',
        parametros: { id: a.transacao.id }
      });
    });

    // Padrões recorrentes não configurados
    var padroes = AI_ENGINE.detectarPadroesRecorrentes(txs);
    padroes.slice(0, 2).forEach(function(p) {
      alertas.push({
        id:        'padrao-' + p.descricao.replace(/\s+/g, '-'),
        tipo:      'padrao',
        titulo:    '🔁 Gasto recorrente detectado',
        msg:       '"' + p.descricao + '" aparece há ' + p.meses + ' meses (média R$ ' + p.valorMedio.toFixed(2).replace('.', ',') + ')',
        gravidade: 'baixa',
        acao:      'marcarRecorrente',
        parametros: { descricao: p.descricao, valor: p.valorMedio }
      });
    });

    // Filtrar dispensados
    var self = this;
    this._ativos = alertas.filter(function(a) {
      return !self._dispensados.has(a.id);
    });

    // Ordenar por gravidade
    var ordem = { critica: 0, alta: 1, media: 2, baixa: 3 };
    this._ativos.sort(function(a, b) {
      return (ordem[a.gravidade] || 9) - (ordem[b.gravidade] || 9);
    });

    return this._ativos;
  },

  /**
   * Dispensa um alerta por ID (persiste por 7 dias).
   * @param {string} id
   */
  dispensar: function(id) {
    this._carregarDispensados();
    this._dispensados.add(id);
    this._dispensadosMeta = (this._dispensadosMeta || []).filter(function(d) { return d.id !== id; });
    this._dispensadosMeta.push({ id: id, ts: Date.now() });
    this._salvarDispensados();
    this._ativos = this._ativos.filter(function(a) { return a.id !== id; });
    this.renderizar();
  },

  // ─────────────────────────────────────────────────────────────────
  // RENDERIZAÇÃO
  // ─────────────────────────────────────────────────────────────────

  /**
   * Renderiza alertas no container #dashboard-alertas.
   */
  renderizar: function() {
    var el = document.getElementById('dashboard-alertas');
    if (!el) return;

    var alertas = this.verificar();

    if (alertas.length === 0) {
      el.innerHTML = '';
      return;
    }

    var self     = this;
    var MAX_SHOW = 4; // Limitar exibição inicial
    var visiveis = alertas.slice(0, MAX_SHOW);
    var extras   = alertas.length - MAX_SHOW;

    var classesGravidade = {
      critica: 'alerta-critico',
      alta:    'alerta-alto',
      media:   'alerta-medio',
      baixa:   'alerta-baixo'
    };

    var html = visiveis.map(function(a) {
      var cls   = classesGravidade[a.gravidade] || 'alerta-baixo';
      var botao = '';
      if (a.acao) {
        botao = '<button class="alerta-btn" ' +
          'data-alerta-acao="' + (typeof UTILS !== 'undefined' ? UTILS.escapeHtml(a.acao) : a.acao) + '" ' +
          'data-alerta-params="' + (typeof UTILS !== 'undefined' ? UTILS.escapeHtml(JSON.stringify(a.parametros || {})) : '{}') + '">' +
          self._acaoLabel(a.acao) +
          '</button>';
      }
      return '<div class="alerta-item ' + cls + '" role="alert">' +
        '<div class="alerta-conteudo">' +
          '<strong class="alerta-titulo">' + a.titulo + '</strong>' +
          '<span class="alerta-msg">' + a.msg + '</span>' +
        '</div>' +
        '<div class="alerta-acoes">' +
          botao +
          '<button class="alerta-dispensar" data-alerta-id="' + (typeof UTILS !== 'undefined' ? UTILS.escapeHtml(a.id) : a.id) + '" ' +
            'aria-label="Dispensar alerta" title="Dispensar">✕</button>' +
        '</div>' +
      '</div>';
    }).join('');

    if (extras > 0) {
      html += '<button class="alertas-ver-mais" id="btn-alertas-ver-mais" data-action="ver-mais-alertas">' +
        '+ ' + extras + ' alerta' + (extras > 1 ? 's' : '') + ' oculto' + (extras > 1 ? 's' : '') +
        '</button>';
    }

    el.innerHTML = html;

    // Event delegation para dispensar e ações
    var existingListener = el._alertaListener;
    if (existingListener) el.removeEventListener('click', existingListener);

    el._alertaListener = function(e) {
      var dispEl = e.target.closest('[data-alerta-id]');
      if (dispEl) {
        self.dispensar(dispEl.dataset.alertaId);
        return;
      }
      var acaoEl = e.target.closest('[data-alerta-acao]');
      if (acaoEl) {
        try {
          var params = JSON.parse(acaoEl.dataset.alertaParams || '{}');
          self._executarAcao(acaoEl.dataset.alertaAcao, params);
        } catch (err) { /* silencioso */ }
        return;
      }
      var verMais = e.target.closest('#btn-alertas-ver-mais');
      if (verMais) {
        self._mostrarTodos();
      }
    };
    el.addEventListener('click', el._alertaListener);
  },

  /**
   * Renderiza painel completo de alertas (modal/seção dedicada).
   * Target: #alertas-painel
   */
  renderizarPainel: function() {
    var el = document.getElementById('alertas-painel');
    if (!el) return;

    var alertas = this.verificar(true); // forçar re-verificação

    if (alertas.length === 0) {
      el.innerHTML = '<div class="alertas-vazio">✅ Nenhum alerta ativo. Finanças em ordem!</div>';
      return;
    }

    var self = this;
    var classesGravidade = {
      critica: 'alerta-critico',
      alta:    'alerta-alto',
      media:   'alerta-medio',
      baixa:   'alerta-baixo'
    };

    el.innerHTML = alertas.map(function(a) {
      var cls   = classesGravidade[a.gravidade] || 'alerta-baixo';
      var botao = '';
      if (a.acao) {
        botao = '<button class="alerta-btn" ' +
          'data-alerta-acao="' + (typeof UTILS !== 'undefined' ? UTILS.escapeHtml(a.acao) : a.acao) + '" ' +
          'data-alerta-params="' + (typeof UTILS !== 'undefined' ? UTILS.escapeHtml(JSON.stringify(a.parametros || {})) : '{}') + '">' +
          self._acaoLabel(a.acao) +
          '</button>';
      }
      return '<div class="alerta-item ' + cls + '">' +
        '<div class="alerta-conteudo">' +
          '<strong class="alerta-titulo">' + a.titulo + '</strong>' +
          '<span class="alerta-msg">' + a.msg + '</span>' +
        '</div>' +
        '<div class="alerta-acoes">' +
          botao +
          '<button class="alerta-dispensar" data-alerta-id="' + (typeof UTILS !== 'undefined' ? UTILS.escapeHtml(a.id) : a.id) + '">✕</button>' +
        '</div>' +
      '</div>';
    }).join('');

    // Delegação de eventos
    var el2 = el;
    var existingListener2 = el2._alertaPainelListener;
    if (existingListener2) el2.removeEventListener('click', existingListener2);
    el2._alertaPainelListener = function(e) {
      var dispEl = e.target.closest('[data-alerta-id]');
      if (dispEl) { self.dispensar(dispEl.dataset.alertaId); self.renderizarPainel(); return; }
      var acaoEl = e.target.closest('[data-alerta-acao]');
      if (acaoEl) {
        try {
          var params = JSON.parse(acaoEl.dataset.alertaParams || '{}');
          self._executarAcao(acaoEl.dataset.alertaAcao, params);
        } catch (err) { /* silencioso */ }
      }
    };
    el2.addEventListener('click', el2._alertaPainelListener);
  },

  // ─────────────────────────────────────────────────────────────────
  // AÇÕES
  // ─────────────────────────────────────────────────────────────────

  _acaoLabel: function(acao) {
    var labels = {
      verExtrato:      '📋 Ver Extrato',
      abrirNovo:       '➕ Registrar',
      lancarRecorrente:'💸 Lançar',
      marcarRecorrente:'🔁 Marcar recorrente',
      editarTransacao: '✏️ Ver transação',
      aumentarLimite:  '⬆️ Ajustar limite'
    };
    return labels[acao] || '→ ' + acao;
  },

  _mostrarTodos: function() {
    var el = document.getElementById('dashboard-alertas');
    if (!el) return;
    var alertas  = this._ativos;
    var self     = this;
    var classesG = { critica: 'alerta-critico', alta: 'alerta-alto', media: 'alerta-medio', baixa: 'alerta-baixo' };
    var esc = function(s) {
      return typeof UTILS !== 'undefined' && typeof UTILS.escapeHtml === 'function'
        ? UTILS.escapeHtml(s) : String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
    };

    var html = alertas.map(function(a) {
      var cls   = classesG[a.gravidade] || 'alerta-baixo';
      var botao = a.acao
        ? '<button class="alerta-btn" data-alerta-acao="' + esc(a.acao) + '" data-alerta-params="' + esc(JSON.stringify(a.parametros || {})) + '">' + self._acaoLabel(a.acao) + '</button>'
        : '';
      return '<div class="alerta-item ' + cls + '">' +
        '<div class="alerta-conteudo"><strong class="alerta-titulo">' + a.titulo + '</strong><span class="alerta-msg">' + esc(a.msg) + '</span></div>' +
        '<div class="alerta-acoes">' + botao + '<button class="alerta-dispensar" data-alerta-id="' + esc(a.id) + '">✕</button></div>' +
      '</div>';
    }).join('');

    el.innerHTML = html;
  },

  _executarAcao: function(acao, params) {
    switch (acao) {
      case 'verExtrato':
        if (typeof APP_STORE !== 'undefined') APP_STORE.ui.setAba('extrato');
        else if (typeof mudarAba === 'function') mudarAba('extrato');
        break;
      case 'abrirNovo':
        if (typeof APP_STORE !== 'undefined') APP_STORE.ui.setAba('novo');
        else if (typeof mudarAba === 'function') mudarAba('novo');
        break;
      case 'lancarRecorrente':
      case 'marcarRecorrente':
        if (typeof APP_STORE !== 'undefined') APP_STORE.ui.setAba('novo');
        if (params && params.descricao) {
          var inp = document.getElementById('entrada-rapida-input');
          if (inp) { inp.value = params.descricao + (params.valor ? ' ' + params.valor : ''); inp.focus(); }
        }
        break;
      case 'editarTransacao':
        if (params && params.id && typeof abrirModalEdicao === 'function') {
          abrirModalEdicao(params.id);
        }
        break;
    }
  },

  // ─────────────────────────────────────────────────────────────────
  // NOTIFICAÇÕES PUSH (toast para alertas críticos)
  // ─────────────────────────────────────────────────────────────────

  /**
   * Mostra toast para alertas críticos/altos não dispensados.
   */
  notificarCriticos: function() {
    var alertas = this.verificar();
    var criticos = alertas.filter(function(a) { return a.gravidade === 'critica' || a.gravidade === 'alta'; });

    criticos.slice(0, 1).forEach(function(a) {
      if (typeof UTILS !== 'undefined' && typeof UTILS.mostrarToast === 'function') {
        UTILS.mostrarToast(a.titulo + ' — ' + a.msg, 'aviso', 5000);
      }
    });
  },

  // ─────────────────────────────────────────────────────────────────
  // INICIALIZAÇÃO
  // ─────────────────────────────────────────────────────────────────

  init: function() {
    this.renderizar();
    this.notificarCriticos();

    // Reprocessar quando transações mudam
    if (typeof APP_STORE !== 'undefined') {
      var self = this;
      APP_STORE.subscribe('dados.transacoesVer', function() {
        self._lastCheck = 0; // força re-verificação
        self.renderizar();
      });
    }

    // Verificação periódica em background (a cada 5 min)
    var self = this;
    setInterval(function() {
      self.renderizar();
    }, this._CHECK_INTERVAL);
  }
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = ALERTAS;
}
