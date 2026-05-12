/**
 * init-extrato.js - Sistema de extrato e filtros
 * Extraído do init.js para modularização
 * Responsabilidades: estado do extrato, filtros, renderização
 */

const INIT_EXTRATO = {
  /**
   * Estado do extrato
   */
  state: {
    filtroTipo: 'todos',
    filtroCat: null,
    busca: '',
    mesOffset: 0 // 0 = mês atual, -1 = mês anterior, etc
  },
  listenerAttached: false,
  filtrosCategoriasListener: false,

  /**
   * Inicializa sistema de extrato
   */
  init: function() {
    this.setupExtratoListeners();
    this.atualizarPeriodoLabel();
    this._bindBusca();
  },

  _bindBusca: function() {
    var self = this;
    var el = document.getElementById('extrato-busca');
    if (el) el.addEventListener('input', function() { self.filtrarExtrato(); });
  },

  /**
   * Configura listeners do extrato
   */
  setupExtratoListeners: function() {
    if (this.listenerAttached) return;
    this.listenerAttached = true;

    // Listener de busca
    var buscaInput = document.getElementById('extrato-busca');
    if (buscaInput) {
      buscaInput.addEventListener('input', () => this.filtrarExtrato());
    }
  },

  /**
   * Obtém informação do mês/ano atual baseado no offset
   */
  getExtratoMesAno: function() {
    var d = new Date();
    d.setMonth(d.getMonth() + this.state.mesOffset);
    return { mes: d.getMonth() + 1, ano: d.getFullYear(), date: d };
  },

  /**
   * Navega para período anterior/próximo
   */
  navegarPeriodo: function(dir) {
    this.state.mesOffset += dir;
    this.atualizarPeriodoLabel();
    this.filtrarExtrato();
  },

  /**
   * Atualiza label do período no UI
   */
  atualizarPeriodoLabel: function() {
    var info = this.getExtratoMesAno();
    var label = document.getElementById('periodo-label');
    if (label) {
      var nomes = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];
      label.textContent = nomes[info.mes - 1] + ' ' + info.ano;
    }
    // Esconder botão "próximo" se já no mês atual
    var btnNext = document.getElementById('periodo-next');
    if (btnNext) btnNext.style.visibility = this.state.mesOffset >= 0 ? 'hidden' : 'visible';
  },

  /**
   * Define filtro por tipo
   */
  setFiltroTipo: function(tipo) {
    this.state.filtroTipo = tipo;
    document.querySelectorAll('.filtro-chip[data-filtro]').forEach(function(b) { b.classList.remove('ativo'); });
    var btn = document.querySelector('.filtro-chip[data-filtro="' + tipo + '"]');
    if (btn) btn.classList.add('ativo');
    this.filtrarExtrato();
  },

  /**
   * Define filtro por categoria
   */
  setFiltroCat: function(cat) {
    if (this.state.filtroCat === cat) {
      this.state.filtroCat = null;
    } else {
      this.state.filtroCat = cat;
    }
    document.querySelectorAll('.filtro-cat-chip').forEach(function(b) {
      b.classList.toggle('ativo', b.dataset.cat === this.state.filtroCat);
    }.bind(this));
    this.filtrarExtrato();
  },

  /**
   * Renderiza filtros de categorias
   */
  renderFiltrosCategorias: function(txs) {
    var container = document.getElementById('filtros-categoria');
    if (!container) return;
    
    var cats = {};
    txs.forEach(function(t) { cats[t.categoria] = (cats[t.categoria] || 0) + 1; });
    var sorted = Object.keys(cats).sort(function(a, b) { return cats[b] - cats[a]; });
    
    container.innerHTML = sorted.map(function(cat) {
      var ativo = this.state.filtroCat === cat ? ' ativo' : '';
      return '<button class="filtro-cat-chip' + ativo + '" data-cat="' + UTILS.escapeHtml(cat) + '">' +
        INIT_EXTRATO.getCatIcon(cat) + ' ' + UTILS.escapeHtml(cat) + ' <span class="cat-count">' + cats[cat] + '</span></button>';
    }.bind(this)).join('');

    if (!this.filtrosCategoriasListener) {
      this.filtrosCategoriasListener = true;
      container.addEventListener('click', function(ev) {
        var btn = ev.target.closest('[data-cat]');
        if (!btn) return;
        this.setFiltroCat(btn.dataset.cat);
      }.bind(this));
    }
  },

  /**
   * Renderiza resumo do extrato
   */
  renderExtratoResumo: function(txs) {
    var el = document.getElementById('extrato-resumo');
    if (!el) return;
    
    var rec = 0, desp = 0;
    txs.forEach(function(t) {
      if (t.tipo === CONFIG.TIPO_RECEITA) rec += t.valor;
      else desp += t.valor;
    });
    var saldo = rec - desp;
    
    el.innerHTML =
      '<div class="resumo-cards">' +
        '<div class="resumo-card receita">' +
          '<div class="resumo-label">Receitas</div>' +
          '<div class="resumo-valor">' + UTILS.formatarMoeda(rec) + '</div>' +
        '</div>' +
        '<div class="resumo-card despesa">' +
          '<div class="resumo-label">Despesas</div>' +
          '<div class="resumo-valor">' + UTILS.formatarMoeda(desp) + '</div>' +
        '</div>' +
        '<div class="resumo-card saldo ' + (saldo >= 0 ? 'positivo' : 'negativo') + '">' +
          '<div class="resumo-label">Saldo</div>' +
          '<div class="resumo-valor">' + UTILS.formatarMoeda(saldo) + '</div>' +
        '</div>' +
      '</div>';
  },

  /**
   * Renderiza lista de transações do extrato
   */
  renderExtratoLista: function(txs) {
    var container = document.getElementById('extrato-lista');
    if (!container) return;
    
    if (txs.length === 0) {
      container.innerHTML = '<div class="empty-state">Nenhuma transação encontrada</div>';
      return;
    }

    var html = '';
    txs.forEach(function(t) {
      var data = new Date(t.data + 'T00:00:00');
      var dataStr = data.toLocaleDateString('pt-BR');
      var catIcon = INIT_EXTRATO.getCatIcon(t.categoria);
      var catCor = INIT_EXTRATO.getCatCor(t.categoria);
      
      html += '<div class="extrato-item ' + t.tipo + '" data-id="' + t.id + '">' +
        '<div class="extrato-data">' + dataStr + '</div>' +
        '<div class="extrato-desc">' +
          '<div class="extrato-categoria" style="color:' + catCor + '">' + catIcon + ' ' + t.categoria + '</div>' +
          '<div class="extrato-nome">' + UTILS.escapeHtml(t.descricao || '') + '</div>' +
        '</div>' +
        '<div class="extrato-valor ' + t.tipo + '">' +
          (t.tipo === CONFIG.TIPO_RECEITA ? '+' : '-') + UTILS.formatarMoeda(t.valor) +
        '</div>' +
        '<div class="extrato-actions">' +
          '<button class="btn-editar" data-id="' + t.id + '" title="Editar">✏️</button>' +
          '<button class="btn-deletar" data-id="' + t.id + '" title="Deletar">🗑️</button>' +
        '</div>' +
      '</div>';
    });

    container.innerHTML = html;

    // Adicionar listeners de ações
    container.addEventListener('click', function(e) {
      var btnEdit = e.target.closest('.btn-editar');
      var btnDel = e.target.closest('.btn-deletar');
      
      if (btnEdit) {
        var id = btnEdit.dataset.id;
        INIT_EXTRATO.editarTransacao(id);
      } else if (btnDel) {
        var id = btnDel.dataset.id;
        INIT_EXTRATO.deletarTransacao(id);
      }
    });
  },

  /**
   * Filtra e renderiza extrato completo
   */
  filtrarExtrato: function() {
    var info = this.getExtratoMesAno();
    var txs = TRANSACOES.obter({
      mes: info.mes,
      ano: info.ano,
      tipo: this.state.filtroTipo === 'todos' ? null : this.state.filtroTipo,
      categoria: this.state.filtroCat,
      busca: document.getElementById('extrato-busca')?.value || ''
    });

    this.renderFiltrosCategorias(txs);
    this.renderExtratoResumo(txs);
    this.renderExtratoLista(txs);
  },

  /**
   * Edita transação
   */
  editarTransacao: function(id) {
    var tx = TRANSACOES.obterPorId(id);
    if (!tx) return;

    // Preencher formulário com dados da transação
    document.getElementById('novo-valor').value = UTILS.formatarMoeda(tx.valor);
    document.getElementById('novo-descricao').value = tx.descricao || '';
    document.getElementById('novo-categoria').value = tx.categoria;
    document.getElementById('novo-tipo').value = tx.tipo;
    document.getElementById('novo-data').value = tx.data;

    // Atualizar UI
    INIT_FORM.atualizarTipoIndicator(tx.tipo);
    INIT_FORM.renderCategoriasBtns(tx.tipo);
    INIT_FORM.atualizarOrcamentoPreview();

    // Navegar para aba de edição
    mudarAba('novo');

    // Marcar como edição
    document.getElementById('form-transacao').dataset.editId = id;
    
    // Mudar texto do botão
    var btnReg = document.querySelector('.btn-registrar');
    if (btnReg) btnReg.textContent = 'Atualizar';

    UTILS.mostrarToast('Edite a transação e clique em Atualizar', 'info');
  },

  /**
   * Deleta transação
   */
  deletarTransacao: function(id) {
    INIT_MODALS.confirm('Tem certeza que deseja deletar esta transação?', function() {
      TRANSACOES.deletar(id);
      INIT_EXTRATO.filtrarExtrato();
      RENDER.init();
      UTILS.mostrarToast('Transação deletada', 'success');
    });
  },

  /**
   * Exporta extrato para Excel
   */
  exportarExcel: function() {
    var info = this.getExtratoMesAno();
    var txs = TRANSACOES.obter({ mes: info.mes, ano: info.ano });
    
    if (txs.length === 0) {
      UTILS.mostrarToast('Nenhuma transação para exportar', 'warning');
      return;
    }

    var csv = 'Data,Descrição,Categoria,Tipo,Valor\n';
    txs.forEach(function(t) {
      var data = new Date(t.data + 'T00:00:00').toLocaleDateString('pt-BR');
      var valor = t.tipo === CONFIG.TIPO_RECEITA ? t.valor : -t.valor;
      csv += data + ',"' + (t.descricao || '') + '",' + t.categoria + ',' + t.tipo + ',' + valor + '\n';
    });

    var blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    var link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = 'extrato_' + info.mes + '_' + info.ano + '.csv';
    link.click();
    
    UTILS.mostrarToast('Extrato exportado com sucesso!', 'success');
  },

  /**
   * Exporta extrato para PDF
   */
  exportarExtrato: function() {
    // Implementação simplificada - abre em nova janela para impressão
    var info = this.getExtratoMesAno();
    var txs = TRANSACOES.obter({ mes: info.mes, ano: info.ano });
    
    if (txs.length === 0) {
      UTILS.mostrarToast('Nenhuma transação para exportar', 'warning');
      return;
    }

    var html = '<html><head><title>Extrato FinançasPro</title>';
    html += '<style>body{font-family:Arial;margin:20px;}table{width:100%;border-collapse:collapse;}th,td{border:1px solid #ddd;padding:8px;text-align:left;}th{background:#f5f5f5;}.receita{color:green;}.despesa{color:red;}</style>';
    html += '</head><body>';
    html += '<h1>Extrato ' + info.mes + '/' + info.ano + '</h1>';
    html += '<table><tr><th>Data</th><th>Descrição</th><th>Categoria</th><th>Tipo</th><th>Valor</th></tr>';
    
    txs.forEach(function(t) {
      var data = new Date(t.data + 'T00:00:00').toLocaleDateString('pt-BR');
      var valor = (t.tipo === CONFIG.TIPO_RECEITA ? '+' : '-') + UTILS.formatarMoeda(t.valor);
      html += '<tr><td>' + data + '</td><td>' + (t.descricao || '') + '</td><td>' + t.categoria + '</td><td>' + t.tipo + '</td><td class="' + t.tipo + '">' + valor + '</td></tr>';
    });
    
    html += '</table></body></html>';

    var win = window.open('', '_blank');
    win.document.write(html);
    win.document.close();
    win.print();
    
    UTILS.mostrarToast('Extrato aberto para impressão', 'success');
  },

  /**
   * Obtém ícone da categoria
   */
  getCatIcon: function(cat) { 
    return this.CATEGORIA_ICONES[cat] || this.CATEGORIA_ICONES[cat.toLowerCase()] || '📌'; 
  },

  /**
   * Obtém cor da categoria
   */
  getCatCor: function(cat) { 
    return this.CATEGORIA_CORES[cat] || this.CATEGORIA_CORES[cat.toLowerCase()] || '#94a3b8'; 
  }
};

// Ícones por categoria
INIT_EXTRATO.CATEGORIA_ICONES = {
  'salario': '💰', 'freelance': '💻', 'investimentos': '📈', 'vendas': '🛒',
  'alimentacao': '🍔', 'transporte': '🚗', 'utilities': '🏠', 'moradia': '🏠',
  'saude': '💊', 'educacao': '📚', 'entretenimento': '🎮', 'lazer': '🎬',
  'compras': '🛍️', 'vestuario': '👕', 'viagem': '✈️', 'pet': '🐾',
  'assinaturas': '📺', 'outro': '📌', 'outros': '📌',
  /* Labels com acento (fallback) */
  'Salário': '💰', 'Alimentação': '🍔', 'Transporte': '🚗', 'Saúde': '💊',
  'Educação': '📚', 'Moradia': '🏠', 'Lazer': '🎬', 'Freelance': '💻',
  'Investimentos': '📈', 'Vendas': '🛒', 'Entretenimento': '🎮', 'Outros': '📌'
};

// Cores por categoria
INIT_EXTRATO.CATEGORIA_CORES = {
  'salario': '#10b981', 'freelance': '#6366f1', 'investimentos': '#0ea5e9', 'vendas': '#f59e0b',
  'alimentacao': '#ef4444', 'transporte': '#8b5cf6', 'utilities': '#06b6d4', 'moradia': '#14b8a6',
  'saude': '#ec4899', 'educacao': '#3b82f6', 'entretenimento': '#f97316', 'lazer': '#a855f7',
  'compras': '#e11d48', 'vestuario': '#7c3aed', 'viagem': '#0284c7', 'pet': '#84cc16',
  'assinaturas': '#6366f1', 'outro': '#94a3b8', 'outros': '#94a3b8',
  'Salário': '#10b981', 'Alimentação': '#ef4444', 'Transporte': '#8b5cf6', 'Saúde': '#ec4899',
  'Educação': '#3b82f6', 'Moradia': '#14b8a6', 'Lazer': '#a855f7', 'Freelance': '#6366f1',
  'Investimentos': '#0ea5e9', 'Vendas': '#f59e0b', 'Entretenimento': '#f97316', 'Outros': '#94a3b8'
};

// Export para compatibilidade
if (typeof module !== 'undefined' && module.exports) {
  module.exports = INIT_EXTRATO;
}
