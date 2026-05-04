/**
 * config-user.js - User Configuration and Settings
 * Tier 1: Depends on config.js, dados.js, utils.js
 */

var CONFIG_USER = {
  init: function() {
    this.setupFormConfig();
    this.aplicarTema();
  },

  setupFormConfig: function() {
    var formConfig = document.getElementById('form-config');
    if (formConfig) {
      var self = this;
      formConfig.addEventListener('submit', function(e) {
        e.preventDefault();
        self.salvarConfiguracao();
      });
    }
    this.preencherConfig();
  },

  preencherConfig: function() {
    // New config tab uses renderConfigTab() in init.js
    // Keep for backwards compatibility
    if (typeof renderConfigTab === 'function') renderConfigTab();
  },

  salvarConfiguracao: function() {
    // Legacy — now handled by individual modals in init.js
  },

  exportarDados: function() {
    var dados = DADOS.exportarDados();
    var json = JSON.stringify(dados, null, 2);
    var element = document.createElement('a');
    element.setAttribute('href', 'data:application/json;charset=utf-8,' + encodeURIComponent(json));
    element.setAttribute('download', 'financaspro-backup-' + new Date().toISOString().split('T')[0] + '.json');
    element.style.display = 'none';
    document.body.appendChild(element);
    element.click();
    document.body.removeChild(element);
    UTILS.mostrarToast('Dados exportados!', 'success');
    DADOS.salvarConfig({ ultimoExportoDados: new Date().toISOString() });
  },

  limparDados: function() {
    fpConfirm('Tem certeza? Todos os seus dados serao apagados permanentemente.', function() {
      DADOS.limparTodos();
      TRANSACOES.init();
      ORCAMENTO.init();
      UTILS.mostrarToast('Todos os dados foram apagados.', 'warning');
      setTimeout(function() { location.reload(); }, 1500);
    });
  },

  aplicarTema: function() {
    var config = DADOS.getConfig();
    var isDark = config.tema === 'dark';
    if (isDark) {
      document.documentElement.setAttribute('data-theme', 'dark');
    } else {
      document.documentElement.removeAttribute('data-theme');
    }
    var chk = document.getElementById('chk-darkmode');
    if (chk) chk.checked = isDark;
  },

  toggleTema: function() {
    var config = DADOS.getConfig();
    var novoTema = config.tema === 'dark' ? 'light' : 'dark';
    DADOS.salvarConfig({ tema: novoTema });
    this.aplicarTema();
    UTILS.mostrarToast(novoTema === 'dark' ? 'Modo escuro ativado' : 'Modo claro ativado', 'success');
  }
};
