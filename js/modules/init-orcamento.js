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
    return '#94a3b8';
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
    UTILS.mostrarToast('Renda definida!', 'success');
    this.renderDashboard();
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
          if (typeof INIT_CONFIG !== 'undefined' && INIT_CONFIG.refreshPerfil) INIT_CONFIG.refreshPerfil();
          UTILS.mostrarToast('Renda atualizada!', 'success');
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
          UTILS.mostrarToast('Regra personalizada! ' + nec + '/' + des + '/' + pou, 'success');
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
      } else {
        totalReceitas += t.valor;
      }
    });
    var poupancaReal = totalReceitas - totalDespesas;
    var limNec = renda * (pNec / 100);
    var limDes = renda * (pDes / 100);
    var limPou = renda * (pPou / 100);
    return {
      renda: renda, pNec: pNec, pDes: pDes, pPou: pPou,
      gastoNec: gastoNec, gasDes: gasDes, poupancaReal: poupancaReal,
      limNec: limNec, limDes: limDes, limPou: limPou,
      pctNec: limNec > 0 ? Math.round((gastoNec / limNec) * 100) : 0,
      pctDes: limDes > 0 ? Math.round((gasDes / limDes) * 100) : 0,
      pctPou: limPou > 0 ? Math.round((Math.max(0, poupancaReal) / limPou) * 100) : 0,
      catGastos: catGastos
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
      this._renderCards(data);
      this.renderInsights(data);
      this.renderCategorias(data.catGastos, data.renda);
      this.renderHistorico(data.renda);
      if (typeof INIT_METAS !== 'undefined' && INIT_METAS.renderOrcamento) {
        INIT_METAS.renderOrcamento();
      }
    } catch (error) {
      console.error('Erro ao renderizar orçamento:', error);
      UTILS.mostrarToast('Erro ao carregar orçamento', 'error');
    }
  },

  _renderCards: function(data) {
    this._updateElement('orc-nec-gasto', UTILS.formatarMoeda(data.gastoNec));
    this._updateElement('orc-nec-limite', UTILS.formatarMoeda(data.limNec));
    this._updateElementStyle('orc-nec-bar', 'width', Math.min(data.pctNec, 100) + '%');
    this._updateElementClass('orc-nec-bar', 'orc-progress-fill-premium ' + (data.pctNec >= 100 ? 'exceeded' : data.pctNec >= 80 ? 'attention' : 'healthy'));
    this._updateElement('orc-des-gasto', UTILS.formatarMoeda(data.gasDes));
    this._updateElement('orc-des-limite', UTILS.formatarMoeda(data.limDes));
    this._updateElementStyle('orc-des-bar', 'width', Math.min(data.pctDes, 100) + '%');
    this._updateElementClass('orc-des-bar', 'orc-progress-fill-premium ' + (data.pctDes >= 100 ? 'exceeded' : data.pctDes >= 80 ? 'attention' : 'healthy'));
    this._updateElement('orc-pou-gasto', UTILS.formatarMoeda(Math.max(0, data.poupancaReal)));
    this._updateElement('orc-pou-limite', UTILS.formatarMoeda(data.limPou));
    this._updateElementStyle('orc-pou-bar', 'width', Math.min(data.pctPou, 100) + '%');
    this._updateElementClass('orc-pou-bar', 'orc-progress-fill-premium ' + (data.pctPou >= 100 ? 'otimo' : data.pctPou >= 50 ? 'healthy' : 'attention'));
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
      dicas.push({ lucide: self._catLucideName(maiorCat), texto: maiorCat + ' é seu maior gasto: ' + UTILS.formatarMoeda(maiorVal) + pctTxt + '.', tipo: 'info' });
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
    if (dicas.length === 0) dicas.push({ lucide: 'sparkles', texto: 'Tudo sob controle! Continue assim.', tipo: 'success' });
    el.innerHTML = dicas.map(function(d) {
      return '<div class="orc-insight ' + d.tipo + '"><span class="orc-insight-icon">' + self._lucideHtml(d.lucide) + '</span><span>' + d.texto + '</span></div>';
    }).join('');
    if (typeof renderLucideIconsNow === 'function') renderLucideIconsNow(el);
  },

  renderCategorias: function(catGastos, renda) {
    var el = document.getElementById('orc-categorias');
    if (!el) return;
    var self = this;
    var cats = Object.keys(catGastos).sort(function(a, b) { return catGastos[b] - catGastos[a]; });
    if (cats.length === 0) {
      el.innerHTML = '<p style="text-align:center;color:var(--text-secondary);padding:18px 16px;font-size:13px;line-height:1.5">Sem despesas este mês ainda.<br>Registre uma transação para ver para onde vai seu dinheiro.</p>';
      return;
    }
    var maxVal = catGastos[cats[0]];
    el.innerHTML = cats.map(function(cat) {
      var val = catGastos[cat];
      var pct = Math.round((val / renda) * 100);
      var barW = maxVal > 0 ? Math.round((val / maxVal) * 100) : 0;
      var icon = self._getCatIcon(cat);
      var cor = self._getCatCor(cat);
      var cls503020 = self.classificarCategoria503020(cat);
      var label = CONFIG.getCatLabel ? CONFIG.getCatLabel(cat) : cat;
      return '<div class="orc-cat-item"><div class="orc-cat-row"><div class="orc-cat-left">' +
        '<span class="orc-cat-icon" style="background:' + cor + '20;color:' + cor + '">' + icon + '</span>' +
        '<div class="orc-cat-info"><span class="orc-cat-nome">' + UTILS.escapeHtml(label) + '</span>' +
        '<span class="orc-cat-badge ' + cls503020 + '">' + (cls503020 === 'necessidades' ? 'Necessidade' : 'Desejo') + '</span></div></div>' +
        '<div class="orc-cat-right"><span class="orc-cat-valor">' + UTILS.formatarMoeda(val) + '</span>' +
        '<span class="orc-cat-pct">' + pct + '%</span></div></div>' +
        '<div class="orc-cat-bar"><div class="orc-cat-bar-fill" style="width:' + barW + '%;background:' + cor + '"></div></div></div>';
    }).join('');
    if (typeof renderLucideIconsNow === 'function') renderLucideIconsNow(el);
  },

  renderHistorico: function(renda) {
    var el = document.getElementById('orc-historico');
    if (!el) return;
    var agora = new Date();
    var meses = [];
    var nomesMes = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];
    for (var i = 2; i >= 0; i--) {
      var d = new Date(agora.getFullYear(), agora.getMonth() - i, 1);
      var txs = TRANSACOES.obter({ mes: d.getMonth() + 1, ano: d.getFullYear() });
      var rec = 0, desp = 0;
      txs.forEach(function(t) {
        if (t.tipo === CONFIG.TIPO_RECEITA) rec += t.valor; else desp += t.valor;
      });
      meses.push({ label: nomesMes[d.getMonth()], rec: rec, desp: desp, saldo: rec - desp });
    }
    var maxVal = 1;
    meses.forEach(function(m) { if (m.rec > maxVal) maxVal = m.rec; if (m.desp > maxVal) maxVal = m.desp; });
    el.innerHTML = '<div class="orc-hist-chart">' + meses.map(function(m) {
      var hRec = Math.max(4, Math.round((m.rec / maxVal) * 100));
      var hDesp = Math.max(4, Math.round((m.desp / maxVal) * 100));
      return '<div class="orc-hist-mes"><div class="orc-hist-bars">' +
        '<div class="orc-hist-bar receita" style="height:' + hRec + 'px" title="Receita: ' + UTILS.formatarMoeda(m.rec) + '"></div>' +
        '<div class="orc-hist-bar despesa" style="height:' + hDesp + 'px" title="Despesa: ' + UTILS.formatarMoeda(m.desp) + '"></div></div>' +
        '<span class="orc-hist-label">' + m.label + '</span>' +
        '<span class="orc-hist-saldo ' + (m.saldo >= 0 ? 'positivo' : 'negativo') + '">' + (m.saldo >= 0 ? '+' : '-') + UTILS.formatarMoeda(Math.abs(m.saldo)) + '</span></div>';
    }).join('') + '</div><div class="orc-hist-legenda">' +
      '<span class="orc-leg-item"><span class="orc-leg-dot receita"></span> Receita</span>' +
      '<span class="orc-leg-item"><span class="orc-leg-dot despesa"></span> Despesa</span></div>';
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
