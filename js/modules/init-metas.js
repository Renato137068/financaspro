/**
 * init-metas.js — UI de metas financeiras
 */
const INIT_METAS = {
  _bound: false,

  init: function() {
    if (this._bound) return;
    this._bound = true;
    var self = this;
    document.addEventListener('click', function(e) {
      var btn = e.target.closest('[data-action]');
      if (!btn) return;
      var action = btn.dataset.action;
      if (action === 'meta-nova') { e.preventDefault(); self.abrirFormNova(); }
      else if (action === 'meta-aporte') self.abrirFormAporte(btn.dataset.metaId);
      else if (action === 'meta-excluir') self.confirmarExcluir(btn.dataset.metaId);
    });
  },

  _iconHtml: function(name) {
    if (typeof lucideIconHtml === 'function') return lucideIconHtml(name || 'target');
    return '<i data-lucide="' + (name || 'target') + '" aria-hidden="true"></i>';
  },

  _tituloMeta: function(meta) {
    // Fallback defensivo: dados legados podem ter usado `nome` em vez de `titulo`.
    var t = (meta && (meta.titulo || meta.nome) || '').toString().trim();
    return t || 'Meta sem nome';
  },

  _renderCard: function(meta, compact) {
    var prog = METAS.calcularProjecao(meta);
    var barClass = prog.concluida ? 'otimo' : (prog.percentual >= 80 ? 'healthy' : 'attention');
    var prazoTxt = '';
    if (meta.prazo) {
      if (prog.diasRestantes !== null && prog.diasRestantes < 0) prazoTxt = 'Prazo vencido';
      else if (prog.diasRestantes === 0) prazoTxt = 'Vence hoje';
      else if (prog.diasRestantes !== null) prazoTxt = prog.diasRestantes + ' dias restantes';
      else prazoTxt = 'Até ' + UTILS.formatarData(meta.prazo);
    }

    // A barra diz onde a pessoa está; esta linha diz se ela chega lá. Sem o
    // valor do ajuste, "você está atrasado" é só ansiedade sem saída.
    var diagnostico = '';
    if (!compact) {
      var msg = METAS.mensagemProjecao(meta);
      if (msg) {
        var classeSituacao = {
          atrasado: 'meta-diagnostico--alerta',
          vencida: 'meta-diagnostico--erro',
          adiantado: 'meta-diagnostico--ok',
          'no-ritmo': 'meta-diagnostico--ok',
          concluida: 'meta-diagnostico--ok'
        }[prog.situacao] || 'meta-diagnostico--neutro';
        diagnostico = '<p class="meta-diagnostico ' + classeSituacao + '">'
          + UTILS.escapeHtml(msg) + '</p>';
      }
    }

    var actions = '';
    if (!compact && !prog.concluida) {
      actions =
        '<div class="meta-card-actions">' +
          '<button type="button" class="btn-secundario btn-sm" data-action="meta-aporte" data-meta-id="' + UTILS.escapeHtml(meta.id) + '">+ Aporte</button>' +
          '<button type="button" class="btn-ghost btn-sm meta-btn-danger" data-action="meta-excluir" data-meta-id="' + UTILS.escapeHtml(meta.id) + '" aria-label="Excluir meta">Excluir</button>' +
        '</div>';
    }

    return '<article class="meta-card' + (compact ? ' meta-card--compact' : '') + (prog.concluida ? ' meta-card--done' : '') + '">' +
      '<div class="meta-card-header">' +
        '<span class="meta-card-icon">' + this._iconHtml(meta.icone) + '</span>' +
        '<div class="meta-card-titles">' +
          '<h4 class="meta-card-title">' + UTILS.escapeHtml(this._tituloMeta(meta)) + '</h4>' +
          (prazoTxt ? '<span class="meta-card-prazo">' + UTILS.escapeHtml(prazoTxt) + '</span>' : '') +
        '</div>' +
        '<span class="meta-card-pct">' + prog.percentual + '%</span>' +
      '</div>' +
      '<div class="meta-card-valores">' +
        '<span>' + UTILS.formatarMoeda(meta.valorAtual) + '</span>' +
        '<span class="meta-card-alvo">de ' + UTILS.formatarMoeda(meta.valorAlvo) + '</span>' +
      '</div>' +
      '<div class="orc-progress meta-progress">' +
        '<div class="orc-progress-fill ' + barClass + '" style="width:' + prog.percentual + '%"></div>' +
      '</div>' +
      (prog.concluida ? '<p class="meta-card-done-msg"><i data-lucide="check-circle" aria-hidden="true"></i> Meta concluída!</p>' : diagnostico) +
      actions +
    '</article>';
  },

  renderOrcamento: function() {
    var el = document.getElementById('metas-list');
    if (!el || typeof METAS === 'undefined') return;
    var metas = METAS.listar();
    if (metas.length === 0) {
      el.innerHTML = '<div class="meta-empty">' +
        '<div class="meta-empty-icon">' + this._iconHtml('target') + '</div>' +
        '<p class="meta-empty-title">Nenhuma meta ainda</p>' +
        '<p class="meta-empty-desc">Crie metas para viagem, reserva de emergência, carro ou qualquer objetivo.</p>' +
        '<button type="button" class="btn-primario" data-action="meta-nova">Criar primeira meta</button>' +
      '</div>';
    } else {
      el.innerHTML = metas.map(function(m) { return INIT_METAS._renderCard(m, false); }).join('');
    }
    if (typeof renderLucideIconsNow === 'function') renderLucideIconsNow(el);
  },

  renderResumo: function() {
    var el = document.getElementById('dashboard-metas-resumo');
    var sec = document.getElementById('secao-metas-resumo');
    if (!el || typeof METAS === 'undefined') return;
    var ativas = METAS.listar(true).slice(0, 3);
    if (sec) sec.style.display = METAS.listar().length === 0 ? 'none' : '';
    if (ativas.length === 0) {
      el.innerHTML = '';
      return;
    }
    el.innerHTML = ativas.map(function(m) { return INIT_METAS._renderCard(m, true); }).join('');
    if (typeof renderLucideIconsNow === 'function') renderLucideIconsNow(el);
  },

  abrirFormNova: function() {
    var html =
      '<div class="meta-form">' +
        '<label class="form-label" for="meta-titulo">Nome da meta</label>' +
        '<input type="text" id="meta-titulo" class="form-input" placeholder="Ex: Viagem, Reserva de emergência" maxlength="60">' +
        '<label class="form-label" for="meta-valor">Valor alvo (R$)</label>' +
        '<input type="text" id="meta-valor" class="form-input campo-moeda" placeholder="0,00" inputmode="decimal" autocomplete="off">' +
        '<p class="campo-moeda-preview" id="meta-valor-preview" hidden></p>' +
        '<label class="form-label" for="meta-atual">Já guardado (opcional)</label>' +
        '<input type="text" id="meta-atual" class="form-input campo-moeda" placeholder="0,00" inputmode="decimal" autocomplete="off">' +
        '<p class="campo-moeda-preview" id="meta-atual-preview" hidden></p>' +
        '<label class="form-label" for="meta-prazo">Prazo (opcional)</label>' +
        '<input type="date" id="meta-prazo" class="form-input">' +
        '<label class="form-label" for="meta-icone">Ícone</label>' +
        '<select id="meta-icone" class="form-input">' +
          '<option value="target">Geral</option>' +
          '<option value="plane">Viagem</option>' +
          '<option value="shield">Reserva</option>' +
          '<option value="car">Carro</option>' +
          '<option value="home">Casa</option>' +
          '<option value="book-open">Educação</option>' +
        '</select>' +
      '</div>';

    var self = this;
    if (typeof INIT_MODALS !== 'undefined' && INIT_MODALS.fpAlert) {
      INIT_MODALS.fpAlert(html, {
        trustedHtml: true,
        title: 'Nova meta financeira',
        okLabel: 'Criar meta',
        onOk: function(ov) {
          try {
            self._salvarNova(ov);
            return false; // _salvarNova já remove o overlay
          } catch (err) {
            UTILS.mostrarToast(err.message || 'Erro ao criar meta', 'error');
            return false;
          }
        }
      });
      setTimeout(function() {
        if (typeof UTILS !== 'undefined' && UTILS.bindCampoMoeda) {
          UTILS.bindCampoMoeda(document.getElementById('meta-valor'), { previewId: 'meta-valor-preview' });
          UTILS.bindCampoMoeda(document.getElementById('meta-atual'), { previewId: 'meta-atual-preview' });
        }
      }, 0);
    }
  },

  _salvarNova: function(overlay) {
    try {
      var titulo = document.getElementById('meta-titulo').value;
      var prazo = document.getElementById('meta-prazo').value || null;
      var icone = document.getElementById('meta-icone').value || 'target';
      METAS.criar({
        titulo: titulo,
        valorAlvo: UTILS.parseMoeda(document.getElementById('meta-valor').value),
        valorAtual: UTILS.parseMoeda(document.getElementById('meta-atual').value),
        prazo: prazo,
        icone: icone
      });
      overlay.remove();
      UTILS.mostrarToast('Meta criada', 'success');
      this.renderOrcamento();
      this.renderResumo();
    } catch (err) {
      UTILS.mostrarToast(err.message || 'Erro ao criar meta', 'error');
    }
  },

  abrirFormAporte: function(metaId) {
    var meta = METAS.obter(metaId);
    if (!meta) return;
    var prog = METAS.calcularProgresso(meta);
    var html =
      '<p style="margin-bottom:12px">Aporte em <strong>' + UTILS.escapeHtml(this._tituloMeta(meta)) + '</strong></p>' +
      '<p style="font-size:13px;color:var(--text-muted);margin-bottom:12px">Faltam ' + UTILS.formatarMoeda(prog.restante) + '</p>' +
      '<label class="form-label" for="meta-aporte-valor">Valor do aporte (R$)</label>' +
      '<input type="text" id="meta-aporte-valor" class="form-input campo-moeda" placeholder="0,00" inputmode="decimal" autocomplete="off">' +
      '<p class="campo-moeda-preview" id="meta-aporte-preview" hidden></p>';

    var self = this;
    INIT_MODALS.fpAlert(html, {
      trustedHtml: true,
      title: 'Registrar aporte',
      okLabel: 'Confirmar',
      onOk: function(ov) {
        try {
          var valor = UTILS.parseMoeda(document.getElementById('meta-aporte-valor').value);
          METAS.registrarAporte(metaId, valor);
          ov.remove();
          UTILS.mostrarToast('Aporte registrado', 'success');
          self.renderOrcamento();
          self.renderResumo();
          return false;
        } catch (e) {
          UTILS.mostrarToast(e.message || 'Erro', 'error');
          return false;
        }
      }
    });
    setTimeout(function() {
      if (UTILS.bindCampoMoeda) {
        UTILS.bindCampoMoeda(document.getElementById('meta-aporte-valor'), { previewId: 'meta-aporte-preview' });
      }
    }, 0);
  },

  confirmarExcluir: function(metaId) {
    var meta = METAS.obter(metaId);
    if (!meta) return;
    var self = this;
    var msg = 'Excluir a meta "' + this._tituloMeta(meta) + '"?';
    if (typeof INIT_MODALS !== 'undefined' && INIT_MODALS.confirm) {
      INIT_MODALS.confirm(msg, function() {
        METAS.excluir(metaId);
        UTILS.mostrarToast('Meta excluída', 'info');
        self.renderOrcamento();
        self.renderResumo();
      });
    } else if (window.confirm(msg)) {
      METAS.excluir(metaId);
      self.renderOrcamento();
      self.renderResumo();
    }
  }
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = INIT_METAS;
}

/* P2.5: dashboard notifica inscritos — ordem 10 (metas primeiro) */
(function() {
  if (typeof RENDER_DASHBOARD === 'undefined' || !RENDER_DASHBOARD.onRender) return;
  if (INIT_METAS._dashboardHooked) return;
  INIT_METAS._dashboardHooked = true;
  RENDER_DASHBOARD.onRender(function() {
    if (INIT_METAS.renderResumo) INIT_METAS.renderResumo();
  }, 10);
})();
