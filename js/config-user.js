/**
 * config-user.js - User Configuration and Settings
 * Tier 1: Depends on config.js, dados.js, utils.js
 *
 * ES Module (ADR 0005): os scripts clássicos o recebem como global por
 * js/esm/ponte.js.
 */

import { UTILS } from './core/utils.js';
import { TRANSACOES } from './transacoes.js';
import { ORCAMENTO } from './orcamento.js';
import { INIT_NAVIGATION } from './modules/init-navigation.js';
import { INIT_MODALS } from './modules/init-modals.js';
import { DADOS } from './core/dados.js';

const CONFIG_USER = {
  init: function() {
    CONFIG_USER.setupFormConfig();
    CONFIG_USER.aplicarTema();
    CONFIG_USER.observarTemaDoSistema();
  },

  setupFormConfig: function() {
    var formConfig = document.getElementById('form-config');
    if (formConfig) {
      var self = CONFIG_USER;
      formConfig.addEventListener('submit', function(e) {
        e.preventDefault();
        self.salvarConfiguracao();
      });
    }
    CONFIG_USER.preencherConfig();
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
    // O exportador mora no chunk 'config' (Perfil). O lembrete de backup do
    // dashboard chega aqui antes de o Perfil abrir: carrega e exporta.
    if (typeof INIT_NAVIGATION !== 'undefined' && INIT_NAVIGATION.carregarChunkConfig) {
      INIT_NAVIGATION.carregarChunkConfig(function() {
        if (typeof INIT_CONFIG !== 'undefined' && typeof INIT_CONFIG.exportarDados === 'function') {
          INIT_CONFIG.exportarDados();
        }
      });
      return;
    }
    // Sem o exportador, exportar um formato incompatível seria pior do que não
    // exportar: o usuário guardaria um backup que não restaura.
    UTILS.mostrarToast('Não foi possível exportar agora. Recarregue a página.', 'error');
  },

  limparDados: function() {
    var confirmar = (typeof INIT_MODALS !== 'undefined' && INIT_MODALS.fpConfirm)
      ? INIT_MODALS.fpConfirm.bind(INIT_MODALS)
      : (typeof fpConfirm === 'function' ? fpConfirm : function(msg, ok) { if (window.confirm(msg)) ok(); });

    confirmar(
      'Tem certeza? Todos os seus dados neste aparelho serão apagados permanentemente. Não há como desfazer.',
      function() {
        confirmar('Confirma o apagamento definitivo de todos os dados locais?', function() {
          DADOS.limparTodos();
          TRANSACOES.init();
          ORCAMENTO.init();
          UTILS.mostrarToast('Tudo apagado. Não sobrou nada neste aparelho.', 'warning');
          setTimeout(function() { location.reload(); }, 1500);
        });
      }
    );
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
    return CONFIG_USER.prefereEscuroNoSistema() ? 'dark' : 'light';
  },

  aplicarTema: function() {
    var isDark = CONFIG_USER.temaEfetivo() === 'dark';
    if (isDark) {
      document.documentElement.setAttribute('data-theme', 'dark');
    } else {
      document.documentElement.removeAttribute('data-theme');
    }
    try {
      localStorage.setItem('financaspro_tema', isDark ? 'dark' : 'light');
    } catch (e) { /* noop */ }
    var chk = document.getElementById('chk-darkmode');
    if (chk) chk.checked = isDark;
  },

  /**
   * Reage à troca de tema no sistema operacional enquanto o app está aberto.
   * Só age se o usuário ainda não escolheu manualmente — escolha explícita
   * nunca é sobrescrita.
   */
  observarTemaDoSistema: function() {
    if (CONFIG_USER._observandoTema) return;
    try {
      if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;
      var mq = window.matchMedia('(prefers-color-scheme: dark)');
      var self = CONFIG_USER;
      var aoMudar = function() {
        var cfg = DADOS.getConfig();
        if (cfg.tema === 'dark' || cfg.tema === 'light') return; // decisão do usuário manda
        self.aplicarTema();
      };
      // addEventListener é o caminho moderno; addListener cobre WebView antiga.
      if (typeof mq.addEventListener === 'function') mq.addEventListener('change', aoMudar);
      else if (typeof mq.addListener === 'function') mq.addListener(aoMudar);
      CONFIG_USER._observandoTema = true;
    } catch (e) { /* sem matchMedia, segue com o tema resolvido no boot */ }
  },

  toggleTema: function() {
    // A partir do primeiro toggle o tema passa a ser escolha explícita e deixa
    // de acompanhar o sistema.
    var novoTema = CONFIG_USER.temaEfetivo() === 'dark' ? 'light' : 'dark';
    DADOS.salvarConfig({ tema: novoTema });
    CONFIG_USER.aplicarTema();
    UTILS.mostrarToast(novoTema === 'dark' ? 'Modo escuro ativado' : 'Modo claro ativado', 'success');
  }
};

export { CONFIG_USER };
export default CONFIG_USER;
