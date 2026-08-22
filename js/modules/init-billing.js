/**
 * init-billing.js — UI de planos, paywall e assinatura Stripe
 */
const INIT_BILLING = {
  _overlay: null,
  _focusTrap: null,
  _interval: 'monthly',

  init: function() {
    if (typeof BILLING !== 'undefined') BILLING.init();
    this.refreshPlanoCard();
    this._handleBillingReturn();
  },

  _handleBillingReturn: function() {
    if (typeof window === 'undefined' || typeof URLSearchParams === 'undefined') return;
    var params = new URLSearchParams(window.location.search);
    var status = params.get('billing');
    if (!status) return;

    var cleanUrl = function() {
      var u = new URL(window.location.href);
      u.searchParams.delete('billing');
      u.searchParams.delete('session_id');
      window.history.replaceState({}, '', u.pathname + u.search + u.hash);
    };

    if (status === 'success' && typeof BILLING !== 'undefined' && BILLING.sync) {
      BILLING.sync().then(function() {
        if (typeof UTILS !== 'undefined' && UTILS.mostrarToast) {
          UTILS.mostrarToast('Assinatura confirmada! Bem-vindo ao plano Pro.', 'success');
        }
        cleanUrl();
      }).catch(function() { cleanUrl(); });
      return;
    }

    if (status === 'cancel' && typeof UTILS !== 'undefined' && UTILS.mostrarToast) {
      UTILS.mostrarToast('Checkout cancelado.', 'info');
    }
    cleanUrl();
  },

  refreshPlanoCard: function() {
    var el = document.getElementById('perfil-plano-subtitle');
    if (!el) return;
    if (typeof BILLING !== 'undefined') {
      el.textContent = BILLING.getStatusLabel();
    } else {
      el.textContent = 'Gratuito · uso local';
    }
  },

  abrirPaywall: function(contextMsg) {
    var self = this;

    // Sem backend nao ha o que assinar, e mostrar preco com botao "Assinar"
    // dentro do app Android e justamente o que a politica de pagamentos do
    // Google proibe onde o link externo nao foi liberado. Guarda de profundidade:
    // a entrada pela aba Perfil ja some por data-requer-nuvem, mas ocr.js e
    // previsao.js tambem chamam este metodo.
    if (typeof DADOS !== 'undefined' && typeof DADOS._apiAtiva === 'function'
        && !DADOS._apiAtiva()) {
      return;
    }

    this._fecharPaywall();

    var ov = document.createElement('div');
    ov.className = 'modal-overlay billing-overlay';
    ov.setAttribute('role', 'dialog');
    ov.setAttribute('aria-modal', 'true');
    ov.setAttribute('aria-labelledby', 'billing-title');
    ov.innerHTML =
      '<div class="modal-box billing-modal">' +
        '<button type="button" class="billing-close" data-action="billing-fechar" aria-label="Fechar">&times;</button>' +
        '<div class="billing-header">' +
          '<span class="billing-badge"><i data-lucide="sparkles" aria-hidden="true"></i> FinançasPro Cloud</span>' +
          '<h2 id="billing-title">Escolha seu plano</h2>' +
          '<p class="billing-lead" id="billing-lead">' + UTILS.escapeHtml(contextMsg || 'Desbloqueie IA, OCR e sincronização na nuvem.') + '</p>' +
        '</div>' +
        '<div class="billing-interval" role="group" aria-label="Periodicidade">' +
          '<button type="button" class="billing-interval-btn ativo" data-action="billing-interval" data-interval="monthly">Mensal</button>' +
          '<button type="button" class="billing-interval-btn" data-action="billing-interval" data-interval="yearly">Anual <span class="billing-save" id="billing-save-badge" hidden></span></button>' +
        '</div>' +
        '<div class="billing-plans" id="billing-plans"><p class="billing-loading">Carregando planos…</p></div>' +
        '<div class="billing-footer" id="billing-footer"></div>' +
      '</div>';

    document.body.appendChild(ov);
    this._overlay = ov;

    ov.addEventListener('click', function(e) {
      if (e.target === ov) self._fecharPaywall();
    });
    ov.addEventListener('click', function(e) {
      var btn = e.target.closest('[data-action]');
      if (!btn) return;
      var action = btn.dataset.action;
      if (action === 'billing-fechar') self._fecharPaywall();
      if (action === 'billing-interval') self._setInterval(btn.dataset.interval, ov);
      if (action === 'billing-assinar') self._assinar(btn.dataset.tier, ov);
      if (action === 'billing-portal') self._portal();
      if (action === 'billing-cancelar') self._cancelar(ov);
      if (action === 'billing-login') self._abrirLogin();
    });

    ov.addEventListener('keydown', function(e) {
      if (e.key === 'Escape') {
        e.preventDefault();
        self._fecharPaywall();
      }
    });

    if (typeof FocusTrap !== 'undefined') {
      this._focusTrap = new FocusTrap(ov);
      this._focusTrap.activate();
    }

    if (typeof renderLucideIconsNow === 'function') renderLucideIconsNow(ov);

    this._renderPlans(ov);
    this._renderFooter(ov);
  },

  _setInterval: function(interval, ov) {
    this._interval = interval || 'monthly';
    ov.querySelectorAll('.billing-interval-btn').forEach(function(btn) {
      btn.classList.toggle('ativo', btn.dataset.interval === interval);
    });
    this._renderPlans(ov);
  },

  /**
   * Desconto do plano anual sobre 12 meses, em pontos percentuais inteiros.
   *
   * O selo era fixo em "-17%" no seletor de periodicidade. Batia com o Business
   * (12 x 99,90 = 1.198,80 contra 999,00) e errava no Pro, que estava a 119,00
   * sobre 12 x 16,90 = 202,80, ou seja 41% -- o app anunciava menos desconto do
   * que dava, justamente no plano de volume. Calcular por plano faz o numero
   * seguir o preco, em vez de o preco precisar lembrar do numero.
   *
   * @returns {number|null} null quando o plano nao tem os dois precos
   */
  _descontoAnual: function(plan) {
    if (!plan) return null;
    var mensal = Number(plan.priceMonthly);
    var anual = Number(plan.priceYearly);
    if (!isFinite(mensal) || !isFinite(anual) || mensal <= 0 || anual <= 0) return null;
    var cheio = mensal * 12;
    if (anual >= cheio) return null;
    return Math.round((1 - anual / cheio) * 100);
  },

  /** Maior desconto anual entre os planos pagos, para o selo do seletor. */
  _atualizarSeloAnual: function(ov, plans) {
    var selo = ov.querySelector('#billing-save-badge');
    if (!selo) return;
    var self = this;
    var maior = 0;
    (plans || []).forEach(function(plan) {
      var d = self._descontoAnual(plan);
      if (d && d > maior) maior = d;
    });
    if (!maior) { selo.hidden = true; return; }
    selo.textContent = '−' + maior + '%';
    selo.hidden = false;
  },

  _renderPlans: function(ov) {
    var self = this;
    var container = ov.querySelector('#billing-plans');
    if (!container) return;

    var render = function(plans) {
      var tierAtual = typeof BILLING !== 'undefined' ? BILLING.getTier() : 'FREE';
      var html = '';
      plans.forEach(function(plan) {
        if (!plan || plan.tier === 'FREE') return;
        var price = self._interval === 'yearly' ? plan.priceYearly : plan.priceMonthly;
        var priceLabel = price > 0
          ? 'R$ ' + Number(price).toFixed(2).replace('.', ',') + (self._interval === 'yearly' ? '/ano' : '/mês')
          : 'Grátis';
        var desconto = self._interval === 'yearly' ? self._descontoAnual(plan) : null;
        var isCurrent = tierAtual === plan.tier;
        var features = Array.isArray(plan.features) ? plan.features : [];
        html += '<article class="billing-plan' + (plan.tier === 'PRO' ? ' billing-plan--featured' : '') + (isCurrent ? ' billing-plan--current' : '') + '">' +
          '<h3>' + UTILS.escapeHtml(plan.name || plan.tier) + '</h3>' +
          '<p class="billing-plan-price">' + UTILS.escapeHtml(priceLabel) +
            (desconto ? ' <span class="billing-plan-save">economize ' + desconto + '%</span>' : '') +
          '</p>' +
          '<ul class="billing-plan-features">' +
            features.map(function(frozen) {
              return '<li><i data-lucide="check" aria-hidden="true"></i> ' + UTILS.escapeHtml(frozen) + '</li>';
            }).join('') +
          '</ul>' +
          (isCurrent
            ? '<span class="billing-plan-current-label">Plano atual</span>'
            : '<button type="button" class="btn-primario billing-plan-btn" data-action="billing-assinar" data-tier="' + UTILS.escapeHtml(plan.tier) + '">' +
                (tierAtual === 'FREE' ? 'Assinar' : 'Mudar plano') +
              '</button>') +
        '</article>';
      });
      container.innerHTML = html || '<p class="billing-empty">Nenhum plano pago disponível no momento.</p>';
      self._atualizarSeloAnual(ov, plans);
      if (typeof renderLucideIconsNow === 'function') renderLucideIconsNow(container);
    };

    if (typeof BILLING !== 'undefined') {
      BILLING.listPlans().then(render).catch(function() { render(BILLING.STATIC_PLANS); });
    } else {
      render([]);
    }
  },

  _renderFooter: function(ov) {
    var footer = ov.querySelector('#billing-footer');
    if (!footer) return;

    if (typeof BILLING === 'undefined' || !BILLING.isCloudUser()) {
      footer.innerHTML =
        '<p class="billing-note">Faça login na nuvem para assinar e sincronizar seus dados entre dispositivos.</p>' +
        '<button type="button" class="btn-primario" data-action="billing-login">Entrar ou criar conta</button>' +
        '<p class="billing-local-note">Sem login, o app continua funcionando offline com todos os recursos locais.</p>';
      return;
    }

    var sub = BILLING._cache.subscription;
    var hasStripe = sub && sub.stripeCustomerId;
    var html = '<p class="billing-note">Pagamento seguro via Stripe Checkout. Trial de 14 dias no Pro.</p>';
    if (hasStripe) {
      html += '<button type="button" class="btn-secundario" data-action="billing-portal">Gerenciar pagamento</button>';
    }
    if (sub && sub.plan && sub.plan.tier !== 'FREE' && !sub.cancelAtPeriodEnd) {
      html += ' <button type="button" class="btn-ghost billing-cancel-link" data-action="billing-cancelar">Cancelar assinatura</button>';
    }
    footer.innerHTML = html;
  },

  _assinar: function(tier, ov) {
    var self = this;
    if (typeof BILLING === 'undefined' || !BILLING.isCloudUser()) {
      this._abrirLogin();
      return;
    }
    if (!tier || tier === 'FREE') return;

    var btn = ov.querySelector('[data-tier="' + tier + '"]');
    if (btn) {
      btn.disabled = true;
      btn.textContent = 'Processando…';
    }

    BILLING.checkoutOrSubscribe(tier, this._interval).then(function(result) {
      if (result && result.redirected) return;
      UTILS.mostrarToast('Assinatura atualizada com sucesso!', 'success');
      self._renderPlans(ov);
      self._renderFooter(ov);
      self.refreshPlanoCard();
      if (typeof INIT_CONFIG !== 'undefined' && INIT_CONFIG.refreshPerfil) INIT_CONFIG.refreshPerfil();
    }).catch(function(err) {
      UTILS.mostrarToast(err.message || 'Falha ao assinar', 'error');
      if (btn) {
        btn.disabled = false;
        btn.textContent = 'Assinar';
      }
    });
  },

  _portal: function() {
    if (typeof BILLING === 'undefined') return;
    BILLING.openPortal().catch(function(err) {
      UTILS.mostrarToast(err.message || 'Portal indisponível', 'error');
    });
  },

  _cancelar: function(ov) {
    var self = this;
    if (typeof INIT_MODALS !== 'undefined' && INIT_MODALS.confirm) {
      INIT_MODALS.confirm('Cancelar assinatura ao final do período atual?', function() {
        self._doCancel(ov);
      });
      return;
    }
    if (window.confirm('Cancelar assinatura ao final do período atual?')) {
      this._doCancel(ov);
    }
  },

  _doCancel: function(ov) {
    var self = this;
    BILLING.cancelSubscription().then(function() {
      UTILS.mostrarToast('Assinatura será cancelada ao final do período.', 'info');
      self._renderFooter(ov);
      self.refreshPlanoCard();
    }).catch(function(err) {
      UTILS.mostrarToast(err.message || 'Falha ao cancelar', 'error');
    });
  },

  _abrirLogin: function() {
    this._fecharPaywall();
    if (typeof abrirAuthOverlay === 'function') {
      abrirAuthOverlay();
    } else if (typeof setupAuthUI === 'function') {
      var overlay = document.getElementById('auth-overlay');
      if (overlay) overlay.style.display = 'flex';
    }
  },

  _fecharPaywall: function() {
    if (this._focusTrap) {
      this._focusTrap.deactivate();
      this._focusTrap = null;
    }
    if (this._overlay && this._overlay.parentNode) {
      this._overlay.parentNode.removeChild(this._overlay);
    }
    this._overlay = null;
  },
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = INIT_BILLING;
}
