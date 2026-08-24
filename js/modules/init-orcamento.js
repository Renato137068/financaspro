/**
 * init-orcamento.js — Orçamento 50/30/20 (extraído de init.js)
 */
const INIT_ORCAMENTO = {
  REGRA_503020: {
    necessidades: ['alimentacao', 'transporte', 'moradia', 'saude', 'utilities', 'educacao'],
    desejos: ['lazer', 'entretenimento', 'compras', 'vestuario', 'viagem', 'assinaturas', 'pet', 'outro']
  },

  _lucideHtml: function(name) {
    if (typeof lucideIconHtml === 'function') return lucideIconHtml(name);
    return '<i data-lucide="' + (name || 'pin') + '" aria-hidden="true"></i>';
  },

  _getCatIcon: function(cat) {
    if (typeof INIT_EXTRATO !== 'undefined' && INIT_EXTRATO.getCatIcon) return INIT_EXTRATO.getCatIcon(cat);
    return this._lucideHtml('pin');
  },

  _getCatCor: function(cat) {
    if (typeof INIT_EXTRATO !== 'undefined' && INIT_EXTRATO.getCatCor) return INIT_EXTRATO.getCatCor(cat);
    return '#98a39d';
  },

  _catLucideName: function(cat) {
    var map = (typeof INIT_EXTRATO !== 'undefined' && INIT_EXTRATO.CATEGORIA_ICONES) ? INIT_EXTRATO.CATEGORIA_ICONES : {};
    return map[cat] || map[(cat || '').toLowerCase()] || 'pin';
  },

  classificarCategoria503020: function(cat) {
    var c = (cat || '').toLowerCase();
    if (this.REGRA_503020.necessidades.indexOf(c) !== -1) return 'necessidades';
    if (this.REGRA_503020.desejos.indexOf(c) !== -1) return 'desejos';
    return 'desejos';
  },

  salvarRenda: function() {
    var input = document.getElementById('orc-renda-valor');
    if (!input) return;
    var clean = input.value.replace(/\./g, '').replace(',', '.');
    var val = parseFloat(clean);
    if (!val || val <= 0) {
      UTILS.mostrarToast('Informe um valor válido', 'error');
      return;
    }
    DADOS.salvarConfig({ renda: val });
    UTILS.mostrarToast('Renda definida', 'success');
    this.renderDashboard();
    this._announce('Renda mensal atualizada para ' + UTILS.formatarMoeda(val));
    if (typeof INIT_CONFIG !== 'undefined' && INIT_CONFIG.refreshPerfil) INIT_CONFIG.refreshPerfil();
  },

  editarRenda: function() {
    var self = this;
    var config = DADOS.getConfig();
    var atual = config.renda || 0;
    var html = '<div class="orc-edit-renda-modal">' +
      '<div class="orc-edit-renda-header">' +
        '<span class="orc-edit-renda-icon">' + self._lucideHtml('wallet') + '</span>' +
        '<h3 class="orc-edit-renda-title">Editar Renda Mensal</h3>' +
        '<p class="orc-edit-renda-subtitle">Atualize sua renda para recalcular o orçamento</p>' +
      '</div>' +
      '<div class="orc-edit-renda-body">' +
        '<div class="orc-renda-input-wrapper">' +
          '<span class="orc-renda-prefix">R$</span>' +
          '<input type="text" id="edit-renda-val" value="' + atual.toLocaleString('pt-BR', {minimumFractionDigits:2}) + '" inputmode="numeric" class="orc-renda-input-field" placeholder="0,00">' +
        '</div>' +
      '</div>' +
    '</div>';
    fpAlert(html, { trustedHtml: true });
    setTimeout(function() {
      var overlay = document.querySelector('.modal-overlay');
      if (!overlay) return;
      var okBtn = overlay.querySelector('.modal-btn');
      if (okBtn) {
        okBtn.textContent = 'Salvar';
        okBtn.onclick = function() {
          var v = document.getElementById('edit-renda-val').value.replace(/\./g, '').replace(',', '.');
          var val = parseFloat(v);
          if (!val || val <= 0) { UTILS.mostrarToast('Valor inválido', 'error'); return; }
          DADOS.salvarConfig({ renda: val });
          overlay.remove();
          self.renderDashboard();
          self._announce('Renda mensal atualizada para ' + UTILS.formatarMoeda(val));
          if (typeof INIT_CONFIG !== 'undefined' && INIT_CONFIG.refreshPerfil) INIT_CONFIG.refreshPerfil();
          UTILS.mostrarToast('Renda atualizada', 'success');
          if (typeof renderLucideIconsNow === 'function') renderLucideIconsNow(overlay);
        };
      }
      if (typeof renderLucideIconsNow === 'function') renderLucideIconsNow(overlay);
    }, 50);
  },

  editarRegra503020: function() {
    var self = this;
    var config = DADOS.getConfig();
    var regra = config.regra503020 || { nec: 50, des: 30, pou: 20 };
    var html = '<div class="orc-edit-regra-modal">' +
      '<div class="orc-edit-regra-header">' +
        '<span class="orc-edit-regra-icon">' + self._lucideHtml('settings') + '</span>' +
        '<h3 class="orc-edit-regra-title">Personalizar Regra 50/30/20</h3>' +
        '<p class="orc-edit-regra-subtitle">Ajuste a distribuição da sua renda (soma deve ser 100%)</p>' +
      '</div>' +
      '<div class="orc-edit-regra-body">' +
        '<div class="orc-regra-input-group"><label class="orc-regra-label">' +
          '<span class="orc-regra-label-icon">' + self._lucideHtml('home') + '</span><span class="orc-regra-label-text">Necessidades</span></label>' +
          '<div class="orc-regra-input-wrapper"><input type="number" id="regra-nec" value="' + regra.nec + '" min="1" max="98" class="orc-regra-input-field"><span class="orc-regra-suffix">%</span></div></div>' +
        '<div class="orc-regra-input-group"><label class="orc-regra-label">' +
          '<span class="orc-regra-label-icon">' + self._lucideHtml('gamepad-2') + '</span><span class="orc-regra-label-text">Desejos</span></label>' +
          '<div class="orc-regra-input-wrapper"><input type="number" id="regra-des" value="' + regra.des + '" min="1" max="98" class="orc-regra-input-field"><span class="orc-regra-suffix">%</span></div></div>' +
        '<div class="orc-regra-input-group"><label class="orc-regra-label">' +
          '<span class="orc-regra-label-icon">' + self._lucideHtml('piggy-bank') + '</span><span class="orc-regra-label-text">Poupança</span></label>' +
          '<div class="orc-regra-input-wrapper"><input type="number" id="regra-pou" value="' + regra.pou + '" min="1" max="98" class="orc-regra-input-field"><span class="orc-regra-suffix">%</span></div></div>' +
        '<div class="orc-regra-total"><span class="orc-regra-total-label">Total:</span><span class="orc-regra-total-value" id="regra-total">100%</span></div>' +
      '</div></div>';
    fpAlert(html, { trustedHtml: true });
    setTimeout(function() {
      var overlay = document.querySelector('.modal-overlay');
      if (!overlay) return;
      var okBtn = overlay.querySelector('.modal-btn');
      if (okBtn) {
        okBtn.textContent = 'Salvar';
        okBtn.onclick = function() {
          var nec = parseInt(document.getElementById('regra-nec').value, 10) || 0;
          var des = parseInt(document.getElementById('regra-des').value, 10) || 0;
          var pou = parseInt(document.getElementById('regra-pou').value, 10) || 0;
          if (nec + des + pou !== 100) { UTILS.mostrarToast('A soma deve ser exatamente 100%', 'error'); return; }
          if (nec < 1 || des < 1 || pou < 1) { UTILS.mostrarToast('Cada valor deve ser ao menos 1%', 'error'); return; }
          DADOS.salvarConfig({ regra503020: { nec: nec, des: des, pou: pou } });
          overlay.remove();
          self.renderDashboard();
          UTILS.mostrarToast('Regra ajustada para ' + nec + '/' + des + '/' + pou, 'success');
        };
      }
      var inputs = overlay.querySelectorAll('.orc-regra-input-field');
      var totalEl = document.getElementById('regra-total');
      inputs.forEach(function(input) {
        input.addEventListener('input', function() {
          var nec = parseInt(document.getElementById('regra-nec').value, 10) || 0;
          var des = parseInt(document.getElementById('regra-des').value, 10) || 0;
          var pou = parseInt(document.getElementById('regra-pou').value, 10) || 0;
          var total = nec + des + pou;
          if (totalEl) {
            totalEl.textContent = total + '%';
            totalEl.style.color = total === 100 ? 'var(--color-success)' : 'var(--color-danger)';
          }
        });
      });
      if (typeof renderLucideIconsNow === 'function') renderLucideIconsNow(overlay);
    }, 50);
  },

  toggleDetalhesCategorias: function() {
    var el = document.getElementById('orc-categorias');
    var arrow = document.getElementById('orc-cat-arrow');
    var btn = document.getElementById('orc-cat-toggle');
    if (!el) return;
    var aberto = el.style.display !== 'none';
    el.style.display = aberto ? 'none' : 'block';
    if (arrow) arrow.classList.toggle('expanded', !aberto);
    if (btn) btn.setAttribute('aria-expanded', aberto ? 'false' : 'true');
  },

  _updateElement: function(id, value) {
    var el = document.getElementById(id);
    if (el) el.textContent = value;
  },

  _updateElementStyle: function(id, property, value) {
    var el = document.getElementById(id);
    if (el) el.style[property] = value;
  },

  _updateElementClass: function(id, className) {
    var el = document.getElementById(id);
    if (el) el.className = className;
  },

  /** Anúncio discreto para leitores de tela (#orc-live-region). */
  _announce: function(msg) {
    var el = document.getElementById('orc-live-region');
    if (!el || !msg) return;
    el.textContent = '';
    setTimeout(function() { el.textContent = msg; }, 30);
  },

  /** Barras 50/30/20 com role=progressbar e ARIA. */
  _setProgressBar: function(id, pct, labelBase) {
    var el = document.getElementById(id);
    if (!el) return;
    var capped = Math.min(Math.max(0, pct), 100);
    el.style.width = capped + '%';
    var track = el.parentElement;
    if (track && track.classList.contains('orc-progress')) {
      track.setAttribute('role', 'progressbar');
      track.setAttribute('aria-valuemin', '0');
      track.setAttribute('aria-valuemax', '100');
      track.setAttribute('aria-valuenow', String(Math.round(capped)));
      track.setAttribute('aria-label', (labelBase || 'Progresso') + ': ' + Math.round(pct) + '%');
    }
  },

  calculateBudgetData: function() {
    var config = DADOS.getConfig();
    var renda = config.renda || 0;
    var regra = config.regra503020 || { nec: 50, des: 30, pou: 20 };
    var pNec = Math.max(1, regra.nec || 50);
    var pDes = Math.max(1, regra.des || 30);
    var pPou = Math.max(1, regra.pou || 20);
    var agora = new Date();
    var mes = agora.getMonth() + 1;
    var ano = agora.getFullYear();
    var txs = TRANSACOES.obter({ mes: mes, ano: ano });
    var self = this;
    var gastoNec = 0, gasDes = 0, totalDespesas = 0, totalReceitas = 0;
    var catGastos = {};
    txs.forEach(function(t) {
      if (t.tipo === CONFIG.TIPO_DESPESA) {
        totalDespesas += t.valor;
        var cls = self.classificarCategoria503020(t.categoria);
        if (cls === 'necessidades') gastoNec += t.valor;
        else gasDes += t.valor;
        catGastos[t.categoria] = (catGastos[t.categoria] || 0) + t.valor;
      } else if (t.tipo === CONFIG.TIPO_RECEITA) {
        totalReceitas += t.valor;
      }
    });
    var poupancaReal = totalReceitas - totalDespesas;
    var limNec = renda * (pNec / 100);
    var limDes = renda * (pDes / 100);
    var limPou = renda * (pPou / 100);
    var realizado = gastoNec + gasDes;
    /* Saldo do orçamento = o que sobra da renda planejada após despesas.
       Economia do mês usa o mesmo número (rótulo do card secundário). */
    var saldoDisponivel = renda - realizado;
    return {
      renda: renda, pNec: pNec, pDes: pDes, pPou: pPou,
      gastoNec: gastoNec, gasDes: gasDes, poupancaReal: poupancaReal,
      limNec: limNec, limDes: limDes, limPou: limPou,
      realizado: realizado, saldoDisponivel: saldoDisponivel,
      pctNec: limNec > 0 ? Math.round((gastoNec / limNec) * 100) : 0,
      pctDes: limDes > 0 ? Math.round((gasDes / limDes) * 100) : 0,
      pctPou: limPou > 0 ? Math.round((Math.max(0, poupancaReal) / limPou) * 100) : 0,
      catGastos: catGastos,
      mes: mes, ano: ano
    };
  },

  /**
   * P0 — Header Estratégico: liga os 7 IDs órfãos aos dados reais.
   */
  _renderHeader: function(data) {
    var realizado = data.realizado != null ? data.realizado : (data.gastoNec + data.gasDes);
    var saldo = data.saldoDisponivel != null ? data.saldoDisponivel : (data.renda - realizado);
    var pctRestante = data.renda > 0 ? Math.round((saldo / data.renda) * 100) : 0;

    this._updateElement('orc-total-planejado', UTILS.formatarMoeda(data.renda));
    this._updateElement('orc-total-realizado', UTILS.formatarMoeda(realizado));
    this._updateElement('orc-saldo-disponivel', UTILS.formatarMoeda(saldo));
    this._updateElement('orc-economia-mes', UTILS.formatarMoeda(saldo));
    this._updateElement('orc-percent-restante', pctRestante + '% restante');

    var criticas = 0;
    if (typeof ORCAMENTO !== 'undefined' && typeof ORCAMENTO.categoriasEmRisco === 'function') {
      try {
        criticas = ORCAMENTO.categoriasEmRisco(new Date()).length;
      } catch (_e) { criticas = 0; }
    }
    this._updateElement('orc-categorias-criticas', String(criticas));

    // Tendência vs mês anterior (mesmo renda × despesas do mês -1)
    var dAnt = new Date(data.ano, data.mes - 2, 1);
    var txsAnt = TRANSACOES.obter({ mes: dAnt.getMonth() + 1, ano: dAnt.getFullYear() });
    var despAnt = 0;
    txsAnt.forEach(function(t) {
      if (t.tipo === CONFIG.TIPO_DESPESA) despAnt += t.valor;
    });
    var saldoAnt = data.renda - despAnt;
    var delta = saldo - saldoAnt;
    var trendTxt;
    if (despAnt === 0 && realizado === 0) {
      trendTxt = 'vs mês anterior';
    } else if (Math.abs(saldoAnt) < 0.005) {
      trendTxt = delta >= 0 ? 'melhor que o mês anterior' : 'pior que o mês anterior';
    } else {
      var pctDelta = Math.round((delta / Math.abs(saldoAnt)) * 100);
      trendTxt = (pctDelta >= 0 ? '+' : '') + pctDelta + '% vs mês anterior';
    }
    this._updateElement('orc-tendencia', trendTxt);

    var indicator = document.getElementById('orc-trend-indicator');
    if (indicator) {
      var iconName = delta >= 0 ? 'trending-up' : 'trending-down';
      indicator.innerHTML = '<span class="trend-icon">' + this._lucideHtml(iconName) + '</span>';
      if (typeof renderLucideIconsNow === 'function') renderLucideIconsNow(indicator);
    }

    this._ultimoHeader = {
      saldo: saldo, realizado: realizado, renda: data.renda, criticas: criticas
    };
  },

  renderDashboard: function() {
    try {
      var config = DADOS.getConfig();
      var renda = config.renda || 0;
      var setupEl = document.getElementById('orc-renda-setup');
      var dashEl = document.getElementById('orc-dashboard');
      if (!renda || renda <= 0) {
        if (setupEl) setupEl.style.display = 'block';
        if (dashEl) dashEl.style.display = 'none';
        if (typeof INIT_METAS !== 'undefined' && INIT_METAS.renderOrcamento) {
          INIT_METAS.renderOrcamento();
        }
        return;
      }
      if (setupEl) setupEl.style.display = 'none';
      if (dashEl) dashEl.style.display = 'block';
      var data = this.calculateBudgetData();
      this._updateElement('orc-nec-pct', data.pNec + '%');
      this._updateElement('orc-des-pct', data.pDes + '%');
      this._updateElement('orc-pou-pct', data.pPou + '%');
      this._renderHeader(data);
      this._renderCards(data);
      this.renderInsights(data);
      this.renderCategorias(data.catGastos, data.renda);
      if (typeof INIT_METAS !== 'undefined' && INIT_METAS.renderOrcamento) {
        INIT_METAS.renderOrcamento();
      }
      if (this._ultimoHeader && this._ultimoHeader.criticas > 0) {
        this._announce(this._ultimoHeader.criticas + ' categoria(s) em risco no orçamento');
      }
    } catch (error) {
      console.error('Erro ao renderizar orçamento:', error);
      UTILS.mostrarToast('Não foi possível carregar o orçamento. Recarregue a página.', 'error');
    }
  },

  _renderCards: function(data) {
    this._updateElement('orc-nec-gasto', UTILS.formatarMoeda(data.gastoNec));
    this._updateElement('orc-nec-limite', UTILS.formatarMoeda(data.limNec));
    this._setProgressBar('orc-nec-bar', data.pctNec, 'Necessidades');
    this._updateElementClass('orc-nec-bar', 'orc-progress-fill ' + (data.pctNec >= 100 ? 'exceeded' : data.pctNec >= 80 ? 'attention' : 'healthy'));

    this._updateElement('orc-des-gasto', UTILS.formatarMoeda(data.gasDes));
    this._updateElement('orc-des-limite', UTILS.formatarMoeda(data.limDes));
    this._setProgressBar('orc-des-bar', data.pctDes, 'Desejos');
    this._updateElementClass('orc-des-bar', 'orc-progress-fill ' + (data.pctDes >= 100 ? 'exceeded' : data.pctDes >= 80 ? 'attention' : 'healthy'));

    this._updateElement('orc-pou-gasto', UTILS.formatarMoeda(Math.max(0, data.poupancaReal)));
    this._updateElement('orc-pou-limite', UTILS.formatarMoeda(data.limPou));
    this._setProgressBar('orc-pou-bar', data.pctPou, 'Poupança');
    this._updateElementClass('orc-pou-bar', 'orc-progress-fill ' + (data.pctPou >= 100 ? 'otimo' : data.pctPou >= 50 ? 'healthy' : 'attention'));
  },

  renderInsights: function(data) {
    var el = document.getElementById('orc-insights');
    if (!el) return;
    var self = this;
    var agora = new Date();
    var diaAtual = agora.getDate();
    var diasNoMes = new Date(agora.getFullYear(), agora.getMonth() + 1, 0).getDate();
    var diasRestantes = diasNoMes - diaAtual;
    var pctMes = Math.round((diaAtual / diasNoMes) * 100);
    var dicas = [];
    if (data.pctNec >= 100) dicas.push({ lucide: 'alert-octagon', texto: 'Necessidades estourou o limite! Gastou ' + UTILS.formatarMoeda(data.gastoNec - data.limNec) + ' a mais.', tipo: 'danger' });
    else if (data.pctNec >= 70 && pctMes < 70) dicas.push({ lucide: 'alert-triangle', texto: 'Já usou ' + data.pctNec + '% do limite de Necessidades e faltam ' + diasRestantes + ' dias no mês.', tipo: 'warning' });
    if (data.pctDes >= 100) dicas.push({ lucide: 'alert-octagon', texto: 'Desejos estourou! Tente conter gastos com lazer até o próximo mês.', tipo: 'danger' });
    else if (data.pctDes >= 70) dicas.push({ lucide: 'alert-triangle', texto: 'Atenção: ' + data.pctDes + '% do limite de Desejos usado. Resta ' + UTILS.formatarMoeda(data.limDes - data.gasDes) + '.', tipo: 'warning' });
    if (data.poupancaReal >= data.limPou) dicas.push({ lucide: 'party-popper', texto: 'Meta de poupança atingida! Você guardou ' + UTILS.formatarMoeda(data.poupancaReal) + '.', tipo: 'success' });
    else if (data.poupancaReal > 0) dicas.push({ lucide: 'lightbulb', texto: 'Faltam ' + UTILS.formatarMoeda(data.limPou - data.poupancaReal) + ' para bater a meta de poupança.', tipo: 'info' });
    else if (data.poupancaReal < 0) dicas.push({ lucide: 'circle-alert', texto: 'Saldo negativo: gastou ' + UTILS.formatarMoeda(Math.abs(data.poupancaReal)) + ' a mais do que ganhou.', tipo: 'danger' });
    var maiorCat = '', maiorVal = 0;
    Object.keys(data.catGastos).forEach(function(c) {
      if (data.catGastos[c] > maiorVal) { maiorVal = data.catGastos[c]; maiorCat = c; }
    });
    if (maiorCat) {
      // Só mostra "% da renda" se a renda foi informada (evita divisão por zero → "Infinity%").
      var pctTxt = data.renda > 0 ? ' (' + Math.round((maiorVal / data.renda) * 100) + '% da renda)' : '';
      var maiorLabel = (typeof CONFIG !== 'undefined' && CONFIG.getCatLabel)
        ? CONFIG.getCatLabel(maiorCat)
        : (typeof UTILS !== 'undefined' && UTILS.labelCategoria)
          ? UTILS.labelCategoria(maiorCat)
          : maiorCat;
      dicas.push({
        lucide: self._catLucideName(maiorCat),
        texto: UTILS.escapeHtml(maiorLabel) + ' é seu maior gasto: ' + UTILS.formatarMoeda(maiorVal) + pctTxt + '.',
        tipo: 'info'
      });
    }
    // Projeção só após alguns dias de dados e com renda informada — no começo do
    // mês a regra de três estoura e a mensagem fica alarmante/enganosa.
    if (pctMes > 0 && diaAtual >= 5 && data.renda > 0) {
      var totalGasto = data.gastoNec + data.gasDes;
      var projecao = (totalGasto / diaAtual) * diasNoMes;
      if (projecao > data.renda * 0.8) {
        dicas.push({ lucide: 'bar-chart-2', texto: 'Estimativa: mantendo esse ritmo, o mês pode fechar em ~' + UTILS.formatarMoeda(projecao) + ' (' + Math.round((projecao / data.renda) * 100) + '% da renda).', tipo: 'warning' });
      }
    }
    // Risco por CATEGORIA. As dicas acima olham os três grupos do 50/30/20;
    // o estouro, porém, acontece numa categoria específica — e é lá que dá
    // para agir. Vem com o teto diário porque "segure os gastos" não é uma
    // instrução: "R$ 10 por dia até o fim do mês" é.
    if (typeof ORCAMENTO !== 'undefined' && typeof ORCAMENTO.categoriasEmRisco === 'function') {
      try {
        ORCAMENTO.categoriasEmRisco(agora).slice(0, 3).forEach(function(p) {
          var texto = ORCAMENTO.mensagemRisco(p.categoria, agora);
          if (!texto) return;
          dicas.push({
            lucide: p.risco === 'estourado' ? 'alert-octagon' : 'alert-triangle',
            texto: UTILS.escapeHtml(texto),
            tipo: p.risco === 'estourado' ? 'danger' : 'warning'
          });
        });
      } catch (e) { /* orçamento indisponível não pode derrubar a aba */ }
    }

    if (dicas.length === 0) dicas.push({ lucide: 'sparkles', texto: 'Tudo sob controle! Continue assim.', tipo: 'success' });
    el.innerHTML = dicas.map(function(d) {
      return '<div class="orc-insight ' + d.tipo + '"><span class="orc-insight-icon">' + self._lucideHtml(d.lucide) + '</span><span>' + d.texto + '</span></div>';
    }).join('');
    if (typeof renderLucideIconsNow === 'function') renderLucideIconsNow(el);
  },

  _catItemHtml: function(cat, val, renda, extraMsg) {
    var self = this;
    var pct = renda > 0 ? Math.round((val / renda) * 100) : 0;
    var icon = self._getCatIcon(cat);
    var cor = self._getCatCor(cat);
    var cls503020 = self.classificarCategoria503020(cat);
    var label = (typeof CONFIG !== 'undefined' && CONFIG.getCatLabel) ? CONFIG.getCatLabel(cat) : cat;
    var barW = Math.min(100, pct);
    var msg = extraMsg
      ? '<div class="orc-cat-risco">' + UTILS.escapeHtml(extraMsg) + '</div>'
      : '';
    return '<div class="orc-cat-item"><div class="orc-cat-row"><div class="orc-cat-left">' +
      '<span class="orc-cat-icon" style="background:' + cor + '20;color:' + cor + '">' + icon + '</span>' +
      '<div class="orc-cat-info"><span class="orc-cat-nome">' + UTILS.escapeHtml(label) + '</span>' +
      '<span class="orc-cat-badge ' + cls503020 + '">' + (cls503020 === 'necessidades' ? 'Necessidade' : 'Desejo') + '</span></div></div>' +
      '<div class="orc-cat-right"><span class="orc-cat-valor">' + UTILS.formatarMoeda(val) + '</span>' +
      '<span class="orc-cat-pct">' + pct + '%</span></div></div>' +
      '<div class="orc-cat-bar" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="' + barW + '" aria-label="' + UTILS.escapeHtml(label) + ': ' + pct + '% da renda">' +
      '<div class="orc-cat-bar-fill" style="width:' + barW + '%;background:' + cor + '"></div></div>' +
      msg + '</div>';
  },

  /**
   * P1.1-A + P2.2: preenche grupos críticos / atenção / saudáveis sem
   * sobrescrever a estrutura do #orc-categorias.
   */
  renderCategorias: function(catGastos, renda) {
    var container = document.getElementById('orc-categorias');
    if (!container) return;

    var criticalList = document.getElementById('orc-critical-list');
    var attentionList = document.getElementById('orc-attention-list');
    var healthyList = document.getElementById('orc-healthy-list');
    var emptyEl = document.getElementById('orc-categorias-empty');
    var groupCritical = document.getElementById('orc-group-critical');
    var groupAttention = document.getElementById('orc-group-attention');
    var groupHealthy = document.getElementById('orc-group-healthy');
    if (!criticalList || !attentionList || !healthyList) return;

    var agora = new Date();
    var mes = agora.getMonth() + 1;
    var ano = agora.getFullYear();
    var self = this;

    var cats = {};
    Object.keys(catGastos || {}).forEach(function(c) { cats[c] = true; });
    if (typeof ORCAMENTO !== 'undefined' && ORCAMENTO.obterTodos) {
      Object.keys(ORCAMENTO.obterTodos() || {}).forEach(function(c) { cats[c] = true; });
    }
    var keys = Object.keys(cats);

    var critical = [], attention = [], healthy = [];

    keys.forEach(function(cat) {
      var val = (catGastos && catGastos[cat]) || 0;
      var status = null;
      var proj = null;
      if (typeof ORCAMENTO !== 'undefined') {
        if (ORCAMENTO.obterStatus) {
          try { status = ORCAMENTO.obterStatus(cat, mes, ano); } catch (_e) { status = null; }
        }
        if (ORCAMENTO.projetarCategoria) {
          try { proj = ORCAMENTO.projetarCategoria(cat, agora); } catch (_e2) { proj = null; }
        }
      }

      var grupo = 'healthy';
      if (status && status.status === 'excedido') grupo = 'critical';
      else if (proj && (proj.risco === 'estourado' || proj.risco === 'vai-estourar')) grupo = 'critical';
      else if (status && status.status === 'alerta') grupo = 'attention';
      else if (status && status.percentual >= 70 && status.percentual < 100) grupo = 'attention';

      var riscoMsg = '';
      if (grupo === 'critical' && typeof ORCAMENTO !== 'undefined' && ORCAMENTO.mensagemRisco) {
        try { riscoMsg = ORCAMENTO.mensagemRisco(cat, agora) || ''; } catch (_e3) { riscoMsg = ''; }
      }

      var item = { cat: cat, val: val, msg: riscoMsg };
      if (grupo === 'critical') critical.push(item);
      else if (grupo === 'attention') attention.push(item);
      else if (val > 0 || (status && status.limite)) healthy.push(item);
    });

    function fill(listEl, items) {
      listEl.innerHTML = items
        .sort(function(a, b) { return b.val - a.val; })
        .map(function(it) { return self._catItemHtml(it.cat, it.val, renda, it.msg); })
        .join('');
    }

    fill(criticalList, critical);
    fill(attentionList, attention);
    fill(healthyList, healthy);

    this._updateElement('orc-critical-count', String(critical.length));
    this._updateElement('orc-attention-count', String(attention.length));
    this._updateElement('orc-healthy-count', String(healthy.length));

    if (groupCritical) groupCritical.style.display = critical.length ? '' : 'none';
    if (groupAttention) groupAttention.style.display = attention.length ? '' : 'none';
    if (groupHealthy) groupHealthy.style.display = healthy.length ? '' : 'none';

    var algum = critical.length + attention.length + healthy.length;
    if (emptyEl) emptyEl.style.display = algum === 0 ? '' : 'none';

    if (typeof renderLucideIconsNow === 'function') renderLucideIconsNow(container);
  }
};

function salvarRendaOrcamento() { INIT_ORCAMENTO.salvarRenda(); }
function editarRendaOrcamento() { INIT_ORCAMENTO.editarRenda(); }
function editarRegra503020() { INIT_ORCAMENTO.editarRegra503020(); }
function toggleDetalhesCategorias() { INIT_ORCAMENTO.toggleDetalhesCategorias(); }
function renderOrcamentoDashboard() { INIT_ORCAMENTO.renderDashboard(); }

if (typeof module !== 'undefined' && module.exports) {
  module.exports = INIT_ORCAMENTO;
}
