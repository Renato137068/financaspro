/**
 * config-user.js - User Configuration and Settings
 * Tier 1: Depends on config.js, dados.js, utils.js
 */

var CONFIG_USER = {
  init: function() {
    this.setupFormConfig();
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
    var config = DADOS.getConfig();
    var nome = document.getElementById('cfg-nome');
    var renda = document.getElementById('cfg-renda');
    if (nome) nome.value = config.nome || '';
    if (renda && config.renda) renda.value = config.renda;
  },

  salvarConfiguracao: function() {
    var nome = document.getElementById('cfg-nome');
    var renda = document.getElementById('cfg-renda');
    var config = {};
    if (nome) config.nome = nome.value.trim() || 'Usuario';
    if (renda) config.renda = parseFloat(renda.value) || 0;
    DADOS.salvarConfig(config);
    UTILS.mostrarToast('Configuracoes salvas!', 'success');
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
    if (config.tema === 'dark') {
      document.documentElement.setAttribute('data-theme', 'dark');
    }
  }
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = CONFIG_USER;
}
