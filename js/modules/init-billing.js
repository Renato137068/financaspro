/**
 * init-billing.js — UI de planos, paywall e assinatura Stripe
 */
const INIT_BILLING = {
  _overlay: null,
  _focusTrap: null,
  _interval: 'monthly',
  // Business sai da vitrine: nao existe ICP para "membros ilimitados e
  // multiplas organizacoes" num app cuja tela principal e o 50/30/20 pessoal.
  // Como ancora de preco tambem nao serve -- ancora so ancora quando e
  // plausivel, e uma terceira coluna sem persona so custa uma decisao a mais
  // no momento em que queremos que o usuario decida uma coisa so.
  // Backend, Edge Functions e tabela de planos continuam intactos.
  SHOW_BUSINESS_PLAN: false,

  init: function() {
    if (typeof BILLING !== 'undefined') BILLING.init();
    this.refreshPlanoCard();
    this._handleBillingReturn();
    this._handleInviteReturn();
    this._consumePendingInvite();
    this._reconciliarPlay();
  },

  // Reconciliacao silenciosa do Google Play.
  //
  // O botao "Restaurar compras" era o UNICO gatilho que reenviava um
  // purchaseToken ao servidor. Como o entitlement do Play so muda quando o
  // play-verify roda, um usuario que cancelasse (ou fosse reembolsado, ou
  // tivesse o cartao recusado) ficava com Pro ate resolver clicar num botao
  // que ele nao tem motivo nenhum para clicar. Aqui reenviamos os tokens
  // ativos no boot: o play-verify renova quando a assinatura segue valida e
  // revoga quando nao segue.
  //
  // Silencioso de proposito -- sem toast em sucesso nem em falha. O botao
  // continua sendo o caminho explicito, para quem reinstalou ou trocou de
  // aparelho e quer ver uma confirmacao.
  _RECONCILIA_KEY: 'fp-play-reconcilia',
  _RECONCILIA_INTERVALO: 6 * 60 * 60 * 1000, // 6h

  _reconciliarPlay: function() {
    if (typeof PLAY_BILLING === 'undefined' || !PLAY_BILLING.isAvailable()) return;
    if (typeof BILLING === 'undefined' || !BILLING.isCloudUser || !BILLING.isCloudUser()) return;

    var agora = Date.now();
    try {
      var ultimo = Number(localStorage.getItem(this._RECONCILIA_KEY) || 0);
      if (ultimo && (agora - ultimo) < this._RECONCILIA_INTERVALO) return;
      localStorage.setItem(this._RECONCILIA_KEY, String(agora));
    } catch (e) { /* storage indisponivel: segue sem throttle */ }

    var self = this;
    PLAY_BILLING.restore().catch(function() {
      // 402 assinatura-nao-ativa: o servidor ja revogou, entao o cache local
      // esta velho. Offline / sem plugin / sem compra caem aqui tambem e o
      // sync simplesmente nao acha novidade.
      if (typeof BILLING !== 'undefined' && BILLING.sync) {
        return BILLING.sync().catch(function() { /* silencioso */ });
      }
    }).then(function() {
      self.refreshPlanoCard();
      if (self.refreshUsageBanner) self.refreshUsageBanner();
    });
  },

  _consumePendingInvite: function() {
    var token = null;
    try { token = sessionStorage.getItem('fp-pending-invite'); } catch (e) { return; }
    if (!token || typeof BILLING === 'undefined' || !BILLING.isCloudUser || !BILLING.isCloudUser()) return;
    try { sessionStorage.removeItem('fp-pending-invite'); } catch (e2) { /* */ }
    BILLING.acceptInvite(token).then(function() {
      if (typeof UTILS !== 'undefined' && UTILS.mostrarToast) {
        UTILS.mostrarToast('Você entrou na organização.', 'success');
      }
    }).catch(function(err) {
      if (typeof UTILS !== 'undefined' && UTILS.mostrarToast) {
        UTILS.mostrarToast((err && err.message) || 'Não foi possível aceitar o convite.', 'error');
      }
    });
  },

  _handleInviteReturn: function() {
    if (typeof window === 'undefined' || typeof URLSearchParams === 'undefined') return;
    var params = new URLSearchParams(window.location.search);
    var token = params.get('invite');
    if (!token) return;

    var cleanUrl = function() {
      var u = new URL(window.location.href);
      u.searchParams.delete('invite');
      window.history.replaceState({}, '', u.pathname + u.search + u.hash);
    };

    if (typeof BILLING === 'undefined' || !BILLING.isCloudUser || !BILLING.isCloudUser()) {
      if (typeof UTILS !== 'undefined' && UTILS.mostrarToast) {
        UTILS.mostrarToast('Faça login na nuvem para aceitar o convite de equipe.', 'info');
      }
      try { sessionStorage.setItem('fp-pending-invite', token); } catch (e) { /* */ }
      cleanUrl();
      return;
    }

    BILLING.acceptInvite(token).then(function() {
      if (typeof UTILS !== 'undefined' && UTILS.mostrarToast) {
        UTILS.mostrarToast('Você entrou na organização.', 'success');
      }
      cleanUrl();
    }).catch(function(err) {
      if (typeof UTILS !== 'undefined' && UTILS.mostrarToast) {
        UTILS.mostrarToast((err && err.message) || 'Não foi possível aceitar o convite.', 'error');
      }
      cleanUrl();
    });
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
        if (typeof FUNIL !== 'undefined') {
          FUNIL.marco(FUNIL.E.ASSINATURA_ATIVA, { dia: FUNIL.diasDeUso() });
        }
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
    if (el) {
      if (typeof BILLING !== 'undefined') {
        var label = BILLING.getStatusLabel();
        var usage = BILLING.getUsageLabel ? BILLING.getUsageLabel() : '';
        el.textContent = usage ? label + ' · ' + usage : label;
      } else {
        el.textContent = 'Gratuito · uso local';
      }
    }
    var equipeSub = document.getElementById('perfil-equipe-subtitle');
    if (equipeSub && typeof BILLING !== 'undefined') {
      if (!BILLING.isCloudUser || !BILLING.isCloudUser()) {
        equipeSub.textContent = 'Disponível com login na nuvem';
      } else if (!BILLING.canUse('teamFeatures')) {
        equipeSub.textContent = 'Convites a partir do Pro';
      } else {
        var lim = BILLING.getLimits();
        equipeSub.textContent = lim.maxUsers === Infinity
          ? 'Membros ilimitados'
          : 'Até ' + lim.maxUsers + ' pessoas no Pro (modo casal)';
      }
    }
    this.refreshUsageBanner();
    this.refreshExportButtons();
    this.refreshExtratoSubtitle();
  },

  refreshUsageBanner: function() {
    var el = document.getElementById('fp-usage-banner');
    if (!el || typeof BILLING === 'undefined') return;
    var onboarding = document.getElementById('dashboard-onboarding');
    if (onboarding && !onboarding.hidden) {
      el.hidden = true;
      el.innerHTML = '';
      return;
    }

    var life = BILLING.getLifecycleAlert && BILLING.getLifecycleAlert();
    if (life) {
      var ctaAction = life.cta === 'portal' ? 'billing-portal-banner' : 'abrir-paywall';
      el.hidden = false;
      el.className = 'fp-usage-banner' + (life.severity === 'warn' ? ' fp-usage-banner--warn' : '');
      el.innerHTML =
        '<div class="fp-usage-banner-text">' +
          '<strong>' + UTILS.escapeHtml(life.title) + '</strong> · ' +
          UTILS.escapeHtml(life.message) +
        '</div>' +
        '<button type="button" class="fp-usage-banner-cta" data-action="' + ctaAction + '">' +
          UTILS.escapeHtml(life.ctaLabel || 'Abrir') +
        '</button>';
      return;
    }

    // Cota de OCR quase no fim: avisa enquanto ainda ha o que usar. O banner
    // some sozinho quando a cota renova na virada do mes.
    if (typeof BILLING.ocrRemaining === 'function') {
      var remOcr = BILLING.ocrRemaining();
      if (isFinite(remOcr) && remOcr <= 2) {
        el.hidden = false;
        el.className = 'fp-usage-banner' + (remOcr === 0 ? ' fp-usage-banner--warn' : '');
        el.innerHTML =
          '<div class="fp-usage-banner-text">' +
            '<strong>' + (remOcr === 0
              ? 'Você usou seus 5 escaneamentos do mês'
              : (remOcr + ' escaneamento' + (remOcr === 1 ? '' : 's') + ' de comprovante restante' + (remOcr === 1 ? '' : 's'))) + '</strong> · ' +
            'No Pro você fotografa quantos comprovantes quiser.' +
          '</div>' +
          '<button type="button" class="fp-usage-banner-cta" data-action="abrir-paywall">Ver o Pro</button>';
        return;
      }
    }

    if (!BILLING.shouldEnforceLimits || !BILLING.shouldEnforceLimits()) {
      el.hidden = true;
      el.innerHTML = '';
      return;
    }

    // Aviso de capacidade: so aparece quando algo esta de fato perto do teto.
    // Um banner permanente listando tudo que o gratuito nao tem transforma o
    // plano gratuito numa reclamacao diaria -- e ninguem assina por irritacao.
    var msg = BILLING.getUsageLabel();
    if (!msg) {
      el.hidden = true;
      el.innerHTML = '';
      return;
    }
    el.hidden = false;
    el.className = 'fp-usage-banner';
    el.innerHTML =
      '<div class="fp-usage-banner-text">' +
        '<strong>Plano gratuito</strong> · ' + UTILS.escapeHtml(msg) +
      '</div>' +
      '<button type="button" class="fp-usage-banner-cta" data-action="abrir-paywall">Ver o Pro</button>';
    if (typeof renderLucideIcons === 'function') renderLucideIcons(el);
  },

  refreshExtratoSubtitle: function() {
    var el = document.getElementById('extrato-meta-subtitle');
    if (!el) return;
    // CSV e livre para todo mundo: o dado e do usuario, e poder leva-lo embora
    // e argumento de aquisicao, nao item de paywall. So o PDF e Pro.
    var semPdf = typeof BILLING !== 'undefined' && BILLING.canUse && !BILLING.canUse('exportPdf');
    el.textContent = semPdf
      ? 'Histórico, filtros e exportação CSV · PDF no Pro'
      : 'Histórico, filtros e exportação';
  },

  refreshExportButtons: function() {
    if (typeof BILLING === 'undefined' || !BILLING.canUse) return;
    var semPdf = !BILLING.canUse('exportPdf');
    // O botao de CSV nunca e desabilitado. Deixamos so o PDF atras do Pro.
    document.querySelectorAll('[data-action="exportar-excel"]').forEach(function(btn) {
      btn.removeAttribute('aria-disabled');
      btn.classList.remove('perfil-card--disabled');
      btn.removeAttribute('title');
    });
    document.querySelectorAll('[data-action="exportar-pdf"]').forEach(function(btn) {
      if (semPdf) {
        btn.setAttribute('aria-disabled', 'true');
        btn.classList.add('perfil-card--disabled');
        btn.title = 'Relatório em PDF disponível no Pro';
      } else {
        btn.removeAttribute('aria-disabled');
        btn.classList.remove('perfil-card--disabled');
        btn.removeAttribute('title');
      }
    });
  },

  /**
   * Anuncia o Pro de boas-vindas logo depois do login.
   *
   * Precisa ser explícito e nomeado como presente. Um trial que o usuário não
   * percebe que ganhou não gera reciprocidade nenhuma — ele só estranha, dias
   * depois, que o app "perdeu" funções. E a frase mais importante é a última:
   * sem cartão, sem cobrança. Sem ela o brinde vira suspeita.
   */
  mostrarBoasVindasPro: function(info) {
    var dias = (info && info.days) || (typeof BILLING !== 'undefined' ? BILLING.WELCOME_TRIAL_DAYS : 14);
    var fim = '';
    try {
      if (info && info.trialEndsAt) {
        fim = new Date(info.trialEndsAt).toLocaleDateString('pt-BR');
      }
    } catch (e) { /* data inválida não pode derrubar o aviso */ }

    if (typeof UTILS === 'undefined' || !UTILS.mostrarBanner) {
      if (typeof UTILS !== 'undefined' && UTILS.mostrarToast) {
        UTILS.mostrarToast(dias + ' dias de Pro por nossa conta. Sem cartão.', 'success');
      }
      return;
    }

    UTILS.mostrarBanner({
      id: 'welcome-trial-banner',
      tipo: 'success',
      mensagem: dias + ' dias de Pro por nossa conta' + (fim ? ', até ' + fim : '') +
        '. Previsão, histórico completo e categorização automática liberados — sem cartão e sem cobrança.',
      acao: 'Ver o que mudou',
      onAcao: function() {
        if (typeof mudarAba === 'function') mudarAba('resumo');
      },
    });

    if (typeof FUNIL !== 'undefined') {
      FUNIL.marco(FUNIL.E.TRIAL_INICIADO, { origem: 'boas-vindas', dias: dias });
    }
  },

  abrirPaywall: function(contextMsg) {
    var self = this;

    if (typeof FUNIL !== 'undefined') {
      FUNIL.evento(FUNIL.E.PAYWALL_VISTO, {
        contextual: !!contextMsg,
        dia: FUNIL.diasDeUso(),
      });
    }

    // Sempre abre o modal (soft paywall local / upsell). Sem nuvem ou sem
    // login, _renderPlans esconde "Assinar" e o footer pede conta — evita CTA
    // morto quando OCR/previsão esgotam usos grátis offline.
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
          '<h2 id="billing-title">O Pro cuida do seu mês por você</h2>' +
          '<p class="billing-lead" id="billing-lead">' + UTILS.escapeHtml(contextMsg || 'Previsão de fim de mês, histórico completo, categorização automática e o app em todos os seus aparelhos. Cancela quando quiser.') + '</p>' +
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
   * seu proprio desconto anual: hoje o Pro da ~36% (12 x 16,99 = 203,88 contra
   * 129,99) e o Business ~17% (12 x 79,90 = 958,80 contra 799,00). Calcular por
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
      // Sem login/nuvem: mostra preços, mas não "Assinar" (política Play + CTA morto).
      var canAssinar = typeof BILLING !== 'undefined'
        && BILLING.isCloudUser && BILLING.isCloudUser()
        && typeof DADOS !== 'undefined'
        && (!DADOS._nuvemAtiva || DADOS._nuvemAtiva());
      var html = '';
      plans.forEach(function(plan) {
        if (!plan || plan.tier === 'FREE') return;
        if (plan.tier === 'BUSINESS' && !self.SHOW_BUSINESS_PLAN) return;
        var price = self._interval === 'yearly' ? plan.priceYearly : plan.priceMonthly;
        var priceLabel = price > 0
          ? 'R$ ' + Number(price).toFixed(2).replace('.', ',') + (self._interval === 'yearly' ? '/ano' : '/mês')
          : 'Grátis';
        var playId = typeof PLAY_BILLING !== 'undefined' && PLAY_BILLING.productIdForTier
          ? PLAY_BILLING.productIdForTier(plan.tier, self._interval)
          : null;
        var playPrice = playId && self._playPriceByProductId
          ? self._playPriceByProductId[playId]
          : '';
        if (playPrice) {
          priceLabel = playPrice + (self._interval === 'yearly' ? ' /ano' : ' /mês');
        }
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
            : (canAssinar
              ? '<button type="button" class="btn-primario billing-plan-btn" data-action="billing-assinar" data-tier="' + UTILS.escapeHtml(plan.tier) + '">' +
                  (tierAtual === 'FREE' ? 'Assinar' : 'Mudar plano') +
                '</button>'
              : '<span class="billing-plan-locked">Disponível após login na nuvem</span>')) +
        '</article>';
      });
      container.innerHTML = html || '<p class="billing-empty">Nenhum plano pago disponível no momento.</p>';
      self._atualizarSeloAnual(ov, plans);
      if (typeof renderLucideIconsNow === 'function') renderLucideIconsNow(container);
    };

    if (typeof BILLING !== 'undefined') {
      BILLING.listPlans().then(function(plans) {
        if (typeof PLAY_BILLING !== 'undefined' && PLAY_BILLING.isAvailable
            && PLAY_BILLING.isAvailable() && PLAY_BILLING.getProductDetails) {
          PLAY_BILLING.getProductDetails().then(function(products) {
            var byId = {};
            (products || []).forEach(function(p) {
              if (p && p.productId && p.formattedPrice) byId[p.productId] = p.formattedPrice;
            });
            self._playPriceByProductId = byId;
            render(plans);
          }).catch(function() { render(plans); });
          return;
        }
        render(plans);
      }).catch(function() { render(BILLING.STATIC_PLANS); });
    } else {
      render([]);
    }
  },

  _renderFooter: function(ov) {
    var footer = ov.querySelector('#billing-footer');
    if (!footer) return;

    if (typeof BILLING === 'undefined' || !BILLING.isCloudUser()) {
      footer.innerHTML =
        '<p class="billing-note">Crie sua conta para assinar o Pro — e já saia com backup automático dos seus dados.</p>' +
        '<button type="button" class="btn-primario" data-action="billing-login">Entrar e assinar</button>' +
        '<p class="billing-local-note">Sem conta, o app continua funcionando offline com tudo do plano gratuito. Seus dados ficam só neste aparelho.</p>';
      return;
    }

    var sub = BILLING._cache.subscription;
    var hasStripe = sub && sub.stripeCustomerId;
    var usePlay = typeof PLAY_BILLING !== 'undefined' && PLAY_BILLING.isAvailable();
    var expressBilling = typeof DADOS !== 'undefined' && DADOS._apiAtiva && DADOS._apiAtiva();
    var supaBilling = typeof DADOS !== 'undefined' && DADOS._supabaseAtivo && DADOS._supabaseAtivo()
      && typeof SUPA_BILLING !== 'undefined' && SUPA_BILLING.isActive && SUPA_BILLING.isActive();
    var webStripe = expressBilling || (supaBilling && !usePlay);
    var trialDays = (typeof BILLING !== 'undefined' && BILLING.TRIAL_DAYS) ? BILLING.TRIAL_DAYS : 7;
    var html = usePlay
      ? '<p class="billing-note">Pagamento via Google Play. Trial de ' + trialDays + ' dias no Pro.</p>'
      : (webStripe
        ? '<p class="billing-note">Pagamento seguro via Stripe Checkout. Trial de ' + trialDays + ' dias no Pro.</p>'
        : '<p class="billing-note">Assinatura Pro no app Android via Google Play. No navegador, o plano gratuito na nuvem permanece ativo.</p>');
    if (usePlay) {
      html += '<button type="button" class="btn-secundario" data-action="billing-restaurar">Restaurar compras</button>';
      html += '<p class="billing-restore-hint">Use se reinstalou o app ou trocou de celular e já tinha assinatura ativa.</p>';
    } else if (hasStripe && webStripe) {
      html += '<button type="button" class="btn-secundario" data-action="billing-portal">Gerenciar pagamento</button>';
    }
    if (sub && sub.plan && sub.plan.tier !== 'FREE' && !sub.cancelAtPeriodEnd) {
      if (usePlay || webStripe) {
        html += ' <button type="button" class="btn-ghost billing-cancel-link" data-action="billing-cancelar">Cancelar assinatura</button>';
      }
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

    if (typeof FUNIL !== 'undefined') {
      FUNIL.evento(FUNIL.E.CHECKOUT_INICIADO, {
        tierAlvo: tier,
        intervalo: this._interval,
        dia: FUNIL.diasDeUso(),
      });
    }

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
    PLAY_BILLING.restore().then(function(purchases) {
      var n = Array.isArray(purchases) ? purchases.length : 0;
      if (n === 0) {
        UTILS.mostrarToast('Nenhuma compra encontrada nesta conta Google.', 'info');
        return;
      }
      UTILS.mostrarToast(
        n === 1 ? 'Compra restaurada' : (n + ' compras restauradas'),
        'success',
      );
      self._renderPlans(ov);
      self._renderFooter(ov);
      self.refreshPlanoCard();
    }).catch(function(err) {
      UTILS.mostrarToast(err.message || 'Não foi possível restaurar compras', 'info');
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

  /** Modal de equipe: membros, convites e upgrade se FREE. */
  abrirEquipe: function() {
    var self = this;
    if (typeof DADOS !== 'undefined' && typeof DADOS._nuvemAtiva === 'function'
        && !DADOS._nuvemAtiva()) {
      return;
    }
    if (typeof BILLING === 'undefined' || !BILLING.isCloudUser || !BILLING.isCloudUser()) {
      if (typeof UTILS !== 'undefined' && UTILS.mostrarToast) {
        UTILS.mostrarToast('Faça login na nuvem para gerenciar a equipe.', 'info');
      }
      this._abrirLogin();
      return;
    }
    if (!BILLING.canUse('teamFeatures')) {
      this.abrirPaywall('Convide alguém da família ou do time a partir do plano Pro.');
      return;
    }

    this._fecharEquipe();
    var ov = document.createElement('div');
    ov.className = 'modal-overlay billing-overlay';
    ov.setAttribute('role', 'dialog');
    ov.setAttribute('aria-modal', 'true');
    ov.setAttribute('aria-labelledby', 'equipe-title');
    ov.innerHTML =
      '<div class="modal-box billing-modal equipe-modal">' +
        '<button type="button" class="billing-close" data-action="equipe-fechar" aria-label="Fechar">&times;</button>' +
        '<div class="billing-header">' +
          '<span class="billing-badge"><i data-lucide="users" aria-hidden="true"></i> Equipe</span>' +
          '<h2 id="equipe-title">Membros da organização</h2>' +
          '<p class="billing-lead" id="equipe-lead">Pro: até 2 pessoas (modo casal).</p>' +
        '</div>' +
        '<div id="equipe-body" class="equipe-body"><p class="billing-loading">Carregando…</p></div>' +
        '<form id="equipe-invite-form" class="equipe-invite-form">' +
          '<label class="equipe-invite-label" for="equipe-invite-email">Convidar por e-mail</label>' +
          '<div class="equipe-invite-row">' +
            '<input type="email" id="equipe-invite-email" class="equipe-invite-input" required ' +
              'placeholder="email@exemplo.com" autocomplete="email">' +
            '<button type="submit" class="btn-primario" data-action="equipe-convidar">Convidar</button>' +
          '</div>' +
          '<p class="equipe-invite-hint">Envia e-mail quando Resend estiver configurado; o link também pode ser copiado (válido 7 dias).</p>' +
        '</form>' +
      '</div>';

    document.body.appendChild(ov);
    this._equipeOverlay = ov;

    ov.addEventListener('click', function(e) {
      if (e.target === ov) self._fecharEquipe();
    });
    ov.addEventListener('click', function(e) {
      var btn = e.target.closest('[data-action]');
      if (!btn) return;
      if (btn.dataset.action === 'equipe-fechar') self._fecharEquipe();
      if (btn.dataset.action === 'equipe-copiar') {
        var url = btn.getAttribute('data-url') || '';
        if (url && navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(url).then(function() {
            UTILS.mostrarToast('Link copiado', 'success');
          }).catch(function() {
            UTILS.mostrarToast(url, 'info');
          });
        } else if (url) {
          UTILS.mostrarToast(url, 'info');
        }
      }
      if (btn.dataset.action === 'equipe-revogar') {
        self._revogarConvite(ov, btn.getAttribute('data-invite-id'));
      }
      if (btn.dataset.action === 'equipe-remover') {
        self._removerMembro(ov, btn.getAttribute('data-user-id'));
      }
    });
    ov.addEventListener('keydown', function(e) {
      if (e.key === 'Escape') {
        e.preventDefault();
        self._fecharEquipe();
      }
    });
    var form = ov.querySelector('#equipe-invite-form');
    if (form) {
      form.addEventListener('submit', function(e) {
        e.preventDefault();
        self._convidarEquipe(ov);
      });
    }

    if (typeof FocusTrap !== 'undefined') {
      this._equipeTrap = new FocusTrap(ov);
      this._equipeTrap.activate();
    }
    if (typeof renderLucideIconsNow === 'function') renderLucideIconsNow(ov);
    this._renderEquipe(ov);
  },

  _fecharEquipe: function() {
    if (this._equipeTrap) {
      this._equipeTrap.deactivate();
      this._equipeTrap = null;
    }
    if (this._equipeOverlay && this._equipeOverlay.parentNode) {
      this._equipeOverlay.parentNode.removeChild(this._equipeOverlay);
    }
    this._equipeOverlay = null;
  },

  _renderEquipe: function(ov) {
    var body = ov.querySelector('#equipe-body');
    var lead = ov.querySelector('#equipe-lead');
    if (!body || typeof BILLING === 'undefined') return;

    var limits = BILLING.getLimits();
    var maxLabel = limits.maxUsers === Infinity ? 'ilimitados' : String(limits.maxUsers);
    if (lead) {
      lead.textContent = 'Plano atual: ' + BILLING.getTier() + ' · até ' + maxLabel + ' membros.';
    }

    BILLING.listTeam().then(function(team) {
      var uid = null;
      if (typeof SUPA_AUTH !== 'undefined' && SUPA_AUTH.getSessionSync) {
        var s = SUPA_AUTH.getSessionSync();
        uid = s && s.user ? s.user.id : null;
      } else if (typeof DADOS !== 'undefined' && DADOS.getSessao) {
        var sess = DADOS.getSessao();
        uid = sess && sess.user ? sess.user.id : null;
      }

      var members = team.members || [];
      var invitations = team.invitations || [];
      var html = '<ul class="equipe-list">';
      members.forEach(function(m) {
        var isYou = uid && m.userId === uid;
        var isOwner = String(m.role || '').toUpperCase() === 'OWNER';
        var label = isYou ? 'Você' : ('Membro ' + String(m.userId || '').slice(0, 8));
        html += '<li class="equipe-item">' +
          '<span class="equipe-item-name">' + UTILS.escapeHtml(label) + '</span>' +
          '<span class="equipe-item-actions">' +
            '<span class="equipe-item-role">' + UTILS.escapeHtml(m.role || 'MEMBER') + '</span>' +
            ((!isYou && !isOwner)
              ? ' <button type="button" class="btn-ghost btn-sm" data-action="equipe-remover" data-user-id="' +
                  UTILS.escapeHtml(m.userId) + '">Remover</button>'
              : '') +
          '</span>' +
        '</li>';
      });
      invitations.forEach(function(inv) {
        var share = BILLING.inviteShareUrl(inv.token);
        html += '<li class="equipe-item equipe-item--pending">' +
          '<span class="equipe-item-name">' + UTILS.escapeHtml(inv.email) + ' <em>pendente</em></span>' +
          '<span class="equipe-item-actions">' +
            '<button type="button" class="btn-ghost btn-sm" data-action="equipe-copiar" data-url="' +
              UTILS.escapeHtml(share) + '">Copiar</button>' +
            '<button type="button" class="btn-ghost btn-sm" data-action="equipe-revogar" data-invite-id="' +
              UTILS.escapeHtml(inv.id) + '">Revogar</button>' +
          '</span>' +
        '</li>';
      });
      html += '</ul>';
      if (!members.length && !invitations.length) {
        html = '<p class="billing-empty">Nenhum membro além de você ainda.</p>';
      }
      body.innerHTML = html;
    }).catch(function(err) {
      body.innerHTML = '<p class="billing-empty">' +
        UTILS.escapeHtml((err && err.message) || 'Não foi possível carregar a equipe.') + '</p>';
    });
  },

  _revogarConvite: function(ov, invitationId) {
    var self = this;
    if (!invitationId) return;
    BILLING.revokeInvite(invitationId).then(function() {
      UTILS.mostrarToast('Convite revogado', 'success');
      self._renderEquipe(ov);
    }).catch(function(err) {
      UTILS.mostrarToast((err && err.message) || 'Falha ao revogar', 'error');
    });
  },

  _removerMembro: function(ov, userId) {
    var self = this;
    if (!userId) return;
    var go = function() {
      BILLING.removeTeamMember(userId).then(function() {
        UTILS.mostrarToast('Membro removido', 'success');
        self._renderEquipe(ov);
      }).catch(function(err) {
        UTILS.mostrarToast((err && err.message) || 'Falha ao remover', 'error');
      });
    };
    if (typeof INIT_MODALS !== 'undefined' && INIT_MODALS.confirm) {
      INIT_MODALS.confirm('Remover este membro da organização?', go);
      return;
    }
    if (window.confirm('Remover este membro da organização?')) go();
  },

  _convidarEquipe: function(ov) {
    var self = this;
    var input = ov.querySelector('#equipe-invite-email');
    var email = input ? input.value : '';
    var btn = ov.querySelector('[data-action="equipe-convidar"]');
    if (btn) btn.disabled = true;

    BILLING.inviteTeamMember(email).then(function(inv) {
      if (input) input.value = '';
      var share = inv && inv.token ? BILLING.inviteShareUrl(inv.token) : '';
      if (share && navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(share).catch(function() {});
      }
      UTILS.mostrarToast(
        share ? 'Convite criado. Link copiado — envie para a pessoa.' : 'Convite criado.',
        'success'
      );
      self._renderEquipe(ov);
    }).catch(function(err) {
      if (err && err.message === 'upgrade-necessario') return;
      UTILS.mostrarToast((err && err.message) || 'Falha ao convidar', 'error');
    }).then(function() {
      if (btn) btn.disabled = false;
    });
  },
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = INIT_BILLING;
}
