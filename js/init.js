/**
 * init.js - Application Initialization
 * Tier 2: Depends on all other modules (last to load)
 */

document.addEventListener('DOMContentLoaded', function() {
  DADOS.init();
  TRANSACOES.init();
  ORCAMENTO.init();
  RENDER.init();
  CONFIG_USER.init();
  CONFIG_USER.aplicarTema();
  setupNavigation();
  setupFormSubmit();
  setupImport();
  setupAutoCategorizacao();
  var dataInput = document.getElementById('novo-data');
  if (dataInput && !dataInput.value) {
    dataInput.value = new Date().toISOString().split('T')[0];
  }
});

function setupNavigation() {
  var navButtons = document.querySelectorAll('.nav-btn');
  if (navButtons.length === 0) return;
  if (navButtons.length > 0) navButtons[0].click();
}

function setupFormSubmit() {
  var form = document.getElementById('form-transacao');
  if (!form) return;

  form.addEventListener('submit', function(e) {
    e.preventDefault();
    try {
      var tipo = window._tipoSelecionado || CONFIG.TIPO_DESPESA;
      var valor = document.getElementById('novo-valor') ? document.getElementById('novo-valor').value : '';
      var categoria = document.getElementById('novo-categoria') ? document.getElementById('novo-categoria').value : '';
      var data = document.getElementById('novo-data') ? document.getElementById('novo-data').value : '';
      var descricao = document.getElementById('novo-descricao') ? document.getElementById('novo-descricao').value : '';
      var nota = document.getElementById('novo-nota') ? document.getElementById('novo-nota').value : '';

      // Auto-categorizar se a categoria não foi selecionada manualmente
      if (!categoria && descricao && typeof CATEGORIAS !== 'undefined') {
        var sugestao = CATEGORIAS.detectar(descricao);
        if (sugestao) {
          tipo = sugestao.tipo;
          categoria = sugestao.categoria;
        }
      }

      if (!tipo || !valor || !categoria || !data) {
        UTILS.mostrarToast('Preencha todos os campos obrigatorios', 'error');
        return;
      }
      var valorNum = parseFloat(valor);
      if (isNaN(valorNum) || valorNum <= 0) {
        UTILS.mostrarToast('Valor deve ser um numero maior que zero', 'error');
        return;
      }

      TRANSACOES.criar(tipo, valor, categoria, data, descricao || nota);
      UTILS.mostrarToast('Transacao registrada com sucesso!', 'success');
      form.reset();
      window._tipoSelecionado = CONFIG.TIPO_DESPESA;
      atualizarBotoesTipo();
      var dataInput = document.getElementById('novo-data');
      if (dataInput) dataInput.value = new Date().toISOString().split('T')[0];
      limparSugestaoCategoria();
      RENDER.renderResumo();
      RENDER.renderExtrato();
      RENDER.renderOrcamento();
      RENDER.atualizarHeaderSaldo();
    } catch (erro) {
      UTILS.mostrarToast(erro.message, 'error');
    }
  });

  var formOrc = document.getElementById('form-orcamentos');
  if (formOrc) {
    formOrc.addEventListener('submit', function(e) {
      e.preventDefault();
      try {
        var cats = ['alimentacao','transporte','moradia','saude','lazer'];
        cats.forEach(function(cat) {
          var el = document.getElementById('limit-' + cat);
          var val = el ? parseFloat(el.value || 0) : 0;
          if (val > 0) ORCAMENTO.definirLimite(cat, val);
        });
        UTILS.mostrarToast('Orcamentos definidos com sucesso!', 'success');
        RENDER.renderOrcamento();
      } catch (erro) {
        UTILS.mostrarToast(erro.message, 'error');
      }
    });
  }
}

/**
 * Auto-categorização: ao digitar a descrição, sugere tipo + categoria
 */
function setupAutoCategorizacao() {
  var descInput = document.getElementById('novo-descricao');
  if (!descInput || typeof CATEGORIAS === 'undefined') return;

  var timeout = null;
  descInput.addEventListener('input', function() {
    clearTimeout(timeout);
    timeout = setTimeout(function() {
      var texto = descInput.value;
      var sugestao = CATEGORIAS.detectar(texto);
      if (sugestao) {
        aplicarSugestao(sugestao);
      } else {
        limparSugestaoCategoria();
      }
    }, 400);
  });
}

function aplicarSugestao(sugestao) {
  // Atualizar tipo
  window._tipoSelecionado = sugestao.tipo;
  atualizarBotoesTipo();

  // Atualizar categoria
  var catSelect = document.getElementById('novo-categoria');
  if (catSelect) {
    catSelect.value = sugestao.categoria;
    // Highlight visual de sugestão automática
    catSelect.classList.add('auto-sugerido');
  }

  // Mostrar badge de sugestão
  var badge = document.getElementById('sugestao-badge');
  if (!badge) {
    badge = document.createElement('div');
    badge.id = 'sugestao-badge';
    badge.className = 'sugestao-badge';
    var catSelect2 = document.getElementById('novo-categoria');
    if (catSelect2 && catSelect2.parentNode) {
      catSelect2.parentNode.appendChild(badge);
    }
  }
  var nomeCategoria = sugestao.categoria.charAt(0).toUpperCase() + sugestao.categoria.slice(1);
  var tipoEmoji = sugestao.tipo === 'receita' ? '💚' : '❤️';
  badge.textContent = tipoEmoji + ' Auto: ' + nomeCategoria;
  badge.style.display = 'block';
}

function limparSugestaoCategoria() {
  var catSelect = document.getElementById('novo-categoria');
  if (catSelect) catSelect.classList.remove('auto-sugerido');
  var badge = document.getElementById('sugestao-badge');
  if (badge) badge.style.display = 'none';
}

window._tipoSelecionado = CONFIG.TIPO_DESPESA;

function mudarAba(nomeAba) {
  var abas = document.querySelectorAll('[id^="aba-"]');
  var navBtns = document.querySelectorAll('.nav-btn');
  abas.forEach(function(a) { a.classList.remove('ativo'); a.setAttribute('aria-hidden','true'); });
  navBtns.forEach(function(b) { b.classList.remove('ativo'); b.removeAttribute('aria-current'); });
  var alvo = document.getElementById('aba-' + nomeAba);
  if (alvo) { alvo.classList.add('ativo'); alvo.removeAttribute('aria-hidden'); }
  var btn = document.querySelector('[data-aba="' + nomeAba + '"]');
  if (btn) { btn.classList.add('ativo'); btn.setAttribute('aria-current','true'); }
}

function selecionarTipo(tipo) {
  window._tipoSelecionado = tipo;
  atualizarBotoesTipo();
}

function atualizarBotoesTipo() {
  document.querySelectorAll('.tipo-btn').forEach(function(btn) {
    if (btn.getAttribute('data-tipo') === window._tipoSelecionado) {
      btn.classList.add('ativo');
    } else {
      btn.classList.remove('ativo');
    }
  });
}

function filtrarExtrato(filtro) {
  document.querySelectorAll('.filtro-btn').forEach(function(b) { b.classList.remove('ativo'); });
  var ba = document.querySelector('[data-filtro="' + filtro + '"]');
  if (ba) ba.classList.add('ativo');

  var txs = TRANSACOES.obter({});
  if (filtro === 'receita') txs = txs.filter(function(t) { return t.tipo === CONFIG.TIPO_RECEITA; });
  else if (filtro === 'despesa') txs = txs.filter(function(t) { return t.tipo === CONFIG.TIPO_DESPESA; });

  var container = document.getElementById('lista-transacoes');
  if (!container) return;
  if (txs.length === 0) { container.innerHTML = '<p class="empty">Nenhuma transacao</p>'; return; }

  container.innerHTML = txs.map(function(t) {
    return '<div class="transacao-item-full" data-tx-id="' + UTILS.escapeHtml(t.id) + '">' +
      '<div class="transacao-info-full">' +
        '<div class="transacao-categoria">' + UTILS.escapeHtml(t.categoria) + '</div>' +
        '<div class="transacao-descricao">' + UTILS.escapeHtml(t.descricao || '-') + '</div>' +
        '<div class="transacao-data">' + UTILS.formatarData(t.data) + '</div>' +
      '</div><div class="transacao-actions">' +
        '<div class="transacao-valor ' + t.tipo + '">' +
          (t.tipo === CONFIG.TIPO_RECEITA ? '+' : '-') + ' ' + UTILS.formatarMoeda(t.valor) +
        '</div>' +
        '<button class="btn-delete" type="button" aria-label="Excluir">&times;</button>' +
      '</div></div>';
  }).join('');

  container.addEventListener('click', function(e) {
    var del = e.target.closest('.btn-delete');
    if (!del) return;
    var item = del.closest('[data-tx-id]');
    var id = item ? item.dataset.txId : null;
    if (!id) return;
    var tx = TRANSACOES.obterPorId(id);
    var desc = tx ? (tx.descricao || tx.categoria) : 'esta transacao';
    fpConfirm('Excluir "' + desc + '"?', function() {
      TRANSACOES.deletar(id);
      filtrarExtrato(filtro);
      RENDER.renderResumo();
      RENDER.renderOrcamento();
      RENDER.atualizarHeaderSaldo();
      UTILS.mostrarToast('Transacao excluida', 'info');
    });
  });
}

function fpConfirm(msg, onOk, onNo) {
  var old = document.querySelector('.modal-overlay');
  if (old) old.remove();
  var ov = document.createElement('div');
  ov.className = 'modal-overlay';
  ov.setAttribute('role','dialog');
  ov.setAttribute('aria-modal','true');
  ov.innerHTML = '<div class="modal-box"><p>' + UTILS.escapeHtml(msg) + '</p>' +
    '<div class="modal-actions">' +
    '<button class="btn-cancelar" id="mc">Cancelar</button>' +
    '<button class="btn-confirmar-danger" id="mo">Confirmar</button>' +
    '</div></div>';
  document.body.appendChild(ov);
  var bo = ov.querySelector('#mo');
  var bc = ov.querySelector('#mc');
  bo.focus();
  bo.addEventListener('click', function() { ov.remove(); if (onOk) onOk(); });
  bc.addEventListener('click', function() { ov.remove(); if (onNo) onNo(); });
  ov.addEventListener('click', function(e) { if (e.target === ov) { ov.remove(); if (onNo) onNo(); } });
  document.addEventListener('keydown', function h(e) {
    if (e.key === 'Escape') { ov.remove(); if (onNo) onNo(); document.removeEventListener('keydown', h); }
  });
}

function setupImport() {
  var area = document.getElementById('import-area');
  var inp = document.getElementById('import-file');
  if (!area || !inp) return;
  area.addEventListener('dragover', function(e) { e.preventDefault(); area.classList.add('drag-over'); });
  area.addEventListener('dragleave', function() { area.classList.remove('drag-over'); });
  area.addEventListener('drop', function(e) {
    e.preventDefault(); area.classList.remove('drag-over');
    if (e.dataTransfer.files[0]) processarImport(e.dataTransfer.files[0]);
  });
  area.addEventListener('keydown', function(e) {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); inp.click(); }
  });
  inp.addEventListener('change', function() {
    if (this.files[0]) processarImport(this.files[0]);
    this.value = '';
  });
}

function processarImport(file) {
  if (!file.name.endsWith('.json')) { UTILS.mostrarToast('Selecione um .json valido', 'error'); return; }
  if (file.size > 5242880) { UTILS.mostrarToast('Arquivo muito grande (max 5MB)', 'error'); return; }
  var reader = new FileReader();
  reader.onload = function(e) {
    try {
      var d = JSON.parse(e.target.result);
      if (!d.transacoes || !Array.isArray(d.transacoes)) {
        UTILS.mostrarToast('Formato invalido: campo transacoes nao encontrado', 'error'); return;
      }
      var validas = d.transacoes.filter(function(t) { return t.tipo && t.valor && t.data && t.categoria; });
      if (validas.length === 0) { UTILS.mostrarToast('Nenhuma transacao valida no arquivo', 'error'); return; }
      fpConfirm('Importar ' + validas.length + ' transacoes? Dados atuais serao mantidos.', function() {
        var existentes = DADOS.getTransacoes();
        var ids = {};
        existentes.forEach(function(t) { ids[t.id] = true; });
        var count = 0;
        validas.forEach(function(t) {
          if (!t.id || !ids[t.id]) { t.id = t.id || UTILS.gerarId(); DADOS.salvarTransacao(t); count++; }
        });
        if (d.config && d.config.orcamentos) {
          var cfg = DADOS.getConfig();
          if (!cfg.orcamentos) cfg.orcamentos = {};
          Object.keys(d.config.orcamentos).forEach(function(k) { cfg.orcamentos[k] = d.config.orcamentos[k]; });
          DADOS.salvarConfig(cfg);
        }
        TRANSACOES.init(); ORCAMENTO.init(); RENDER.init();
        UTILS.mostrarToast(count + ' transacoes importadas!', 'success');
      });
    } catch (err) { UTILS.mostrarToast('JSON invalido', 'error'); }
  };
  reader.onerror = function() { UTILS.mostrarToast('Erro ao ler arquivo', 'error'); };
  reader.readAsText(file);
}

function exportarDados() {
  var dados = DADOS.exportarDados();
  var json = JSON.stringify(dados, null, 2);
  var el = document.createElement('a');
  el.setAttribute('href', 'data:application/json;charset=utf-8,' + encodeURIComponent(json));
  el.setAttribute('download', 'financaspro-backup-' + new Date().toISOString().split('T')[0] + '.json');
  el.style.display = 'none';
  document.body.appendChild(el);
  el.click();
  document.body.removeChild(el);
  UTILS.mostrarToast('Dados exportados com sucesso!', 'success');
  DADOS.salvarConfig({ ultimoExportoDados: new Date().toISOString() });
}

/**
 * Exportar extrato em PDF usando jsPDF
 */
function exportarPDF() {
  if (typeof jspdf === 'undefined' && typeof window.jspdf === 'undefined') {
    UTILS.mostrarToast('Carregando biblioteca PDF...', 'info');
    var script = document.createElement('script');
    script.src = 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.2/jspdf.umd.min.js';
    script.onload = function() { gerarPDF(); };
    script.onerror = function() { UTILS.mostrarToast('Erro ao carregar biblioteca PDF', 'error'); };
    document.head.appendChild(script);
    return;
  }
  gerarPDF();
}

function gerarPDF() {
  var jsPDF = window.jspdf.jsPDF;
  var doc = new jsPDF();
  var agora = new Date();
  var mesNome = agora.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });

  // Cabeçalho
  doc.setFillColor(0, 114, 63); // Sicredi Verde
  doc.rect(0, 0, 210, 35, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(20);
  doc.setFont('helvetica', 'bold');
  doc.text('FinancasPro - Extrato', 14, 18);
  doc.setFontSize(11);
  doc.setFont('helvetica', 'normal');
  doc.text('Periodo: ' + mesNome.charAt(0).toUpperCase() + mesNome.slice(1), 14, 28);
  doc.text('Gerado em: ' + agora.toLocaleDateString('pt-BR') + ' ' + agora.toLocaleTimeString('pt-BR', {hour:'2-digit',minute:'2-digit'}), 120, 28);

  // Resumo
  var resumo = TRANSACOES.obterResumoMes(agora.getMonth() + 1, agora.getFullYear());
  doc.setTextColor(51, 51, 51);
  doc.setFontSize(12);
  doc.setFont('helvetica', 'bold');
  doc.text('Resumo do Mes', 14, 48);

  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(16, 185, 129);
  doc.text('Receitas: ' + UTILS.formatarMoeda(resumo.receitas), 14, 56);
  doc.setTextColor(239, 68, 68);
  doc.text('Despesas: ' + UTILS.formatarMoeda(resumo.despesas), 80, 56);
  var saldoCor = resumo.saldo >= 0 ? [16, 185, 129] : [239, 68, 68];
  doc.setTextColor(saldoCor[0], saldoCor[1], saldoCor[2]);
  doc.setFont('helvetica', 'bold');
  doc.text('Saldo: ' + UTILS.formatarMoeda(resumo.saldo), 146, 56);

  // Linha separadora
  doc.setDrawColor(229, 231, 235);
  doc.line(14, 62, 196, 62);

  // Tabela de transações
  doc.setTextColor(51, 51, 51);
  doc.setFontSize(12);
  doc.setFont('helvetica', 'bold');
  doc.text('Transacoes', 14, 72);

  // Header da tabela
  var y = 80;
  doc.setFillColor(245, 247, 250);
  doc.rect(14, y - 5, 182, 8, 'F');
  doc.setFontSize(9);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(102, 102, 102);
  doc.text('DATA', 16, y);
  doc.text('DESCRICAO', 42, y);
  doc.text('CATEGORIA', 110, y);
  doc.text('VALOR', 160, y);
  y += 8;

  // Dados
  var transacoes = TRANSACOES.obter({});
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);

  for (var i = 0; i < transacoes.length; i++) {
    if (y > 275) {
      doc.addPage();
      y = 20;
      // Re-print header on new page
      doc.setFillColor(245, 247, 250);
      doc.rect(14, y - 5, 182, 8, 'F');
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(102, 102, 102);
      doc.text('DATA', 16, y);
      doc.text('DESCRICAO', 42, y);
      doc.text('CATEGORIA', 110, y);
      doc.text('VALOR', 160, y);
      y += 8;
      doc.setFont('helvetica', 'normal');
    }

    var t = transacoes[i];
    doc.setTextColor(51, 51, 51);
    doc.text(UTILS.formatarData(t.data), 16, y);
    var desc = (t.descricao || '-').substring(0, 35);
    doc.text(desc, 42, y);
    doc.text((t.categoria || '-').substring(0, 18), 110, y);

    if (t.tipo === CONFIG.TIPO_RECEITA) {
      doc.setTextColor(16, 185, 129);
      doc.text('+ ' + UTILS.formatarMoeda(t.valor), 160, y);
    } else {
      doc.setTextColor(239, 68, 68);
      doc.text('- ' + UTILS.formatarMoeda(t.valor), 160, y);
    }
    y += 7;

    // Zebra striping
    if (i % 2 === 1) {
      doc.setFillColor(250, 251, 252);
      doc.rect(14, y - 5, 182, 7, 'F');
    }
  }

  if (transacoes.length === 0) {
    doc.setTextColor(153, 153, 153);
    doc.text('Nenhuma transacao registrada.', 14, y);
  }

  // Rodapé
  var totalPages = doc.getNumberOfPages();
  for (var p = 1; p <= totalPages; p++) {
    doc.setPage(p);
    doc.setFontSize(8);
    doc.setTextColor(153, 153, 153);
    doc.text('FinancasPro v1.0 - Gerado automaticamente', 14, 290);
    doc.text('Pagina ' + p + ' de ' + totalPages, 170, 290);
  }

  doc.save('extrato-financaspro-' + agora.toISOString().split('T')[0] + '.pdf');
  UTILS.mostrarToast('Extrato PDF exportado!', 'success');
}
