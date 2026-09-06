/**
 * init-config.js - Sistema de configurações e utilitários
 * Extraído do init.js para modularização
 * Responsabilidades: configurações de usuário, import/export, backup
 */

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
    this.setupImport();
    this.setupInsightActions();
    // O logout vive em authController.setupLogoutButton (#btn-logout). Havia
    // aqui uma segunda implementação, ligada a um #logout-btn que não existe no
    // HTML e que limpava 'fp-user-token'/'fp-user-data' — chaves que o app nunca
    // gravou. Além de morta, teria deixado a sessão real intacta se rodasse.
    this._bindToggles();
    this._bindKeyboardNavigation();
    this._bindSairOutrosAparelhos();
    this._updateDynamicValues();
    this._bindEditarPerfilEvents();
    this._bindBancosEvents();
    this.aplicarVisibilidadeNuvem();
  },

  /**
   * Esconde as superficies que dependem de backend quando nao ha backend.
   *
   * O build Android do piloto roda em modo local: `_apiBaseUrl()` devolve string
   * vazia e nada sobe para servidor nenhum. Mesmo assim a aba Perfil continuava
   * oferecendo assinatura, Open Finance e verificacao em duas etapas -- recursos
   * que so existem com nuvem.
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
   * nao ha um segundo interruptor para esquecer de virar. Configure
   * `CONFIG.API_BASE_URL` ou Supabase e a nuvem reaparece sozinha.
   */
  aplicarVisibilidadeNuvem: function() {
    var temNuvem = typeof DADOS !== 'undefined'
      && typeof DADOS._nuvemAtiva === 'function'
      && DADOS._nuvemAtiva();
    var openFinanceOn = typeof CONFIG !== 'undefined' && CONFIG.FEATURE_OPEN_FINANCE;

    var alvos = document.querySelectorAll('[data-requer-nuvem]');
    for (var i = 0; i < alvos.length; i++) {
      var el = alvos[i];
      var isOpenFinance = el.getAttribute('data-action') === 'abrir-open-finance';
      var visivel = temNuvem && (!isOpenFinance || openFinanceOn);
      el.hidden = !visivel;
      el.style.display = visivel ? '' : 'none';
    }
    return temNuvem;
  },

  /** Atualiza perfil + toggles (substitui renderConfigTab legado) */
  refreshPerfil: function() {
    this._updateDynamicValues();
    var config = DADOS.getConfig();
    var chk = document.getElementById('chk-darkmode');
    if (chk) chk.checked = config.tema === 'dark';
    var chkAlerta = document.getElementById('chk-alerta-orc');
    if (chkAlerta) chkAlerta.checked = !!config.alertaOrcamento;
    var chkLembrete = document.getElementById('chk-lembrete');
    if (chkLembrete) chkLembrete.checked = !!config.lembreteDiario;
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
    this._refreshCryptoToggle();
    this._refreshExportHint();
    this._refreshSairOutrosBtn();
    this._updateAppFooter();
    this._updateLembreteStatus();
    if (typeof INIT_BILLING !== 'undefined' && INIT_BILLING.refreshPlanoCard) {
      INIT_BILLING.refreshPlanoCard();
    }
    if (typeof INIT_2FA !== 'undefined' && INIT_2FA.refreshUI) {
      INIT_2FA.refreshUI();
    }
    if (typeof INIT_OPEN_FINANCE !== 'undefined' && INIT_OPEN_FINANCE.refreshCard) {
      INIT_OPEN_FINANCE.refreshCard();
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
      if (!this._acessoRegistrado) {
        this._acessoRegistrado = true;
        try {
          DADOS.salvarConfig({ ultimoAcessoApp: new Date().toISOString() });
        } catch (_e) { /* noop */ }
      }
    }
    
    // Atualizar badge de plano
    var planBadge = document.getElementById('perfil-plan-badge');
    if (planBadge) {
      var info = INIT_CONFIG._planoBadgeInfo(config.plano);
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
    bind('btn-refazer-onboarding', 'click', function() {
      if (typeof ONBOARDING !== 'undefined' && ONBOARDING.reiniciar) {
        ONBOARDING.reiniciar();
      }
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
    var self = this;
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
    if (this._perfilKeyNavBound) return;
    this._perfilKeyNavBound = true;
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

  /**
   * Valida schema de JSON de importação
   */
  _validateImportSchema: function(data) {
    if (!data || typeof data !== 'object') {
      return { valid: false, message: 'Formato inválido: esperado objeto JSON' };
    }
    
    var errors = [];
    
    // Validar transações se existirem
    if (data.transacoes) {
      if (!Array.isArray(data.transacoes)) {
        errors.push('transacoes deve ser um array');
      } else {
        data.transacoes.forEach(function(tx, idx) {
          if (!tx.id) errors.push('transacao[' + idx + ']: id ausente');
          if (typeof tx.valor !== 'number') errors.push('transacao[' + idx + ']: valor inválido');
          if (!tx.data) errors.push('transacao[' + idx + ']: data ausente');
          if (!tx.tipo || !['receita', 'despesa'].includes(tx.tipo)) {
            errors.push('transacao[' + idx + ']: tipo inválido');
          }
          if (!tx.categoria) errors.push('transacao[' + idx + ']: categoria ausente');
        });
      }
    }
    
    // Validar configurações se existirem
    if (data.config && typeof data.config !== 'object') {
      errors.push('config deve ser um objeto');
    }
    
    // Validar orçamentos se existirem
    if (data.orcamentos && typeof data.orcamentos !== 'object') {
      errors.push('orcamentos deve ser um objeto');
    }
    
    if (errors.length > 0) {
      return { valid: false, message: 'Schema inválido: ' + errors.join(', ') };
    }
    
    return { valid: true };
  },

  /** Campos de config que nunca devem ser sobrescritos por importação */
  _IMPORT_CONFIG_BLOCKED: [
    'pinHash', 'pinSalt', 'pinAlgoritmo', 'pinAtivo', 'pinTentativas', 'pinBloqueadoAte'
  ],

  /**
   * Preferências que a importação PODE tocar. Tudo fora da lista é ignorado
   * (ex.: apiBaseUrl, flags de infra/plano forjadas, syncV2Enabled).
   * `plano` permanece aqui — o aviso de override sensível já cobre a troca.
   */
  _IMPORT_CONFIG_ALLOWED: [
    'nome', 'email', 'telefone', 'nascimento', 'endereco', 'cidade',
    'moeda', 'tema', 'alertaOrcamento', 'lembreteDiario',
    'categoriasCustom', 'bancos', 'cartoes',
    'renda', 'rendaMensal', 'regra503020',
    'ultimoExportoDados', 'ultimoAcessoApp',
    'metas', 'contasPagar', 'assinaturas', 'patrimonio', 'openFinance',
    'onboardingConcluido', 'feedbacks',
    'saldosIniciais', 'faturasPagas', 'recorrentesProcessadas',
    'plano'
  ],

  /** P1.1: config serializada no backup sem hash/salt/estado do PIN. */
  _configParaExportacao: function() {
    var cfg = Object.assign({}, DADOS.getConfig());
    this._IMPORT_CONFIG_BLOCKED.forEach(function(key) {
      delete cfg[key];
    });
    return cfg;
  },

  _mergeImportedConfig: function(imported) {
    var current = DADOS.getConfig();
    var merged = Object.assign({}, current);
    var allowed = this._IMPORT_CONFIG_ALLOWED;
    var src = imported && typeof imported === 'object' ? imported : {};
    for (var i = 0; i < allowed.length; i++) {
      var key = allowed[i];
      if (Object.prototype.hasOwnProperty.call(src, key)) {
        merged[key] = src[key];
      }
    }
    this._IMPORT_CONFIG_BLOCKED.forEach(function(key) {
      merged[key] = current[key];
    });
    return merged;
  },

  /** Outbox: só restaura array de operações com shape esperado. */
  _validarOutbox: function(outbox) {
    if (!Array.isArray(outbox)) return null;
    var ok = [];
    for (var i = 0; i < outbox.length; i++) {
      var op = outbox[i];
      if (!op || typeof op !== 'object') continue;
      if (typeof op.opId !== 'string' || !op.opId) continue;
      if (typeof op.entity !== 'string' || !op.entity) continue;
      if (op.id == null || op.id === '') continue;
      if (op.op !== 'upsert' && op.op !== 'delete') continue;
      ok.push(op);
    }
    return ok;
  },

  /** Cursor de sync: string ou number não vazio. */
  _validarSyncCursor: function(cursor) {
    if (cursor == null || cursor === '') return null;
    if (typeof cursor === 'string' || typeof cursor === 'number') return cursor;
    return null;
  },

  _importTemOverridesSensiveis: function(data) {
    if (!data.config || typeof data.config !== 'object') return false;
    var cfg = data.config;
    var atual = DADOS.getConfig();
    if (cfg.plano && cfg.plano !== atual.plano) return true;
    if (cfg.pinAtivo || cfg.pinHash || cfg.pinSalt) return true;
    return false;
  },

  /**
   * Configura sistema de importação
   */
  setupImport: function() {
    var area = document.getElementById('import-area');
    var inp = document.getElementById('import-file');
    if (!inp) return;
    
    if (area) {
      area.addEventListener('dragover', function(e) { 
        e.preventDefault(); 
        area.classList.add('drag-over'); 
      });
      area.addEventListener('dragleave', function() { 
        area.classList.remove('drag-over'); 
      });
      area.addEventListener('drop', function(e) {
        e.preventDefault(); 
        area.classList.remove('drag-over');
        if (e.dataTransfer.files[0]) INIT_CONFIG.processarImport(e.dataTransfer.files[0]);
      });
      area.addEventListener('keydown', function(e) {
        if (e.key === 'Enter' || e.key === ' ') { 
          e.preventDefault(); 
          inp.click(); 
        }
      });
    }
    inp.addEventListener('change', function() {
      if (this.files[0]) INIT_CONFIG.processarImport(this.files[0]);
      this.value = '';
    });
  },

  /**
   * Configura ações de insights
   */
  setupInsightActions: function() {
    if (this._insightBound) return;
    this._insightBound = true;

    document.addEventListener('click', function(e) {
      var btn = e.target.closest('[data-insight-action]');
      if (!btn) return;
      var acao = btn.getAttribute('data-insight-action');
      var parametros = {};
      try {
        parametros = JSON.parse(btn.getAttribute('data-insight-params') || '{}');
      } catch (_err) {
        parametros = {};
      }
      INIT_CONFIG.handleInsightAction(acao, btn, parametros);
    });
  },

  /**
   * Processa ações de insights
   */
  handleInsightAction: function(acao, btn, parametros) {
    parametros = parametros || {};
    switch (acao) {
      case 'filtrar-categoria':
        var cat = btn.dataset.cat;
        mudarAba('extrato');
        setTimeout(function() {
          INIT_EXTRATO.setFiltroCat(cat);
        }, 100);
        break;

      case 'criar-orcamento':
        mudarAba('orcamento');
        setTimeout(function() {
          var input = document.getElementById('limit-' + btn.dataset.cat);
          if (input) input.focus();
        }, 100);
        break;

      case 'abrirPaywall':
        // Teaser de insight (assinaturas esquecidas, por ora) levando ao
        // paywall com o contexto que o gerou — o número em reais vai junto.
        if (typeof INIT_BILLING !== 'undefined' && INIT_BILLING.abrirPaywall) {
          INIT_BILLING.abrirPaywall(parametros.message);
        }
        break;

      case 'ver-detalhes':
        break;

      default:
        INIT_CONFIG.executarInsight(acao, parametros);
    }
  },

  /**
   * Processa arquivo de importação
   */
  processarImport: function(file) {
    if (!file) return;
    
    // Validar tipo de arquivo
    if (file.type !== 'application/json' && !file.name.endsWith('.json')) {
      UTILS.mostrarToast('O backup precisa ser um arquivo .json', 'error');
      return;
    }
    
    // Validar tamanho (max 5MB)
    if (file.size > 5 * 1024 * 1024) {
      UTILS.mostrarToast('Arquivo muito grande (máximo 5MB)', 'error');
      return;
    }
    
    var reader = new FileReader();
    reader.onload = function(e) {
      try {
        var data = JSON.parse(e.target.result);
        
        // Validar schema antes de importar
        var schemaValidacao = INIT_CONFIG._validateImportSchema(data);
        if (!schemaValidacao.valid) {
          UTILS.mostrarToast(schemaValidacao.message, 'error');
          return;
        }
        
        INIT_CONFIG._pendingImport = data;
        if (INIT_CONFIG._importTemOverridesSensiveis(data)) {
          INIT_MODALS.confirm(
            'O backup pode alterar plano e preferências. Seu PIN local não será substituído. Continuar?',
            function() { INIT_CONFIG.importarDados(INIT_CONFIG._pendingImport); }
          );
        } else {
          INIT_CONFIG.importarDados(data);
        }
      } catch (err) {
        console.error('Erro ao parsear JSON:', err);
        UTILS.mostrarToast('Esse arquivo não parece ser um backup do app. Nada foi alterado.', 'error');
      }
    };
    reader.onerror = function() {
      UTILS.mostrarToast('Não foi possível ler esse arquivo. Nada foi alterado.', 'error');
    };
    reader.readAsText(file);
  },

  /**
   * Importa dados do arquivo
   */
  importarDados: function(data) {
    try {
      var transacoesImportadas = 0;
      var configImportada = false;
      
      // Importar transações
      if (data.transacoes && Array.isArray(data.transacoes)) {
        data.transacoes.forEach(function(tx) {
          if (!tx || !tx.id || !tx.valor || !tx.data || !tx.tipo || !tx.categoria) return;
          var jaExiste = DADOS.getTransacoesRaw().some(function(t) { return t.id === tx.id; });
          if (jaExiste) return;
          DADOS.salvarTransacao(Object.assign({}, tx));
          transacoesImportadas++;
        });
      }
      
      // Importar configurações (PIN local preservado)
      if (data.config && typeof data.config === 'object') {
        var newConfig = INIT_CONFIG._mergeImportedConfig(data.config);
        DADOS.salvarConfig(newConfig);
        configImportada = true;
      }
      
      // Importar contas bancárias ANTES das demais entidades de tela, para que
      // os `contaId` das transações já recém-importadas resolvam para um nome.
      var contasImportadas = 0;
      if (data.contas && Array.isArray(data.contas)) {
        var validas = data.contas.filter(function(c) { return c && c.id && c.nome; });
        if (validas.length) {
          DADOS.salvarContas(validas);
          if (typeof CONTAS !== 'undefined' && CONTAS.init) CONTAS.init();
          contasImportadas = validas.length;
        }
      }

      // Importar orçamentos
      if (data.orcamentos && typeof data.orcamentos === 'object') {
        Object.keys(data.orcamentos).forEach(function(cat) {
          if (data.orcamentos[cat] && data.orcamentos[cat].limite) {
            ORCAMENTO.definirLimite(cat, data.orcamentos[cat].limite);
          }
        });
      }

      // Restaurar outbox e cursor só se o formato for válido (P1.2)
      if (typeof SYNC_ENGINE !== 'undefined') {
        var outboxOk = INIT_CONFIG._validarOutbox(data.outbox);
        if (outboxOk) {
          SYNC_ENGINE.saveOutbox(outboxOk);
        }
        var cursorOk = INIT_CONFIG._validarSyncCursor(data.sync_cursor);
        if (cursorOk != null) {
          SYNC_ENGINE.setCursor(cursorOk);
        }
      }

      var anexosImportados = 0;
      var importAnexos = Promise.resolve(0);
      if (data.anexos && Array.isArray(data.anexos) && typeof ANEXOS !== 'undefined' && ANEXOS.importarTodos) {
        importAnexos = ANEXOS.importarTodos(data.anexos).then(function(n) { return n; }).catch(function(err) {
          console.warn('Importação de anexos:', err);
          return 0;
        });
      }

      importAnexos.then(function(n) {
        anexosImportados = n || 0;
        if (typeof RENDER !== 'undefined' && RENDER.init) RENDER.init();
        var msg = [];
        if (transacoesImportadas > 0) msg.push(transacoesImportadas + ' transações');
        if (contasImportadas > 0) msg.push(contasImportadas + ' contas');
        if (configImportada) msg.push('configurações');
        if (anexosImportados > 0) msg.push(anexosImportados + ' anexos');
        if (msg.length > 0) {
          UTILS.mostrarToast('Importado: ' + msg.join(', '), 'success');
        } else {
          UTILS.mostrarToast('Não encontrei nada para importar nesse arquivo', 'warning');
        }
      });
      
    } catch (err) {
      console.error('Erro ao importar:', err);
      UTILS.mostrarToast('Não foi possível importar esse arquivo. Nada foi alterado.', 'error');
    }
  },

  /**
   * Exporta todos os dados
   */
  exportarDados: function() {
    var self = this;
    var finalizar = function(anexos) {
      try {
        var exportData = {
          versao: (typeof CONFIG !== 'undefined' ? CONFIG.VERSION : '11.0.0'),
          dataExportacao: new Date().toISOString(),
          transacoes: TRANSACOES.obter({}),
          // Contas bancárias precisam viajar junto: cada transação guarda um
          // `contaId`. Sem elas, todo lançamento restaurado aponta para uma
          // conta inexistente e a coluna de banco no extrato fica em branco —
          // o backup parece completo e não é.
          contas: DADOS.getContas(),
          config: self._configParaExportacao(),
          orcamentos: self.getOrcamentosData(),
          anexos: anexos || [],
          outbox: (typeof SYNC_ENGINE !== 'undefined' && SYNC_ENGINE.loadOutbox)
            ? SYNC_ENGINE.loadOutbox() : [],
          sync_cursor: (typeof SYNC_ENGINE !== 'undefined' && SYNC_ENGINE.getCursor)
            ? SYNC_ENGINE.getCursor() : null,
          metadados: {
            totalTransacoes: TRANSACOES.obter({}).length,
            totalContas: DADOS.getContas().length,
            totalAnexos: (anexos || []).length,
            periodo: self.getPeriodoDados()
          }
        };

        var blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
        var link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = 'financaspro_backup_' + new Date().toISOString().split('T')[0] + '.json';
        link.click();

        DADOS.salvarConfig({ ultimoExportoDados: new Date().toISOString() });
        UTILS.mostrarToast('Backup exportado' + ((anexos && anexos.length) ? ' (com anexos)' : ''), 'success');
      } catch (err) {
        console.error('Erro ao exportar:', err);
        UTILS.mostrarToast('Não foi possível exportar. Seus dados continuam salvos aqui.', 'error');
      }
    };

    if (typeof ANEXOS !== 'undefined' && ANEXOS.exportarTodos) {
      ANEXOS.exportarTodos().then(finalizar).catch(function() { finalizar([]); });
    } else {
      finalizar([]);
    }
  },

  /**
   * Obtém dados de orçamentos para exportação
   */
  getOrcamentosData: function() {
    var orcamentos = {};
    var categorias = ['alimentacao', 'transporte', 'moradia', 'saude', 'lazer'];
    
    categorias.forEach(function(cat) {
      var status = ORCAMENTO.obterStatus(cat, new Date().getMonth() + 1, new Date().getFullYear());
      if (status && status.limite) {
        orcamentos[cat] = {
          limite: status.limite,
          gasto: status.gasto,
          periodo: status.mes + '/' + status.ano
        };
      }
    });
    
    return orcamentos;
  },

  /**
   * Obtém metadados do período
   */
  getPeriodoDados: function() {
    var txs = TRANSACOES.obter({});
    if (txs.length === 0) return null;
    
    var datas = txs.map(function(t) { return new Date(t.data); });
    var minDate = new Date(Math.min(...datas));
    var maxDate = new Date(Math.max(...datas));
    
    return {
      inicio: minDate.toISOString().split('T')[0],
      fim: maxDate.toISOString().split('T')[0],
      meses: this.calcularMesesEntre(minDate, maxDate)
    };
  },

  /**
   * Calcula meses entre duas datas
   */
  calcularMesesEntre: function(data1, data2) {
    var months = (data2.getFullYear() - data1.getFullYear()) * 12;
    months += data2.getMonth() - data1.getMonth();
    return Math.abs(months) + 1;
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

  /**
   * Abre aba de gerenciamento de bancos
   */
  abrirConfigBancos: function() {
    console.warn('[INIT_CONFIG] Abrindo gerenciamento de bancos');
    
    // Esconder todas as abas e mostrar aba gerenciar-bancos
    var abas = document.querySelectorAll('.aba');
    for (var i = 0; i < abas.length; i++) {
      abas[i].classList.remove('ativo');
      abas[i].setAttribute('aria-hidden', 'true');
    }
    
    var abaBancos = document.getElementById('aba-gerenciar-bancos');
    if (!abaBancos) {
      console.error('[INIT_CONFIG] Elemento aba-gerenciar-bancos não encontrado');
      return;
    }
    
    abaBancos.classList.add('ativo');
    abaBancos.removeAttribute('aria-hidden');
    
    // Renderizar listas
    INIT_CONFIG._renderizarListaBancos();
    INIT_CONFIG._renderizarListaCartoes();
  },

  /**
   * Renderiza lista de bancos cadastrados
   */
  _renderizarListaBancos: function() {
    var config = DADOS.getConfig();
    var bancos = config.bancos || [];
    var listaEl = document.getElementById('bancos-list');
    
    if (!listaEl) return;
    
    if (bancos.length === 0) {
      listaEl.innerHTML = '<div class="bancos-empty">' +
        '<div class="bancos-empty-icon" aria-hidden="true"><i data-lucide="landmark"></i></div>' +
        '<p>Nenhum banco cadastrado</p>' +
        '<p class="bancos-empty-hint">Adicione seu primeiro banco acima</p>' +
        '</div>';
      if (typeof renderLucideIcons === 'function') renderLucideIcons(listaEl);
      return;
    }
    
    var html = '';
    bancos.forEach(function(banco, index) {
      var iconLucide = 'landmark';
      if (banco.tipo === 'Conta Poupança') iconLucide = 'piggy-bank';
      if (banco.tipo === 'Dinheiro') iconLucide = 'wallet';
      
      html += '<div class="banco-item" data-index="' + index + '" data-tipo="banco">' +
        '<div class="banco-item-info">' +
          '<div class="banco-item-icon" aria-hidden="true"><i data-lucide="' + iconLucide + '"></i></div>' +
          '<div class="banco-item-details">' +
            '<div class="banco-item-nome">' + UTILS.escapeHtml(banco.nome) + '</div>' +
            '<div class="banco-item-tipo">' + UTILS.escapeHtml(banco.tipo) + '</div>' +
          '</div>' +
        '</div>' +
        '<div class="banco-item-actions">' +
          '<button type="button" class="btn-remover-banco" data-index="' + index + '" data-tipo="banco" aria-label="Remover ' + UTILS.escapeHtml(banco.nome) + '">' +
          '<i data-lucide="trash-2" aria-hidden="true"></i> Remover' +
          '</button>' +
        '</div>' +
        '</div>';
    });
    
    listaEl.innerHTML = html;
    if (typeof renderLucideIcons === 'function') renderLucideIcons(listaEl);
  },

  /**
   * Renderiza lista de cartões cadastrados
   */
  _renderizarListaCartoes: function() {
    var config = DADOS.getConfig();
    var cartoes = config.cartoes || [];
    var listaEl = document.getElementById('cartoes-list');
    
    if (!listaEl) return;
    
    if (cartoes.length === 0) {
      listaEl.innerHTML = '<div class="bancos-empty">' +
        '<div class="bancos-empty-icon" aria-hidden="true"><i data-lucide="credit-card"></i></div>' +
        '<p>Nenhum cartão cadastrado</p>' +
        '<p class="bancos-empty-hint">Adicione seu primeiro cartão acima</p>' +
        '</div>';
      if (typeof renderLucideIcons === 'function') renderLucideIcons(listaEl);
      return;
    }
    
    var html = '';
    cartoes.forEach(function(cartao, index) {
      var info = (typeof CARTOES !== 'undefined' && CARTOES.obter)
        ? CARTOES.obter(cartao.nome) : null;
      var semCiclo = info && !info.temCiclo;
      html += '<div class="banco-item' + (semCiclo ? ' banco-item--aviso' : '') + '" data-index="' + index + '" data-tipo="cartao">' +
        '<div class="banco-item-info">' +
          '<div class="banco-item-icon" aria-hidden="true"><i data-lucide="credit-card"></i></div>' +
          '<div class="banco-item-details">' +
            '<div class="banco-item-nome">' + UTILS.escapeHtml(cartao.nome) +
              (semCiclo ? ' <span class="banco-item-badge-aviso">Sem ciclo</span>' : '') +
            '</div>' +
            '<div class="banco-item-tipo">' + UTILS.escapeHtml(cartao.bandeira) + (cartao.limite ? ' • Limite: R$ ' + parseFloat(cartao.limite).toLocaleString('pt-BR', {minimumFractionDigits:2}) : '') +
              (semCiclo ? ' · Informe fechamento e vencimento para calcular faturas' : '') +
            '</div>' +
          '</div>' +
        '</div>' +
        '<div class="banco-item-actions">' +
          '<button type="button" class="btn-remover-banco" data-index="' + index + '" data-tipo="cartao" aria-label="Remover ' + UTILS.escapeHtml(cartao.nome) + '">' +
          '<i data-lucide="trash-2" aria-hidden="true"></i> Remover' +
          '</button>' +
        '</div>' +
        '</div>';
    });
    
    listaEl.innerHTML = html;
    if (typeof renderLucideIcons === 'function') renderLucideIcons(listaEl);
  },

  /**
   * Adiciona banco
   */
  adicionarBanco: function(nome, tipo) {
    var validacao = INIT_CONFIG._validateBancoNome(nome);
    if (!validacao.valid) {
      UTILS.mostrarToast(validacao.message, 'error');
      return;
    }
    if (typeof BILLING !== 'undefined' && !BILLING.guardQuota('account', 1)) return;
    
    var config = DADOS.getConfig();
    var bancos = config.bancos || [];
    bancos.push({ nome: validacao.value, tipo: tipo });
    DADOS.salvarConfig({ bancos: bancos });
    
    // Limpar formulário
    document.getElementById('banco-nome').value = '';
    document.getElementById('banco-tipo').value = 'Conta Corrente';
    
    // Re-renderizar lista
    INIT_CONFIG._renderizarListaBancos();
    INIT_CONFIG._updateDynamicValues();
    UTILS.mostrarToast('Banco salvo', 'success');
  },

  /**
   * Remove banco
   */
  removerBanco: function(index) {
    INIT_MODALS.confirm('Deseja remover este banco?', function() {
      var config = DADOS.getConfig();
      var bancos = config.bancos || [];
      bancos.splice(index, 1);
      DADOS.salvarConfig({ bancos: bancos });
      INIT_CONFIG._renderizarListaBancos();
      INIT_CONFIG._updateDynamicValues();
      UTILS.mostrarToast('Banco removido', 'success');
    });
  },

  /**
   * Adiciona cartão
   */
  adicionarCartao: function(nome, bandeira, limite, fechamento, vencimento) {
    var validacao = INIT_CONFIG._validateBancoNome(nome);
    if (!validacao.valid) {
      UTILS.mostrarToast(validacao.message, 'error');
      return;
    }
    if (typeof BILLING !== 'undefined' && !BILLING.guardQuota('account', 1)) return;
    
    var config = DADOS.getConfig();
    var cartoes = config.cartoes || [];
    // fechamento e vencimento são o que dá CICLO ao cartão: sem eles o app
    // não sabe em qual fatura a compra cai, e CARTOES trata o cadastro como
    // "sem ciclo" em vez de inventar datas.
    var dia = function(v) {
      var n = parseInt(v, 10);
      return (isFinite(n) && n >= 1 && n <= 31) ? n : null;
    };

    cartoes.push({
      nome: validacao.value,
      bandeira: bandeira,
      limite: limite ? UTILS.parseMoeda(limite) : null,
      fechamento: dia(fechamento),
      vencimento: dia(vencimento)
    });
    DADOS.salvarConfig({ cartoes: cartoes });
    
    // Limpar formulário
    document.getElementById('cartao-nome').value = '';
    document.getElementById('cartao-bandeira').value = 'Visa';
    document.getElementById('cartao-limite').value = '';
    var fechEl = document.getElementById('cartao-fechamento');
    if (fechEl) fechEl.value = '';
    var vencEl = document.getElementById('cartao-vencimento');
    if (vencEl) vencEl.value = '';
    
    // Re-renderizar lista
    INIT_CONFIG._renderizarListaCartoes();
    INIT_CONFIG._updateDynamicValues();
    UTILS.mostrarToast('Cartão salvo', 'success');
  },

  /**
   * Remove cartão
   */
  removerCartao: function(index) {
    INIT_MODALS.confirm('Deseja remover este cartão?', function() {
      var config = DADOS.getConfig();
      var cartoes = config.cartoes || [];
      cartoes.splice(index, 1);
      DADOS.salvarConfig({ cartoes: cartoes });
      INIT_CONFIG._renderizarListaCartoes();
      INIT_CONFIG._updateDynamicValues();
      UTILS.mostrarToast('Cartão removido', 'success');
    });
  },

  /**
   * Abre gerenciador de categorias
   */
  abrirGerenciarCategorias: function(tipo) {
    var config = DADOS.getConfig();
    var customCats = config.categoriasCustom || {};
    var cats = customCats[tipo] || [];
    
    var html = '<h3><i data-lucide="tag" aria-hidden="true"></i> Gerenciar Categorias - ' + (tipo === 'receita' ? 'Receitas' : 'Despesas') + '</h3>' +
      '<div class="perfil-modal-toolbar">' +
      '<button type="button" id="add-cat-btn" class="perfil-modal-btn-primary"><i data-lucide="plus" aria-hidden="true"></i> Adicionar Categoria</button>' +
      '</div>' +
      '<div id="cats-list" class="perfil-modal-list">';
    
    cats.forEach(function(cat, index) {
      html += '<div class="cat-item perfil-modal-item" data-index="' + index + '">' +
        '<div class="perfil-modal-item-main">' +
          '<span class="perfil-modal-item-icon" aria-hidden="true"><i data-lucide="sparkles"></i></span>' +
          '<div>' +
            '<div class="perfil-modal-item-title">' + UTILS.escapeHtml(cat) + '</div>' +
          '</div>' +
        '</div>' +
        '<button type="button" class="btn-remover-cat perfil-modal-btn-danger" data-index="' + index + '">Remover</button>' +
      '</div>';
    });
    
    if (cats.length === 0) {
      html += '<div class="perfil-modal-empty">Nenhuma categoria personalizada</div>';
    }
    
    html += '</div>';
    
    INIT_MODALS.fpAlert(html, { trustedHtml: true, title: 'Gerenciar categorias' });
    
    setTimeout(function() {
      var overlay = document.querySelector('.modal-overlay');
      if (!overlay) return;
      if (typeof renderLucideIcons === 'function') renderLucideIcons(overlay);
      
      // Botão adicionar
      var addBtn = document.getElementById('add-cat-btn');
      if (addBtn) {
        addBtn.onclick = function() {
          INIT_CONFIG.adicionarCategoria(tipo);
        };
      }
      
      // Botões remover
      overlay.addEventListener('click', function(e) {
        var btn = e.target.closest('.btn-remover-cat');
        if (btn) {
          var index = parseInt(btn.dataset.index);
          INIT_CONFIG.removerCategoria(tipo, index);
        }
      });
      
      var okBtn = overlay.querySelector('.modal-btn');
      if (okBtn) {
        okBtn.textContent = 'Fechar';
      }
    }, 100);
  },

  /**
   * Adiciona categoria personalizada
   */
  adicionarCategoria: function(tipo) {
    var html = '<h3><i data-lucide="plus" aria-hidden="true"></i> Adicionar Categoria</h3>' +
      '<div class="perfil-modal-form">' +
      '<div>' +
      '<label class="perfil-modal-label" for="cat-nome">Nome da Categoria</label>' +
      '<input type="text" id="cat-nome" class="perfil-modal-input" placeholder="Ex: Streaming" maxlength="30">' +
      '</div>' +
      '</div>';
    
    INIT_MODALS.fpAlert(html, { trustedHtml: true, title: 'Adicionar categoria' });
    
    setTimeout(function() {
      var overlay = document.querySelector('.modal-overlay');
      if (!overlay) return;
      if (typeof renderLucideIcons === 'function') renderLucideIcons(overlay);
      
      var okBtn = overlay.querySelector('.modal-btn');
      if (okBtn) {
        okBtn.textContent = 'Adicionar';
        okBtn.onclick = function() {
          var nome = document.getElementById('cat-nome').value;
          
          var validacao = INIT_CONFIG._validateCategoriaNome(nome);
          if (!validacao.valid) {
            UTILS.mostrarToast(validacao.message, 'error');
            return;
          }
          
          var config = DADOS.getConfig();
          var customCats = config.categoriasCustom || {};
          if (!customCats[tipo]) customCats[tipo] = [];
          
          if (customCats[tipo].includes(validacao.value)) {
            UTILS.mostrarToast('Já existe uma categoria com esse nome', 'warning');
            return;
          }
          
          customCats[tipo].push(validacao.value);
          DADOS.salvarConfig({ categoriasCustom: customCats });
          
          overlay.remove();
          INIT_CONFIG.abrirGerenciarCategorias(tipo); // Reabrir para atualizar lista
          UTILS.mostrarToast('Categoria salva', 'success');
        };
      }
    }, 100);
  },

  /**
   * Remove categoria personalizada
   */
  removerCategoria: function(tipo, index) {
    INIT_MODALS.confirm('Remover esta categoria?', function() {
      var config = DADOS.getConfig();
      var customCats = config.categoriasCustom || {};
      if (customCats[tipo]) {
        customCats[tipo].splice(index, 1);
        DADOS.salvarConfig({ categoriasCustom: customCats });
      }
      
      // Reabrir modal para atualizar lista
      var overlay = document.querySelector('.modal-overlay');
      if (overlay) overlay.remove();
      INIT_CONFIG.abrirGerenciarCategorias(tipo);
      
      UTILS.mostrarToast('Categoria removida', 'success');
    });
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
    var self = this;
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
      this._updateLembreteStatus();
      UTILS.mostrarToast('Lembrete desativado', 'info');
      return;
    }

    if (typeof DAILY_REMINDER === 'undefined' || !DAILY_REMINDER.isSupported()) {
      if (chk) chk.checked = false;
      UTILS.mostrarToast('Este aparelho não aceita notificações', 'warning');
      return;
    }

    var self = this;
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
    parametros = parametros || {};
    if (acao === 'aumentarLimite') {
      try {
        ORCAMENTO.definirLimite(parametros.categoria, parametros.novoLimite);
        UTILS.mostrarToast('Limite de ' + UTILS.labelCategoria(parametros.categoria) +
          ' → R$ ' + parametros.novoLimite.toFixed(2), 'success');
      } catch (_e) {
        UTILS.mostrarToast('Não foi possível atualizar o limite. Tente de novo.', 'error');
      }
    }

    if (acao === 'marcarRecorrente') {
      var catEl = document.getElementById('novo-categoria');
      var cat = (parametros && parametros.categoria) || (catEl ? catEl.value : '') || 'outro';
      var valorRec = parametros && parametros.valor ? parseFloat(parametros.valor) : 0;
      DADOS.salvarRecorrente({
        tipo: parametros.tipo || 'despesa',
        categoria: cat,
        descricao: parametros.descricao || 'Recorrente',
        frequencia: parametros.frequencia || 'mensal',
        valor: isNaN(valorRec) ? 0 : valorRec,
        dataInicio: UTILS.dataLocalIso(),
        ativo: true
      });
      UTILS.mostrarToast('"' + (parametros.descricao || 'Lançamento') + '" marcado como recorrente', 'success');
    }

    if (typeof INSIGHTS !== 'undefined') {
      setTimeout(function() { INSIGHTS.mostrar(); }, 150);
    }
  }
};

// Export para compatibilidade
if (typeof module !== 'undefined' && module.exports) {
  module.exports = INIT_CONFIG;
}
