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
      var descricao = document.getElementById('novo-nota') ? document.getElementById('novo-nota').value : '';

      if (!tipo || !valor || !categoria || !data) {
        UTILS.mostrarToast('Preencha todos os campos obrigatorios', 'error');
        return;
      }
      var valorNum = parseFloat(valor);
      if (isNaN(valorNum) || valorNum <= 0) {
        UTILS.mostrarToast('Valor deve ser um numero maior que zero', 'error');
        return;
      }

      TRANSACOES.criar(tipo, valor, categoria, data, descricao);
      UTILS.mostrarToast('Transacao registrada com sucesso!', 'success');
      form.reset();
      window._tipoSelecionado = CONFIG.TIPO_DESPESA;
      atualizarBotoesTipo();
      var dataInput = document.getElementById('novo-data');
      if (dataInput) dataInput.value = new Date().toISOString().split('T')[0];
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
