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
        if (typeof ONBOARDING !== 'undefined' && ONBOARDING.registrarInteracao) {
          ONBOARDING.registrarInteracao({ aba: aba });
        }
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

    // Ações com listener próprio nos módulos (INIT_METAS, INIT_ASSINATURAS…).
    // Sem esta lista o dispatcher global emitia "Ação desconhecida" no console
    // mesmo com o formulário abrindo — falso negativo que a auditoria tratou
    // como falha de roteamento.
    var acoesDeModulo = {
      'meta-nova': true,
      'meta-aporte': true,
      'meta-excluir': true,
      'assinatura-nova': true,
      'assinatura-toggle': true,
      'assinatura-excluir': true,
      'assinatura-importar': true,
      'patrimonio-ativo-nova': true,
      'patrimonio-divida-nova': true,
      'patrimonio-ativo-editar': true,
      'patrimonio-divida-editar': true,
      'patrimonio-ativo-excluir': true,
      'patrimonio-divida-excluir': true,
      'patrimonio-importar-conta': true,
      'conta-nova': true,
      'conta-pagar': true,
      'conta-excluir': true,
      'conta-mes-prev': true,
      'conta-mes-next': true,
      'anexo-ver': true,
      'anexo-remover-salvo': true,
      'anexo-remover-pendente': true,
      'anexo-abrir': true,
      'billing-fechar': true,
      'billing-interval': true,
      'billing-assinar': true,
      'billing-login': true,
      'billing-restaurar': true,
      'billing-portal': true,
      'billing-cancelar': true,
      'of-fechar': true,
      'of-conectar-sandbox': true,
      'of-conectar-belvo': true,
      'of-sync': true,
      'of-desconectar': true
    };

    var actions = {
      'mudar-aba': function() {
        var aba = target.dataset.aba;
        if (typeof ONBOARDING !== 'undefined' && ONBOARDING.registrarInteracao) {
          ONBOARDING.registrarInteracao({ aba: aba });
        }
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
      // Exportação percorre todas as transações e monta o arquivo: passa de um
      // segundo em base grande. Sem bloquear o botão, o clique duplo gera dois
      // downloads e a impressão de que o app travou.
      'exportar-excel': function() {
        UTILS.comCarregamento(target, function() { return safeCall('exportarExcel'); }, 'Gerando...');
      },
      'exportar-pdf': function() {
        UTILS.comCarregamento(target, function() { return safeCall('exportarExtrato'); }, 'Gerando...');
      },
      'salvar-renda-orcamento': function() { safeCall('salvarRendaOrcamento'); },
      'editar-renda-orcamento': function() { safeCall('editarRendaOrcamento'); },
      'editar-regra-503020': function() { safeCall('editarRegra503020'); },
      'toggle-detalhes-categorias': function() { safeCall('toggleDetalhesCategorias'); },
      'toggle-graficos': function() { self.toggleGraficos(); },
      'toggle-previsao': function() { self.togglePrevisao(); },
      'toggle-relatorios': function() { self.toggleRelatorios(); },
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
      'exportar-dados': function() {
        UTILS.comCarregamento(target, function() { return safeCall('exportarDados'); }, 'Exportando...');
      },
      'abrir-import': function() { self.abrirImport(); },
      'abrir-changelog': function() { safeCall('abrirChangelog'); },
      'abrir-feedback': function() { safeCall('abrirFeedback'); },
      'abrir-plano': function() {
        if (typeof DADOS !== 'undefined' && DADOS._apiAtiva && !DADOS._apiAtiva()) return;
        if (typeof INIT_BILLING !== 'undefined' && INIT_BILLING.abrirPaywall) {
          INIT_BILLING.abrirPaywall();
        }
      },
      'abrir-open-finance': function() {
        if (typeof DADOS !== 'undefined' && DADOS._apiAtiva && !DADOS._apiAtiva()) return;
        if (typeof INIT_OPEN_FINANCE !== 'undefined' && INIT_OPEN_FINANCE.abrir) {
          INIT_OPEN_FINANCE.abrir();
        }
      },
      'limpar-dados': function() { 
        if (typeof CONFIG_USER !== 'undefined' && CONFIG_USER.limparDados) {
          CONFIG_USER.limparDados();
        }
      },
      'excluir-conta': function() { self.excluirConta(); }
    };

    if (actions[action]) {
      actions[action]();
    } else if (acoesDeModulo[action]) {
      return;
    } else {
      console.warn('[INIT_NAVIGATION] Ação desconhecida:', action);
    }
  },

  /**
   * Exclui a conta na nuvem — LGPD art. 18, VI e exigencia do Google Play.
   *
   * A API ja fazia o trabalho pesado (anonimiza o log de auditoria na mesma
   * transacao em que apaga o usuario). Faltava o caminho dentro do app: sem ele
   * o unico jeito era pedir por e-mail, e o Play recusa apps com criacao de
   * conta que nao oferecem exclusao in-app.
   *
   * Dupla confirmacao de proposito: e destrutivo, definitivo e nao tem desfazer.
   * Os dados locais ficam — apagar tudo de uma vez surpreenderia quem so queria
   * sair da nuvem e continuar usando offline. Quem quiser os dois usa tambem
   * "Apagar todos os dados".
   */
  excluirConta: function() {
    if (typeof DADOS === 'undefined' || !DADOS._apiAtiva()) return;

    var confirmar = (typeof INIT_MODALS !== 'undefined' && INIT_MODALS.confirm)
      ? INIT_MODALS.confirm.bind(INIT_MODALS)
      : function(msg, ok) { if (window.confirm(msg)) ok(); };

    confirmar(
      'Excluir sua conta apaga da nuvem seus lançamentos, contas, orçamentos e o cadastro. '
      + 'Não há como desfazer. Os dados salvos neste aparelho continuam aqui.',
      function() {
        confirmar('Confirma a exclusão definitiva da conta?', function() {
          DADOS._apiFetch('/api/v1/users/me', { method: 'DELETE' })
            .then(function() {
              DADOS.encerrarSessao();
              UTILS.mostrarToast('Conta excluída', 'info');
              if (typeof INIT_CONFIG !== 'undefined' && INIT_CONFIG.refreshPerfil) {
                INIT_CONFIG.refreshPerfil();
              }
            })
            .catch(function() {
              UTILS.mostrarToast('Não foi possível excluir agora. Tente de novo.', 'error');
            });
        });
      },
    );
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
    if (gArrow) gArrow.classList.toggle('expanded', !gAberto);
    if (gBtn)   gBtn.setAttribute('aria-expanded', String(!gAberto));
  },

  /**
   * Garante que um chunk lazy esteja carregado antes de usar seu global.
   * `isReady()` usa `typeof <GLOBAL>` nu — resolve tanto em dev (módulos eager,
   * escopo compartilhado) quanto em prod após o chunk injetado carregar (o
   * ambiente léxico global é compartilhado entre scripts clássicos, então até
   * módulos declarados com `const` — que NÃO vão para window — ficam visíveis).
   * onReady(justLoaded): justLoaded=true só na primeira carga real do chunk.
   */
  /**
   * Garante o chunk 'conta' (billing + 2FA + Open Finance) e roda o callback.
   *
   * Os três eram inicializados no boot. Ao virarem lazy, o `init()` de cada um
   * precisa acontecer na primeira carga — senão o módulo existe mas nunca se
   * liga aos elementos da tela, e o resultado é uma aba que parece funcionar
   * e não faz nada.
   *
   * Em DEV os módulos vêm eager: isReady() já é verdadeiro e o callback roda
   * na hora, sem nenhuma requisição.
   */
  carregarChunkConta: function(callback) {
    this._ensureChunk(
      'conta',
      function() { return typeof INIT_BILLING !== 'undefined'; },
      function(justLoaded) {
        if (justLoaded) {
          // Mesma ordem do lifecycle original.
          // Um init que falha não pode impedir os outros — mas precisa deixar
          // rastro: sem isso, "a aba de configurações não mostra o plano" vira
          // um relato sem nenhuma pista de investigação.
          [
            ['BILLING', typeof BILLING !== 'undefined' ? BILLING : null],
            ['INIT_BILLING', typeof INIT_BILLING !== 'undefined' ? INIT_BILLING : null],
            ['INIT_2FA', typeof INIT_2FA !== 'undefined' ? INIT_2FA : null],
            ['OPEN_FINANCE', typeof OPEN_FINANCE !== 'undefined' ? OPEN_FINANCE : null],
            ['INIT_OPEN_FINANCE', typeof INIT_OPEN_FINANCE !== 'undefined' ? INIT_OPEN_FINANCE : null]
          ].forEach(function(par) {
            var mod = par[1];
            if (!mod || typeof mod.init !== 'function') return;
            UTILS.tentar('chunk.conta.' + par[0] + '.init', function() { mod.init(); });
          });
        }
        if (typeof callback === 'function') callback();
      },
    );
  },

  _ensureChunk: function(chunk, isReady, onReady) {
    if (isReady()) { onReady(false); return; }
    if (typeof LAZY === 'undefined' || !LAZY.load) { onReady(false); return; }
    LAZY.load(chunk).then(function() { onReady(true); }).catch(function(e) {
      console.warn('[INIT_NAVIGATION] Falha ao carregar chunk', chunk, e);
    });
  },

  /**
   * Alterna painel de previsão financeira (Fase 8) — carrega o chunk sob demanda.
   */
  togglePrevisao: function() {
    var painel = document.getElementById('previsao-painel');
    var arrow  = document.getElementById('previsao-arrow');
    var btn    = document.getElementById('btn-previsao');
    if (!painel) return;
    var aberto = painel.style.display !== 'none';
    painel.style.display = aberto ? 'none' : 'block';
    if (arrow) arrow.classList.toggle('expanded', !aberto);
    if (btn)   btn.setAttribute('aria-expanded', String(!aberto));
    if (!aberto) {
      this._ensureChunk('previsao', function() { return typeof PREVISAO !== 'undefined'; }, function(justLoaded) {
        if (typeof PREVISAO === 'undefined') return;
        if (justLoaded && PREVISAO.init) UTILS.tentar('PREVISAO.init', PREVISAO.init);
        PREVISAO.renderizar();
      });
    }
  },

  toggleRelatorios: function() {
    var painel = document.getElementById('relatorios-panel');
    var arrow  = document.getElementById('relatorios-arrow');
    var btn    = document.getElementById('btn-relatorios');
    if (!painel) return;
    var aberto = painel.style.display !== 'none';
    painel.style.display = aberto ? 'none' : 'block';
    if (arrow) arrow.classList.toggle('expanded', !aberto);
    if (btn)   btn.setAttribute('aria-expanded', String(!aberto));
    if (!aberto) {
      this._ensureChunk('relatorios', function() { return typeof INIT_RELATORIOS !== 'undefined'; }, function() {
        if (typeof INIT_RELATORIOS !== 'undefined' && INIT_RELATORIOS.render) {
          INIT_RELATORIOS.render();
        }
      });
    }
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

  var tabLabels = {
    resumo: 'Resumo financeiro',
    novo: 'Novo lançamento',
    extrato: 'Extrato',
    orcamento: 'Orçamento',
    config: 'Perfil e configurações',
  };
  if (typeof ariaLive !== 'undefined' && ariaLive.announce) {
    ariaLive.announce('Aba ' + (tabLabels[nomeAba] || nomeAba));
  }

  // Reset de rolagem: trocar de aba sempre começa no topo (auditoria UI/UX P1-01)
  try {
    if (typeof window !== 'undefined' && window.scrollTo) {
      window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
    }
    var mainScroll = document.querySelector('.app-main, main, #app-content, .conteudo-principal');
    if (mainScroll) mainScroll.scrollTop = 0;
    if (alvo) alvo.scrollTop = 0;
    if (document.documentElement) document.documentElement.scrollTop = 0;
    if (document.body) document.body.scrollTop = 0;
  } catch (scrollErr) { /* noop */ }

  // Renderers opcionais
  setTimeout(function() {
    try {
      if (nomeAba === 'novo') {
        if (typeof INIT_FORM !== 'undefined') {
          if (INIT_FORM.renderizarSelects) INIT_FORM.renderizarSelects();
          if (INIT_FORM.renderQuickEntries) INIT_FORM.renderQuickEntries();
          var tipoAtual = (document.getElementById('novo-tipo') || {}).value || 'despesa';
          if (INIT_FORM.renderCategoriasBtns) INIT_FORM.renderCategoriasBtns(tipoAtual);
        } else if (typeof renderQuickEntries === 'function') {
          renderQuickEntries();
        }
        var vi = document.getElementById('novo-valor');
        if (vi) vi.focus();
      }
      if (nomeAba === 'extrato') {
        if (typeof INIT_EXTRATO !== 'undefined' && INIT_EXTRATO.filtrarExtrato) {
          INIT_EXTRATO.filtrarExtrato();
        } else if (typeof filtrarExtrato === 'function') {
          filtrarExtrato();
        }
      }
      if (nomeAba === 'orcamento') {
        if (typeof INIT_ORCAMENTO !== 'undefined' && INIT_ORCAMENTO.renderDashboard) {
          INIT_ORCAMENTO.renderDashboard();
        } else if (typeof renderOrcamentoDashboard === 'function') {
          renderOrcamentoDashboard();
        }
        if (typeof INIT_METAS !== 'undefined' && INIT_METAS.renderOrcamento) {
          INIT_METAS.renderOrcamento();
        }
        if (typeof INIT_ASSINATURAS !== 'undefined' && INIT_ASSINATURAS.render) {
          INIT_ASSINATURAS.render();
        }
        if (typeof INIT_PATRIMONIO !== 'undefined' && INIT_PATRIMONIO.render) {
          INIT_PATRIMONIO.render();
        }
      }
      if (nomeAba === 'config') {
        // Billing, 2FA e Open Finance saem do bundle eager (chunk 'conta') —
        // são ~45 KB que só interessam a quem abre esta aba. O chunk precisa
        // chegar ANTES do refreshPerfil: ele chama refreshPlanoCard, refreshUI
        // e refreshCard atrás de `typeof X !== 'undefined'`, e sem os módulos
        // essas guardas silenciariam a ausência em vez de acusá-la.
        INIT_NAVIGATION.carregarChunkConta(function() {
          if (typeof INIT_CONFIG !== 'undefined' && INIT_CONFIG.refreshPerfil) {
            INIT_CONFIG.refreshPerfil();
          } else if (typeof renderConfigTab === 'function') {
            renderConfigTab();
          }
        });
      }
    } catch (e) {
      console.warn('Erro ao renderizar aba:', e);
    }
  }, 0);
}

/** Botão voltar Android (Capacitor) — subpáginas voltam ao perfil */
window.__fpHandleAndroidBack = function() {
  var subpages = ['editar-perfil', 'gerenciar-bancos'];
  for (var i = 0; i < subpages.length; i++) {
    var page = document.getElementById('aba-' + subpages[i]);
    if (page && page.classList.contains('ativo')) {
      mudarAba('config');
      return true;
    }
  }
  return false;
};

// Export para compatibilidade
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { INIT_NAVIGATION, mudarAba };
}
