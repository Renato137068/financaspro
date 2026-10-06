/**
 * init-config.js - Sistema de configurações e utilitários
 * Extraído do init.js para modularização
 * Responsabilidades: tela do Perfil, edição de perfil e renda, validações,
 * interruptores (alerta de orçamento, cifragem, lembrete) e sessão.
 *
 * Backup (importar/exportar) está em config-backup.js; bancos, cartões e
 * categorias, em config-bancos.js. Os dois vêm logo depois deste no chunk
 * lazy 'config' e acrescentam seus métodos a INIT_CONFIG.
 *
 * ES Module (ADR 0005): chega sob demanda no chunk 'config'
 * (js/esm/chunks/config.js, via LAZY.load), que o publica em window.
 */

import { CONFIG } from '../core/config.js';
import { UTILS } from '../core/utils.js';
import { LAZY } from '../core/lazy-load.js';
import { LOCAL_CRYPTO } from '../utilities/local-crypto.js';
import { INSIGHT_ACOES } from './insight-acoes.js';
import { CONFIG_USER } from '../config-user.js';
import { RENDER } from '../render.js';
import { INIT_MODALS } from './init-modals.js';
import { togglePinSeguranca } from '../pin.js';
import { BILLING } from '../billing.js';
import { AUTH_BIOMETRIC } from '../auth-biometric.js';
import { DAILY_REMINDER } from '../utilities/daily-reminder.js';
import { DADOS } from '../core/dados.js';

const INIT_CONFIG = {
  _planoBadgeInfo: function(plano) {
    var raw = String(plano || 'free').toLowerCase().trim();
    if (raw === 'business' || raw === 'enterprise') {
      return { label: 'Business', className: 'perfil-avatar-badge--business' };
    }
    if (raw === 'premium' || raw === 'pro' || raw === 'paid' || raw === 'plus') {
      return { label: 'Pro', className: 'perfil-avatar-badge--premium' };
    }
    return { label: 'Grátis', className: 'perfil-avatar-badge--gratis' };
  },

  /**
   * Inicializa sistema de configurações
   */
  init: function() {
    INIT_CONFIG.setupImport();
    INIT_CONFIG.setupInsightActions();
    // O logout vive em authController.setupLogoutButton (#btn-logout). Havia
    // aqui uma segunda implementação, ligada a um #logout-btn que não existe no
    // HTML e que limpava 'fp-user-token'/'fp-user-data' — chaves que o app nunca
    // gravou. Além de morta, teria deixado a sessão real intacta se rodasse.
    INIT_CONFIG._bindToggles();
    INIT_CONFIG._bindKeyboardNavigation();
    INIT_CONFIG._bindSairOutrosAparelhos();
    INIT_CONFIG._updateDynamicValues();
    INIT_CONFIG._bindEditarPerfilEvents();
    INIT_CONFIG._bindBancosEvents();
    INIT_CONFIG.aplicarVisibilidadeNuvem();
  },

  /**
   * Esconde as superficies que dependem de nuvem quando nao ha nuvem.
   *
   * O build Android do piloto roda em modo local: sem Supabase, nada sobe para
   * servidor nenhum. Mesmo assim a aba Perfil continuava oferecendo
   * assinatura e verificacao em duas etapas -- recursos que so existem com
   * nuvem.
   *
   * Isso nao era so ruido de interface. A folha de respostas do Data safety da
   * Play Store declara, para o piloto, que o app NAO coleta nem compartilha
   * dados; um app que oferece criacao de conta, cobranca e conexao bancaria
   * contradiz essa declaracao, e a revisao do Google compara as duas coisas.
   * Alem disso, exibir preco e botao de assinar dentro do app, levando a um
   * checkout externo, e o padrao que a politica de pagamentos do Google proibe
   * fora dos mercados onde o link externo foi liberado -- o Brasil nao esta
   * entre eles.
   *
   * A condicao deriva de `DADOS._nuvemAtiva()` em vez de um flag proprio: assim
   * nao ha um segundo interruptor para esquecer de virar. Configure o
   * Supabase e a nuvem reaparece sozinha.
   */
  aplicarVisibilidadeNuvem: function() {
    var temNuvem = typeof DADOS !== 'undefined'
      && typeof DADOS._nuvemAtiva === 'function'
      && DADOS._nuvemAtiva();

    var alvos = document.querySelectorAll('[data-requer-nuvem]');
    for (var i = 0; i < alvos.length; i++) {
      var el = alvos[i];
      el.hidden = !temNuvem;
      el.style.display = temNuvem ? '' : 'none';
    }
    return temNuvem;
  },

  /** Atualiza perfil + toggles (substitui renderConfigTab legado) */
  refreshPerfil: function() {
    INIT_CONFIG._updateDynamicValues();
    var config = DADOS.getConfig();
    var chk = document.getElementById('chk-darkmode');
    if (chk) chk.checked = config.tema === 'dark';
    var chkAlerta = document.getElementById('chk-alerta-orc');
    if (chkAlerta) chkAlerta.checked = !!config.alertaOrcamento;
    var chkLembrete = document.getElementById('chk-lembrete');
    if (chkLembrete) chkLembrete.checked = !!config.lembreteDiario;
    var chkObs = document.getElementById('chk-obs-erros');
    if (chkObs) chkObs.checked = config.obsErrorsEnabled !== false;
    var chkPin = document.getElementById('chk-pin');
    if (chkPin) chkPin.checked = !!config.pinAtivo;
    var pinStatus = document.getElementById('perfil-pin-status');
    if (pinStatus) pinStatus.textContent = config.pinAtivo ? 'PIN ativo' : 'PIN desativado';
    // Subtítulo do card: deixa explícito que o PIN só oculta saldos.
    var pinToggleStatus = document.getElementById('perfil-pin-toggle-status');
    if (pinToggleStatus) {
      pinToggleStatus.textContent = config.pinAtivo
        ? 'Ativo — oculta saldos'
        : 'Desativado';
    }
    // Verde = proteção ativa. Com o PIN desativado o selo vira neutro: mostrar
    // uma proteção DESLIGADA em verde lê como "tudo certo", que é o oposto.
    var pinPill = document.getElementById('security-pin-status');
    if (pinPill) pinPill.classList.toggle('security-indicator--neutro', !config.pinAtivo);
    INIT_CONFIG._refreshContaStatus();
    INIT_CONFIG._refreshCryptoToggle();
    INIT_CONFIG._refreshExportHint();
    INIT_CONFIG._refreshSairOutrosBtn();
    INIT_CONFIG._updateAppFooter();
    INIT_CONFIG._updateLembreteStatus();
    if (typeof INIT_BILLING !== 'undefined' && INIT_BILLING.refreshPlanoCard) {
      INIT_BILLING.refreshPlanoCard();
    }
    if (typeof INIT_2FA !== 'undefined' && INIT_2FA.refreshUI) {
      INIT_2FA.refreshUI();
    }
    if (typeof AUTH_BIOMETRIC !== 'undefined' && AUTH_BIOMETRIC.refreshBiometricUI) {
      AUTH_BIOMETRIC.refreshBiometricUI();
    }
  },

  _updateAppFooter: function() {
    var el = document.getElementById('perfil-app-footer');
    if (!el) return;
    var ver = (typeof CONFIG !== 'undefined' && CONFIG.VERSION) ? CONFIG.VERSION : '11.0.0';
    var modo = 'Dados salvos localmente';
    var sessao = typeof DADOS !== 'undefined' && DADOS.getSessao ? DADOS.getSessao() : null;
    if (sessao && sessao.user && sessao.user.email) {
      modo = 'Conta conectada · backup em JSON disponível';
    }
    el.textContent = 'FinançasPro v' + ver + ' · ' + modo;
  },

  _updateLembreteStatus: function() {
    var el = document.getElementById('perfil-lembrete-status');
    if (!el) return;
    var config = DADOS.getConfig();
    if (!config.lembreteDiario) {
      el.textContent = 'Notificação do navegador ou app';
      return;
    }
    if (typeof DAILY_REMINDER !== 'undefined' && DAILY_REMINDER.isSupported()) {
      if (Notification.permission === 'granted') el.textContent = 'Ativo — permissão concedida';
      else if (Notification.permission === 'denied') el.textContent = 'Bloqueado nas configurações do sistema';
      else el.textContent = 'Aguardando permissão de notificação';
    } else {
      el.textContent = 'Não suportado neste navegador';
    }
  },

  /**
   * Configura event listeners para edição de perfil
   */
  _bindEditarPerfilEvents: function() {
    // Formulário de edição de perfil
    var formEditar = document.getElementById('form-editar-perfil');
    if (formEditar) {
      formEditar.addEventListener('submit', function(e) {
        e.preventDefault();
        var dados = {
          nome: document.getElementById('editar-nome').value,
          email: document.getElementById('editar-email').value,
          telefone: document.getElementById('editar-telefone').value,
          nascimento: document.getElementById('editar-nascimento').value,
          endereco: document.getElementById('editar-endereco').value,
          cidade: document.getElementById('editar-cidade').value,
          moeda: document.getElementById('editar-moeda').value
        };
        INIT_CONFIG.salvarPerfilCompleto(dados);
      });
    }
    
    // Botão voltar
    var btnVoltar = document.querySelector('[data-action="voltar-perfil"]');
    if (btnVoltar) {
      btnVoltar.addEventListener('click', function() {
        INIT_CONFIG.voltarPerfil();
      });
    }
    
    // Botão cancelar
    var btnCancelar = document.querySelector('[data-action="cancelar-editar-perfil"]');
    if (btnCancelar) {
      btnCancelar.addEventListener('click', function() {
        INIT_CONFIG.voltarPerfil();
      });
    }
  },

  /**
   * Configura event listeners para gerenciamento de bancos
   */
  _bindBancosEvents: function() {
    // Formulário para adicionar banco
    var formBanco = document.getElementById('form-adicionar-banco');
    if (formBanco) {
      formBanco.addEventListener('submit', function(e) {
        e.preventDefault();
        var nome = document.getElementById('banco-nome').value;
        var tipo = document.getElementById('banco-tipo').value;
        INIT_CONFIG.adicionarBanco(nome, tipo);
      });
    }
    
    // Formulário para adicionar cartão
    var formCartao = document.getElementById('form-adicionar-cartao');
    if (formCartao) {
      formCartao.addEventListener('submit', function(e) {
        e.preventDefault();
        var nome = document.getElementById('cartao-nome').value;
        var bandeira = document.getElementById('cartao-bandeira').value;
        var limite = document.getElementById('cartao-limite').value;
        var fechamento = (document.getElementById('cartao-fechamento') || {}).value;
        var vencimento = (document.getElementById('cartao-vencimento') || {}).value;
        INIT_CONFIG.adicionarCartao(nome, bandeira, limite, fechamento, vencimento);
      });
    }

    if (typeof UTILS !== 'undefined' && UTILS.bindCampoMoeda) {
      UTILS.bindCampoMoeda(document.getElementById('cartao-limite'), {
        previewId: 'cartao-limite-preview'
      });
    }
    
    // Event delegation para botões de remover
    document.addEventListener('click', function(e) {
      var btn = e.target.closest('.btn-remover-banco');
      if (btn) {
        var index = parseInt(btn.dataset.index);
        var tipo = btn.dataset.tipo;
        if (tipo === 'cartao') {
          INIT_CONFIG.removerCartao(index);
        } else {
          INIT_CONFIG.removerBanco(index);
        }
        return;
      }
      var btnEd = e.target.closest('.btn-editar-cartao');
      if (btnEd) {
        INIT_CONFIG.editarCartao(parseInt(btnEd.dataset.index, 10));
      }
    });
  },

  /**
   * Atualiza valores dinâmicos na interface
   */
  _updateDynamicValues: function() {
    var config = DADOS.getConfig();
    
    // Atualizar nome do usuário
    var nomeDisplay = document.getElementById('perfil-nome-display');
    if (nomeDisplay) {
      nomeDisplay.textContent = (!config.nome || config.nome === 'Usuario') ? 'Usuário' : config.nome;
    }
    
    // Atualizar avatar com inicial
    var avatar = document.getElementById('perfil-avatar');
    var nomeAvatar = (!config.nome || config.nome === 'Usuario') ? 'Usuário' : config.nome;
    if (avatar && nomeAvatar) {
      avatar.textContent = nomeAvatar.charAt(0).toUpperCase();
    }
    
    // Último acesso real (não a hora atual inventada)
    var lastAccessEl = document.getElementById('perfil-last-access');
    if (lastAccessEl) {
      var prev = config.ultimoAcessoApp;
      if (prev) {
        var d = new Date(prev);
        if (!isNaN(d.getTime())) {
          lastAccessEl.textContent = 'Último acesso: ' +
            d.toLocaleDateString('pt-BR') + ' às ' +
            d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
        } else {
          lastAccessEl.textContent = 'Sessão neste aparelho';
        }
      } else {
        lastAccessEl.textContent = 'Primeiro acesso neste aparelho';
      }
      if (!INIT_CONFIG._acessoRegistrado) {
        INIT_CONFIG._acessoRegistrado = true;
        try {
          DADOS.salvarConfig({ ultimoAcessoApp: new Date().toISOString() });
        } catch (_e) { /* noop */ }
      }
    }
    
    // Atualizar badge de plano (fonte: entitlement BILLING, não config.plano)
    var planBadge = document.getElementById('perfil-plan-badge');
    if (planBadge) {
      var planoFonte = config.plano;
      if (typeof BILLING !== 'undefined' && BILLING.getTier) {
        planoFonte = BILLING.planoFromTier
          ? BILLING.planoFromTier(BILLING.getTier())
          : String(BILLING.getTier() || 'FREE').toLowerCase();
      }
      var info = INIT_CONFIG._planoBadgeInfo(planoFonte);
      planBadge.textContent = info.label;
      planBadge.className = 'perfil-avatar-badge ' + info.className;
    }
    
    // Atualizar display de bancos
    var bancosDisplay = document.getElementById('perfil-bancos-display');
    if (bancosDisplay) {
      var bancos = config.bancos || [];
      var cartoes = config.cartoes || [];
      var total = bancos.length + cartoes.length;
      bancosDisplay.textContent = total > 0 ? total + ' cadastrado(s)' : 'Nenhum cadastrado';
    }
    
    // Atualizar último backup
    var ultimoBackup = document.getElementById('perfil-ultimo-backup');
    if (ultimoBackup && config.ultimoExportoDados) {
      var dataBackup = new Date(config.ultimoExportoDados);
      ultimoBackup.textContent = dataBackup.toLocaleDateString('pt-BR');
    }
  },

  _bindToggles: function() {
    var bind = function(id, ev, fn) {
      var el = document.getElementById(id);
      if (el) el.addEventListener(ev, fn);
    };
    bind('chk-darkmode',  'change', function() { if (typeof CONFIG_USER !== 'undefined') CONFIG_USER.toggleTema(); });
    bind('chk-alerta-orc','change', function() { INIT_CONFIG.toggleAlertaOrcamento(); });
    bind('chk-lembrete',  'change', function() { INIT_CONFIG.toggleLembreteDiario(); });
    bind('chk-pin',       'change', function() { if (typeof togglePinSeguranca === 'function') togglePinSeguranca(); });
    bind('chk-crypto',    'change', function(e) { INIT_CONFIG.toggleCriptografia(!!e.target.checked); });
    bind('chk-obs-erros', 'change', function(e) { DADOS.salvarConfig({ obsErrorsEnabled: !!e.target.checked }); });
    bind('btn-refazer-onboarding', 'click', function() {
      var abrir = function() {
        if (typeof ONBOARDING !== 'undefined' && ONBOARDING.reiniciar) ONBOARDING.reiniciar();
      };
      // O tour mora no chunk 'onboarding' (só abre por este botão).
      if (typeof ONBOARDING !== 'undefined' || typeof LAZY === 'undefined') { abrir(); return; }
      LAZY.load('onboarding').then(abrir).catch(function() {
        UTILS.mostrarToast('Não foi possível abrir o tour agora. Tente de novo.', 'error');
      });
    });
  },

  /**
   * Hint do export: offline = só este aparelho; nuvem = backup local complementar.
   */
  _refreshExportHint: function() {
    var el = document.getElementById('perfil-export-hint');
    if (!el) return;
    var naNuvem = typeof BILLING !== 'undefined' && BILLING.isCloudUser && BILLING.isCloudUser();
    el.textContent = naNuvem
      ? 'JSON com lançamentos, contas e preferências. A nuvem continua sendo a fonte da verdade da conta.'
      : 'JSON com lançamentos, contas e preferências deste aparelho.';
  },

  // O selo dizia "Conta protegida" sempre, inclusive em sessão local e logo
  // ao lado de "PIN desativado". Agora diz onde os dados estão, e só fica
  // verde quando há login na nuvem.
  _refreshContaStatus: function() {
    var texto = document.getElementById('perfil-conta-status');
    var pill = document.getElementById('security-account-status');
    if (!texto || !pill) return;
    var naNuvem = typeof BILLING !== 'undefined' && BILLING.isCloudUser && BILLING.isCloudUser();
    texto.textContent = naNuvem ? 'Conta com login' : 'Só neste aparelho';
    pill.classList.toggle('security-indicator--neutro', !naNuvem);
  },

  _refreshSairOutrosBtn: function() {
    var btn = document.getElementById('btn-sair-outros');
    if (!btn) return;
    var naNuvem = typeof BILLING !== 'undefined' && BILLING.isCloudUser && BILLING.isCloudUser();
    btn.disabled = !naNuvem;
    var st = document.getElementById('perfil-sessoes-status');
    if (st) {
      st.textContent = naNuvem
        ? 'Desconectar todos, menos este'
        : 'Requer login na nuvem';
    }
  },

  /**
   * Desconecta sessões nos outros aparelhos (Supabase scope: others).
   */
  _bindSairOutrosAparelhos: function() {
    var btn = document.getElementById('btn-sair-outros');
    if (!btn || btn._fpBoundSairOutros) return;
    btn._fpBoundSairOutros = true;
    var self = INIT_CONFIG;
    self._refreshSairOutrosBtn();
    btn.addEventListener('click', function() {
      var naNuvem = typeof BILLING !== 'undefined' && BILLING.isCloudUser && BILLING.isCloudUser();
      btn.disabled = !naNuvem;
      if (!naNuvem) {
        if (typeof UTILS !== 'undefined' && UTILS.mostrarToast) {
          UTILS.mostrarToast('Requer login na nuvem', 'info');
        }
        return;
      }
      var go = function() {
        if (typeof SUPA_AUTH === 'undefined' || !SUPA_AUTH.signOutOthers) {
          if (typeof UTILS !== 'undefined' && UTILS.mostrarToast) {
            UTILS.mostrarToast('Indisponível neste modo.', 'warning');
          }
          return;
        }
        SUPA_AUTH.signOutOthers().then(function() {
          if (typeof UTILS !== 'undefined' && UTILS.mostrarToast) {
            UTILS.mostrarToast('Outros aparelhos desconectados.', 'success');
          }
        }).catch(function(err) {
          if (typeof UTILS !== 'undefined' && UTILS.mostrarToast) {
            UTILS.mostrarToast((err && err.message) || 'Não foi possível desconectar.', 'error');
          }
        });
      };
      var msg = 'Desconectar todos os outros aparelhos? Este permanece conectado.';
      if (typeof INIT_MODALS !== 'undefined' && INIT_MODALS.fpConfirm) {
        INIT_MODALS.fpConfirm(msg, go);
      } else if (typeof fpConfirm === 'function') {
        fpConfirm(msg, go);
      } else if (window.confirm(msg)) {
        go();
      }
    });
  },

  /**
   * P2.2: teclado delegado no container — cobre cards presentes no init e
   * os que aparecem depois (modais). BUTTON/A nativos já tratam Enter/Espaço.
   */
  _bindKeyboardNavigation: function() {
    if (INIT_CONFIG._perfilKeyNavBound) return;
    INIT_CONFIG._perfilKeyNavBound = true;
    var root = document.getElementById('aba-config') || document;
    root.addEventListener('keydown', function(e) {
      if (e.key !== 'Enter' && e.key !== ' ') return;
      var card = e.target.closest('.perfil-card[role="button"]');
      if (!card || !root.contains(card)) return;
      if (card.tagName === 'BUTTON' || card.tagName === 'A') return;
      e.preventDefault();
      card.click();
    });
  },

  /**
   * Valida nome de usuário
   */
  _validateNome: function(nome) {
    if (!nome || typeof nome !== 'string') {
      return { valid: false, message: 'Nome é obrigatório' };
    }
    var trimmed = nome.trim();
    if (trimmed.length < 2) {
      return { valid: false, message: 'Nome deve ter pelo menos 2 caracteres' };
    }
    if (trimmed.length > 100) {
      return { valid: false, message: 'Nome deve ter no máximo 100 caracteres' };
    }
    if (!/^[a-zA-ZÀ-ÿ\s\-']+$/.test(trimmed)) {
      return { valid: false, message: 'Nome contém caracteres inválidos' };
    }
    return { valid: true, value: trimmed };
  },

  /**
   * Valida email
   */
  _validateEmail: function(email) {
    if (!email || typeof email !== 'string') {
      return { valid: true, value: '' }; // Email é opcional
    }
    var trimmed = email.trim();
    if (trimmed === '') {
      return { valid: true, value: '' };
    }
    if (trimmed.length > 100) {
      return { valid: false, message: 'Email deve ter no máximo 100 caracteres' };
    }
    var emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(trimmed)) {
      return { valid: false, message: 'Email inválido' };
    }
    return { valid: true, value: trimmed };
  },

  /**
   * Valida telefone
   */
  _validateTelefone: function(telefone) {
    if (!telefone || typeof telefone !== 'string') {
      return { valid: true, value: '' }; // Telefone é opcional
    }
    var trimmed = telefone.trim();
    if (trimmed === '') {
      return { valid: true, value: '' };
    }
    if (trimmed.length > 15) {
      return { valid: false, message: 'Telefone deve ter no máximo 15 caracteres' };
    }
    // Aceita formatos: (XX) XXXXX-XXXX, XX XXXXX-XXXX, XXXXXXXXXX
    var telefoneRegex = /^(\(\d{2}\)\s?\d{5}-\d{4}|\d{2}\s?\d{5}-\d{4}|\d{10,11})$/;
    if (!telefoneRegex.test(trimmed)) {
      return { valid: false, message: 'Telefone inválido. Use formato: (XX) XXXXX-XXXX' };
    }
    return { valid: true, value: trimmed };
  },

  /**
   * Valida data de nascimento
   */
  _validateNascimento: function(nascimento) {
    if (!nascimento) {
      return { valid: true, value: '' }; // Data é opcional
    }
    var data = new Date(nascimento);
    if (isNaN(data.getTime())) {
      return { valid: false, message: 'Data de nascimento inválida' };
    }
    var hoje = new Date();
    var idade = hoje.getFullYear() - data.getFullYear();
    var mes = hoje.getMonth() - data.getMonth();
    if (mes < 0 || (mes === 0 && hoje.getDate() < data.getDate())) {
      idade--;
    }
    if (idade < 0) {
      return { valid: false, message: 'Data de nascimento não pode ser futura' };
    }
    if (idade > 150) {
      return { valid: false, message: 'Data de nascimento inválida' };
    }
    return { valid: true, value: nascimento };
  },

  /**
   * Valida endereço
   */
  _validateEndereco: function(endereco) {
    if (!endereco || typeof endereco !== 'string') {
      return { valid: true, value: '' }; // Endereço é opcional
    }
    var trimmed = endereco.trim();
    if (trimmed === '') {
      return { valid: true, value: '' };
    }
    if (trimmed.length > 200) {
      return { valid: false, message: 'Endereço deve ter no máximo 200 caracteres' };
    }
    return { valid: true, value: trimmed };
  },

  /**
   * Valida cidade
   */
  _validateCidade: function(cidade) {
    if (!cidade || typeof cidade !== 'string') {
      return { valid: true, value: '' }; // Cidade é opcional
    }
    var trimmed = cidade.trim();
    if (trimmed === '') {
      return { valid: true, value: '' };
    }
    if (trimmed.length > 50) {
      return { valid: false, message: 'Cidade deve ter no máximo 50 caracteres' };
    }
    if (!/^[a-zA-ZÀ-ÿ\s\-']+$/.test(trimmed)) {
      return { valid: false, message: 'Cidade contém caracteres inválidos' };
    }
    return { valid: true, value: trimmed };
  },

  /**
   * Valida nome de banco
   */
  _validateBancoNome: function(nome) {
    if (!nome || typeof nome !== 'string') {
      return { valid: false, message: 'Nome do banco é obrigatório' };
    }
    var trimmed = nome.trim();
    if (trimmed.length < 2) {
      return { valid: false, message: 'Nome deve ter pelo menos 2 caracteres' };
    }
    if (trimmed.length > 50) {
      return { valid: false, message: 'Nome deve ter no máximo 50 caracteres' };
    }
    if (!/^[a-zA-Z0-9À-ÿ\s\-']+$/.test(trimmed)) {
      return { valid: false, message: 'Nome contém caracteres inválidos' };
    }
    return { valid: true, value: trimmed };
  },

  /**
   * Valida nome de categoria
   */
  _validateCategoriaNome: function(nome) {
    if (!nome || typeof nome !== 'string') {
      return { valid: false, message: 'Nome da categoria é obrigatório' };
    }
    var trimmed = nome.trim();
    if (trimmed.length < 2) {
      return { valid: false, message: 'Nome deve ter pelo menos 2 caracteres' };
    }
    if (trimmed.length > 30) {
      return { valid: false, message: 'Nome deve ter no máximo 30 caracteres' };
    }
    if (!/^[a-zA-Z0-9À-ÿ\s\-']+$/.test(trimmed)) {
      return { valid: false, message: 'Nome contém caracteres inválidos' };
    }
    return { valid: true, value: trimmed };
  },

  /**
   * Valida valor monetário
   */
  _validateValor: function(valor) {
    if (typeof valor !== 'number' || isNaN(valor)) {
      return { valid: false, message: 'Valor inválido' };
    }
    if (valor < 0) {
      return { valid: false, message: 'Valor não pode ser negativo' };
    }
    if (valor > 999999999.99) {
      return { valid: false, message: 'Valor muito alto' };
    }
    return { valid: true, value: valor };
  },

  /** Ações de insight moram em INSIGHT_ACOES (bundle principal). */
  setupInsightActions: function() {
    if (typeof INSIGHT_ACOES !== 'undefined') INSIGHT_ACOES.init();
  },

  handleInsightAction: function(acao, btn, parametros) {
    if (typeof INSIGHT_ACOES !== 'undefined') INSIGHT_ACOES.handle(acao, btn, parametros);
  },

  /**
   * Abre aba de edição de perfil completo
   */
  abrirEditarPerfil: function() {
    console.warn('[INIT_CONFIG] Abrindo edição de perfil');
    
    // Esconder todas as abas e mostrar aba editar-perfil
    var abas = document.querySelectorAll('.aba');
    for (var i = 0; i < abas.length; i++) {
      abas[i].classList.remove('ativo');
      abas[i].setAttribute('aria-hidden', 'true');
    }
    
    var abaEditar = document.getElementById('aba-editar-perfil');
    if (!abaEditar) {
      console.error('[INIT_CONFIG] Elemento aba-editar-perfil não encontrado');
      return;
    }
    
    abaEditar.classList.add('ativo');
    abaEditar.removeAttribute('aria-hidden');
    
    // Carregar dados atuais
    var config = DADOS.getConfig();
    console.warn('[INIT_CONFIG] Config carregada:', config);
    
    // Verificar se elementos existem antes de preencher
    var campos = {
      'editar-nome': config.nome || '',
      'editar-email': config.email || '',
      'editar-telefone': config.telefone || '',
      'editar-nascimento': config.nascimento || '',
      'editar-endereco': config.endereco || '',
      'editar-cidade': config.cidade || '',
      'editar-moeda': config.moeda || 'BRL'
    };
    
    for (var id in campos) {
      var el = document.getElementById(id);
      if (el) {
        el.value = campos[id];
        console.warn('[INIT_CONFIG] Campo ' + id + ' preenchido com:', campos[id]);
      } else {
        console.error('[INIT_CONFIG] Campo ' + id + ' não encontrado');
      }
    }
    
    // Atualizar avatar
    var avatar = document.getElementById('editar-perfil-avatar');
    if (avatar && config.nome) {
      avatar.textContent = config.nome.charAt(0).toUpperCase();
    }
  },

  /**
   * Volta para aba de perfil
   */
  voltarPerfil: function() {
    // Esconder aba editar-perfil e mostrar aba config
    var abaEditar = document.getElementById('aba-editar-perfil');
    var abaConfig = document.getElementById('aba-config');
    
    if (abaEditar) {
      abaEditar.classList.remove('ativo');
      abaEditar.setAttribute('aria-hidden', 'true');
    }
    
    if (abaConfig) {
      abaConfig.classList.add('ativo');
      abaConfig.removeAttribute('aria-hidden');
    }
  },

  /**
   * Salva dados do perfil completo
   */
  salvarPerfilCompleto: function(dados) {
    var validacoes = [
      INIT_CONFIG._validateNome(dados.nome),
      INIT_CONFIG._validateEmail(dados.email),
      INIT_CONFIG._validateTelefone(dados.telefone),
      INIT_CONFIG._validateNascimento(dados.nascimento),
      INIT_CONFIG._validateEndereco(dados.endereco),
      INIT_CONFIG._validateCidade(dados.cidade)
    ];
    
    for (var i = 0; i < validacoes.length; i++) {
      if (!validacoes[i].valid) {
        UTILS.mostrarToast(validacoes[i].message, 'error');
        return false;
      }
    }
    
    var configAtualizada = {
      nome: validacoes[0].value,
      email: validacoes[1].value,
      telefone: validacoes[2].value,
      nascimento: validacoes[3].value,
      endereco: validacoes[4].value,
      cidade: validacoes[5].value,
      moeda: dados.moeda
    };
    
    DADOS.salvarConfig(configAtualizada);
    INIT_CONFIG._updateDynamicValues();
    RENDER.init();
    INIT_CONFIG.voltarPerfil();
    UTILS.mostrarToast('Perfil atualizado', 'success');
    return true;
  },

  /**
   * Abre modal de edição de renda
   */
  abrirEditarRenda: function() {
    var config = DADOS.getConfig();
    var html = '<h3><i data-lucide="dollar-sign" aria-hidden="true"></i> Renda Mensal</h3>' +
      '<div style="display:flex;flex-direction:column;gap:12px;">' +
      '<div>' +
      '<label style="display:block;margin-bottom:4px;font-weight:500;">Renda mensal estimada</label>' +
      '<input type="text" id="renda-valor" value="' + UTILS.formatarMoeda(config.rendaMensal || 0) + '" style="width:100%;padding:8px;border:1px solid var(--border);border-radius:var(--radius-sm);">' +
      '<div style="font-size:12px;color:var(--text-muted);margin-top:4px;">Usada para cálculos de orçamento e metas</div>' +
      '</div>' +
      '</div>';
    
    INIT_MODALS.fpAlert(html, { trustedHtml: true, title: 'Renda mensal' });
    
    setTimeout(function() {
      var overlay = document.querySelector('.modal-overlay');
      if (!overlay) return;
      
      var valorInput = document.getElementById('renda-valor');
      var okBtn = overlay.querySelector('.modal-btn');

      if (valorInput && UTILS.bindCampoMoeda) {
        // Remove prefixo R$ do valor pré-preenchido para o parser
        valorInput.value = String(valorInput.value || '').replace(/[R$\s]/gi, '').trim();
        UTILS.bindCampoMoeda(valorInput);
      }
      
      if (okBtn) {
        okBtn.textContent = 'Salvar';
        okBtn.onclick = function() {
          var valor = UTILS.parseMoeda(valorInput.value);
          
          var validacao = INIT_CONFIG._validateValor(valor);
          if (!validacao.valid) {
            UTILS.mostrarToast(validacao.message, 'error');
            return;
          }
          
          if (valor === 0) {
            UTILS.mostrarToast('Informe uma renda válida', 'error');
            return;
          }
          
          DADOS.salvarConfig({ rendaMensal: validacao.value });
          overlay.remove();
          RENDER.init();
          UTILS.mostrarToast('Renda atualizada', 'success');
        };
      }
    }, 100);
  },

  toggleAlertaOrcamento: function() {
    var chk = document.getElementById('chk-alerta-orc');
    DADOS.salvarConfig({ alertaOrcamento: chk ? chk.checked : false });
    UTILS.mostrarToast(chk && chk.checked ? 'Alertas ativados' : 'Alertas desativados', 'success');
  },

  /** Sincroniza o switch de cifragem com o estado real (LOCAL_CRYPTO.isEnabled). */
  _refreshCryptoToggle: function() {
    var chk = document.getElementById('chk-crypto');
    var status = document.getElementById('perfil-crypto-status');
    var card = document.getElementById('perfil-crypto-card');
    var suportado = typeof LOCAL_CRYPTO !== 'undefined'
      && typeof crypto !== 'undefined' && !!crypto.subtle;
    var ativo = suportado && LOCAL_CRYPTO.isEnabled();
    if (chk) { chk.checked = ativo; chk.disabled = !suportado; }
    if (status) {
      // "Ativa — dados cifrados (AES-GCM)" prometia proteção que o desenho não
      // sustenta: sem passphrase do usuário, a chave mora no MESMO localStorage
      // que ela protege. Continua valendo a pena (backup em texto puro, olhada
      // no DevTools, sincronização acidental), mas o usuário precisa saber o
      // que está comprando antes de confiar demais.
      var nivel = ativo && typeof LOCAL_CRYPTO.nivelDeProtecao === 'function'
        ? LOCAL_CRYPTO.nivelDeProtecao() : null;
      status.textContent = !suportado ? 'Indisponível neste navegador'
        : (!ativo ? 'Desativada'
          : (nivel === 'passphrase'
            ? 'Ativa (AES-GCM) — chave derivada da sua senha'
            : 'Ativa (AES-GCM) — a chave fica neste dispositivo'));
    }
    if (card) card.style.opacity = suportado ? '' : '0.6';
  },

  /**
   * Liga/desliga a cifragem at-rest dos dados locais, migrando o que já existe.
   * Reverte o switch e avisa em caso de falha (nunca deixa dados ilegíveis).
   * @param {boolean} ligar
   */
  toggleCriptografia: function(ligar) {
    var chk = document.getElementById('chk-crypto');
    if (typeof DADOS === 'undefined' || typeof DADOS.aplicarCriptografia !== 'function') {
      if (chk) chk.checked = false;
      return;
    }
    if (chk) chk.disabled = true;
    UTILS.mostrarToast(ligar ? 'Cifrando dados…' : 'Removendo cifragem…', 'info');
    var self = INIT_CONFIG;
    DADOS.aplicarCriptografia(ligar).then(function(estado) {
      self._refreshCryptoToggle();
      if (chk) chk.disabled = false;
      UTILS.mostrarToast(estado ? 'Cifragem ativada' : 'Cifragem desativada', 'success');
    }).catch(function(err) {
      console.error('[INIT_CONFIG] Falha ao alternar cifragem:', err);
      // Falhou: garante que o flag reflete o estado real e não perde dados.
      self._refreshCryptoToggle();
      if (chk) chk.disabled = false;
      UTILS.mostrarToast('Não foi possível alterar a cifragem. Nada foi modificado.', 'error');
    });
  },

  toggleLembreteDiario: function() {
    var chk = document.getElementById('chk-lembrete');
    var ativo = chk ? chk.checked : false;

    if (!ativo) {
      DADOS.salvarConfig({ lembreteDiario: false });
      INIT_CONFIG._updateLembreteStatus();
      UTILS.mostrarToast('Lembrete desativado', 'info');
      return;
    }

    if (typeof DAILY_REMINDER === 'undefined' || !DAILY_REMINDER.isSupported()) {
      if (chk) chk.checked = false;
      UTILS.mostrarToast('Este aparelho não aceita notificações', 'warning');
      return;
    }

    var self = INIT_CONFIG;
    DAILY_REMINDER.requestPermission().then(function(perm) {
      if (perm !== 'granted') {
        if (chk) chk.checked = false;
        DADOS.salvarConfig({ lembreteDiario: false });
        self._updateLembreteStatus();
        UTILS.mostrarToast('As notificações estão bloqueadas nas configurações do navegador', 'warning');
        return;
      }
      DADOS.salvarConfig({ lembreteDiario: true });
      self._updateLembreteStatus();
      UTILS.mostrarToast('Lembrete diário ativado', 'success');
      DAILY_REMINDER.maybeRemind();
    });
  },

  executarInsight: function(acao, parametros) {
    if (typeof INSIGHT_ACOES !== 'undefined') INSIGHT_ACOES.executar(acao, parametros);
  }
};

// Export para compatibilidade

export { INIT_CONFIG };
export default INIT_CONFIG;
