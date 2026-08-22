/**
 * config-user.js - User Configuration and Settings
 * Tier 1: Depends on config.js, dados.js, utils.js
 */

var CONFIG_USER = {
  init: function() {
    this.setupFormConfig();
    this.aplicarTema();
    this.observarTemaDoSistema();
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

  /**
   * Exporta o backup. Delega para INIT_CONFIG — que é o formato que o
   * importador sabe ler.
   *
   * Antes existiam DOIS exportadores gerando arquivos diferentes com o mesmo
   * nome: este produzia { transacoes, contas, config } e o de INIT_CONFIG
   * produzia { transacoes, config, orcamentos, anexos }. O importador só lê o
   * segundo. Quem exportava pelo lembrete automático de backup (healthService,
   * que chamava esta função) levava um arquivo que perderia orçamentos e
   * anexos na restauração — sem aviso nenhum.
   */
  exportarDados: function() {
    if (typeof INIT_CONFIG !== 'undefined' && typeof INIT_CONFIG.exportarDados === 'function') {
      return INIT_CONFIG.exportarDados();
    }
    // Sem INIT_CONFIG carregado, exportar um formato incompatível seria pior do
    // que não exportar: o usuário guardaria um backup que não restaura.
    UTILS.mostrarToast('Exportação indisponível — recarregue a página', 'error');
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

  /**
   * O sistema operacional está em modo escuro?
   * Devolve false onde matchMedia não existe (WebView antiga, jsdom).
   */
  prefereEscuroNoSistema: function() {
    try {
      return typeof window !== 'undefined'
        && typeof window.matchMedia === 'function'
        && window.matchMedia('(prefers-color-scheme: dark)').matches;
    } catch (e) {
      return false;
    }
  },

  /**
   * Tema efetivo: escolha explícita do usuário vence; na ausência dela, segue
   * o sistema.
   *
   * Antes desta mudança, quem usa o celular em modo escuro abria o app e
   * levava uma tela branca na cara até descobrir o toggle nas configurações.
   * A preferência do sistema é um sinal que o usuário já deu — ignorá-lo é
   * pedir que ele repita a mesma decisão em cada app.
   */
  temaEfetivo: function(config) {
    var cfg = config || DADOS.getConfig();
    if (cfg.tema === 'dark' || cfg.tema === 'light') return cfg.tema;
    return this.prefereEscuroNoSistema() ? 'dark' : 'light';
  },

  aplicarTema: function() {
    var isDark = this.temaEfetivo() === 'dark';
    if (isDark) {
      document.documentElement.setAttribute('data-theme', 'dark');
    } else {
      document.documentElement.removeAttribute('data-theme');
    }
    var chk = document.getElementById('chk-darkmode');
    if (chk) chk.checked = isDark;
  },

  /**
   * Reage à troca de tema no sistema operacional enquanto o app está aberto.
   * Só age se o usuário ainda não escolheu manualmente — escolha explícita
   * nunca é sobrescrita.
   */
  observarTemaDoSistema: function() {
    if (this._observandoTema) return;
    try {
      if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;
      var mq = window.matchMedia('(prefers-color-scheme: dark)');
      var self = this;
      var aoMudar = function() {
        var cfg = DADOS.getConfig();
        if (cfg.tema === 'dark' || cfg.tema === 'light') return; // decisão do usuário manda
        self.aplicarTema();
      };
      // addEventListener é o caminho moderno; addListener cobre WebView antiga.
      if (typeof mq.addEventListener === 'function') mq.addEventListener('change', aoMudar);
      else if (typeof mq.addListener === 'function') mq.addListener(aoMudar);
      this._observandoTema = true;
    } catch (e) { /* sem matchMedia, segue com o tema resolvido no boot */ }
  },

  toggleTema: function() {
    // A partir do primeiro toggle o tema passa a ser escolha explícita e deixa
    // de acompanhar o sistema.
    var novoTema = this.temaEfetivo() === 'dark' ? 'light' : 'dark';
    DADOS.salvarConfig({ tema: novoTema });
    this.aplicarTema();
    UTILS.mostrarToast(novoTema === 'dark' ? 'Modo escuro ativado' : 'Modo claro ativado', 'success');
  }
};

// Exporta para teste como os demais módulos. Também resolve o aviso de
// "variável não usada": num script clássico o objeto é consumido via global,
// o que o linter não enxerga.
if (typeof module !== 'undefined' && module.exports) {
  module.exports = CONFIG_USER;
}
