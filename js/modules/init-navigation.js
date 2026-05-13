/**
 * init-navigation.js - Sistema de navegação e abas
 * Extraído do init.js para modularização
 * Responsabilidades: navegação entre abas, action bindings
 */

const INIT_NAVIGATION = {
  _listeners: [],
  _initialized: false,

  /**
   * Inicializa sistema de navegação
   */
  init: function() {
    if (this._initialized) {
      console.warn('[INIT_NAVIGATION] Já inicializado, ignorando...');
      return;
    }
    this.setupNavigation();
    this.setupActionBindings();
    this._initialized = true;
  },

  /**
   * Limpa listeners (útil para re-inicialização)
   */
  cleanup: function() {
    this._listeners.forEach(function(fn) {
      document.removeEventListener('click', fn);
    });
    this._listeners = [];
    this._initialized = false;
  },

  /**
   * Configura navegação inicial
   */
  setupNavigation: function() {
    var navButtons = document.querySelectorAll('.nav-btn');
    if (navButtons.length > 0 && navButtons[0].click) {
      navButtons[0].click();
    }
  },

  /**
   * Configura bindings de ações globais
   */
  setupActionBindings: function() {
    // Handler genérico para botões com data-mudar-aba
    var handlerMudarAba = function(e) {
      var muda = e.target.closest('[data-mudar-aba]');
      if (muda) {
        var aba = muda.dataset.mudarAba;
        if (aba && typeof mudarAba === 'function') {
          try {
            mudarAba(aba);
          } catch (err) {
            console.error('[INIT_NAVIGATION] Erro ao mudar aba:', err);
          }
        }
      }
    };

    // Handler principal de ações
    var handlerAction = function(e) {
      var target = e.target.closest('[data-action]');
      if (!target) return;

      var action = target.dataset.action;
      try {
        INIT_NAVIGATION.handleAction(action, target);
      } catch (err) {
        console.error('[INIT_NAVIGATION] Erro na ação', action, ':', err);
      }
    };

    document.addEventListener('click', handlerMudarAba);
    document.addEventListener('click', handlerAction);

    this._listeners.push(handlerMudarAba, handlerAction);
  },

  /**
   * Dispacha ações baseado no data-action
   */
  handleAction: function(action, target) {
    // ES5 compatible (sem arrow functions)
    var self = this;

    var safeCall = function(fnName, args) {
      if (typeof window[fnName] === 'function') {
        return window[fnName].apply(null, args || []);
      }
      console.warn('[INIT_NAVIGATION] Função não disponível:', fnName);
    };

    var actions = {
      'mudar-aba': function() {
        var aba = target.dataset.aba;
        if (aba && typeof mudarAba === 'function') mudarAba(aba);
      },
      'abrir-entrada-rapida': function() { safeCall('abrirEntradaRapida'); },
      'navegar-periodo': function() { 
        var dir = parseInt(target.dataset.dir || '0', 10);
        safeCall('navegarPeriodo', [dir]); 
      },
      'filtro-tipo': function() { 
        safeCall('setFiltroTipo', [target.dataset.filtro || 'todos']); 
      },
      'exportar-excel': function() { safeCall('exportarExcel'); },
      'exportar-pdf': function() { safeCall('exportarExtrato'); },
      'salvar-renda-orcamento': function() { safeCall('salvarRendaOrcamento'); },
      'editar-renda-orcamento': function() { safeCall('editarRendaOrcamento'); },
      'editar-regra-503020': function() { safeCall('editarRegra503020'); },
      'toggle-detalhes-categorias': function() { safeCall('toggleDetalhesCategorias'); },
      'toggle-graficos': function() { self.toggleGraficos(); },
      'toggle-previsao': function() { self.togglePrevisao(); },
      'ver-mais-alertas': function() {
        if (typeof ALERTAS !== 'undefined') {
          var painel = document.getElementById('secao-alertas-painel');
          if (painel) {
            painel.style.display = 'block';
            ALERTAS.renderizarPainel();
          }
        }
      },
      'abrir-editar-perfil': function() { 
        if (typeof INIT_CONFIG !== 'undefined' && typeof INIT_CONFIG.abrirEditarPerfil === 'function') {
          INIT_CONFIG.abrirEditarPerfil();
        }
      },
      'abrir-editar-renda': function() { safeCall('abrirEditarRenda'); },
      'abrir-config-bancos': function() { 
        if (typeof INIT_CONFIG !== 'undefined' && typeof INIT_CONFIG.abrirConfigBancos === 'function') {
          INIT_CONFIG.abrirConfigBancos();
        }
      },
      'gerenciar-categorias': function() { 
        safeCall('abrirGerenciarCategorias', [target.dataset.tipo]); 
      },
      'exportar-dados': function() { safeCall('exportarDados'); },
      'abrir-import': function() { self.abrirImport(); },
      'abrir-changelog': function() { safeCall('abrirChangelog'); },
      'abrir-feedback': function() { safeCall('abrirFeedback'); },
      'limpar-dados': function() { 
        if (typeof CONFIG_USER !== 'undefined' && CONFIG_USER.limparDados) {
          CONFIG_USER.limparDados();
        }
      }
    };

    if (actions[action]) {
      actions[action]();
    } else {
      console.warn('[INIT_NAVIGATION] Ação desconhecida:', action);
    }
  },

  /**
   * Alterna painel de gráficos
   */
  toggleGraficos: function() {
    var gPanel = document.getElementById('graficos-panel');
    var gArrow = document.getElementById('graficos-arrow');
    var gBtn   = document.getElementById('btn-graficos');
    if (!gPanel) return;
    var gAberto = gPanel.style.display !== 'none';
    gPanel.style.display = gAberto ? 'none' : 'block';
    if (gArrow) gArrow.textContent = gAberto ? '▼' : '▲';
    if (gBtn)   gBtn.setAttribute('aria-expanded', String(!gAberto));
  },

  /**
   * Alterna painel de previsão financeira (Fase 8)
   */
  togglePrevisao: function() {
    var painel = document.getElementById('previsao-painel');
    var arrow  = document.getElementById('previsao-arrow');
    var btn    = document.getElementById('btn-previsao');
    if (!painel) return;
    var aberto = painel.style.display !== 'none';
    painel.style.display = aberto ? 'none' : 'block';
    if (arrow) arrow.textContent = aberto ? '▼' : '▲';
    if (btn)   btn.setAttribute('aria-expanded', String(!aberto));
    if (!aberto && typeof PREVISAO !== 'undefined') PREVISAO.renderizar();
  },

  /**
   * Abre diálogo de importação
   */
  abrirImport: function() {
    var importInput = document.getElementById('import-file');
    if (importInput) importInput.click();
  }
};

/**
 * Função global de mudança de aba (mantida para compatibilidade)
 * @param {string} nomeAba - Nome da aba a ser ativada
 */
function mudarAba(nomeAba) {
  // Mostrar/esconder abas
  var abas = document.querySelectorAll('[id^="aba-"]');
  for (var i = 0; i < abas.length; i++) {
    abas[i].classList.remove('ativo');
    abas[i].setAttribute('aria-hidden','true');
  }

  var alvo = document.getElementById('aba-' + nomeAba);
  if (alvo) {
    alvo.classList.add('ativo');
    alvo.removeAttribute('aria-hidden');
  }

  // Ativar botão de navegação
  var navBtns = document.querySelectorAll('.nav-btn');
  for (var j = 0; j < navBtns.length; j++) {
    navBtns[j].classList.remove('ativo');
    navBtns[j].removeAttribute('aria-current');
  }

  var btns = document.querySelectorAll('[data-aba="' + nomeAba + '"]');
  for (var k = 0; k < btns.length; k++) {
    btns[k].classList.add('ativo');
    btns[k].setAttribute('aria-current','page');
  }

  // Renderers opcionais
  setTimeout(function() {
    try {
      if (nomeAba === 'novo') {
        if (typeof renderQuickEntries === 'function') renderQuickEntries();
        var vi = document.getElementById('novo-valor');
        if (vi) vi.focus();
      }
      if (nomeAba === 'extrato' && typeof filtrarExtrato === 'function') {
        filtrarExtrato();
      }
      if (nomeAba === 'orcamento' && typeof renderOrcamentoDashboard === 'function') {
        renderOrcamentoDashboard();
      }
      if (nomeAba === 'config' && typeof renderConfigTab === 'function') {
        renderConfigTab();
      }
    } catch (e) {
      console.warn('Erro ao renderizar aba:', e);
    }
  }, 0);
}

// Export para compatibilidade
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { INIT_NAVIGATION, mudarAba };
}
