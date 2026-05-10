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
        console.log('Storage > 5MB (' + usadoMB + 'MB), considere IndexedDB');
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
        if (typeof fpConfirm !== 'function') return;
        var msg = ultimo
          ? 'Faz mais de ' + diasLimite + ' dias desde seu ultimo backup. Exportar dados agora?'
          : 'Voce tem ' + txs.length + ' transacoes sem backup. Exportar dados?';
        fpConfirm(msg, function() {
          if (typeof CONFIG_USER !== 'undefined' && CONFIG_USER.exportarDados) {
            CONFIG_USER.exportarDados();
          }
        }, 'Backup');
      }, options.delay || 3000);
      return true;
    } catch (e) {
      console.warn('Backup auto-check falhou:', e);
      return false;
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
