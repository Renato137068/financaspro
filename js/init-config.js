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
    
    var reader = new FileReader();
    reader.onload = function(e) {
      try {
        var data = JSON.parse(e.target.result);
        INIT_CONFIG.importarDados(data);
      } catch (err) {
        UTILS.mostrarToast('Arquivo inválido', 'error');
      }
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
   * Abre modal de edição de perfil
   */
  abrirEditarPerfil: function() {
    var config = DADOS.getConfig();
    var html = '<h3>👤 Perfil</h3>' +
      '<div style="display:flex;flex-direction:column;gap:12px;">' +
      '<div>' +
      '<label style="display:block;margin-bottom:4px;font-weight:500;">Nome</label>' +
      '<input type="text" id="perfil-nome" value="' + UTILS.escapeHtml(config.nome || '') + '" style="width:100%;padding:8px;border:1px solid var(--border);border-radius:var(--radius-sm);">' +
      '</div>' +
      '<div>' +
      '<label style="display:block;margin-bottom:4px;font-weight:500;">Moeda</label>' +
      '<select id="perfil-moeda" style="width:100%;padding:8px;border:1px solid var(--border);border-radius:var(--radius-sm);">' +
      '<option value="BRL" ' + (config.moeda === 'BRL' ? 'selected' : '') + '>🇧🇷 BRL - Real Brasileiro</option>' +
      '<option value="USD" ' + (config.moeda === 'USD' ? 'selected' : '') + '>🇺🇸 USD - Dólar Americano</option>' +
      '<option value="EUR" ' + (config.moeda === 'EUR' ? 'selected' : '') + '>🇪🇺 EUR - Euro</option>' +
      '</select>' +
      '</div>' +
      '</div>';
    
    INIT_MODALS.fpAlert(html);
    
    setTimeout(function() {
      var overlay = document.querySelector('.modal-overlay');
      if (!overlay) return;
      
      var okBtn = overlay.querySelector('.modal-btn');
      if (okBtn) {
        okBtn.textContent = 'Salvar';
        okBtn.onclick = function() {
          var nome = document.getElementById('perfil-nome').value.trim();
          var moeda = document.getElementById('perfil-moeda').value;
          
          if (!nome) {
            UTILS.mostrarToast('Informe seu nome', 'error');
            return;
          }
          
          DADOS.salvarConfig({ nome: nome, moeda: moeda });
          overlay.remove();
          RENDER.init();
          UTILS.mostrarToast('Perfil atualizado!', 'success');
        };
      }
    }, 100);
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
          
          if (valor <= 0) {
            UTILS.mostrarToast('Informe uma renda válida', 'error');
            return;
          }
          
          DADOS.salvarConfig({ rendaMensal: valor });
          overlay.remove();
          RENDER.init();
          UTILS.mostrarToast('Renda atualizada!', 'success');
        };
      }
    }, 100);
  },

  /**
   * Abre modal de configuração de bancos
   */
  abrirConfigBancos: function() {
    var config = DADOS.getConfig();
    var bancos = config.bancos || [];
    var html = '<h3>🏦 Bancos e Contas</h3>' +
      '<div style="margin-bottom:16px;">' +
      '<button type="button" id="add-banco-btn" style="padding:8px 16px;background:var(--primary);color:white;border:none;border-radius:var(--radius-sm);cursor:pointer;">+ Adicionar Banco</button>' +
      '</div>' +
      '<div id="bancos-list" style="display:flex;flex-direction:column;gap:8px;">';
    
    bancos.forEach(function(banco, index) {
      html += '<div class="banco-item" data-index="' + index + '" style="padding:12px;border:1px solid var(--border);border-radius:var(--radius-sm);display:flex;justify-content:space-between;align-items:center;">' +
        '<div>' +
          '<div style="font-weight:500;">' + UTILS.escapeHtml(banco.nome) + '</div>' +
          '<div style="font-size:12px;color:var(--text-muted);">' + UTILS.escapeHtml(banco.tipo || 'Conta Corrente') + '</div>' +
        '</div>' +
        '<button type="button" class="btn-remover-banco" data-index="' + index + '" style="padding:4px 8px;background:var(--danger);color:white;border:none;border-radius:4px;cursor:pointer;">Remover</button>' +
      '</div>';
    });
    
    if (bancos.length === 0) {
      html += '<div style="text-align:center;color:var(--text-muted);padding:20px;">Nenhum banco cadastrado</div>';
    }
    
    html += '</div>';
    
    INIT_MODALS.fpAlert(html);
    
    setTimeout(function() {
      var overlay = document.querySelector('.modal-overlay');
      if (!overlay) return;
      
      // Botão adicionar
      var addBtn = document.getElementById('add-banco-btn');
      if (addBtn) {
        addBtn.onclick = function() {
          INIT_CONFIG.adicionarBanco();
        };
      }
      
      // Botões remover
      overlay.addEventListener('click', function(e) {
        var btn = e.target.closest('.btn-remover-banco');
        if (btn) {
          var index = parseInt(btn.dataset.index);
          INIT_CONFIG.removerBanco(index);
        }
      });
      
      var okBtn = overlay.querySelector('.modal-btn');
      if (okBtn) {
        okBtn.textContent = 'Fechar';
      }
    }, 100);
  },

  /**
   * Adiciona banco
   */
  adicionarBanco: function() {
    var html = '<h3>➕ Adicionar Banco</h3>' +
      '<div style="display:flex;flex-direction:column;gap:12px;">' +
      '<div>' +
      '<label style="display:block;margin-bottom:4px;font-weight:500;">Nome do Banco</label>' +
      '<input type="text" id="banco-nome" placeholder="Ex: Banco do Brasil" style="width:100%;padding:8px;border:1px solid var(--border);border-radius:var(--radius-sm);">' +
      '</div>' +
      '<div>' +
      '<label style="display:block;margin-bottom:4px;font-weight:500;">Tipo de Conta</label>' +
      '<select id="banco-tipo" style="width:100%;padding:8px;border:1px solid var(--border);border-radius:var(--radius-sm);">' +
      '<option value="Conta Corrente">Conta Corrente</option>' +
      '<option value="Conta Poupança">Conta Poupança</option>' +
      '<option value="Cartão de Crédito">Cartão de Crédito</option>' +
      '<option value="Dinheiro">Dinheiro</option>' +
      '</select>' +
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
          var nome = document.getElementById('banco-nome').value.trim();
          var tipo = document.getElementById('banco-tipo').value;
          
          if (!nome) {
            UTILS.mostrarToast('Informe o nome do banco', 'error');
            return;
          }
          
          var config = DADOS.getConfig();
          var bancos = config.bancos || [];
          bancos.push({ nome: nome, tipo: tipo });
          DADOS.salvarConfig({ bancos: bancos });
          
          overlay.remove();
          INIT_CONFIG.abrirConfigBancos(); // Reabrir para atualizar lista
          UTILS.mostrarToast('Banco adicionado!', 'success');
        };
      }
    }, 100);
  },

  /**
   * Remove banco
   */
  removerBanco: function(index) {
    INIT_MODALS.confirm('Remover este banco?', function() {
      var config = DADOS.getConfig();
      var bancos = config.bancos || [];
      bancos.splice(index, 1);
      DADOS.salvarConfig({ bancos: bancos });
      
      // Reabrir modal para atualizar lista
      var overlay = document.querySelector('.modal-overlay');
      if (overlay) overlay.remove();
      INIT_CONFIG.abrirConfigBancos();
      
      UTILS.mostrarToast('Banco removido!', 'success');
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
      '<input type="text" id="cat-nome" placeholder="Ex: Streaming" style="width:100%;padding:8px;border:1px solid var(--border);border-radius:var(--radius-sm);">' +
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
          var nome = document.getElementById('cat-nome').value.trim();
          
          if (!nome) {
            UTILS.mostrarToast('Informe o nome da categoria', 'error');
            return;
          }
          
          var config = DADOS.getConfig();
          var customCats = config.categoriasCustom || {};
          if (!customCats[tipo]) customCats[tipo] = [];
          
          if (customCats[tipo].includes(nome)) {
            UTILS.mostrarToast('Categoria já existe', 'warning');
            return;
          }
          
          customCats[tipo].push(nome);
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
