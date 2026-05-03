/**
 * init.js - Application Initialization (v2.0)
 * Tier 2: Depends on all other modules (last to load)
 * Includes: currency mask, category grid, quick entries, autocomplete,
 *           recurring, installments, budget preview, success animation,
 *           continuous mode, date chips, collapsible extras
 */

document.addEventListener('DOMContentLoaded', function() {
  try {
    console.log('1. Iniciando DOMUTILS...');
    DOMUTILS.init();

    console.log('2. Iniciando DADOS...');
    DADOS.init();
    DADOS.setupStorageSync();

    console.log('3. Iniciando TRANSACOES...');
    TRANSACOES.init();

    console.log('4. Iniciando ORCAMENTO...');
    ORCAMENTO.init();

    console.log('5. Iniciando CATEGORIAS...');
    CATEGORIAS.init();

    console.log('5b. Iniciando APRENDIZADO...');
    if (typeof APRENDIZADO !== 'undefined') APRENDIZADO.init();

    console.log('5c. Verificando armazenamento...');
    verificarArmazenamento();

    console.log('6. Iniciando AUTOMACAO...');
    AUTOMACAO.init();

    console.log('7. Iniciando RENDER...');
    RENDER.init();

    console.log('8. Iniciando CONFIG_USER...');
    CONFIG_USER.init();
    CONFIG_USER.aplicarTema();

    console.log('9. Verificando PIN...');
    verificarPinAoAbrir();

    console.log('10. Setup Navigation...');
    setupNavigation();

    console.log('11. Setup Form...');
    setupFormNovo();

    console.log('12. Setup Import...');
    setupImport();

    console.log('13. Setup Auto Categoria...');
    try {
      setupAutoCategoria();
    } catch (e) {
      console.warn('Auto-categoria não disponível:', e);
    }

    console.log('14. Setting data...');
    var dataInput = DOMUTILS.elementos.novoData;
    if (dataInput && !dataInput.value) {
      dataInput.value = new Date().toISOString().split('T')[0];
    }

    console.log('✅ Inicialização completa!');
  } catch (e) {
    console.error('❌ Erro na inicialização:', e.message, e.stack);
    UTILS.mostrarToast('Erro ao inicializar: ' + e.message, 'error');
  }
});

/* ============================================
   NAVEGAÇÃO
   ============================================ */
function setupNavigation() {
  var navButtons = document.querySelectorAll('.nav-btn');
  if (navButtons.length > 0) navButtons[0].click();
}

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

  var btn = document.querySelector('[data-aba="' + nomeAba + '"]');
  if (btn) {
    btn.classList.add('ativo');
    btn.setAttribute('aria-current','true');
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

/* ============================================
   FORM NOVO - SETUP MASTER
   ============================================ */
function setupFormNovo() {
  var fns = [
    setupMascaraValor,
    setupCategoriaGrid,
    setupDateChips,
    setupExtrasToggle,
    setupRecorrencia,
    setupParcelamento,
    setupAutoCategorizacao,
    setupAutocomplete,
    setupFormSubmit,
    setupParcelaPreview
  ];

  fns.forEach(function(fn) {
    try {
      if (typeof fn === 'function') fn();
    } catch (e) {
      console.warn('Setup falhou:', fn.name, e);
    }
  });
}

/* ============================================
   1. MÁSCARA DE VALOR (R$ brasileiro)
   ============================================ */
function setupMascaraValor() {
  var input = UTILS.obterElemento('novo-valor');
  if (!input) return;

  var atualizarValor = UTILS.debounce(function() {
    atualizarParcelaPreview();
    atualizarOrcamentoPreview();
  }, 100);

  input.addEventListener('input', function() {
    var raw = this.value.replace(/\D/g, '');
    if (raw === '') { this.value = ''; atualizarParcelaPreview(); atualizarOrcamentoPreview(); return; }
    var num = parseInt(raw, 10);
    var formatted = (num / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    this.value = formatted;
    atualizarValor();
  });

  input.addEventListener('keydown', function(e) {
    if (e.key === 'Enter') { e.preventDefault(); UTILS.obterElemento('novo-descricao').focus(); }
  });
}

function obterValorNumerico() {
  var input = document.getElementById('novo-valor');
  if (!input || !input.value) return 0;
  var clean = input.value.replace(/\./g, '').replace(',', '.');
  var val = parseFloat(clean);
  return isNaN(val) ? 0 : val;
}

/* ============================================
   2. GRID DE CATEGORIAS
   ============================================ */
function setupCategoriaGrid() {
  var grid = UTILS.obterElemento('categoria-grid');
  if (!grid) return;

  grid.addEventListener('click', function(e) {
    var btn = e.target.closest('.cat-btn');
    if (!btn) return;

    grid.querySelectorAll('.cat-btn').forEach(function(b) { b.classList.remove('ativo'); });
    btn.classList.add('ativo');

    var cat = btn.dataset.cat;
    var tipo = btn.dataset.tipo;
    var catEl = UTILS.obterElemento('novo-categoria');
    catEl.value = cat;
    catEl._manualSet = true; // Impede override pelo PIPELINE
    UTILS.obterElemento('novo-tipo').value = tipo;
    atualizarTipoIndicator(tipo);
    atualizarOrcamentoPreview();

    var grupoParcelas = UTILS.obterElemento('grupo-parcelas');
    if (grupoParcelas) {
      grupoParcelas.style.display = tipo === 'receita' ? 'none' : '';
    }
  });
}

function atualizarTipoIndicator(tipo) {
  var dot = document.querySelector('.tipo-dot');
  var txt = document.getElementById('tipo-indicator-text');
  if (dot) {
    dot.className = 'tipo-dot ' + tipo;
  }
  if (txt) {
    txt.textContent = tipo === 'receita' ? 'Receita' : 'Despesa';
  }
}

/* ============================================
   3. CHIPS DE DATA RÁPIDA
   ============================================ */
function setupDateChips() {
  var chips = document.querySelectorAll('.data-chip');
  var dateInput = DOMUTILS.elementos.novoData;
  if (!dateInput) return;

  chips.forEach(function(chip) {
    chip.addEventListener('click', function() {
      chips.forEach(function(c) { c.classList.remove('ativo'); });
      this.classList.add('ativo');
      var offset = parseInt(this.dataset.offset, 10);
      var d = new Date();
      d.setDate(d.getDate() - offset);
      dateInput.value = d.toISOString().split('T')[0];
    });
  });

  dateInput.addEventListener('change', function() {
    chips.forEach(function(c) { c.classList.remove('ativo'); });
  });
}

/* ============================================
   4. EXTRAS TOGGLE (recolher/expandir)
   ============================================ */
function setupExtrasToggle() {
  var btn = document.getElementById('btn-extras');
  var panel = document.getElementById('extras-panel');
  var arrow = document.getElementById('extras-arrow');
  if (!btn || !panel) return;

  btn.addEventListener('click', function() {
    var aberto = panel.style.display !== 'none';
    panel.style.display = aberto ? 'none' : 'block';
    btn.setAttribute('aria-expanded', !aberto);
    if (arrow) arrow.textContent = aberto ? '▼' : '▲';
  });
}

/* ============================================
   5. RECORRÊNCIA
   ============================================ */
function setupRecorrencia() {
  var chk = document.getElementById('chk-recorrente');
  var opcoes = document.getElementById('recorrencia-opcoes');
  if (!chk || !opcoes) return;

  chk.addEventListener('change', function() {
    opcoes.style.display = this.checked ? 'flex' : 'none';
    // Desabilitar parcelamento se recorrente
    if (this.checked) {
      var chkParc = document.getElementById('chk-parcelado');
      if (chkParc) { chkParc.checked = false; chkParc.dispatchEvent(new Event('change')); }
    }
  });

  opcoes.addEventListener('click', function(e) {
    var chip = e.target.closest('.rec-chip');
    if (!chip) return;
    opcoes.querySelectorAll('.rec-chip').forEach(function(c) { c.classList.remove('ativo'); });
    chip.classList.add('ativo');
  });
}

/* ============================================
   6. PARCELAMENTO
   ============================================ */
function setupParcelamento() {
  var chk = document.getElementById('chk-parcelado');
  var opcoes = document.getElementById('parcelas-opcoes');
  if (!chk || !opcoes) return;

  chk.addEventListener('change', function() {
    opcoes.style.display = this.checked ? 'block' : 'none';
    if (this.checked) {
      var chkRec = document.getElementById('chk-recorrente');
      if (chkRec) { chkRec.checked = false; chkRec.dispatchEvent(new Event('change')); }
    }
    atualizarParcelaPreview();
  });
}

function setupParcelaPreview() {
  var numInput = document.getElementById('num-parcelas');
  if (!numInput) return;
  numInput.addEventListener('input', atualizarParcelaPreview);
}

function atualizarParcelaPreview() {
  var chk = document.getElementById('chk-parcelado');
  var txt = document.getElementById('parcela-valor-txt');
  if (!txt) return;
  if (!chk || !chk.checked) { txt.textContent = ''; return; }
  var val = obterValorNumerico();
  var n = parseInt(document.getElementById('num-parcelas').value, 10) || 2;
  if (val > 0 && n >= 2) {
    txt.textContent = n + 'x de ' + UTILS.formatarMoeda(val / n);
  } else {
    txt.textContent = '';
  }
}

/* ============================================
   7. AUTO-CATEGORIZAÇÃO (detecta tipo + categoria)
   ============================================ */
function setupAutoCategorizacao() {
  var descInput = document.getElementById('novo-descricao');
  if (!descInput) return;

  var timeout = null;
  descInput.addEventListener('input', function() {
    clearTimeout(timeout);
    var texto = this.value;
    timeout = setTimeout(function() {
      var sugestao = null;
      if (typeof CATEGORIZADOR !== 'undefined') {
        sugestao = CATEGORIZADOR.detectar(texto);
      } else if (typeof CATEGORIAS !== 'undefined') {
        sugestao = CATEGORIAS.detectar(texto);
      }

      if (sugestao) {
        aplicarSugestaoCategoria(sugestao);
      } else {
        limparSugestaoCategoria();
      }
    }, 300);
  });
}

function aplicarSugestaoCategoria(sugestao) {
  // Selecionar no grid
  var grid = document.getElementById('categoria-grid');
  if (grid) {
    grid.querySelectorAll('.cat-btn').forEach(function(b) { b.classList.remove('ativo'); });
    var target = grid.querySelector('[data-cat="' + sugestao.categoria + '"]');
    if (target) target.classList.add('ativo');
  }

  document.getElementById('novo-categoria').value = sugestao.categoria;
  document.getElementById('novo-tipo').value = sugestao.tipo;
  atualizarTipoIndicator(sugestao.tipo);

  // Badge
  var badge = document.getElementById('sugestao-badge');
  if (badge) {
    var nome = sugestao.categoria.charAt(0).toUpperCase() + sugestao.categoria.slice(1);
    var emoji = sugestao.tipo === 'receita' ? '💚' : '❤️';
    badge.textContent = emoji + ' Auto: ' + nome;
    badge.style.display = 'block';
  }

  atualizarOrcamentoPreview();

  // Esconder parcelamento para receitas
  var grupoParcelas = document.getElementById('grupo-parcelas');
  if (grupoParcelas) {
    grupoParcelas.style.display = sugestao.tipo === 'receita' ? 'none' : '';
  }
}

function limparSugestaoCategoria() {
  var badge = document.getElementById('sugestao-badge');
  if (badge) badge.style.display = 'none';
}

/* ============================================
   8. AUTOCOMPLETE DE DESCRIÇÕES ANTERIORES
   ============================================ */
function setupAutocomplete() {
  var input = document.getElementById('novo-descricao');
  var list = document.getElementById('autocomplete-list');
  if (!input || !list) return;

  input.addEventListener('input', function() {
    var texto = this.value.trim().toLowerCase();
    list.innerHTML = '';
    if (texto.length < 2) { list.style.display = 'none'; return; }

    var descricoes = obterDescricoesAnteriores();
    var filtradas = descricoes.filter(function(d) {
      return d.toLowerCase().indexOf(texto) > -1;
    }).slice(0, 5);

    if (filtradas.length === 0) { list.style.display = 'none'; return; }

    filtradas.forEach(function(d) {
      var item = document.createElement('div');
      item.className = 'autocomplete-item';
      item.textContent = d;
      item.addEventListener('mousedown', function(e) {
        e.preventDefault();
        input.value = d;
        list.style.display = 'none';
        input.dispatchEvent(new Event('input', { bubbles: true }));
      });
      list.appendChild(item);
    });
    list.style.display = 'block';
  });

  input.addEventListener('blur', function() {
    setTimeout(function() { list.style.display = 'none'; }, 150);
  });
}

function obterDescricoesAnteriores() {
  var txs = TRANSACOES.obter({});
  var map = {};
  txs.forEach(function(t) {
    if (t.descricao && t.descricao.trim()) {
      map[t.descricao.trim()] = (map[t.descricao.trim()] || 0) + 1;
    }
  });
  var arr = Object.keys(map).map(function(k) { return { desc: k, count: map[k] }; });
  arr.sort(function(a, b) { return b.count - a.count; });
  return arr.map(function(a) { return a.desc; });
}

/* ============================================
   9. LANÇAMENTOS RÁPIDOS (frequentes)
   ============================================ */
function renderQuickEntries() {
  var container = document.getElementById('quick-entries');
  if (!container) return;

  var frequentes = obterTransacoesFrequentes();
  if (frequentes.length === 0) { container.innerHTML = ''; return; }

  var html = '<div class="quick-label">⚡ Lançamento rápido</div><div class="quick-chips">';
  frequentes.forEach(function(f) {
    var emoji = f.tipo === 'receita' ? '💚' : '';
    html += '<button type="button" class="quick-chip" ' +
      'data-desc="' + UTILS.escapeHtml(f.descricao) + '" ' +
      'data-val="' + f.valor + '" ' +
      'data-cat="' + UTILS.escapeHtml(f.categoria) + '" ' +
      'data-tipo="' + f.tipo + '">' +
      emoji + UTILS.escapeHtml(f.descricao) + ' <strong>' + UTILS.formatarMoeda(f.valor) + '</strong>' +
    '</button>';
  });
  html += '</div>';
  container.innerHTML = html;

  container.addEventListener('click', function(e) {
    var chip = e.target.closest('.quick-chip');
    if (!chip) return;
    preencherFormRapido(chip.dataset);
  });
}

function obterTransacoesFrequentes() {
  var txs = TRANSACOES.obter({});
  var map = {};
  txs.forEach(function(t) {
    if (!t.descricao) return;
    var key = t.descricao + '|' + t.categoria + '|' + t.tipo;
    if (!map[key]) {
      map[key] = { descricao: t.descricao, categoria: t.categoria, tipo: t.tipo, valor: t.valor, count: 0 };
    }
    map[key].count++;
    map[key].valor = t.valor; // último valor usado
  });
  var arr = Object.values(map);
  arr.sort(function(a, b) { return b.count - a.count; });
  return arr.slice(0, 4);
}

function preencherFormRapido(data) {
  // Preencher valor
  var valInput = document.getElementById('novo-valor');
  if (valInput) {
    var cents = Math.round(parseFloat(data.val) * 100);
    var formatted = (cents / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    valInput.value = formatted;
  }

  // Preencher descrição
  var descInput = document.getElementById('novo-descricao');
  if (descInput) descInput.value = data.desc;

  // Selecionar categoria no grid
  var grid = document.getElementById('categoria-grid');
  if (grid) {
    grid.querySelectorAll('.cat-btn').forEach(function(b) { b.classList.remove('ativo'); });
    var target = grid.querySelector('[data-cat="' + data.cat + '"]');
    if (target) target.classList.add('ativo');
  }
  document.getElementById('novo-categoria').value = data.cat;
  document.getElementById('novo-tipo').value = data.tipo;
  atualizarTipoIndicator(data.tipo);
  atualizarOrcamentoPreview();

  // Scroll para o botão registrar
  var btnReg = document.querySelector('.btn-registrar');
  if (btnReg) btnReg.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

/* ============================================
   10. PREVIEW IMPACTO ORÇAMENTO
   ============================================ */
function atualizarOrcamentoPreview() {
  var el = document.getElementById('orcamento-preview');
  if (!el) return;
  var cat = document.getElementById('novo-categoria').value;
  var tipo = document.getElementById('novo-tipo').value;
  var val = obterValorNumerico();

  if (!cat || tipo !== 'despesa' || val <= 0) { el.innerHTML = ''; return; }

  var agora = new Date();
  var status = ORCAMENTO.obterStatus(cat, agora.getMonth() + 1, agora.getFullYear());
  if (!status || !status.limite) { el.innerHTML = ''; return; }

  var gastoAtual = status.gasto;
  var gastoNovo = gastoAtual + val;
  var pctAtual = Math.round((gastoAtual / status.limite) * 100);
  var pctNovo = Math.round((gastoNovo / status.limite) * 100);
  var cor = pctNovo > 100 ? '#ef4444' : pctNovo > 80 ? '#f59e0b' : '#10b981';
  var nomeCategoria = cat.charAt(0).toUpperCase() + cat.slice(1);

  el.innerHTML = '<div class="orc-preview-card">' +
    '<div class="orc-preview-header">' +
      '<span class="orc-preview-cat">' + UTILS.escapeHtml(nomeCategoria) + '</span>' +
      '<span class="orc-preview-valores">' + UTILS.formatarMoeda(gastoNovo) + ' / ' + UTILS.formatarMoeda(status.limite) + '</span>' +
    '</div>' +
    '<div class="orc-preview-bar"><div class="orc-preview-fill" style="width:' + Math.min(pctNovo, 100) + '%;background:' + cor + '"></div>' +
      '<div class="orc-preview-marker" style="left:' + Math.min(pctAtual, 100) + '%"></div>' +
    '</div>' +
    '<div class="orc-preview-footer">' +
      '<span style="color:' + cor + ';font-weight:600">' + pctAtual + '% → ' + pctNovo + '%</span>' +
      (pctNovo > 100 ? '<span class="orc-preview-alerta">⚠️ Estoura o limite!</span>' :
       pctNovo > 80 ? '<span class="orc-preview-aviso">⚡ Perto do limite</span>' : '') +
    '</div>' +
  '</div>';
}

/* ============================================
   11. SUBMIT DO FORMULÁRIO
   ============================================ */
function setupFormSubmit() {
  var form = document.getElementById('form-transacao');
  if (!form) return;

  form.addEventListener('submit', function(e) {
    e.preventDefault();
    try {
      var tipo = document.getElementById('novo-tipo').value || CONFIG.TIPO_DESPESA;
      var valor = obterValorNumerico();
      var categoria = document.getElementById('novo-categoria').value;
      var data = document.getElementById('novo-data').value;
      var descricao = document.getElementById('novo-descricao').value;
      var banco = document.getElementById('novo-banco') ? document.getElementById('novo-banco').value : '';
      var cartao = document.getElementById('novo-cartao') ? document.getElementById('novo-cartao').value : '';
      var nota = document.getElementById('novo-nota') ? document.getElementById('novo-nota').value : '';

      // Auto-categorizar se nenhuma categoria selecionada
      if (!categoria && descricao && typeof CATEGORIAS !== 'undefined') {
        var sugestao = CATEGORIAS.detectar(descricao);
        if (sugestao) { tipo = sugestao.tipo; categoria = sugestao.categoria; }
      }

      if (!valor || valor <= 0) {
        UTILS.mostrarToast('Informe o valor da transação', 'error');
        return;
      }
      if (!categoria) {
        UTILS.mostrarToast('Selecione uma categoria', 'error');
        return;
      }
      if (!data) {
        UTILS.mostrarToast('Selecione a data', 'error');
        return;
      }

      var chkParcelado = document.getElementById('chk-parcelado');
      var chkRecorrente = document.getElementById('chk-recorrente');
      var descFinal = descricao || nota;

      // PARCELAMENTO
      if (chkParcelado && chkParcelado.checked && tipo === 'despesa') {
        var nParcelas = parseInt(document.getElementById('num-parcelas').value, 10) || 2;
        var valorParcela = Math.round((valor / nParcelas) * 100) / 100;
        for (var p = 0; p < nParcelas; p++) {
          var dataParcela = new Date(data + 'T12:00:00');
          dataParcela.setMonth(dataParcela.getMonth() + p);
          var descParcela = descFinal + ' (' + (p + 1) + '/' + nParcelas + ')';
          TRANSACOES.criar(tipo, valorParcela, categoria, dataParcela.toISOString().split('T')[0], descParcela, banco, cartao);
        }
        if (typeof APRENDIZADO !== 'undefined') {
          APRENDIZADO.registrar(descricao, tipo, categoria, banco, cartao, valorParcela);
        }
        mostrarSucesso(nParcelas + ' parcelas de ' + UTILS.formatarMoeda(valorParcela) + ' registradas!');
      }
      // RECORRÊNCIA
      else if (chkRecorrente && chkRecorrente.checked) {
        var freqEl = document.querySelector('.rec-chip.ativo');
        var freq = freqEl ? freqEl.dataset.freq : 'mensal';
        var recData = {
          tipo: tipo, valor: valor, categoria: categoria,
          descricao: descFinal, frequencia: freq, dataInicio: data, ativo: true
        };
        DADOS.salvarRecorrente(recData);
        TRANSACOES.criar(tipo, valor, categoria, data, descFinal + ' (recorrente)', banco, cartao);
        if (typeof APRENDIZADO !== 'undefined') {
          APRENDIZADO.registrar(descricao, tipo, categoria, banco, cartao, valor);
        }
        mostrarSucesso('Recorrência ' + freq + ' criada!');
      }
      // NORMAL
      else {
        TRANSACOES.criar(tipo, valor, categoria, data, descFinal, banco, cartao);
        if (typeof APRENDIZADO !== 'undefined') {
          APRENDIZADO.registrar(descricao, tipo, categoria, banco, cartao, valor);
        }
        mostrarSucesso('Registrado!');
      }

      RENDER.init();
      if (typeof INSIGHTS !== 'undefined') {
        setTimeout(function() { INSIGHTS.mostrar(); }, 100);
      }
      if (typeof SCORE !== 'undefined') {
        SCORE.limparCache();
      }

      // Modo contínuo ou limpar
      var chkContinuo = document.getElementById('chk-continuo');
      if (chkContinuo && chkContinuo.checked) {
        limparFormularioParcial();
      } else {
        limparFormularioCompleto(form);
      }
    } catch (erro) {
      UTILS.mostrarToast(erro.message, 'error');
    }
  });

  // Form de orçamento
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

function limparFormularioParcial() {
  // Modo contínuo: limpa valor e descrição, mantém categoria e data
  var vi = document.getElementById('novo-valor');
  var di = document.getElementById('novo-descricao');
  if (vi) vi.value = '';
  if (di) di.value = '';
  limparSugestaoCategoria();
  var orc = document.getElementById('orcamento-preview');
  if (orc) orc.innerHTML = '';
  if (vi) setTimeout(function() { vi.focus(); }, 500);
}

function limparFormularioCompleto(form) {
  form.reset();
  // Resetar grid categorias
  var grid = document.getElementById('categoria-grid');
  if (grid) grid.querySelectorAll('.cat-btn').forEach(function(b) { b.classList.remove('ativo'); });
  var catElReset = document.getElementById('novo-categoria');
  catElReset.value = '';
  catElReset._manualSet = false; // Libera auto-preenchimento
  document.getElementById('novo-tipo').value = 'despesa';
  atualizarTipoIndicator('despesa');
  limparSugestaoCategoria();
  var orc = document.getElementById('orcamento-preview');
  if (orc) orc.innerHTML = '';
  // Resetar data para hoje
  var dataInput = document.getElementById('novo-data');
  if (dataInput) dataInput.value = new Date().toISOString().split('T')[0];
  var chips = document.querySelectorAll('.data-chip');
  chips.forEach(function(c, i) { i === 0 ? c.classList.add('ativo') : c.classList.remove('ativo'); });
  // Recolher extras
  var panel = document.getElementById('extras-panel');
  if (panel) panel.style.display = 'none';
  var arrow = document.getElementById('extras-arrow');
  if (arrow) arrow.textContent = '▼';
  // Resetar checkboxes
  var chks = ['chk-recorrente','chk-parcelado','chk-continuo'];
  chks.forEach(function(id) { var c = document.getElementById(id); if (c) c.checked = false; });
  var recOp = document.getElementById('recorrencia-opcoes');
  if (recOp) recOp.style.display = 'none';
  var parcOp = document.getElementById('parcelas-opcoes');
  if (parcOp) parcOp.style.display = 'none';
  // Atualizar quick entries
  renderQuickEntries();
}

/* ============================================
   12. ANIMAÇÃO DE SUCESSO
   ============================================ */
function mostrarSucesso(msg) {
  var overlay = document.getElementById('success-overlay');
  var msgEl = document.getElementById('success-msg');
  var saldoEl = document.getElementById('success-saldo');
  if (!overlay) { UTILS.mostrarToast(msg, 'success'); return; }

  if (msgEl) msgEl.textContent = msg;
  if (saldoEl) {
    var agora = new Date();
    var resumo = TRANSACOES.obterResumoMes(agora.getMonth() + 1, agora.getFullYear());
    saldoEl.textContent = 'Saldo do mês: ' + UTILS.formatarMoeda(resumo.saldo);
  }
  overlay.style.display = 'flex';
  overlay.classList.add('animando');

  setTimeout(function() {
    overlay.classList.remove('animando');
    overlay.style.display = 'none';
  }, 1800);
}

/* ============================================
   EXTRATO - SISTEMA COMPLETO v2
   ============================================ */

/* Ícones por categoria — keys lowercase sem acento (match data-cat) */
var CATEGORIA_ICONES = {
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

var CATEGORIA_CORES = {
  'salario': '#10b981', 'freelance': '#6366f1', 'investimentos': '#0ea5e9', 'vendas': '#f59e0b',
  'alimentacao': '#ef4444', 'transporte': '#8b5cf6', 'utilities': '#06b6d4', 'moradia': '#14b8a6',
  'saude': '#ec4899', 'educacao': '#3b82f6', 'entretenimento': '#f97316', 'lazer': '#a855f7',
  'compras': '#e11d48', 'vestuario': '#7c3aed', 'viagem': '#0284c7', 'pet': '#84cc16',
  'assinaturas': '#6366f1', 'outro': '#94a3b8', 'outros': '#94a3b8',
  'Salário': '#10b981', 'Alimentação': '#ef4444', 'Transporte': '#8b5cf6', 'Saúde': '#ec4899',
  'Educação': '#3b82f6', 'Moradia': '#14b8a6', 'Lazer': '#a855f7', 'Freelance': '#6366f1',
  'Investimentos': '#0ea5e9', 'Vendas': '#f59e0b', 'Entretenimento': '#f97316', 'Outros': '#94a3b8'
};

function getCatIcon(cat) { return CATEGORIA_ICONES[cat] || CATEGORIA_ICONES[cat.toLowerCase()] || '📌'; }
function getCatCor(cat) { return CATEGORIA_CORES[cat] || CATEGORIA_CORES[cat.toLowerCase()] || '#94a3b8'; }

/* Estado do extrato */
var _extratoState = {
  filtroTipo: 'todos',
  filtroCat: null,
  busca: '',
  mesOffset: 0 // 0 = mês atual, -1 = mês anterior, etc
};
var _extratoListenerAttached = false;

function getExtratoMesAno() {
  var d = new Date();
  d.setMonth(d.getMonth() + _extratoState.mesOffset);
  return { mes: d.getMonth() + 1, ano: d.getFullYear(), date: d };
}

function navegarPeriodo(dir) {
  _extratoState.mesOffset += dir;
  atualizarPeriodoLabel();
  filtrarExtrato();
}

function atualizarPeriodoLabel() {
  var info = getExtratoMesAno();
  var label = document.getElementById('periodo-label');
  if (label) {
    var nomes = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];
    label.textContent = nomes[info.mes - 1] + ' ' + info.ano;
  }
  // Esconder botão "próximo" se já no mês atual
  var btnNext = document.getElementById('periodo-next');
  if (btnNext) btnNext.style.visibility = _extratoState.mesOffset >= 0 ? 'hidden' : 'visible';
}

function setFiltroTipo(tipo) {
  _extratoState.filtroTipo = tipo;
  document.querySelectorAll('.filtro-chip[data-filtro]').forEach(function(b) { b.classList.remove('ativo'); });
  var btn = document.querySelector('.filtro-chip[data-filtro="' + tipo + '"]');
  if (btn) btn.classList.add('ativo');
  filtrarExtrato();
}

function setFiltroCat(cat) {
  if (_extratoState.filtroCat === cat) {
    _extratoState.filtroCat = null;
  } else {
    _extratoState.filtroCat = cat;
  }
  document.querySelectorAll('.filtro-cat-chip').forEach(function(b) {
    b.classList.toggle('ativo', b.dataset.cat === _extratoState.filtroCat);
  });
  filtrarExtrato();
}

function renderFiltrosCategorias(txs) {
  var container = document.getElementById('filtros-categoria');
  if (!container) return;
  var cats = {};
  txs.forEach(function(t) { cats[t.categoria] = (cats[t.categoria] || 0) + 1; });
  var sorted = Object.keys(cats).sort(function(a, b) { return cats[b] - cats[a]; });
  container.innerHTML = sorted.map(function(cat) {
    var ativo = _extratoState.filtroCat === cat ? ' ativo' : '';
    return '<button class="filtro-cat-chip' + ativo + '" data-cat="' + UTILS.escapeHtml(cat) + '" onclick="setFiltroCat(\'' + UTILS.escapeHtml(cat).replace(/'/g, "\\'") + '\')">' +
      getCatIcon(cat) + ' ' + UTILS.escapeHtml(cat) + ' <span class="cat-count">' + cats[cat] + '</span></button>';
  }).join('');
}

function renderExtratoResumo(txs) {
  var el = document.getElementById('extrato-resumo');
  if (!el) return;
  var rec = 0, desp = 0;
  txs.forEach(function(t) {
    if (t.tipo === CONFIG.TIPO_RECEITA) rec += t.valor;
    else desp += t.valor;
  });
  var saldo = rec - desp;
  el.innerHTML =
    '<div class="resumo-item receita"><span class="resumo-label">Receitas</span><span class="resumo-valor">' + UTILS.formatarMoeda(rec) + '</span></div>' +
    '<div class="resumo-item despesa"><span class="resumo-label">Despesas</span><span class="resumo-valor">' + UTILS.formatarMoeda(desp) + '</span></div>' +
    '<div class="resumo-item saldo ' + (saldo >= 0 ? 'positivo' : 'negativo') + '"><span class="resumo-label">Saldo</span><span class="resumo-valor">' + UTILS.formatarMoeda(saldo) + '</span></div>';
}

function formatarDataGrupo(dataStr) {
  var hoje = new Date(); hoje.setHours(0,0,0,0);
  var ontem = new Date(hoje); ontem.setDate(ontem.getDate() - 1);
  var d = new Date(dataStr + 'T12:00:00');
  d.setHours(0,0,0,0);
  if (d.getTime() === hoje.getTime()) return 'Hoje';
  if (d.getTime() === ontem.getTime()) return 'Ontem';
  var dias = ['Dom','Seg','Ter','Qua','Qui','Sex','Sáb'];
  return dias[d.getDay()] + ', ' + d.getDate() + '/' + String(d.getMonth()+1).padStart(2,'0');
}

function agruparPorData(txs) {
  var grupos = {};
  txs.forEach(function(t) {
    var key = t.data;
    if (!grupos[key]) grupos[key] = [];
    grupos[key].push(t);
  });
  // Ordenar datas decrescente
  var keys = Object.keys(grupos).sort(function(a, b) { return b.localeCompare(a); });
  return keys.map(function(k) { return { data: k, label: formatarDataGrupo(k), txs: grupos[k] }; });
}

function renderTransacaoItem(t) {
  var icon = getCatIcon(t.categoria);
  var cor = getCatCor(t.categoria);
  var desc = t.descricao && t.descricao.trim() && t.descricao !== '-' ? t.descricao : t.categoria;
  var valorClass = t.tipo === CONFIG.TIPO_RECEITA ? 'receita' : 'despesa';

  return '<div class="ext-tx" data-tx-id="' + UTILS.escapeHtml(t.id) + '">' +
    '<div class="ext-tx-icon" style="background:' + cor + '20;color:' + cor + '">' + icon + '</div>' +
    '<div class="ext-tx-info">' +
      '<div class="ext-tx-desc">' + UTILS.escapeHtml(desc) + '</div>' +
      '<div class="ext-tx-meta">' + UTILS.escapeHtml(t.categoria) + '</div>' +
    '</div>' +
    '<div class="ext-tx-valor ' + valorClass + '">' +
      UTILS.formatarMoeda(t.valor) +
    '</div>' +
  '</div>' +
  '<div class="ext-tx-expanded" id="exp-' + t.id + '">' +
    '<div class="ext-tx-detail-row">' +
      '<span>Tipo</span><span>' + (t.tipo === CONFIG.TIPO_RECEITA ? 'Receita' : 'Despesa') + '</span>' +
    '</div>' +
    (t.descricao ? '<div class="ext-tx-detail-row"><span>Descrição</span><span>' + UTILS.escapeHtml(t.descricao) + '</span></div>' : '') +
    '<div class="ext-tx-detail-row">' +
      '<span>Data</span><span>' + UTILS.formatarData(t.data) + '</span>' +
    '</div>' +
    '<div class="ext-tx-detail-row">' +
      '<span>Valor</span><span class="' + valorClass + '">' + UTILS.formatarMoeda(t.valor) + '</span>' +
    '</div>' +
    '<div class="ext-tx-actions-bar">' +
      '<button class="ext-btn-edit" data-id="' + t.id + '">✏️ Editar</button>' +
      '<button class="ext-btn-delete" data-id="' + t.id + '">🗑️ Excluir</button>' +
    '</div>' +
  '</div>';
}

function filtrarExtrato() {
  var info = getExtratoMesAno();
  atualizarPeriodoLabel();

  // Obter transações do mês selecionado
  var txs = TRANSACOES.obter({ mes: info.mes, ano: info.ano });

  // Renderizar filtros de categorias (antes dos filtros de tipo)
  renderFiltrosCategorias(txs);

  // Aplicar filtro de tipo
  if (_extratoState.filtroTipo === 'receita') {
    txs = txs.filter(function(t) { return t.tipo === CONFIG.TIPO_RECEITA; });
  } else if (_extratoState.filtroTipo === 'despesa') {
    txs = txs.filter(function(t) { return t.tipo === CONFIG.TIPO_DESPESA; });
  }

  // Aplicar filtro de categoria
  if (_extratoState.filtroCat) {
    txs = txs.filter(function(t) { return t.categoria === _extratoState.filtroCat; });
  }

  // Aplicar busca
  var busca = document.getElementById('extrato-busca');
  var termo = busca ? busca.value.trim().toLowerCase() : '';
  if (termo) {
    txs = txs.filter(function(t) {
      return (t.descricao && t.descricao.toLowerCase().indexOf(termo) !== -1) ||
             (t.categoria && t.categoria.toLowerCase().indexOf(termo) !== -1) ||
             (UTILS.formatarMoeda(t.valor).indexOf(termo) !== -1);
    });
  }

  // Renderizar resumo
  renderExtratoResumo(txs);

  var container = document.getElementById('lista-transacoes');
  if (!container) return;

  if (txs.length === 0) {
    container.innerHTML = '<div class="extrato-empty">' +
      '<div class="extrato-empty-icon">📭</div>' +
      '<p>Nenhuma transação encontrada</p>' +
      '<p class="extrato-empty-hint">' + (termo ? 'Tente outro termo de busca' : 'Adicione transações na aba Novo') + '</p>' +
    '</div>';
    return;
  }

  // Agrupar por data
  var grupos = agruparPorData(txs);

  var html = grupos.map(function(grupo) {
    var subtotal = 0;
    grupo.txs.forEach(function(t) {
      subtotal += t.tipo === CONFIG.TIPO_RECEITA ? t.valor : -t.valor;
    });
    return '<div class="ext-grupo">' +
      '<div class="ext-grupo-header">' +
        '<span class="ext-grupo-data">' + grupo.label + '</span>' +
        '<span class="ext-grupo-subtotal ' + (subtotal >= 0 ? 'positivo' : 'negativo') + '">' +
          (subtotal >= 0 ? '+' : '') + UTILS.formatarMoeda(Math.abs(subtotal)) +
        '</span>' +
      '</div>' +
      '<div class="ext-grupo-list">' +
        grupo.txs.map(renderTransacaoItem).join('') +
      '</div>' +
    '</div>';
  }).join('');

  container.innerHTML = html;

  // Attach event listeners (uma vez)
  if (!_extratoListenerAttached) {
    container.addEventListener('click', function(e) {
      // Toggle expandir
      var txEl = e.target.closest('.ext-tx');
      var btnEdit = e.target.closest('.ext-btn-edit');
      var btnDel = e.target.closest('.ext-btn-delete');

      if (btnDel) {
        e.stopPropagation();
        var id = btnDel.dataset.id;
        var tx = TRANSACOES.obterPorId(id);
        var desc = tx ? (tx.descricao || tx.categoria) : 'esta transação';
        fpConfirm('Excluir "' + desc + '"?', function() {
          TRANSACOES.deletar(id);
          filtrarExtrato();
          atualizarDashboard();
          UTILS.mostrarToast('Transação excluída', 'info');
        });
        return;
      }

      if (btnEdit) {
        e.stopPropagation();
        abrirEdicaoTransacao(btnEdit.dataset.id);
        return;
      }

      if (txEl) {
        var txId = txEl.dataset.txId;
        var expanded = document.getElementById('exp-' + txId);
        if (expanded) {
          // Fechar outros
          document.querySelectorAll('.ext-tx-expanded.aberto').forEach(function(el) {
            if (el !== expanded) { el.classList.remove('aberto'); el.previousElementSibling.classList.remove('aberto'); }
          });
          expanded.classList.toggle('aberto');
          txEl.classList.toggle('aberto');
        }
      }
    });

    // Swipe to delete no mobile
    var startX = 0, currentEl = null;
    container.addEventListener('touchstart', function(e) {
      var tx = e.target.closest('.ext-tx');
      if (tx) { startX = e.touches[0].clientX; currentEl = tx; }
    }, { passive: true });

    container.addEventListener('touchmove', function(e) {
      if (!currentEl) return;
      var diff = e.touches[0].clientX - startX;
      if (diff < -30) {
        currentEl.style.transform = 'translateX(' + Math.max(diff, -80) + 'px)';
        currentEl.classList.add('swiping');
      }
    }, { passive: true });

    container.addEventListener('touchend', function(e) {
      if (!currentEl) return;
      var finalX = e.changedTouches[0].clientX;
      var diff = finalX - startX;
      if (diff < -60) {
        // Swipe confirmado: mostrar botão delete
        currentEl.style.transform = 'translateX(-70px)';
        currentEl.classList.add('swiped');
      } else {
        currentEl.style.transform = '';
        currentEl.classList.remove('swiping', 'swiped');
      }
      currentEl = null;
    }, { passive: true });

    _extratoListenerAttached = true;
  }
}

function abrirEdicaoTransacao(id) {
  var tx = TRANSACOES.obterPorId(id);
  if (!tx) return;

  function buildCatOptions(tipo, selected) {
    var slugs = tipo === CONFIG.TIPO_RECEITA ? CONFIG.CATEGORIAS_RECEITA : CONFIG.CATEGORIAS_DESPESA;
    return slugs.map(function(slug) {
      var label = CONFIG.getCatLabel(slug);
      return '<option value="' + slug + '"' + (slug === selected ? ' selected' : '') + '>' + label + '</option>';
    }).join('');
  }

  var html = '<div style="display:flex;flex-direction:column;gap:12px">' +
    '<div class="form-group"><label>Tipo</label><select id="edit-tipo">' +
      '<option value="despesa"' + (tx.tipo === 'despesa' ? ' selected' : '') + '>Despesa</option>' +
      '<option value="receita"' + (tx.tipo === 'receita' ? ' selected' : '') + '>Receita</option>' +
    '</select></div>' +
    '<div class="form-group"><label>Descrição</label><input type="text" id="edit-desc" value="' + UTILS.escapeHtml(tx.descricao || '') + '"></div>' +
    '<div class="form-group"><label>Valor</label><input type="number" id="edit-valor" value="' + tx.valor + '" step="0.01" min="0.01"></div>' +
    '<div class="form-group"><label>Data</label><input type="date" id="edit-data" value="' + tx.data + '"></div>' +
    '<div class="form-group"><label>Categoria</label><select id="edit-cat">' +
      buildCatOptions(tx.tipo, tx.categoria) +
    '</select></div>' +
  '</div>';
  fpAlert(html);
  setTimeout(function() {
    var overlay = document.querySelector('.modal-overlay');
    if (!overlay) return;
    var tipoSel = document.getElementById('edit-tipo');
    if (tipoSel) {
      tipoSel.addEventListener('change', function() {
        var catSel = document.getElementById('edit-cat');
        if (catSel) catSel.innerHTML = buildCatOptions(this.value, '');
      });
    }
    var okBtn = overlay.querySelector('.modal-btn');
    if (okBtn) {
      okBtn.textContent = 'Salvar';
      okBtn.onclick = function() {
        var tipo = document.getElementById('edit-tipo').value;
        var desc = document.getElementById('edit-desc').value.trim();
        var valor = parseFloat(document.getElementById('edit-valor').value);
        var data = document.getElementById('edit-data').value;
        var cat = document.getElementById('edit-cat').value;
        if (!valor || valor <= 0) { UTILS.mostrarToast('Informe um valor válido', 'error'); return; }
        if (!data) { UTILS.mostrarToast('Informe a data', 'error'); return; }
        TRANSACOES.atualizar(id, { tipo: tipo, descricao: desc, valor: valor, data: data, categoria: cat });
        overlay.remove();
        filtrarExtrato();
        atualizarDashboard();
        UTILS.mostrarToast('Transação atualizada!', 'success');
      };
    }
  }, 50);
}

function atualizarDashboard() {
  if (RENDER.renderGreeting) RENDER.renderGreeting();
  if (RENDER.renderCardSaldo) RENDER.renderCardSaldo();
  if (RENDER.renderResumo) RENDER.renderResumo();
  if (RENDER.renderComparacaoMesAnterior) RENDER.renderComparacaoMesAnterior();
  if (RENDER.renderAlertas) RENDER.renderAlertas();
  if (RENDER.renderChartEvolucao) RENDER.renderChartEvolucao();
  if (RENDER.renderChartCategorias) RENDER.renderChartCategorias();
  if (RENDER.renderOrcamento) RENDER.renderOrcamento();
  if (RENDER.renderUltimasTransacoes) RENDER.renderUltimasTransacoes();
  if (RENDER.atualizarHeaderSaldo) RENDER.atualizarHeaderSaldo();
}

/* ============================================
   ORÇAMENTO 50/30/20
   ============================================ */

/* Classificação de categorias na regra 50/30/20 */
var REGRA_503020 = {
  necessidades: ['alimentacao', 'transporte', 'moradia', 'saude', 'utilities', 'educacao'],
  desejos: ['lazer', 'entretenimento', 'compras', 'vestuario', 'viagem', 'assinaturas', 'pet', 'outro']
};

function classificarCategoria503020(cat) {
  var c = (cat || '').toLowerCase();
  if (REGRA_503020.necessidades.indexOf(c) !== -1) return 'necessidades';
  if (REGRA_503020.desejos.indexOf(c) !== -1) return 'desejos';
  return 'desejos'; // default
}

function salvarRendaOrcamento() {
  var input = document.getElementById('orc-renda-valor');
  if (!input) return;
  var clean = input.value.replace(/\./g, '').replace(',', '.');
  var val = parseFloat(clean);
  if (!val || val <= 0) {
    UTILS.mostrarToast('Informe um valor válido', 'error');
    return;
  }
  DADOS.salvarConfig({ renda: val });
  UTILS.mostrarToast('Renda definida!', 'success');
  renderOrcamentoDashboard();
}

function editarRendaOrcamento() {
  var config = DADOS.getConfig();
  var atual = config.renda || 0;
  var html = '<div style="display:flex;flex-direction:column;gap:12px;text-align:center">' +
    '<p style="font-weight:600;font-size:16px">Editar Renda Mensal</p>' +
    '<div class="orc-renda-input"><span class="orc-renda-prefix">R$</span>' +
    '<input type="text" id="edit-renda-val" value="' + atual.toLocaleString('pt-BR', {minimumFractionDigits:2}) + '" inputmode="numeric"></div>' +
  '</div>';
  fpAlert(html);
  setTimeout(function() {
    var overlay = document.querySelector('.modal-overlay');
    if (!overlay) return;
    var okBtn = overlay.querySelector('.modal-btn');
    if (okBtn) {
      okBtn.textContent = 'Salvar';
      okBtn.onclick = function() {
        var v = document.getElementById('edit-renda-val').value.replace(/\./g, '').replace(',', '.');
        var val = parseFloat(v);
        if (!val || val <= 0) { UTILS.mostrarToast('Valor inválido', 'error'); return; }
        DADOS.salvarConfig({ renda: val });
        overlay.remove();
        renderOrcamentoDashboard();
        UTILS.mostrarToast('Renda atualizada!', 'success');
      };
    }
  }, 50);
}

function toggleDetalhesCategorias() {
  var el = document.getElementById('orc-categorias');
  var arrow = document.getElementById('orc-cat-arrow');
  if (!el) return;
  var aberto = el.style.display !== 'none';
  el.style.display = aberto ? 'none' : 'block';
  if (arrow) arrow.textContent = aberto ? '▼' : '▲';
}

function renderOrcamentoDashboard() {
  var config = DADOS.getConfig();
  var renda = config.renda || 0;

  var setupEl = document.getElementById('orc-renda-setup');
  var dashEl = document.getElementById('orc-dashboard');

  if (!renda || renda <= 0) {
    if (setupEl) setupEl.style.display = 'block';
    if (dashEl) dashEl.style.display = 'none';
    return;
  }
  if (setupEl) setupEl.style.display = 'none';
  if (dashEl) dashEl.style.display = 'block';

  // Mostrar renda
  var rendaDisplay = document.getElementById('orc-renda-display');
  if (rendaDisplay) rendaDisplay.textContent = UTILS.formatarMoeda(renda);

  // Calcular 50/30/20
  var agora = new Date();
  var mes = agora.getMonth() + 1;
  var ano = agora.getFullYear();
  var txs = TRANSACOES.obter({ mes: mes, ano: ano });

  var gastoNec = 0, gasDes = 0, totalDespesas = 0, totalReceitas = 0;
  var catGastos = {};
  txs.forEach(function(t) {
    if (t.tipo === CONFIG.TIPO_DESPESA) {
      totalDespesas += t.valor;
      var cls = classificarCategoria503020(t.categoria);
      if (cls === 'necessidades') gastoNec += t.valor;
      else gasDes += t.valor;
      catGastos[t.categoria] = (catGastos[t.categoria] || 0) + t.valor;
    } else {
      totalReceitas += t.valor;
    }
  });

  var poupancaReal = totalReceitas - totalDespesas;
  var limNec = renda * 0.5;
  var limDes = renda * 0.3;
  var limPou = renda * 0.2;

  var pctNec = limNec > 0 ? Math.round((gastoNec / limNec) * 100) : 0;
  var pctDes = limDes > 0 ? Math.round((gasDes / limDes) * 100) : 0;
  var pctPou = limPou > 0 ? Math.round((Math.max(0, poupancaReal) / limPou) * 100) : 0;

  // Atualizar necessidades
  var el;
  el = document.getElementById('orc-nec-gasto');
  if (el) el.textContent = UTILS.formatarMoeda(gastoNec);
  el = document.getElementById('orc-nec-limite');
  if (el) el.textContent = UTILS.formatarMoeda(limNec);
  el = document.getElementById('orc-nec-bar');
  if (el) {
    el.style.width = Math.min(pctNec, 100) + '%';
    el.className = 'orc-progress-fill ' + (pctNec >= 100 ? 'excedido' : pctNec >= 70 ? 'alerta' : 'ok');
  }
  el = document.getElementById('orc-necessidades');
  if (el) el.className = 'orc-regra-item necessidades' + (pctNec >= 100 ? ' status-excedido' : pctNec >= 70 ? ' status-alerta' : '');

  // Atualizar desejos
  el = document.getElementById('orc-des-gasto');
  if (el) el.textContent = UTILS.formatarMoeda(gasDes);
  el = document.getElementById('orc-des-limite');
  if (el) el.textContent = UTILS.formatarMoeda(limDes);
  el = document.getElementById('orc-des-bar');
  if (el) {
    el.style.width = Math.min(pctDes, 100) + '%';
    el.className = 'orc-progress-fill ' + (pctDes >= 100 ? 'excedido' : pctDes >= 70 ? 'alerta' : 'ok');
  }
  el = document.getElementById('orc-desejos');
  if (el) el.className = 'orc-regra-item desejos' + (pctDes >= 100 ? ' status-excedido' : pctDes >= 70 ? ' status-alerta' : '');

  // Atualizar poupança
  el = document.getElementById('orc-pou-gasto');
  if (el) el.textContent = UTILS.formatarMoeda(Math.max(0, poupancaReal));
  el = document.getElementById('orc-pou-limite');
  if (el) el.textContent = UTILS.formatarMoeda(limPou);
  el = document.getElementById('orc-pou-bar');
  if (el) {
    el.style.width = Math.min(pctPou, 100) + '%';
    el.className = 'orc-progress-fill ' + (pctPou >= 100 ? 'otimo' : pctPou >= 50 ? 'ok' : 'alerta');
  }

  // Insights
  renderOrcamentoInsights(gastoNec, gasDes, poupancaReal, limNec, limDes, limPou, pctNec, pctDes, catGastos, renda);

  // Detalhes por categoria
  renderOrcamentoCategorias(catGastos, renda);

  // Histórico 3 meses
  renderOrcamentoHistorico(renda);
}

function renderOrcamentoInsights(gastoNec, gasDes, poupanca, limNec, limDes, limPou, pctNec, pctDes, catGastos, renda) {
  var el = document.getElementById('orc-insights');
  if (!el) return;

  var agora = new Date();
  var diaAtual = agora.getDate();
  var diasNoMes = new Date(agora.getFullYear(), agora.getMonth() + 1, 0).getDate();
  var diasRestantes = diasNoMes - diaAtual;
  var pctMes = Math.round((diaAtual / diasNoMes) * 100);

  var dicas = [];

  // Alertas de limite
  if (pctNec >= 100) {
    dicas.push({ icon: '🚨', texto: 'Necessidades estourou o limite! Gastou ' + UTILS.formatarMoeda(gastoNec - limNec) + ' a mais.', tipo: 'danger' });
  } else if (pctNec >= 70 && pctMes < 70) {
    dicas.push({ icon: '⚠️', texto: 'Já usou ' + pctNec + '% do limite de Necessidades e faltam ' + diasRestantes + ' dias no mês.', tipo: 'warning' });
  }

  if (pctDes >= 100) {
    dicas.push({ icon: '🚨', texto: 'Desejos estourou! Tente conter gastos com lazer até o próximo mês.', tipo: 'danger' });
  } else if (pctDes >= 70) {
    dicas.push({ icon: '⚠️', texto: 'Atenção: ' + pctDes + '% do limite de Desejos usado. Resta ' + UTILS.formatarMoeda(limDes - gasDes) + '.', tipo: 'warning' });
  }

  // Poupança
  if (poupanca >= limPou) {
    dicas.push({ icon: '🎉', texto: 'Meta de poupança atingida! Você guardou ' + UTILS.formatarMoeda(poupanca) + '.', tipo: 'success' });
  } else if (poupanca > 0) {
    dicas.push({ icon: '💡', texto: 'Faltam ' + UTILS.formatarMoeda(limPou - poupanca) + ' para bater a meta de poupança.', tipo: 'info' });
  } else if (poupanca < 0) {
    dicas.push({ icon: '🔴', texto: 'Saldo negativo: gastou ' + UTILS.formatarMoeda(Math.abs(poupanca)) + ' a mais do que ganhou.', tipo: 'danger' });
  }

  // Maior gasto
  var maiorCat = '', maiorVal = 0;
  Object.keys(catGastos).forEach(function(c) {
    if (catGastos[c] > maiorVal) { maiorVal = catGastos[c]; maiorCat = c; }
  });
  if (maiorCat) {
    var pctRenda = Math.round((maiorVal / renda) * 100);
    dicas.push({ icon: getCatIcon(maiorCat), texto: maiorCat + ' é seu maior gasto: ' + UTILS.formatarMoeda(maiorVal) + ' (' + pctRenda + '% da renda).', tipo: 'info' });
  }

  // Ritmo de gastos
  if (pctMes > 0) {
    var totalGasto = gastoNec + gasDes;
    var ritmo = totalGasto / diaAtual;
    var projecao = ritmo * diasNoMes;
    if (projecao > renda * 0.8) {
      dicas.push({ icon: '📊', texto: 'No ritmo atual, você gastará ~' + UTILS.formatarMoeda(projecao) + ' no mês (' + Math.round((projecao/renda)*100) + '% da renda).', tipo: 'warning' });
    }
  }

  if (dicas.length === 0) {
    dicas.push({ icon: '✨', texto: 'Tudo sob controle! Continue assim.', tipo: 'success' });
  }

  el.innerHTML = dicas.map(function(d) {
    return '<div class="orc-insight ' + d.tipo + '"><span class="orc-insight-icon">' + d.icon + '</span><span>' + d.texto + '</span></div>';
  }).join('');
}

function renderOrcamentoCategorias(catGastos, renda) {
  var el = document.getElementById('orc-categorias');
  if (!el) return;

  var cats = Object.keys(catGastos).sort(function(a, b) { return catGastos[b] - catGastos[a]; });
  if (cats.length === 0) {
    el.innerHTML = '<p style="text-align:center;color:var(--text-muted);padding:16px;font-size:13px">Nenhuma despesa este mês</p>';
    return;
  }
  var maxVal = catGastos[cats[0]];

  el.innerHTML = cats.map(function(cat) {
    var val = catGastos[cat];
    var pct = Math.round((val / renda) * 100);
    var barW = maxVal > 0 ? Math.round((val / maxVal) * 100) : 0;
    var icon = getCatIcon(cat);
    var cor = getCatCor(cat);
    var cls503020 = classificarCategoria503020(cat);
    var badge = cls503020 === 'necessidades' ? 'N' : 'D';

    return '<div class="orc-cat-item">' +
      '<div class="orc-cat-left">' +
        '<span class="orc-cat-icon" style="background:' + cor + '20;color:' + cor + '">' + icon + '</span>' +
        '<div class="orc-cat-info"><span class="orc-cat-nome">' + UTILS.escapeHtml(cat) + '</span>' +
        '<span class="orc-cat-badge ' + cls503020 + '">' + badge + '</span></div>' +
      '</div>' +
      '<div class="orc-cat-right">' +
        '<span class="orc-cat-valor">' + UTILS.formatarMoeda(val) + '</span>' +
        '<span class="orc-cat-pct">' + pct + '%</span>' +
      '</div>' +
      '<div class="orc-cat-bar"><div class="orc-cat-bar-fill" style="width:' + barW + '%;background:' + cor + '"></div></div>' +
    '</div>';
  }).join('');
}

function renderOrcamentoHistorico(renda) {
  var el = document.getElementById('orc-historico');
  if (!el) return;
  var agora = new Date();
  var meses = [];
  var nomesMes = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];

  for (var i = 2; i >= 0; i--) {
    var d = new Date(agora.getFullYear(), agora.getMonth() - i, 1);
    var mes = d.getMonth() + 1;
    var ano = d.getFullYear();
    var txs = TRANSACOES.obter({ mes: mes, ano: ano });
    var rec = 0, desp = 0;
    txs.forEach(function(t) {
      if (t.tipo === CONFIG.TIPO_RECEITA) rec += t.valor; else desp += t.valor;
    });
    meses.push({ label: nomesMes[d.getMonth()], rec: rec, desp: desp, saldo: rec - desp });
  }

  var maxVal = 1;
  meses.forEach(function(m) { if (m.rec > maxVal) maxVal = m.rec; if (m.desp > maxVal) maxVal = m.desp; });

  el.innerHTML = '<div class="orc-hist-chart">' + meses.map(function(m) {
    var hRec = Math.max(4, Math.round((m.rec / maxVal) * 100));
    var hDesp = Math.max(4, Math.round((m.desp / maxVal) * 100));
    return '<div class="orc-hist-col">' +
      '<div class="orc-hist-bars">' +
        '<div class="orc-hist-bar receita" style="height:' + hRec + 'px" title="Receita: ' + UTILS.formatarMoeda(m.rec) + '"></div>' +
        '<div class="orc-hist-bar despesa" style="height:' + hDesp + 'px" title="Despesa: ' + UTILS.formatarMoeda(m.desp) + '"></div>' +
      '</div>' +
      '<span class="orc-hist-label">' + m.label + '</span>' +
      '<span class="orc-hist-saldo ' + (m.saldo >= 0 ? 'positivo' : 'negativo') + '">' + (m.saldo >= 0 ? '+' : '') + UTILS.formatarMoeda(Math.abs(m.saldo)) + '</span>' +
    '</div>';
  }).join('') + '</div>' +
  '<div class="orc-hist-legenda"><span class="orc-leg-item"><span class="orc-leg-dot receita"></span>Receita</span>' +
  '<span class="orc-leg-item"><span class="orc-leg-dot despesa"></span>Despesa</span></div>';
}

/* ============================================
   CONFIGURAÇÕES — Funções da aba Config
   ============================================ */

function renderConfigTab() {
  var config = DADOS.getConfig();

  // Avatar
  var nome = config.nome || 'Usuário';
  var avatar = document.getElementById('cfg-avatar');
  var nomeEl = document.getElementById('cfg-perfil-nome');
  if (avatar) {
    var iniciais = nome.split(' ').map(function(p){return p[0]}).join('').toUpperCase().substring(0,2);
    avatar.textContent = iniciais || 'U';
  }
  if (nomeEl) nomeEl.textContent = nome;

  // Renda
  var rendaEl = document.getElementById('cfg-renda-display');
  if (rendaEl) {
    rendaEl.textContent = config.renda ? UTILS.formatarMoeda(config.renda) : 'Não definida';
  }

  // Moeda
  var moedaEl = document.getElementById('cfg-moeda-display');
  if (moedaEl) {
    var m = config.moeda || 'BRL';
    var labels = {BRL:'BRL (R$)', USD:'USD ($)', EUR:'EUR (€)'};
    moedaEl.textContent = labels[m] || m;
  }

  // Dark mode
  var chk = document.getElementById('chk-darkmode');
  if (chk) chk.checked = config.tema === 'dark';

  // Alertas
  var chkAlerta = document.getElementById('chk-alerta-orc');
  if (chkAlerta) chkAlerta.checked = !!config.alertaOrcamento;
  var chkLembrete = document.getElementById('chk-lembrete');
  if (chkLembrete) chkLembrete.checked = !!config.lembreteDiario;

  // PIN
  var chkPin = document.getElementById('chk-pin');
  var pinStatus = document.getElementById('cfg-pin-status');
  if (chkPin) chkPin.checked = !!config.pinAtivo;
  if (pinStatus) pinStatus.textContent = config.pinAtivo ? 'Ativado' : 'Desativado';

  // Categorias count
  var catsDespEl = document.getElementById('cfg-cats-despesa');
  var catsRecEl = document.getElementById('cfg-cats-receita');
  var customCats = config.categoriasCustom || {};
  var despCats = (CONFIG.CATEGORIAS_DESPESA || []).concat(customCats.despesa || []);
  var recCats = (CONFIG.CATEGORIAS_RECEITA || []).concat(customCats.receita || []);
  if (catsDespEl) catsDespEl.textContent = despCats.length + ' categorias';
  if (catsRecEl) catsRecEl.textContent = recCats.length + ' categorias';

  // Último backup
  var backupEl = document.getElementById('cfg-ultimo-backup');
  if (backupEl) {
    if (config.ultimoExportoDados) {
      var d = new Date(config.ultimoExportoDados);
      backupEl.textContent = d.toLocaleDateString('pt-BR') + ' às ' + d.toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'});
    } else {
      backupEl.textContent = 'Nunca exportado';
    }
  }

  // Estatísticas
  renderConfigStats();
}

function renderConfigStats() {
  var txAll = DADOS.getTransacoes();
  var txEl = document.getElementById('cfg-stat-tx');
  if (txEl) txEl.textContent = txAll.length;

  var diasEl = document.getElementById('cfg-stat-dias');
  if (diasEl) {
    if (txAll.length > 0) {
      var datas = txAll.map(function(t){return new Date(t.dataCriacao || t.data).getTime()});
      var primeira = Math.min.apply(null, datas);
      var dias = Math.floor((Date.now() - primeira) / 86400000) + 1;
      diasEl.textContent = dias;
    } else {
      diasEl.textContent = '0';
    }
  }

  var catEl = document.getElementById('cfg-stat-cat');
  if (catEl) {
    if (txAll.length > 0) {
      var contagem = {};
      txAll.forEach(function(t) {
        if (t.tipo === 'despesa') {
          contagem[t.categoria] = (contagem[t.categoria]||0) + 1;
        }
      });
      var top = Object.keys(contagem).sort(function(a,b){return contagem[b]-contagem[a]})[0];
      catEl.textContent = top ? (getCatIcon(top) + ' ' + top.charAt(0).toUpperCase() + top.slice(1)) : '—';
    } else {
      catEl.textContent = '—';
    }
  }
}

function _fpModal(titulo, camposHtml, onSalvar) {
  var old = document.querySelector('.modal-overlay');
  if (old) old.remove();
  var ov = document.createElement('div');
  ov.className = 'modal-overlay';
  ov.setAttribute('role', 'dialog');
  ov.setAttribute('aria-modal', 'true');
  ov.innerHTML =
    '<div class="modal-box">' +
      '<p style="font-size:17px;font-weight:700;margin-bottom:18px;color:var(--text)">' + titulo + '</p>' +
      camposHtml +
      '<div class="modal-actions" style="grid-template-columns:1fr 1fr;margin-top:20px">' +
        '<button class="btn-cancelar" type="button" id="_fpModal-cancel">Cancelar</button>' +
        '<button class="modal-btn" type="button" id="_fpModal-ok">Salvar</button>' +
      '</div>' +
    '</div>';
  document.body.appendChild(ov);
  document.getElementById('_fpModal-cancel').onclick = function() { ov.remove(); };
  ov.addEventListener('click', function(e) { if (e.target === ov) ov.remove(); });
  document.addEventListener('keydown', function h(e) {
    if (e.key === 'Escape') { ov.remove(); document.removeEventListener('keydown', h); }
  });
  document.getElementById('_fpModal-ok').onclick = function() { onSalvar(ov); };
  // foco no primeiro input
  var inp = ov.querySelector('input');
  if (inp) { inp.focus(); inp.select(); }
}

function abrirEditarPerfil() {
  var config = DADOS.getConfig();
  var campos =
    '<div class="form-group">' +
      '<label style="font-size:13px;font-weight:600;display:block;margin-bottom:6px;text-transform:uppercase;letter-spacing:.4px">Nome</label>' +
      '<input type="text" id="edit-cfg-nome" value="' + UTILS.escapeHtml(config.nome || '') + '" ' +
        'placeholder="Seu nome" maxlength="40" ' +
        'style="width:100%;padding:12px;border:2px solid var(--border);border-radius:10px;font-size:15px;background:var(--bg);color:var(--text)">' +
    '</div>';
  _fpModal('Editar Perfil', campos, function(ov) {
    var v = document.getElementById('edit-cfg-nome').value.trim();
    if (!v) { UTILS.mostrarToast('Informe um nome', 'error'); return; }
    DADOS.salvarConfig({ nome: v });
    ov.remove();
    renderConfigTab();
    atualizarDashboard();
    UTILS.mostrarToast('Perfil atualizado!', 'success');
  });
}

function abrirEditarRenda() {
  var config = DADOS.getConfig();
  var atual = config.renda || 0;
  var campos =
    '<div class="form-group">' +
      '<label style="font-size:13px;font-weight:600;display:block;margin-bottom:6px;text-transform:uppercase;letter-spacing:.4px">Renda Mensal</label>' +
      '<input type="text" id="edit-cfg-renda" value="' + (atual > 0 ? atual.toLocaleString('pt-BR', {minimumFractionDigits:2}) : '') + '" ' +
        'placeholder="0,00" inputmode="numeric" ' +
        'style="width:100%;padding:12px;border:2px solid var(--border);border-radius:10px;font-size:15px;background:var(--bg);color:var(--text)">' +
    '</div>';
  _fpModal('Renda Mensal', campos, function(ov) {
    var raw = document.getElementById('edit-cfg-renda').value.replace(/\./g, '').replace(',', '.');
    var val = parseFloat(raw);
    if (!val || val <= 0) { UTILS.mostrarToast('Valor inválido', 'error'); return; }
    DADOS.salvarConfig({ renda: val });
    ov.remove();
    renderConfigTab();
    RENDER.init();
    UTILS.mostrarToast('Renda atualizada!', 'success');
  });
}

function toggleAlertaOrcamento() {
  var chk = document.getElementById('chk-alerta-orc');
  DADOS.salvarConfig({ alertaOrcamento: chk ? chk.checked : false });
  UTILS.mostrarToast(chk && chk.checked ? 'Alertas ativados' : 'Alertas desativados', 'success');
}

function toggleLembreteDiario() {
  var chk = document.getElementById('chk-lembrete');
  DADOS.salvarConfig({ lembreteDiario: chk ? chk.checked : false });
  UTILS.mostrarToast(chk && chk.checked ? 'Lembrete ativado' : 'Lembrete desativado', 'success');
}

/* Helper: SHA-256 hash via Web Crypto API */
function hashPin(pin) {
  var encoder = new TextEncoder();
  var data = encoder.encode('fp-pin-salt:' + pin);
  return crypto.subtle.digest('SHA-256', data).then(function(buffer) {
    var arr = Array.from(new Uint8Array(buffer));
    return arr.map(function(b) { return b.toString(16).padStart(2, '0'); }).join('');
  });
}

function togglePinSeguranca() {
  var chk = document.getElementById('chk-pin');
  if (chk && chk.checked) {
    // Ativar — pedir para criar PIN
    var html = '<div style="display:flex;flex-direction:column;gap:16px;text-align:center">' +
      '<p style="font-weight:700;font-size:17px">Criar PIN</p>' +
      '<p style="font-size:13px;color:var(--text-secondary)">Crie um PIN de 4 dígitos</p>' +
      '<div style="display:flex;gap:8px;justify-content:center">' +
      '<input type="password" id="pin-1" maxlength="1" inputmode="numeric" style="width:48px;height:56px;text-align:center;font-size:24px;font-weight:700;border:2px solid var(--border);border-radius:12px;background:var(--bg);color:var(--text-primary)" oninput="if(this.value.length===1)document.getElementById(\'pin-2\').focus()">' +
      '<input type="password" id="pin-2" maxlength="1" inputmode="numeric" style="width:48px;height:56px;text-align:center;font-size:24px;font-weight:700;border:2px solid var(--border);border-radius:12px;background:var(--bg);color:var(--text-primary)" oninput="if(this.value.length===1)document.getElementById(\'pin-3\').focus()">' +
      '<input type="password" id="pin-3" maxlength="1" inputmode="numeric" style="width:48px;height:56px;text-align:center;font-size:24px;font-weight:700;border:2px solid var(--border);border-radius:12px;background:var(--bg);color:var(--text-primary)" oninput="if(this.value.length===1)document.getElementById(\'pin-4\').focus()">' +
      '<input type="password" id="pin-4" maxlength="1" inputmode="numeric" style="width:48px;height:56px;text-align:center;font-size:24px;font-weight:700;border:2px solid var(--border);border-radius:12px;background:var(--bg);color:var(--text-primary)">' +
      '</div></div>';
    fpAlert(html);
    setTimeout(function() {
      var overlay = document.querySelector('.modal-overlay');
      if (!overlay) return;
      var okBtn = overlay.querySelector('.modal-btn');
      if (okBtn) {
        okBtn.textContent = 'Ativar PIN';
        okBtn.onclick = function() {
          var pin = ['pin-1','pin-2','pin-3','pin-4'].map(function(id){return document.getElementById(id).value}).join('');
          if (pin.length !== 4 || !/^\d{4}$/.test(pin)) { UTILS.mostrarToast('PIN deve ter 4 dígitos', 'error'); return; }
          hashPin(pin).then(function(hash) {
            DADOS.salvarConfig({ pinAtivo: true, pinHash: hash });
            overlay.remove();
            renderConfigTab();
            UTILS.mostrarToast('PIN ativado!', 'success');
          });
        };
      }
      var cancelar = overlay.querySelector('.modal-btn:last-child') || null;
      // handle cancel
      document.getElementById('pin-1').focus();
    }, 100);
  } else {
    // Desativar PIN
    DADOS.salvarConfig({ pinAtivo: false, pinHash: null });
    renderConfigTab();
    UTILS.mostrarToast('PIN desativado', 'success');
  }
}

function verificarPinAoAbrir() {
  var config = DADOS.getConfig();
  if (!config.pinAtivo || !config.pinHash) return;
  var html = '<div style="display:flex;flex-direction:column;gap:16px;text-align:center">' +
    '<p style="font-size:36px">🔒</p>' +
    '<p style="font-weight:700;font-size:17px">FinançasPro</p>' +
    '<p style="font-size:13px;color:var(--text-secondary)">Digite seu PIN</p>' +
    '<div style="display:flex;gap:8px;justify-content:center">' +
    '<input type="password" id="unlock-1" maxlength="1" inputmode="numeric" style="width:48px;height:56px;text-align:center;font-size:24px;font-weight:700;border:2px solid var(--border);border-radius:12px;background:var(--bg);color:var(--text-primary)" oninput="if(this.value.length===1)document.getElementById(\'unlock-2\').focus()">' +
    '<input type="password" id="unlock-2" maxlength="1" inputmode="numeric" style="width:48px;height:56px;text-align:center;font-size:24px;font-weight:700;border:2px solid var(--border);border-radius:12px;background:var(--bg);color:var(--text-primary)" oninput="if(this.value.length===1)document.getElementById(\'unlock-3\').focus()">' +
    '<input type="password" id="unlock-3" maxlength="1" inputmode="numeric" style="width:48px;height:56px;text-align:center;font-size:24px;font-weight:700;border:2px solid var(--border);border-radius:12px;background:var(--bg);color:var(--text-primary)" oninput="if(this.value.length===1)document.getElementById(\'unlock-4\').focus()">' +
    '<input type="password" id="unlock-4" maxlength="1" inputmode="numeric" style="width:48px;height:56px;text-align:center;font-size:24px;font-weight:700;border:2px solid var(--border);border-radius:12px;background:var(--bg);color:var(--text-primary)">' +
    '</div></div>';
  var lockScreen = document.createElement('div');
  lockScreen.className = 'pin-lock-screen';
  lockScreen.innerHTML = '<div class="pin-lock-content">' + html +
    '<button class="btn-primario" style="margin-top:16px" onclick="tentarDesbloquear()">Desbloquear</button></div>';
  document.body.appendChild(lockScreen);
  setTimeout(function(){ var el = document.getElementById('unlock-1'); if(el) el.focus(); }, 200);
}

function tentarDesbloquear() {
  var config = DADOS.getConfig();
  var pin = ['unlock-1','unlock-2','unlock-3','unlock-4'].map(function(id){return document.getElementById(id).value}).join('');
  hashPin(pin).then(function(hash) {
    if (hash === config.pinHash) {
      var lock = document.querySelector('.pin-lock-screen');
      if (lock) lock.remove();
      UTILS.mostrarToast('Bem-vindo de volta!', 'success');
    } else {
      UTILS.mostrarToast('PIN incorreto', 'error');
      ['unlock-1','unlock-2','unlock-3','unlock-4'].forEach(function(id){ document.getElementById(id).value = ''; });
      document.getElementById('unlock-1').focus();
    }
  });
}

function abrirGerenciarCategorias(tipo) {
  var config = DADOS.getConfig();
  var customCats = config.categoriasCustom || {};
  var customs = customCats[tipo] || [];
  var defaults = tipo === 'despesa' ? CONFIG.CATEGORIAS_DESPESA : CONFIG.CATEGORIAS_RECEITA;
  var html = '<div style="display:flex;flex-direction:column;gap:12px">' +
    '<p style="font-weight:700;font-size:17px;text-align:center">Categorias de ' + (tipo==='despesa'?'Despesa':'Receita') + '</p>' +
    '<div style="max-height:300px;overflow-y:auto">';
  defaults.forEach(function(cat) {
    var key = cat.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'');
    html += '<div style="display:flex;align-items:center;gap:10px;padding:10px 12px;background:var(--bg);border-radius:10px;margin-bottom:6px">' +
      '<span style="font-size:18px">' + getCatIcon(key) + '</span>' +
      '<span style="flex:1;font-size:14px;font-weight:500">' + cat + '</span>' +
      '<span style="font-size:11px;color:var(--text-secondary);background:var(--card-bg);padding:2px 8px;border-radius:6px">padrão</span></div>';
  });
  customs.forEach(function(cat, idx) {
    html += '<div style="display:flex;align-items:center;gap:10px;padding:10px 12px;background:var(--bg);border-radius:10px;margin-bottom:6px">' +
      '<span style="font-size:18px">🏷️</span>' +
      '<span style="flex:1;font-size:14px;font-weight:500">' + cat + '</span>' +
      '<button onclick="removerCategoriaCustom(\'' + tipo + '\',' + idx + ')" style="background:none;border:none;font-size:16px;cursor:pointer;color:#ef4444;padding:4px">✕</button></div>';
  });
  html += '</div>' +
    '<div style="display:flex;gap:8px;margin-top:8px">' +
    '<input type="text" id="nova-cat-input" placeholder="Nova categoria..." style="flex:1;padding:12px;border:2px solid var(--border);border-radius:10px;font-size:14px;background:var(--bg);color:var(--text-primary)">' +
    '<button onclick="adicionarCategoriaCustom(\'' + tipo + '\')" style="padding:12px 16px;background:var(--primary);color:#fff;border:none;border-radius:10px;font-weight:600;font-size:14px;cursor:pointer">+</button>' +
    '</div></div>';
  fpAlert(html);
}

function adicionarCategoriaCustom(tipo) {
  var input = document.getElementById('nova-cat-input');
  if (!input || !input.value.trim()) { UTILS.mostrarToast('Digite um nome', 'error'); return; }
  var nome = input.value.trim();
  var config = DADOS.getConfig();
  var customCats = config.categoriasCustom || { receita: [], despesa: [] };
  if (!customCats[tipo]) customCats[tipo] = [];
  if (customCats[tipo].indexOf(nome) >= 0) { UTILS.mostrarToast('Categoria já existe', 'error'); return; }
  customCats[tipo].push(nome);
  DADOS.salvarConfig({ categoriasCustom: customCats });
  var overlay = document.querySelector('.modal-overlay');
  if (overlay) overlay.remove();
  abrirGerenciarCategorias(tipo);
  UTILS.mostrarToast('Categoria adicionada!', 'success');
}

function removerCategoriaCustom(tipo, idx) {
  var config = DADOS.getConfig();
  var customCats = config.categoriasCustom || { receita: [], despesa: [] };
  if (!customCats[tipo]) return;
  customCats[tipo].splice(idx, 1);
  DADOS.salvarConfig({ categoriasCustom: customCats });
  var overlay = document.querySelector('.modal-overlay');
  if (overlay) overlay.remove();
  abrirGerenciarCategorias(tipo);
  UTILS.mostrarToast('Categoria removida', 'success');
}

function abrirChangelog() {
  var html = '<div style="display:flex;flex-direction:column;gap:12px">' +
    '<p style="font-weight:700;font-size:17px;text-align:center">Novidades</p>' +
    '<div style="max-height:350px;overflow-y:auto">' +
    '<div style="margin-bottom:16px"><p style="font-weight:700;font-size:14px;color:var(--primary)">v3.0</p>' +
    '<ul style="font-size:13px;color:var(--text-secondary);padding-left:18px;line-height:1.8">' +
    '<li>Orçamento 50/30/20 com insights</li><li>Extrato com busca e filtros</li>' +
    '<li>Categorias personalizáveis</li><li>Proteção por PIN</li>' +
    '<li>Configurações redesenhadas</li><li>Seletor de moeda</li></ul></div>' +
    '<div style="margin-bottom:16px"><p style="font-weight:700;font-size:14px;color:var(--primary)">v2.0</p>' +
    '<ul style="font-size:13px;color:var(--text-secondary);padding-left:18px;line-height:1.8">' +
    '<li>Dashboard com gráficos</li><li>Modo escuro</li>' +
    '<li>Exportar/importar dados</li><li>Auto-categorização</li></ul></div>' +
    '<div><p style="font-weight:700;font-size:14px;color:var(--primary)">v1.0</p>' +
    '<ul style="font-size:13px;color:var(--text-secondary);padding-left:18px;line-height:1.8">' +
    '<li>Lançamento inicial</li><li>Receitas e despesas</li><li>Armazenamento local</li></ul></div>' +
    '</div></div>';
  fpAlert(html);
}

function abrirFeedback() {
  var html = '<div style="display:flex;flex-direction:column;gap:16px;text-align:center">' +
    '<p style="font-weight:700;font-size:17px">Enviar Feedback</p>' +
    '<p style="font-size:13px;color:var(--text-secondary)">Sua opinião ajuda a melhorar o app!</p>' +
    '<div style="display:flex;flex-direction:column;gap:8px">' +
    '<select id="feedback-tipo" style="padding:12px;border:2px solid var(--border);border-radius:10px;font-size:14px;background:var(--bg);color:var(--text-primary)">' +
    '<option value="sugestao">💡 Sugestão</option>' +
    '<option value="bug">🐛 Bug / Problema</option>' +
    '<option value="elogio">⭐ Elogio</option></select>' +
    '<textarea id="feedback-msg" rows="4" placeholder="Descreva aqui..." style="padding:12px;border:2px solid var(--border);border-radius:10px;font-size:14px;resize:none;background:var(--bg);color:var(--text-primary)"></textarea>' +
    '</div></div>';
  fpAlert(html);
  setTimeout(function() {
    var overlay = document.querySelector('.modal-overlay');
    if (!overlay) return;
    var okBtn = overlay.querySelector('.modal-btn');
    if (okBtn) {
      okBtn.textContent = 'Enviar';
      okBtn.onclick = function() {
        var msg = document.getElementById('feedback-msg').value.trim();
        if (!msg) { UTILS.mostrarToast('Escreva algo', 'error'); return; }
        var config = DADOS.getConfig();
        var feedbacks = config.feedbacks || [];
        feedbacks.push({ tipo: document.getElementById('feedback-tipo').value, msg: msg, data: new Date().toISOString() });
        DADOS.salvarConfig({ feedbacks: feedbacks });
        overlay.remove();
        UTILS.mostrarToast('Feedback salvo! Obrigado!', 'success');
      };
    }
  }, 100);
}


/* ============================================
   MODAIS
   ============================================ */
function fpAlert(htmlContent) {
  var old = document.querySelector('.modal-overlay');
  if (old) old.remove();
  var ov = document.createElement('div');
  ov.className = 'modal-overlay';
  ov.setAttribute('role','dialog');
  ov.setAttribute('aria-modal','true');
  ov.innerHTML = '<div class="modal-box">' + htmlContent +
    '<div class="modal-actions"><button class="modal-btn btn-principal" type="button">OK</button></div></div>';
  document.body.appendChild(ov);
  var btn = ov.querySelector('.modal-btn');
  btn.focus();
  btn.addEventListener('click', function() { ov.remove(); });
  ov.addEventListener('click', function(e) { if (e.target === ov) ov.remove(); });
  document.addEventListener('keydown', function h(e) {
    if (e.key === 'Escape') { ov.remove(); document.removeEventListener('keydown', h); }
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
    '<button class="btn-cancelar" type="button" id="mc">Cancelar</button>' +
    '<button class="btn-confirmar-danger" type="button" id="mo">Confirmar</button>' +
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

/* ============================================
   IMPORTAR / EXPORTAR
   ============================================ */
function setupImport() {
  var area = document.getElementById('import-area');
  var inp = document.getElementById('import-file');
  if (!inp) return;
  if (area) {
    area.addEventListener('dragover', function(e) { e.preventDefault(); area.classList.add('drag-over'); });
    area.addEventListener('dragleave', function() { area.classList.remove('drag-over'); });
    area.addEventListener('drop', function(e) {
      e.preventDefault(); area.classList.remove('drag-over');
      if (e.dataTransfer.files[0]) processarImport(e.dataTransfer.files[0]);
    });
    area.addEventListener('keydown', function(e) {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); inp.click(); }
    });
  }
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
        UTILS.mostrarToast('Formato invalido', 'error'); return;
      }
      var validas = d.transacoes.filter(function(t) { return t.tipo && t.valor && t.data && t.categoria; });
      if (validas.length === 0) { UTILS.mostrarToast('Nenhuma transacao valida', 'error'); return; }
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
  DADOS.salvarConfig({ ultimoExportoDados: new Date().toISOString() });
  UTILS.mostrarToast('Dados exportados!', 'success');
}

/* ============================================
   HELPER: carrega script com fallback de CDNs
   ============================================ */
function _carregarScript(urls, onSuccess, onError) {
  var idx = 0;
  function tentarProximo() {
    if (idx >= urls.length) { onError(); return; }
    var s = document.createElement('script');
    s.src = urls[idx++];
    s.onload = onSuccess;
    s.onerror = tentarProximo;
    document.head.appendChild(s);
  }
  tentarProximo();
}

/* ============================================
   EXPORTAR EXCEL (.xlsx)
   ============================================ */
function exportarExcel() {
  if (!window.XLSX) {
    UTILS.mostrarToast('Carregando Excel...', 'info');
    _carregarScript([
      'https://unpkg.com/xlsx@0.18.5/dist/xlsx.full.min.js',
      'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js',
      'https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js'
    ], function() { exportarExcel(); },
       function() { UTILS.mostrarToast('Erro ao carregar biblioteca Excel.', 'error'); });
    return;
  }

  var info = getExtratoMesAno();
  var txs = TRANSACOES.obter({ mes: info.mes, ano: info.ano });
  if (txs.length === 0) { UTILS.mostrarToast('Nenhuma transacao para exportar', 'warning'); return; }

  var nomesMes = ['Janeiro','Fevereiro','Marco','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];
  var nomeMes = nomesMes[info.mes - 1];
  var config = DADOS.getConfig();
  var nomeUsuario = (config.nome || 'Usuario').replace(/[^\w\s]/gi, '');

  var receitas = 0, despesas = 0;
  txs.forEach(function(t) { if (t.tipo === CONFIG.TIPO_RECEITA) receitas += t.valor; else despesas += t.valor; });
  var saldo = receitas - despesas;

  var wb = XLSX.utils.book_new();
  var ws_data = [];

  // Título
  ws_data.push(['FinancasPro - Extrato Mensal', '', '', '', '']);
  ws_data.push(['Periodo: ' + nomeMes + ' ' + info.ano, '', '', '', '']);
  ws_data.push(['Usuario: ' + nomeUsuario, '', 'Gerado em:', new Date().toLocaleDateString('pt-BR'), '']);
  ws_data.push(['', '', '', '', '']);

  // Resumo
  ws_data.push(['RESUMO DO MES', '', '', '', '']);
  ws_data.push(['Receitas', '', '', '', receitas]);
  ws_data.push(['Despesas', '', '', '', -despesas]);
  ws_data.push(['Saldo', '', '', '', saldo]);
  ws_data.push(['', '', '', '', '']);

  // Cabeçalho da tabela
  ws_data.push(['Data', 'Tipo', 'Categoria', 'Descricao', 'Valor (R$)']);

  // Linhas de transações
  txs.forEach(function(t) {
    var cat = CONFIG.getCatLabel ? CONFIG.getCatLabel(t.categoria) : t.categoria;
    var sinal = t.tipo === CONFIG.TIPO_RECEITA ? 1 : -1;
    ws_data.push([
      UTILS.formatarData(t.data),
      t.tipo === CONFIG.TIPO_RECEITA ? 'Receita' : 'Despesa',
      cat,
      t.descricao || '',
      sinal * t.valor
    ]);
  });

  ws_data.push(['', '', '', '', '']);
  ws_data.push(['', '', '', 'Total Receitas:', receitas]);
  ws_data.push(['', '', '', 'Total Despesas:', -despesas]);
  ws_data.push(['', '', '', 'Saldo Final:', saldo]);

  var ws = XLSX.utils.aoa_to_sheet(ws_data);

  // Larguras das colunas
  ws['!cols'] = [
    { wch: 14 }, // Data
    { wch: 12 }, // Tipo
    { wch: 18 }, // Categoria
    { wch: 36 }, // Descrição
    { wch: 16 }  // Valor
  ];

  // Mesclar células do título
  ws['!merges'] = [
    { s: { r: 0, c: 0 }, e: { r: 0, c: 4 } },
    { s: { r: 1, c: 0 }, e: { r: 1, c: 4 } },
    { s: { r: 4, c: 0 }, e: { r: 4, c: 4 } }
  ];

  XLSX.utils.book_append_sheet(wb, ws, nomeMes + ' ' + info.ano);

  var nomeArquivo = 'financaspro-extrato-' + nomeMes.toLowerCase() + '-' + info.ano + '.xlsx';
  XLSX.writeFile(wb, nomeArquivo);
  UTILS.mostrarToast('Excel exportado!', 'success');
}

/* ============================================
   EXPORTAR PDF
   ============================================ */
function exportarExtrato() {
  if (window.jspdf && window.jspdf.jsPDF) { gerarPDF(); return; }
  UTILS.mostrarToast('Carregando PDF...', 'info');
  _carregarScript([
    'https://unpkg.com/jspdf@2.5.2/dist/jspdf.umd.min.js',
    'https://cdn.jsdelivr.net/npm/jspdf@2.5.2/dist/jspdf.umd.min.js',
    'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.2/jspdf.umd.min.js'
  ], function() {
    if (window.jspdf && window.jspdf.jsPDF) gerarPDF();
    else UTILS.mostrarToast('Erro ao inicializar PDF.', 'error');
  }, function() {
    UTILS.mostrarToast('Sem conexão para carregar PDF.', 'error');
  });
}

function exportarPDF() { exportarExtrato(); }

function gerarPDF() {
  var jsPDF = window.jspdf.jsPDF;
  var doc = new jsPDF({ unit: 'mm', format: 'a4' });
  var info = getExtratoMesAno();
  var txs = TRANSACOES.obter({ mes: info.mes, ano: info.ano });

  if (txs.length === 0) { UTILS.mostrarToast('Nenhuma transacao para exportar', 'warning'); return; }

  var nomesMes = ['Janeiro','Fevereiro','Marco','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];
  var nomeMes = nomesMes[info.mes - 1];
  var agora = new Date();
  var config = DADOS.getConfig();
  var nomeUsuario = config.nome || 'Usuario';

  var receitas = 0, despesas = 0;
  txs.forEach(function(t) { if (t.tipo === CONFIG.TIPO_RECEITA) receitas += t.valor; else despesas += t.valor; });
  var saldo = receitas - despesas;

  // --- CABEÇALHO ---
  doc.setFillColor(0, 114, 63);
  doc.rect(0, 0, 210, 38, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(18); doc.setFont('helvetica', 'bold');
  doc.text('FinancasPro', 14, 15);
  doc.setFontSize(11); doc.setFont('helvetica', 'normal');
  doc.text('Extrato de ' + nomeMes + ' ' + info.ano, 14, 24);
  doc.setFontSize(9);
  doc.text('Usuario: ' + nomeUsuario, 14, 32);
  doc.text('Gerado em: ' + agora.toLocaleDateString('pt-BR') + ' ' + agora.toLocaleTimeString('pt-BR', {hour:'2-digit',minute:'2-digit'}), 120, 32);

  // --- CARDS DE RESUMO ---
  var cardY = 46;
  var cardH = 16;
  var cardW = 56;

  // Card Receitas
  doc.setFillColor(236, 253, 245);
  doc.roundedRect(14, cardY, cardW, cardH, 3, 3, 'F');
  doc.setDrawColor(16, 185, 129); doc.setLineWidth(0.5);
  doc.roundedRect(14, cardY, cardW, cardH, 3, 3, 'S');
  doc.setTextColor(107, 114, 128); doc.setFontSize(7); doc.setFont('helvetica', 'normal');
  doc.text('RECEITAS', 42, cardY + 5, { align: 'center' });
  doc.setTextColor(5, 150, 105); doc.setFontSize(10); doc.setFont('helvetica', 'bold');
  doc.text(UTILS.formatarMoeda(receitas), 42, cardY + 12, { align: 'center' });

  // Card Despesas
  doc.setFillColor(254, 242, 242);
  doc.roundedRect(77, cardY, cardW, cardH, 3, 3, 'F');
  doc.setDrawColor(239, 68, 68);
  doc.roundedRect(77, cardY, cardW, cardH, 3, 3, 'S');
  doc.setTextColor(107, 114, 128); doc.setFontSize(7); doc.setFont('helvetica', 'normal');
  doc.text('DESPESAS', 105, cardY + 5, { align: 'center' });
  doc.setTextColor(220, 38, 38); doc.setFontSize(10); doc.setFont('helvetica', 'bold');
  doc.text(UTILS.formatarMoeda(despesas), 105, cardY + 12, { align: 'center' });

  // Card Saldo
  var saldoPos = saldo >= 0;
  doc.setFillColor(saldoPos ? 236 : 254, saldoPos ? 253 : 242, saldoPos ? 245 : 242);
  doc.roundedRect(140, cardY, cardW, cardH, 3, 3, 'F');
  doc.setDrawColor(saldoPos ? 16 : 239, saldoPos ? 185 : 68, saldoPos ? 129 : 68);
  doc.roundedRect(140, cardY, cardW, cardH, 3, 3, 'S');
  doc.setTextColor(107, 114, 128); doc.setFontSize(7); doc.setFont('helvetica', 'normal');
  doc.text('SALDO', 168, cardY + 5, { align: 'center' });
  doc.setTextColor(saldoPos ? 5 : 220, saldoPos ? 150 : 38, saldoPos ? 105 : 38);
  doc.setFontSize(10); doc.setFont('helvetica', 'bold');
  doc.text(UTILS.formatarMoeda(saldo), 168, cardY + 12, { align: 'center' });

  // --- TABELA DE TRANSAÇÕES ---
  var tableY = cardY + cardH + 10;
  doc.setTextColor(31, 41, 55); doc.setFontSize(11); doc.setFont('helvetica', 'bold');
  doc.text('Transacoes do Periodo', 14, tableY);
  doc.text(txs.length + ' registros', 196, tableY, { align: 'right' });
  tableY += 6;

  // Cabeçalho da tabela
  doc.setFillColor(243, 244, 246);
  doc.rect(14, tableY, 182, 7, 'F');
  doc.setTextColor(75, 85, 99); doc.setFontSize(7.5); doc.setFont('helvetica', 'bold');
  doc.text('DATA', 16, tableY + 5);
  doc.text('DESCRICAO', 42, tableY + 5);
  doc.text('CATEGORIA', 112, tableY + 5);
  doc.text('TIPO', 152, tableY + 5);
  doc.text('VALOR', 196, tableY + 5, { align: 'right' });
  tableY += 7;

  doc.setFontSize(8.5); doc.setFont('helvetica', 'normal');
  var altRow = false;

  for (var i = 0; i < txs.length; i++) {
    if (tableY > 270) {
      // Rodapé da página
      doc.setDrawColor(229, 231, 235); doc.setLineWidth(0.3);
      doc.line(14, 285, 196, 285);
      doc.setTextColor(156, 163, 175); doc.setFontSize(7.5);
      doc.text('FinancasPro - Extrato gerado automaticamente', 14, 290);
      doc.text('Pagina ' + doc.getNumberOfPages(), 196, 290, { align: 'right' });

      doc.addPage();
      tableY = 20;
      // Repetir cabeçalho
      doc.setFillColor(243, 244, 246);
      doc.rect(14, tableY, 182, 7, 'F');
      doc.setTextColor(75, 85, 99); doc.setFontSize(7.5); doc.setFont('helvetica', 'bold');
      doc.text('DATA', 16, tableY + 5);
      doc.text('DESCRICAO', 42, tableY + 5);
      doc.text('CATEGORIA', 112, tableY + 5);
      doc.text('TIPO', 152, tableY + 5);
      doc.text('VALOR', 196, tableY + 5, { align: 'right' });
      tableY += 7;
      doc.setFontSize(8.5); doc.setFont('helvetica', 'normal');
      altRow = false;
    }

    var t = txs[i];
    var isReceita = t.tipo === CONFIG.TIPO_RECEITA;
    var catLabel = CONFIG.getCatLabel ? CONFIG.getCatLabel(t.categoria) : t.categoria;
    var desc = (t.descricao || '-');
    if (desc.length > 32) desc = desc.substring(0, 30) + '..';
    catLabel = catLabel.length > 14 ? catLabel.substring(0, 13) + '.' : catLabel;

    if (altRow) {
      doc.setFillColor(249, 250, 251);
      doc.rect(14, tableY - 1, 182, 7, 'F');
    }

    doc.setTextColor(55, 65, 81);
    doc.text(UTILS.formatarData(t.data), 16, tableY + 4);
    doc.text(desc, 42, tableY + 4);
    doc.text(catLabel, 112, tableY + 4);

    // Badge tipo
    if (isReceita) {
      doc.setFillColor(220, 252, 231); doc.roundedRect(149, tableY, 16, 5.5, 1.5, 1.5, 'F');
      doc.setTextColor(22, 101, 52); doc.setFontSize(7);
    } else {
      doc.setFillColor(254, 226, 226); doc.roundedRect(149, tableY, 16, 5.5, 1.5, 1.5, 'F');
      doc.setTextColor(153, 27, 27); doc.setFontSize(7);
    }
    doc.text(isReceita ? 'Receita' : 'Despesa', 157, tableY + 4, { align: 'center' });

    doc.setFontSize(8.5);
    if (isReceita) { doc.setTextColor(5, 150, 105); doc.setFont('helvetica', 'bold'); doc.text('+' + UTILS.formatarMoeda(t.valor), 196, tableY + 4, { align: 'right' }); }
    else { doc.setTextColor(220, 38, 38); doc.setFont('helvetica', 'bold'); doc.text('-' + UTILS.formatarMoeda(t.valor), 196, tableY + 4, { align: 'right' }); }
    doc.setFont('helvetica', 'normal');

    tableY += 7;
    altRow = !altRow;
  }

  // --- TOTAIS FINAIS ---
  tableY += 3;
  doc.setDrawColor(229, 231, 235); doc.setLineWidth(0.5);
  doc.line(14, tableY, 196, tableY);
  tableY += 6;

  doc.setFontSize(9); doc.setFont('helvetica', 'normal');
  doc.setTextColor(107, 114, 128); doc.text('Total Receitas:', 130, tableY);
  doc.setTextColor(5, 150, 105); doc.setFont('helvetica', 'bold'); doc.text(UTILS.formatarMoeda(receitas), 196, tableY, { align: 'right' });
  tableY += 6;
  doc.setFont('helvetica', 'normal'); doc.setTextColor(107, 114, 128); doc.text('Total Despesas:', 130, tableY);
  doc.setTextColor(220, 38, 38); doc.setFont('helvetica', 'bold'); doc.text(UTILS.formatarMoeda(despesas), 196, tableY, { align: 'right' });
  tableY += 6;
  doc.setDrawColor(156, 163, 175); doc.line(130, tableY - 1, 196, tableY - 1);
  doc.setFont('helvetica', 'normal'); doc.setTextColor(31, 41, 55); doc.text('Saldo Final:', 130, tableY + 4);
  var sc = saldo >= 0;
  doc.setTextColor(sc ? 5 : 220, sc ? 150 : 38, sc ? 105 : 38);
  doc.setFont('helvetica', 'bold'); doc.setFontSize(10);
  doc.text(UTILS.formatarMoeda(saldo), 196, tableY + 4, { align: 'right' });

  var nomeArquivo = 'financaspro-extrato-' + nomeMes.toLowerCase() + '-' + info.ano + '.pdf';
  doc.save(nomeArquivo);
  UTILS.mostrarToast('PDF exportado!', 'success');
}

/* ============================================
   AUTO-CATEGORIA + DETECÇÃO DE ANOMALIA
   ============================================ */
function setupAutoCategoria() {
  try {
    var descInput = DOMUTILS.elementos.novoDescricao;
    if (!descInput) return;

    var timerDeteccao = null;

    descInput.addEventListener('input', function() {
      clearTimeout(timerDeteccao);
      var descricao = this.value.trim();

      timerDeteccao = setTimeout(function() {
        if (!descricao) {
          AUTOMACAO.limparAlerta();
          return;
        }

        // Use PIPELINE para processar
        if (typeof PIPELINE !== 'undefined') {
          var resultado = PIPELINE.processar(descricao);
          if (resultado && PIPELINE.preencherForm(resultado)) {
            atualizarTipoIndicator(resultado.tipo);
            atualizarOrcamentoPreview();

            var grid = document.getElementById('categoria-grid');
            if (grid) {
              grid.querySelectorAll('.cat-btn').forEach(function(btn) {
                btn.classList.remove('ativo');
              });
              var botaoSelecionado = grid.querySelector('[data-cat="' + resultado.categoria + '"]');
              if (botaoSelecionado) botaoSelecionado.classList.add('ativo');
            }
          }
        }

        var valorInput = DOMUTILS.elementos.novoValor;
        if (valorInput && valorInput.value) {
          var valor = VALIDATIONS.validarValor(valorInput.value);
          if (valor.valido) {
            var categoria = document.getElementById('novo-categoria').value;
            var tipo = document.getElementById('novo-tipo').value;
            if (categoria && typeof AUTOMACAO !== 'undefined') {
              var alerta = AUTOMACAO.detectarAnomalia(valor.valor, categoria, tipo);
              if (alerta) {
                AUTOMACAO.mostrarAlerta(alerta);
              } else {
                AUTOMACAO.limparAlerta();
              }
            }
          }
        }
      }, 300);
    });
  } catch (e) {
    console.warn('Auto-categoria setup falhou:', e);
  }
}

/* CONFIG BANCOS E CARTÕES */
function abrirConfigBancos() {
  var config = DADOS.getConfig();
  var bancos = config.bancos || ['Nubank','Itaú','Caixa','Bradesco','Santander'];
  var cartoes = config.cartoes || ['Crédito','Débito','XP','B3'];

  var html = '<div style="display:flex;flex-direction:column;gap:16px">' +
    '<div>' +
      '<p style="font-weight:700;font-size:14px;margin-bottom:8px">🏦 Bancos</p>' +
      '<div id="lista-bancos" style="display:flex;flex-direction:column;gap:6px">' +
        bancos.map(function(b) {
          return '<div style="display:flex;justify-content:space-between;align-items:center;padding:8px 12px;background:var(--bg);border-radius:8px">' +
            '<span>' + UTILS.escapeHtml(b) + '</span>' +
            '<button onclick="removerBanco(\'' + UTILS.escapeHtml(b) + '\')" style="background:none;border:none;color:red;cursor:pointer;font-size:16px">✕</button>' +
          '</div>';
        }).join('') +
      '</div>' +
      '<input type="text" id="novo-banco-input" placeholder="Novo banco..." style="width:100%;padding:8px;margin-top:8px;border:1px solid var(--border);border-radius:8px">' +
      '<button onclick="adicionarBanco()" style="width:100%;padding:8px;margin-top:6px;background:var(--primary);color:white;border:none;border-radius:8px;cursor:pointer">+ Adicionar</button>' +
    '</div>' +
    '<div>' +
      '<p style="font-weight:700;font-size:14px;margin-bottom:8px">💳 Cartões</p>' +
      '<div id="lista-cartoes" style="display:flex;flex-direction:column;gap:6px">' +
        cartoes.map(function(c) {
          return '<div style="display:flex;justify-content:space-between;align-items:center;padding:8px 12px;background:var(--bg);border-radius:8px">' +
            '<span>' + UTILS.escapeHtml(c) + '</span>' +
            '<button onclick="removerCartao(\'' + UTILS.escapeHtml(c) + '\')" style="background:none;border:none;color:red;cursor:pointer;font-size:16px">✕</button>' +
          '</div>';
        }).join('') +
      '</div>' +
      '<input type="text" id="novo-cartao-input" placeholder="Novo cartão..." style="width:100%;padding:8px;margin-top:8px;border:1px solid var(--border);border-radius:8px">' +
      '<button onclick="adicionarCartao()" style="width:100%;padding:8px;margin-top:6px;background:var(--primary);color:white;border:none;border-radius:8px;cursor:pointer">+ Adicionar</button>' +
    '</div>' +
  '</div>';

  fpAlert(html);
}

function adicionarBanco() {
  var input = document.getElementById('novo-banco-input');
  var valor = input ? input.value.trim() : '';
  if (!valor) return;

  var config = DADOS.getConfig();
  config.bancos = config.bancos || [];
  if (config.bancos.indexOf(valor) === -1) {
    config.bancos.push(valor);
    DADOS.salvarConfig(config);
    abrirConfigBancos();
  }
}

function removerBanco(banco) {
  var config = DADOS.getConfig();
  config.bancos = config.bancos || [];
  config.bancos = config.bancos.filter(function(b) { return b !== banco; });
  DADOS.salvarConfig(config);
  abrirConfigBancos();
}

function adicionarCartao() {
  var input = document.getElementById('novo-cartao-input');
  var valor = input ? input.value.trim() : '';
  if (!valor) return;

  var config = DADOS.getConfig();
  config.cartoes = config.cartoes || [];
  if (config.cartoes.indexOf(valor) === -1) {
    config.cartoes.push(valor);
    DADOS.salvarConfig(config);
    abrirConfigBancos();
  }
}

function removerCartao(cartao) {
  var config = DADOS.getConfig();
  config.cartoes = config.cartoes || [];
  config.cartoes = config.cartoes.filter(function(c) { return c !== cartao; });
  DADOS.salvarConfig(config);
  abrirConfigBancos();
}

/* RENDERIZAR SELECTS COM BANCOS E CARTÕES */
function renderizarSelects() {
  var config = DADOS.getConfig();
  var bancos = config.bancos || ['Nubank','Itaú','Caixa','Bradesco','Santander'];
  var cartoes = config.cartoes || ['Crédito','Débito','XP','B3'];

  var seletoRBanco = document.getElementById('novo-banco');
  if (seletoRBanco) {
    var valBanco = seletoRBanco.value;
    seletoRBanco.innerHTML = '<option value="">Sem banco</option>' +
      bancos.map(function(b) { return '<option value="' + UTILS.escapeHtml(b) + '">' + UTILS.escapeHtml(b) + '</option>'; }).join('');
    seletoRBanco.value = valBanco;
  }

  var seletorCartao = document.getElementById('novo-cartao');
  if (seletorCartao) {
    var valCartao = seletorCartao.value;
    seletorCartao.innerHTML = '<option value="">Sem cartão</option>' +
      cartoes.map(function(c) { return '<option value="' + UTILS.escapeHtml(c) + '">' + UTILS.escapeHtml(c) + '</option>'; }).join('');
    seletorCartao.value = valCartao;
  }
}

/* Chamar ao entrar na aba Novo */
var originalMudarAba = mudarAba;
window.mudarAba = function(aba) {
  originalMudarAba(aba);
  if (aba === 'novo') {
    setTimeout(renderizarSelects, 100);
  }
};

/* ============================================
   ENTRADA RÁPIDA - PARSER
   ============================================ */
function abrirEntradaRapida() {
  var input = prompt('Entrada rápida (ex: mercado 150 ontem nubank)\n\nFormato: descrição [valor] [data] [banco]');
  if (!input) return;

  if (typeof PIPELINE === 'undefined') {
    UTILS.mostrarToast('Pipeline não disponível', 'error');
    return;
  }

  var resultado = PIPELINE.processar(input);
  if (!resultado) {
    UTILS.mostrarToast('Entrada inválida', 'error');
    return;
  }

  if (resultado.descricao) {
    DOMUTILS.elementos.novoDescricao.value = resultado.descricao;
  }
  PIPELINE.preencherForm(resultado);
  atualizarTipoIndicator(resultado.tipo);
  atualizarOrcamentoPreview();

  DOMUTILS.elementos.novoDescricao.focus();
  UTILS.mostrarToast('Entrada rápida preenchida!', 'success');
}

function atualizarBadgeConfianca(confianca) {
  var badge = document.getElementById('sugestao-badge');
  if (!badge) return;

  var prefixes = {alta: '✨', media: '💡', baixa: '❓'};
  var categoria = document.getElementById('novo-categoria').value;

  if (categoria) {
    badge.textContent = (prefixes[confianca] || '✨') + ' ' + UTILS.labelCategoria(categoria);
    badge.dataset.confianca = confianca;
    badge.style.display = 'block';
  }
}

function executarInsight(acao, parametros) {
  if (acao === 'aumentarLimite') {
    var config = DADOS.getConfig();
    if (!config.orcamentos) config.orcamentos = {};
    config.orcamentos[parametros.categoria] = parametros.novoLimite;
    DADOS.salvarConfig(config);
    UTILS.mostrarToast('Limite de ' + UTILS.labelCategoria(parametros.categoria) +
      ' → R$ ' + parametros.novoLimite.toFixed(2), 'success');
  }

  if (acao === 'marcarRecorrente') {
    var catEl = document.getElementById('novo-categoria');
    var cat   = catEl ? catEl.value : '';
    var rec = {
      tipo: 'despesa', categoria: cat || 'outro',
      descricao: parametros.descricao,
      frequencia: 'mensal', valor: 0,
      dataInicio: new Date().toISOString().split('T')[0], ativo: true
    };
    DADOS.salvarRecorrente(rec);
    UTILS.mostrarToast('"' + parametros.descricao + '" marcado como recorrente', 'success');
  }

  if (typeof INSIGHTS !== 'undefined') {
    setTimeout(function() { INSIGHTS.mostrar(); }, 150);
  }
}

function verificarArmazenamento() {
  try {
    var usado = 0;
    for (var key in localStorage) {
      if (localStorage.hasOwnProperty(key)) {
        usado += localStorage[key].length + key.length;
      }
    }
    var usadoMB = (usado / 1024 / 1024).toFixed(2);

    if (usadoMB > 5 && typeof IndexedDB !== 'undefined') {
      console.log('Storage > 5MB (' + usadoMB + 'MB), considere IndexedDB');
    }
  } catch (e) {
    console.warn('Erro ao verificar storage:', e);
  }
}

setInterval(function() {
  if (typeof SCORE !== 'undefined') {
    SCORE.limparCache();
  }
}, 300000);
