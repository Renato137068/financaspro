/**
 * replay-sessao.js — timeline da sessão para o suporte (modo suporte).
 *
 * Fica fora do boot: o HEALTH_SERVICE carrega este módulo sob demanda (chunk
 * "replay") quando a pessoa pede o replay. Nada aqui grava dados do
 * lançamento: só eventos da sessão, já sem descrições.
 *
 * ES Module (ADR 0005): o chunk o publica em window.REPLAY_SESSAO.
 */
import { UTILS } from '../core/utils.js';
import { SESSION_LOG } from '../core/session-log.js';
import { DADOS } from '../core/dados.js';
import { INIT_MODALS } from '../modules/init-modals.js';

const REPLAY_SESSAO = {
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
    var self = REPLAY_SESSAO;
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
    var lista = REPLAY_SESSAO._montarListaReplayHtml(eventos);
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
  exportar: function() {
    if (typeof SESSION_LOG === 'undefined' || !SESSION_LOG.snapshot) {
      if (typeof UTILS !== 'undefined') UTILS.mostrarToast('Replay indisponível', 'error');
      return null;
    }
    var eventos = SESSION_LOG.snapshot();
    if (!eventos.length) {
      if (typeof UTILS !== 'undefined') UTILS.mostrarToast('Nenhum evento nesta sessão ainda', 'info');
      return null;
    }
    var html = REPLAY_SESSAO._montarDocumentoReplayHtml(eventos);
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
  mostrar: function() {
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

    var html = '<ol class="session-replay-list" style="text-align:left;margin:0;padding-left:1.2em;max-height:52vh;overflow:auto;line-height:1.5">' +
      REPLAY_SESSAO._montarListaReplayHtml(eventos).replace(/class="det"/g, 'style="color:var(--color-text-secondary,#607269);font-size:13px"') +
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

export { REPLAY_SESSAO };
export default REPLAY_SESSAO;
