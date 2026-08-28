/**
 * healthService.js - checks locais de saude da aplicacao.
 */
var HEALTH_SERVICE = {
  verificarArmazenamento: function() {
    try {
      var usado = 0;
      for (var key in localStorage) {
        if (Object.prototype.hasOwnProperty.call(localStorage, key)) {
          usado += localStorage[key].length + key.length;
        }
      }
      var usadoMB = Number((usado / 1024 / 1024).toFixed(2));
      if (usadoMB > 5 && typeof IndexedDB !== 'undefined') {
        console.warn('Storage > 5MB (' + usadoMB + 'MB), considere IndexedDB');
      }
      return { usadoMB: usadoMB };
    } catch (e) {
      console.warn('Erro ao verificar storage:', e);
      return { usadoMB: 0, erro: e.message };
    }
  },

  verificarBackupAutomatico: function(options) {
    options = options || {};
    try {
      var diasLimite = options.diasLimite || 7;
      var config = DADOS.getConfig();
      var ultimo = config.ultimoExportoDados;
      var txs = DADOS.getTransacoes();
      if (!Array.isArray(txs) || txs.length < 5) return false;

      var precisa = !ultimo;
      if (ultimo) {
        var dias = (Date.now() - new Date(ultimo).getTime()) / (1000 * 60 * 60 * 24);
        precisa = dias > diasLimite;
      }
      if (!precisa || sessionStorage.getItem('_avisoBackup')) return false;
      sessionStorage.setItem('_avisoBackup', '1');

      setTimeout(function() {
        if (typeof UTILS === 'undefined' || !UTILS.mostrarBanner) return;
        var msg = ultimo
          ? 'Faz mais de ' + diasLimite + ' dias desde seu último backup. Exporte seus dados para não perder nada.'
          : 'Você tem ' + txs.length + ' transações sem backup. Exporte seus dados para não perder nada.';
        UTILS.mostrarBanner({
          id: 'backup-reminder-banner',
          mensagem: msg,
          acao: 'Exportar',
          tipo: 'info',
          onAcao: function() {
            if (typeof CONFIG_USER !== 'undefined' && CONFIG_USER.exportarDados) {
              CONFIG_USER.exportarDados();
            }
          }
        });
      }, options.delay || 3000);
      return true;
    } catch (e) {
      console.warn('Backup auto-check falhou:', e);
      return false;
    }
  },

  /**
   * Exporta JSON técnico para suporte — sem descrições de lançamentos.
   */
  exportarDiagnostico: function() {
    var diag = {
      geradoEm: new Date().toISOString(),
      app: 'FinançasPro',
      painel: (typeof FINANCE_RECONCILER !== 'undefined' && FINANCE_RECONCILER.verificarPainel)
        ? FINANCE_RECONCILER.verificarPainel() : null,
      storage: (typeof DADOS !== 'undefined' && DADOS.usoArmazenamento)
        ? DADOS.usoArmazenamento() : null,
      transacoes: {
        total: (typeof DADOS !== 'undefined' && DADOS.getTransacoes) ? DADOS.getTransacoes().length : 0,
        backend: (typeof DADOS !== 'undefined' && DADOS._transacoesBackend) ? DADOS._transacoesBackend : 'unknown'
      },
      fila: (typeof PERSIST_QUEUE !== 'undefined' && PERSIST_QUEUE.getSnapshot)
        ? PERSIST_QUEUE.getSnapshot() : null,
      lifecycle: (typeof LIFECYCLE !== 'undefined' && LIFECYCLE.getStatus)
        ? LIFECYCLE.getStatus() : null,
      sessao: (typeof SESSION_LOG !== 'undefined' && SESSION_LOG.snapshot)
        ? SESSION_LOG.snapshot() : []
    };

    if (typeof SESSION_LOG !== 'undefined') {
      SESSION_LOG.registrar('exportar_diagnostico', { eventos: diag.sessao.length });
    }

    var nome = 'financaspro-diagnostico-' + new Date().toISOString().slice(0, 10) + '.json';
    var blob = new Blob([JSON.stringify(diag, null, 2)], { type: 'application/json' });
    var url = URL.createObjectURL(blob);
    var link = document.createElement('a');
    link.href = url;
    link.download = nome;
    link.click();
    URL.revokeObjectURL(url);
    return diag;
  },

  _rotuloEventoSessao: function(tipo) {
    var mapa = {
      init_dados: 'App iniciou',
      merge_multiaba: 'Sincronizou com outra aba',
      conflito_multiaba: 'Conflito detectado',
      conflito_resolvido: 'Conflito resolvido',
      exportar_diagnostico: 'Diagnóstico exportado',
      replay_sessao_aberto: 'Replay da sessão aberto',
      exportar_replay_html: 'Replay HTML exportado'
    };
    return mapa[tipo] || tipo;
  },

  _detalheEventoSessao: function(evt) {
    if (!evt || !evt.detalhe) return '';
    var d = evt.detalhe;
    if (d.qtd != null) return d.qtd + ' lançamento(s)';
    if (d.conflitos != null && d.total != null) {
      return d.conflitos + ' conflito(s), ' + d.total + ' total';
    }
    if (d.eventos != null) return d.eventos + ' evento(s)';
    if (d.backend) return 'backend ' + d.backend;
    try { return JSON.stringify(d); } catch (e) { return ''; }
  },

  _montarListaReplayHtml: function(eventos) {
    var self = this;
    var html = '';
    (eventos || []).slice().reverse().forEach(function(evt) {
      var hora = evt.iso ? evt.iso.replace('T', ' ').slice(0, 19) : '';
      var rotulo = self._rotuloEventoSessao(evt.tipo);
      var det = self._detalheEventoSessao(evt);
      html += '<li><strong>' + UTILS.escapeHtml(hora) + '</strong> — ';
      html += UTILS.escapeHtml(rotulo);
      if (det) {
        html += '<br><span class="det">' + UTILS.escapeHtml(det) + '</span>';
      }
      html += '</li>';
    });
    return html;
  },

  _montarDocumentoReplayHtml: function(eventos) {
    var lista = this._montarListaReplayHtml(eventos);
    var gerado = new Date().toISOString();
    var totalTx = (typeof DADOS !== 'undefined' && DADOS.getTransacoes)
      ? DADOS.getTransacoes().length : null;
    return '<!doctype html><html lang="pt-BR"><head><meta charset="utf-8">' +
      '<meta name="viewport" content="width=device-width,initial-scale=1">' +
      '<title>FinançasPro — replay da sessão</title>' +
      '<style>body{font:16px/1.6 system-ui,sans-serif;max-width:720px;margin:32px auto;padding:0 20px;color:#10231a}' +
      'h1{font-size:24px;margin:0 0 8px}.meta{color:#607269;font-size:14px;margin-bottom:24px}' +
      'ol{padding-left:22px}li{margin:0 0 14px}.det{color:#607269;font-size:13px}' +
      'footer{margin-top:32px;padding-top:16px;border-top:1px solid #d9e6df;color:#607269;font-size:13px}</style></head><body>' +
      '<h1>Replay da sessão — FinançasPro</h1>' +
      '<p class="meta">Gerado em ' + UTILS.escapeHtml(gerado.replace('T', ' ').slice(0, 19)) +
      (totalTx != null ? ' · ' + totalTx + ' transações no app' : '') +
      ' · ' + (eventos || []).length + ' evento(s)</p>' +
      '<ol>' + lista + '</ol>' +
      '<footer>Sem descrições de lançamentos · anexe este arquivo ao ticket de suporte.</footer>' +
      '</body></html>';
  },

  /**
   * Baixa HTML standalone da timeline (tickets de suporte).
   */
  exportarReplaySessao: function() {
    if (typeof SESSION_LOG === 'undefined' || !SESSION_LOG.snapshot) {
      if (typeof UTILS !== 'undefined') UTILS.mostrarToast('Replay indisponível', 'error');
      return null;
    }
    var eventos = SESSION_LOG.snapshot();
    if (!eventos.length) {
      if (typeof UTILS !== 'undefined') UTILS.mostrarToast('Nenhum evento nesta sessão ainda', 'info');
      return null;
    }
    var html = this._montarDocumentoReplayHtml(eventos);
    var nome = 'financaspro-replay-' + new Date().toISOString().slice(0, 10) + '.html';
    var blob = new Blob([html], { type: 'text/html;charset=utf-8' });
    var url = URL.createObjectURL(blob);
    var link = document.createElement('a');
    link.href = url;
    link.download = nome;
    link.click();
    URL.revokeObjectURL(url);
    SESSION_LOG.registrar('exportar_replay_html', { eventos: eventos.length });
    return html;
  },

  /**
   * Modal com timeline dos eventos da sessão (modo suporte).
   */
  mostrarReplaySessao: function() {
    if (typeof SESSION_LOG === 'undefined' || !SESSION_LOG.snapshot) {
      if (typeof UTILS !== 'undefined') UTILS.mostrarToast('Replay indisponível', 'error');
      return;
    }
    var eventos = SESSION_LOG.snapshot();
    if (!eventos.length) {
      if (typeof UTILS !== 'undefined') UTILS.mostrarToast('Nenhum evento nesta sessão ainda', 'info');
      return;
    }
    SESSION_LOG.registrar('replay_sessao_aberto', { eventos: eventos.length });

    var self = this;
    var html = '<ol class="session-replay-list" style="text-align:left;margin:0;padding-left:1.2em;max-height:52vh;overflow:auto;line-height:1.5">' +
      this._montarListaReplayHtml(eventos).replace(/class="det"/g, 'style="color:var(--color-text-secondary,#607269);font-size:13px"') +
      '</ol>';

    if (typeof INIT_MODALS !== 'undefined' && INIT_MODALS.fpAlert) {
      INIT_MODALS.fpAlert(html, {
        title: 'Replay da sessão',
        trustedHtml: true,
        okLabel: 'Fechar'
      });
    }
  }
};

function verificarArmazenamento() {
  return HEALTH_SERVICE.verificarArmazenamento();
}

function verificarBackupAutomatico() {
  return HEALTH_SERVICE.verificarBackupAutomatico();
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = HEALTH_SERVICE;
}
