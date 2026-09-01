/**
 * init-billing.js — UI de planos, paywall e assinatura Stripe
 */
const INIT_BILLING = {
  _overlay: null,
  _focusTrap: null,
  _interval: 'monthly',
  // Business fica no backend/Play Console, mas oculto no paywall até os recursos existirem.
  SHOW_BUSINESS_PLAN: false,

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
          UTILS.mostrarToast('Pronto, você está no Pro.', 'success');
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
      var label = BILLING.getStatusLabel();
      var usage = BILLING.getUsageLabel ? BILLING.getUsageLabel() : '';
      el.textContent = usage ? label + ' · ' + usage : label;
    } else {
      el.textContent = 'Gratuito · uso local';
    }
    this.refreshUsageBanner();
    this.refreshExportButtons();
  },

  refreshUsageBanner: function() {
    var el = document.getElementById('fp-usage-banner');
    if (!el || typeof BILLING === 'undefined') return;
    if (!BILLING.shouldEnforceLimits || !BILLING.shouldEnforceLimits()) {
      el.hidden = true;
      el.innerHTML = '';
      return;
    }
    var usage = BILLING.getUsage();
    var maxT = usage.maxTransPerMonth === Infinity ? 0 : usage.maxTransPerMonth;
    var pct = maxT ? Math.round((100 * usage.transactionsThisMonth) / maxT) : 0;
    var perto = pct >= 80;
    var msg = BILLING.getUsageLabel();
    el.hidden = false;
    el.className = 'fp-usage-banner' + (perto ? ' fp-usage-banner--warn' : '');
    el.innerHTML =
      '<div class="fp-usage-banner-text">' +
        '<strong>Plano gratuito na nuvem</strong> · ' + UTILS.escapeHtml(msg) +
        (perto ? ' — perto do limite' : '') +
      '</div>' +
      '<button type="button" class="btn-primario btn-sm" data-action="abrir-paywall">Ver Pro</button>';
    if (typeof renderLucideIcons === 'function') renderLucideIcons(el);
  },

  refreshExportButtons: function() {
    var bloqueado = typeof BILLING !== 'undefined' && BILLING.isCloudUser && BILLING.isCloudUser()
      && BILLING.canUse && !BILLING.canUse('reportExport');
    document.querySelectorAll('[data-action="exportar-excel"], [data-action="exportar-pdf"]').forEach(function(btn) {
      if (bloqueado) {
        btn.setAttribute('aria-disabled', 'true');
        btn.classList.add('perfil-card--disabled');
        btn.title = 'Exportação disponível no plano Pro';
      } else {
        btn.removeAttribute('aria-disabled');
        btn.classList.remove('perfil-card--disabled');
        btn.removeAttribute('title');
      }
    });
  },

  abrirPaywall: function(contextMsg) {
    var self = this;

    // Sem backend nao ha o que assinar, e mostrar preco com botao "Assinar"
    // dentro do app Android e justamente o que a politica de pagamentos do
    // Google proibe onde o link externo nao foi liberado. Guarda de profundidade:
    // a entrada pela aba Perfil ja some por data-requer-nuvem, mas ocr.js e
    // previsao.js tambem chamam este metodo.
    if (typeof DADOS !== 'undefined' && typeof DADOS._nuvemAtiva === 'function'
        && !DADOS._nuvemAtiva()) {
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
          '<span class="billing-badge"><i data-lucide="sparkles" aria-hidden="true"></i> FinançasPro</span>' +
          '<h2 id="billing-title">O Pro tira os limites</h2>' +
          '<p class="billing-lead" id="billing-lead">' + UTILS.escapeHtml(contextMsg || 'Contas ilimitadas, relatórios do ano inteiro e backup automático. Cancela quando quiser.') + '</p>' +
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
      if (action === 'billing-restaurar') self._restaurarPlay(ov);
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
   * O selo era fixo em "-17%" no seletor de periodicidade, mas cada plano tem
   * seu proprio desconto anual: hoje o Pro da ~36% (12 x 16,90 = 202,80 contra
   * 129,00) e o Business ~17% (12 x 79,90 = 958,80 contra 799,00). Calcular por
   * plano faz o numero seguir o preco, em vez de o preco precisar lembrar do
   * numero.
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
        if (plan.tier === 'BUSINESS' && !self.SHOW_BUSINESS_PLAN) return;
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
    var usePlay = typeof PLAY_BILLING !== 'undefined' && PLAY_BILLING.isAvailable();
    var html = usePlay
      ? '<p class="billing-note">Pagamento via Google Play. Trial de 14 dias no Pro.</p>'
      : '<p class="billing-note">Pagamento seguro via Stripe Checkout. Trial de 14 dias no Pro.</p>';
    if (usePlay) {
      html += '<button type="button" class="btn-secundario" data-action="billing-restaurar">Restaurar compras</button>';
      html += '<p class="billing-restore-hint">Use se reinstalou o app ou trocou de celular e já tinha assinatura ativa.</p>';
    } else if (hasStripe) {
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

    var onSuccess = function() {
      UTILS.mostrarToast('Assinatura atualizada', 'success');
      self._renderPlans(ov);
      self._renderFooter(ov);
      self.refreshPlanoCard();
      if (typeof INIT_CONFIG !== 'undefined' && INIT_CONFIG.refreshPerfil) INIT_CONFIG.refreshPerfil();
    };

    var onError = function(err) {
      UTILS.mostrarToast(err.message || 'Falha ao assinar', 'error');
      if (btn) {
        btn.disabled = false;
        btn.textContent = 'Assinar';
      }
    };

    if (typeof PLAY_BILLING !== 'undefined' && PLAY_BILLING.isAvailable()) {
      var productId = PLAY_BILLING.productIdForTier(tier, this._interval);
      if (!productId) {
        onError(new Error('Plano indisponível no Google Play'));
        return;
      }
      PLAY_BILLING.purchase(productId).then(onSuccess).catch(onError);
      return;
    }

    BILLING.checkoutOrSubscribe(tier, this._interval).then(function(result) {
      if (result && result.redirected) return;
      onSuccess();
    }).catch(onError);
  },

  _restaurarPlay: function(ov) {
    var self = this;
    if (typeof PLAY_BILLING === 'undefined' || !PLAY_BILLING.isAvailable()) return;
    PLAY_BILLING.restore().then(function() {
      UTILS.mostrarToast('Compras restauradas', 'success');
      self._renderPlans(ov);
      self._renderFooter(ov);
      self.refreshPlanoCard();
    }).catch(function(err) {
      UTILS.mostrarToast(err.message || 'Nada para restaurar', 'info');
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
    if (typeof PLAY_BILLING !== 'undefined' && PLAY_BILLING.isAvailable()) {
      BILLING.cancelSubscription().then(function() {
        UTILS.mostrarToast('Abra o Google Play para gerenciar ou cancelar a assinatura.', 'info');
        self._renderFooter(ov);
      });
      return;
    }
    BILLING.cancelSubscription().then(function() {
      UTILS.mostrarToast('Cancelado. Você continua no Pro até o fim do período, e seus dados ficam aqui depois disso.', 'info');
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
