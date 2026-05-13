/**
 * init-config.js - Sistema de configurações e utilitários
 * Extraído do init.js para modularização
 * Responsabilidades: configurações de usuário, import/export, backup
 */

const INIT_CONFIG = {
  /**
   * Inicializa sistema de configurações
   */
  init: function() {
    this.setupImport();
    this.setupInsightActions();
    this.setupLogoutButton();
    this._bindToggles();
    this._bindKeyboardNavigation();
    this._updateDynamicValues();
    this._bindEditarPerfilEvents();
    this._bindBancosEvents();
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
        INIT_CONFIG.adicionarCartao(nome, bandeira, limite);
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
    if (nomeDisplay && config.nome) {
      nomeDisplay.textContent = config.nome;
    }
    
    // Atualizar avatar com inicial
    var avatar = document.getElementById('perfil-avatar');
    if (avatar && config.nome) {
      avatar.textContent = config.nome.charAt(0).toUpperCase();
    }
    
    // Atualizar data de último acesso
    var lastAccessEl = document.getElementById('perfil-last-access');
    if (lastAccessEl) {
      var now = new Date();
      var timeStr = now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
      lastAccessEl.textContent = 'Hoje às ' + timeStr;
    }
    
    // Atualizar badge de plano
    var planBadge = document.getElementById('perfil-plan-badge');
    if (planBadge) {
      var plano = config.plano || 'Free';
      planBadge.textContent = plano;
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
    bind('chk-alerta-orc','change', function() { if (typeof toggleAlertaOrcamento === 'function') toggleAlertaOrcamento(); });
    bind('chk-lembrete',  'change', function() { if (typeof toggleLembreteDiario === 'function') toggleLembreteDiario(); });
    bind('chk-pin',       'change', function() { if (typeof togglePinSeguranca === 'function') togglePinSeguranca(); });
  },

  /**
   * Configura navegação por teclado nos cards
   */
  _bindKeyboardNavigation: function() {
    var cards = document.querySelectorAll('.perfil-card-premium[role="button"]');
    cards.forEach(function(card) {
      card.addEventListener('keydown', function(e) {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          card.click();
        }
      });
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
    var container = document.getElementById('dashboard-alertas');
    if (!container || container.dataset.boundInsights === '1') return;
    container.dataset.boundInsights = '1';
    
    container.addEventListener('click', function(e) {
      var btn = e.target.closest('[data-insight-action]');
      if (!btn) return;
      var acao = btn.getAttribute('data-insight-action');
      
      INIT_CONFIG.handleInsightAction(acao, btn);
    });
  },

  /**
   * Processa ações de insights
   */
  handleInsightAction: function(acao, btn) {
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
        
      case 'ver-detalhes':
        // Implementar visualização de detalhes
        break;
    }
  },

  /**
   * Configura botão de logout
   */
  setupLogoutButton: function() {
    var logoutBtn = document.getElementById('logout-btn');
    if (logoutBtn) {
      logoutBtn.addEventListener('click', function() {
        INIT_CONFIG.handleLogout();
      });
    }
  },

  /**
   * Processa logout
   */
  handleLogout: function() {
    INIT_MODALS.confirm('Deseja sair da sua conta?', function() {
      // Limpar dados de autenticação
      localStorage.removeItem('fp-user-token');
      localStorage.removeItem('fp-user-data');
      
      // Recarregar página
      window.location.reload();
    });
  },

  /**
   * Processa arquivo de importação
   */
  processarImport: function(file) {
    if (!file) return;
    
    // Validar tipo de arquivo
    if (file.type !== 'application/json' && !file.name.endsWith('.json')) {
      UTILS.mostrarToast('Arquivo deve ser JSON', 'error');
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
        
        INIT_CONFIG.importarDados(data);
      } catch (err) {
        console.error('Erro ao parsear JSON:', err);
        UTILS.mostrarToast('Arquivo JSON inválido ou corrompido', 'error');
      }
    };
    reader.onerror = function() {
      UTILS.mostrarToast('Erro ao ler arquivo', 'error');
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
          if (tx.id && tx.valor && tx.data && tx.tipo && tx.categoria) {
            TRANSACOES.criar(tx.tipo, tx.valor, tx.categoria, tx.data, tx.descricao, tx.banco, tx.cartao, true);
            transacoesImportadas++;
          }
        });
      }
      
      // Importar configurações
      if (data.config && typeof data.config === 'object') {
        var currentConfig = DADOS.getConfig();
        var newConfig = Object.assign({}, currentConfig, data.config);
        DADOS.salvarConfig(newConfig);
        configImportada = true;
      }
      
      // Importar orçamentos
      if (data.orcamentos && typeof data.orcamentos === 'object') {
        Object.keys(data.orcamentos).forEach(function(cat) {
          if (data.orcamentos[cat] && data.orcamentos[cat].limite) {
            ORCAMENTO.definirLimite(cat, data.orcamentos[cat].limite);
          }
        });
      }
      
      // Atualizar UI
      RENDER.init();
      
      // Feedback
      var msg = [];
      if (transacoesImportadas > 0) msg.push(transacoesImportadas + ' transações');
      if (configImportada) msg.push('configurações');
      
      if (msg.length > 0) {
        UTILS.mostrarToast('Importado: ' + msg.join(', '), 'success');
      } else {
        UTILS.mostrarToast('Nenhum dado válido encontrado', 'warning');
      }
      
    } catch (err) {
      console.error('Erro ao importar:', err);
      UTILS.mostrarToast('Erro ao importar dados', 'error');
    }
  },

  /**
   * Exporta todos os dados
   */
  exportarDados: function() {
    try {
      var exportData = {
        versao: '11.0.0',
        dataExportacao: new Date().toISOString(),
        transacoes: TRANSACOES.obter({}),
        config: DADOS.getConfig(),
        orcamentos: this.getOrcamentosData(),
        metadados: {
          totalTransacoes: TRANSACOES.obter({}).length,
          periodo: this.getPeriodoDados()
        }
      };
      
      var blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
      var link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = 'financaspro_backup_' + new Date().toISOString().split('T')[0] + '.json';
      link.click();
      
      // Atualizar último export
      DADOS.salvarConfig({ ultimoExportoDados: new Date().toISOString() });
      
      UTILS.mostrarToast('Dados exportados com sucesso!', 'success');
      
    } catch (err) {
      console.error('Erro ao exportar:', err);
      UTILS.mostrarToast('Erro ao exportar dados', 'error');
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
    console.log('[INIT_CONFIG] Abrindo edição de perfil');
    
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
    console.log('[INIT_CONFIG] Config carregada:', config);
    
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
        console.log('[INIT_CONFIG] Campo ' + id + ' preenchido com:', campos[id]);
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
    UTILS.mostrarToast('Perfil atualizado com sucesso!', 'success');
    return true;
  },

  /**
   * Abre modal de edição de renda
   */
  abrirEditarRenda: function() {
    var config = DADOS.getConfig();
    var html = '<h3>💰 Renda Mensal</h3>' +
      '<div style="display:flex;flex-direction:column;gap:12px;">' +
      '<div>' +
      '<label style="display:block;margin-bottom:4px;font-weight:500;">Renda mensal estimada</label>' +
      '<input type="text" id="renda-valor" value="' + UTILS.formatarMoeda(config.rendaMensal || 0) + '" style="width:100%;padding:8px;border:1px solid var(--border);border-radius:var(--radius-sm);">' +
      '<div style="font-size:12px;color:var(--text-muted);margin-top:4px;">Usada para cálculos de orçamento e metas</div>' +
      '</div>' +
      '</div>';
    
    INIT_MODALS.fpAlert(html);
    
    setTimeout(function() {
      var overlay = document.querySelector('.modal-overlay');
      if (!overlay) return;
      
      var valorInput = document.getElementById('renda-valor');
      var okBtn = overlay.querySelector('.modal-btn');
      
      // Máscara de moeda
      valorInput.addEventListener('input', function() {
        var raw = this.value.replace(/\D/g, '');
        if (raw === '') { this.value = ''; return; }
        var num = parseInt(raw, 10);
        var formatted = (num / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
        this.value = formatted;
      });
      
      if (okBtn) {
        okBtn.textContent = 'Salvar';
        okBtn.onclick = function() {
          var valorStr = valorInput.value.replace(/\./g, '').replace(',', '.');
          var valor = parseFloat(valorStr) || 0;
          
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
          UTILS.mostrarToast('Renda atualizada!', 'success');
        };
      }
    }, 100);
  },

  /**
   * Abre aba de gerenciamento de bancos
   */
  abrirConfigBancos: function() {
    console.log('[INIT_CONFIG] Abrindo gerenciamento de bancos');
    
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
        '<div class="bancos-empty-icon">🏦</div>' +
        '<p>Nenhum banco cadastrado</p>' +
        '<p style="font-size:var(--font-size-sm);margin-top:8px;">Adicione seu primeiro banco acima</p>' +
        '</div>';
      return;
    }
    
    var html = '';
    bancos.forEach(function(banco, index) {
      var icon = '🏦';
      if (banco.tipo === 'Conta Poupança') icon = '�';
      if (banco.tipo === 'Dinheiro') icon = '💵';
      
      html += '<div class="banco-item" data-index="' + index + '" data-tipo="banco">' +
        '<div class="banco-item-info">' +
          '<div class="banco-item-icon">' + icon + '</div>' +
          '<div class="banco-item-details">' +
            '<div class="banco-item-nome">' + UTILS.escapeHtml(banco.nome) + '</div>' +
            '<div class="banco-item-tipo">' + UTILS.escapeHtml(banco.tipo) + '</div>' +
          '</div>' +
        '</div>' +
        '<div class="banco-item-actions">' +
          '<button type="button" class="btn-remover-banco" data-index="' + index + '" data-tipo="banco" aria-label="Remover ' + UTILS.escapeHtml(banco.nome) + '">' +
          '🗑️ Remover' +
          '</button>' +
        '</div>' +
        '</div>';
    });
    
    listaEl.innerHTML = html;
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
        '<div class="bancos-empty-icon">💳</div>' +
        '<p>Nenhum cartão cadastrado</p>' +
        '<p style="font-size:var(--font-size-sm);margin-top:8px;">Adicione seu primeiro cartão acima</p>' +
        '</div>';
      return;
    }
    
    var html = '';
    cartoes.forEach(function(cartao, index) {
      html += '<div class="banco-item" data-index="' + index + '" data-tipo="cartao">' +
        '<div class="banco-item-info">' +
          '<div class="banco-item-icon">💳</div>' +
          '<div class="banco-item-details">' +
            '<div class="banco-item-nome">' + UTILS.escapeHtml(cartao.nome) + '</div>' +
            '<div class="banco-item-tipo">' + UTILS.escapeHtml(cartao.bandeira) + (cartao.limite ? ' • Limite: R$ ' + parseFloat(cartao.limite).toLocaleString('pt-BR', {minimumFractionDigits:2}) : '') + '</div>' +
          '</div>' +
        '</div>' +
        '<div class="banco-item-actions">' +
          '<button type="button" class="btn-remover-banco" data-index="' + index + '" data-tipo="cartao" aria-label="Remover ' + UTILS.escapeHtml(cartao.nome) + '">' +
          '🗑️ Remover' +
          '</button>' +
        '</div>' +
        '</div>';
    });
    
    listaEl.innerHTML = html;
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
    UTILS.mostrarToast('Banco adicionado!', 'success');
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
      UTILS.mostrarToast('Banco removido!', 'success');
    });
  },

  /**
   * Adiciona cartão
   */
  adicionarCartao: function(nome, bandeira, limite) {
    var validacao = INIT_CONFIG._validateBancoNome(nome);
    if (!validacao.valid) {
      UTILS.mostrarToast(validacao.message, 'error');
      return;
    }
    
    var config = DADOS.getConfig();
    var cartoes = config.cartoes || [];
    cartoes.push({ 
      nome: validacao.value, 
      bandeira: bandeira,
      limite: limite ? parseFloat(limite) : null
    });
    DADOS.salvarConfig({ cartoes: cartoes });
    
    // Limpar formulário
    document.getElementById('cartao-nome').value = '';
    document.getElementById('cartao-bandeira').value = 'Visa';
    document.getElementById('cartao-limite').value = '';
    
    // Re-renderizar lista
    INIT_CONFIG._renderizarListaCartoes();
    INIT_CONFIG._updateDynamicValues();
    UTILS.mostrarToast('Cartão adicionado!', 'success');
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
      UTILS.mostrarToast('Cartão removido!', 'success');
    });
  },

  /**
   * Abre gerenciador de categorias
   */
  abrirGerenciarCategorias: function(tipo) {
    var config = DADOS.getConfig();
    var customCats = config.categoriasCustom || {};
    var cats = customCats[tipo] || [];
    
    var html = '<h3>🏷️ Gerenciar Categorias - ' + (tipo === 'receita' ? 'Receitas' : 'Despesas') + '</h3>' +
      '<div style="margin-bottom:16px;">' +
      '<button type="button" id="add-cat-btn" style="padding:8px 16px;background:var(--primary);color:white;border:none;border-radius:var(--radius-sm);cursor:pointer;">+ Adicionar Categoria</button>' +
      '</div>' +
      '<div id="cats-list" style="display:flex;flex-direction:column;gap:8px;">';
    
    cats.forEach(function(cat, index) {
      html += '<div class="cat-item" data-index="' + index + '" style="padding:12px;border:1px solid var(--border);border-radius:var(--radius-sm);display:flex;justify-content:space-between;align-items:center;">' +
        '<div style="display:flex;align-items:center;gap:8px;">' +
          '<span style="font-size:18px;">✨</span>' +
          '<div>' +
            '<div style="font-weight:500;">' + UTILS.escapeHtml(cat) + '</div>' +
          '</div>' +
        '</div>' +
        '<button type="button" class="btn-remover-cat" data-index="' + index + '" style="padding:4px 8px;background:var(--danger);color:white;border:none;border-radius:4px;cursor:pointer;">Remover</button>' +
      '</div>';
    });
    
    if (cats.length === 0) {
      html += '<div style="text-align:center;color:var(--text-muted);padding:20px;">Nenhuma categoria personalizada</div>';
    }
    
    html += '</div>';
    
    INIT_MODALS.fpAlert(html);
    
    setTimeout(function() {
      var overlay = document.querySelector('.modal-overlay');
      if (!overlay) return;
      
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
    var html = '<h3>➕ Adicionar Categoria</h3>' +
      '<div style="display:flex;flex-direction:column;gap:12px;">' +
      '<div>' +
      '<label style="display:block;margin-bottom:4px;font-weight:500;">Nome da Categoria</label>' +
      '<input type="text" id="cat-nome" placeholder="Ex: Streaming" style="width:100%;padding:8px;border:1px solid var(--border);border-radius:var(--radius-sm);" maxlength="30">' +
      '</div>' +
      '</div>';
    
    INIT_MODALS.fpAlert(html);
    
    setTimeout(function() {
      var overlay = document.querySelector('.modal-overlay');
      if (!overlay) return;
      
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
            UTILS.mostrarToast('Categoria já existe', 'warning');
            return;
          }
          
          customCats[tipo].push(validacao.value);
          DADOS.salvarConfig({ categoriasCustom: customCats });
          
          overlay.remove();
          INIT_CONFIG.abrirGerenciarCategorias(tipo); // Reabrir para atualizar lista
          UTILS.mostrarToast('Categoria adicionada!', 'success');
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
      
      UTILS.mostrarToast('Categoria removida!', 'success');
    });
  }
};

// Export para compatibilidade
if (typeof module !== 'undefined' && module.exports) {
  module.exports = INIT_CONFIG;
}
