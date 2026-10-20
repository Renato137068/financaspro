/**
 * healthService.js - checks locais de saude da aplicacao.
 *
 * ES Module (ADR 0005): os scripts clássicos o recebem como global por
 * js/esm/ponte.js.
 */

import { UTILS } from '../core/utils.js';
import { SESSION_LOG } from '../core/session-log.js';
import { LAZY } from '../core/lazy-load.js';
import { PERSIST_QUEUE } from '../core/persist-queue.js';
import { FINANCE_RECONCILER } from '../utilities/finance-reconciler.js';
import { CONFIG_USER } from '../config-user.js';
import { DADOS } from '../core/dados.js';
// Replay da sessão: módulo sob demanda (chunk "replay"), fora do boot.
function carregarReplaySessao() {
  return LAZY.load('replay').then(function() { return window.REPLAY_SESSAO; });
}

const HEALTH_SERVICE = {
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
      // O sessionStorage só segura o aviso dentro de uma sessão: cada vez que o
      // app abria, o banner voltava por cima do cabeçalho. Agora ele aparece no
      // máximo uma vez a cada `diasLimite` dias, mesmo sem backup feito.
      var CHAVE_ULTIMO_AVISO = 'fp-lembrete-exportar-em';
      var ultimoAviso = Number(localStorage.getItem(CHAVE_ULTIMO_AVISO)) || 0;
      if (ultimoAviso && (Date.now() - ultimoAviso) < diasLimite * 24 * 60 * 60 * 1000) return false;
      sessionStorage.setItem('_avisoBackup', '1');
      localStorage.setItem(CHAVE_ULTIMO_AVISO, String(Date.now()));

      setTimeout(function() {
        if (typeof UTILS === 'undefined' || !UTILS.mostrarBanner) return;
        var msg = ultimo
          ? 'Faz mais de ' + diasLimite + ' dias desde seu último backup. Exporte seus dados para não perder nada.'
          : 'Você tem ' + txs.length + ' transações sem backup. Exporte seus dados para não perder nada.';
        UTILS.mostrarBanner({
          id: 'backup-reminder-banner',
          // No fluxo do Resumo, abaixo da saudação: flutuando, cobria o
          // cabeçalho no celular e cortava o "Bom dia" no desktop.
          apos: 'dashboard-greeting',
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
  exportarDiagnostico: async function() {
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
      // Busca tardia: o LIFECYCLE é a raiz de composição e importa o app
      // inteiro; um serviço-folha não pode depender dele só para um diagnóstico.
      lifecycle: (typeof window !== 'undefined' && window.LIFECYCLE && window.LIFECYCLE.getStatus)
        ? window.LIFECYCLE.getStatus() : null,
      sessao: (typeof SESSION_LOG !== 'undefined' && SESSION_LOG.snapshot)
        ? SESSION_LOG.snapshot() : [],
      // Linha de base do lançamento: contagens e medianas, sem valores nem descrições.
      // Linha de base do lançamento, carregada sob demanda (sem ela, null).
      lancamentos: await LAZY.load('metricas').then(function() {
        return window.METRICAS_LANCAMENTO.resumo();
      }, function() { return null; })
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

  /** Baixa o HTML da timeline da sessão (replay carregado sob demanda). */
  exportarReplaySessao: function() {
    return carregarReplaySessao().then(function(R) { return R.exportar(); });
  },

  /** Modal com a timeline da sessão (replay carregado sob demanda). */
  mostrarReplaySessao: function() {
    return carregarReplaySessao().then(function(R) { R.mostrar(); });
  }
};

function verificarArmazenamento() {
  return HEALTH_SERVICE.verificarArmazenamento();
}

function verificarBackupAutomatico() {
  return HEALTH_SERVICE.verificarBackupAutomatico();
}

export { HEALTH_SERVICE, verificarArmazenamento, verificarBackupAutomatico };
export default HEALTH_SERVICE;
