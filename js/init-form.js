/**
 * init-form.js - Sistema de formulário de transações
 * Extraído do init.js para modularização
 * Responsabilidades: setup completo do form novo, validação, submit
 */

const INIT_FORM = {
  /**
   * Inicializa sistema de formulário
   */
  init: function() {
    this.setupFormNovo();
  },

  /**
   * Configura todos os subsistemas do formulário
   */
  setupFormNovo: function() {
    var fns = [
      this.setupEntradaRapida,
      this.setupTipoToggle,
      this.setupMascaraValor,
      this.setupCategoriaGrid,
      this.setupDateChips,
      this.setupExtrasToggle,
      this.setupRecorrencia,
      this.setupParcelamento,
      this.setupAutoCategorizacao,
      this.setupAutocomplete,
      this.setupFormSubmit,
      this.setupParcelaPreview
    ];

    fns.forEach(function(fn) {
      try {
        if (typeof fn === 'function') fn();
      } catch (e) {
        console.warn('Setup falhou:', fn.name, e);
      }
    });
  },

  /**
   * 1. MÁSCARA DE VALOR (R$ brasileiro)
   */
  setupMascaraValor: function() {
    var input = UTILS.obterElemento('novo-valor');
    if (!input) return;

    var atualizarValor = UTILS.debounce(function() {
      INIT_FORM.atualizarParcelaPreview();
      INIT_FORM.atualizarOrcamentoPreview();
    }, 100);

    input.addEventListener('input', function() {
      var raw = this.value.replace(/\D/g, '');
      if (raw === '') { 
        this.value = ''; 
        INIT_FORM.atualizarParcelaPreview(); 
        INIT_FORM.atualizarOrcamentoPreview(); 
        return; 
      }
      var num = parseInt(raw, 10);
      var formatted = (num / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
      this.value = formatted;
      atualizarValor();
    });

    input.addEventListener('keydown', function(e) {
      if (e.key === 'Enter') { 
        e.preventDefault(); 
        UTILS.obterElemento('novo-descricao').focus(); 
      }
    });
  },

  /**
   * 2. GRID DE CATEGORIAS
   */
  setupCategoriaGrid: function() {
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
      INIT_FORM.atualizarTipoIndicator(tipo);
      INIT_FORM.atualizarOrcamentoPreview();

      var grupoParcelas = UTILS.obterElemento('grupo-parcelas');
      if (grupoParcelas) {
        grupoParcelas.style.display = tipo === 'receita' ? 'none' : '';
      }
    });
  },

  setupTipoToggle: function() {
    document.querySelectorAll('.tipo-btn').forEach(function(btn) {
      btn.addEventListener('click', function() {
        var tipo = this.dataset.tipo;
        document.getElementById('novo-tipo').value = tipo;
        INIT_FORM.atualizarTipoIndicator(tipo);
        var grupoParcelas = document.getElementById('grupo-parcelas');
        if (grupoParcelas) grupoParcelas.style.display = tipo === 'receita' ? 'none' : '';
        INIT_FORM.atualizarOrcamentoPreview();
      });
    });
    // Estado inicial: despesa
    INIT_FORM.filtrarCategoriasPorTipo('despesa');
  },

  atualizarTipoIndicator: function(tipo) {
    document.querySelectorAll('.tipo-btn').forEach(function(btn) {
      btn.classList.toggle('ativo', btn.dataset.tipo === tipo);
    });
    var hero = document.getElementById('valor-hero');
    if (hero) {
      hero.classList.toggle('tipo-receita', tipo === 'receita');
      hero.classList.toggle('tipo-despesa', tipo === 'despesa');
    }
    INIT_FORM.filtrarCategoriasPorTipo(tipo);
  },

  /**
   * 3. CHIPS DE DATA RÁPIDA
   */
  setupDateChips: function() {
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
  },

  /**
   * 4. EXTRAS TOGGLE
   */
  setupExtrasToggle: function() {
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
  },

  /**
   * 5. RECORRÊNCIA
   */
  setupRecorrencia: function() {
    var chk = document.getElementById('chk-recorrente');
    var opcoes = document.getElementById('recorrencia-opcoes');
    if (!chk || !opcoes) return;

    chk.addEventListener('change', function() {
      opcoes.style.display = this.checked ? 'flex' : 'none';
      // Desabilitar parcelamento se recorrente
      if (this.checked) {
        var chkParc = document.getElementById('chk-parcelado');
        if (chkParc) { 
          chkParc.checked = false; 
          chkParc.dispatchEvent(new Event('change')); 
        }
      }
    });

    opcoes.addEventListener('click', function(e) {
      var chip = e.target.closest('.rec-chip');
      if (!chip) return;
      opcoes.querySelectorAll('.rec-chip').forEach(function(c) { c.classList.remove('ativo'); });
      chip.classList.add('ativo');
    });
  },

  /**
   * 6. PARCELAMENTO
   */
  setupParcelamento: function() {
    var chk = document.getElementById('chk-parcelado');
    var opcoes = document.getElementById('parcelas-opcoes');
    if (!chk || !opcoes) return;

    chk.addEventListener('change', function() {
      opcoes.style.display = this.checked ? 'block' : 'none';
      if (this.checked) {
        var chkRec = document.getElementById('chk-recorrente');
        if (chkRec) { 
          chkRec.checked = false; 
          chkRec.dispatchEvent(new Event('change')); 
        }
      }
      INIT_FORM.atualizarParcelaPreview();
    });
  },

  setupParcelaPreview: function() {
    var numInput = document.getElementById('num-parcelas');
    if (!numInput) return;
    numInput.addEventListener('input', INIT_FORM.atualizarParcelaPreview);
  },

  atualizarParcelaPreview: function() {
    var chk = document.getElementById('chk-parcelado');
    var txt = document.getElementById('parcela-valor-txt');
    if (!txt) return;
    if (!chk || !chk.checked) { txt.textContent = ''; return; }
    var val = INIT_FORM.obterValorNumerico();
    var n = parseInt(document.getElementById('num-parcelas').value, 10) || 2;
    if (val > 0 && n >= 2) {
      txt.textContent = n + 'x de ' + UTILS.formatarMoeda(val / n);
    } else {
      txt.textContent = '';
    }
  },

  /**
   * 7. AUTO-CATEGORIZAÇÃO
   */
  setupAutoCategorizacao: function() {
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
          INIT_FORM.aplicarSugestaoCategoria(sugestao);
        } else {
          INIT_FORM.limparSugestaoCategoria();
        }
      }, 300);
    });
  },

  aplicarSugestaoCategoria: function(sugestao) {
    // Selecionar no grid
    var grid = document.getElementById('categoria-grid');
    if (grid) {
      grid.querySelectorAll('.cat-btn').forEach(function(b) { b.classList.remove('ativo'); });
      var target = grid.querySelector('[data-cat="' + sugestao.categoria + '"]');
      if (target) target.classList.add('ativo');
    }

    document.getElementById('novo-categoria').value = sugestao.categoria;
    document.getElementById('novo-tipo').value = sugestao.tipo;
    INIT_FORM.atualizarTipoIndicator(sugestao.tipo);

    // Badge
    var badge = document.getElementById('sugestao-badge');
    if (badge) {
      var nome = sugestao.categoria.charAt(0).toUpperCase() + sugestao.categoria.slice(1);
      var emoji = sugestao.tipo === 'receita' ? '💚' : '❤️';
      badge.textContent = emoji + ' Auto: ' + nome;
      badge.style.display = 'block';
    }

    INIT_FORM.atualizarOrcamentoPreview();

    // Esconder parcelamento para receitas
    var grupoParcelas = document.getElementById('grupo-parcelas');
    if (grupoParcelas) {
      grupoParcelas.style.display = sugestao.tipo === 'receita' ? 'none' : '';
    }
  },

  limparSugestaoCategoria: function() {
    var badge = document.getElementById('sugestao-badge');
    if (badge) badge.style.display = 'none';
  },

  /**
   * 8. AUTOCOMPLETE
   */
  setupAutocomplete: function() {
    var input = document.getElementById('novo-descricao');
    var list = document.getElementById('autocomplete-list');
    if (!input || !list) return;

    input.addEventListener('input', function() {
      var texto = this.value.trim().toLowerCase();
      list.innerHTML = '';
      if (texto.length < 2) { list.style.display = 'none'; return; }

      var descricoes = INIT_FORM.obterDescricoesAnteriores();
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
  },

  /**
   * 9. ENTRADA RÁPIDA
   */
  setupEntradaRapida: function() {
    // Renderizado quando aba 'novo' é ativada
  },

  renderQuickEntries: function() {
    var container = document.getElementById('quick-entries');
    if (!container) return;

    var frequentes = INIT_FORM.obterTransacoesFrequentes();
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
      INIT_FORM.preencherFormRapido(chip.dataset);
    });
  },

  /**
   * 10. SUBMIT DO FORMULÁRIO
   */
  setupFormSubmit: function() {
    var form = document.getElementById('form-transacao');
    if (!form) return;

    form.addEventListener('submit', function(e) {
      e.preventDefault();
      INIT_FORM.handleFormSubmit(e);
    });

    // Form de orçamento
    var formOrc = document.getElementById('form-orcamentos');
    if (formOrc) {
      formOrc.addEventListener('submit', function(e) {
        e.preventDefault();
        INIT_FORM.handleOrcamentoSubmit(e);
      });
    }
  },

  handleFormSubmit: function(e) {
    try {
      var tipo = document.getElementById('novo-tipo').value || CONFIG.TIPO_DESPESA;
      var valor = INIT_FORM.obterValorNumerico();
      var categoria = document.getElementById('novo-categoria').value;
      var data = document.getElementById('novo-data').value;
      var descricao = document.getElementById('novo-descricao').value;
      var banco = document.getElementById('novo-banco') ? document.getElementById('novo-banco').value : '';
      var cartao = document.getElementById('novo-cartao') ? document.getElementById('novo-cartao').value : '';
      var nota = document.getElementById('novo-nota') ? document.getElementById('novo-nota').value : '';

      // Detectar sugestão (para feedback loop)
      var sugestaoOriginal = null;
      if (descricao && typeof CATEGORIAS !== 'undefined') {
        sugestaoOriginal = CATEGORIAS.detectar(descricao);
      }

      // Auto-categorizar se nenhuma categoria selecionada
      if (!categoria && sugestaoOriginal) {
        tipo = sugestaoOriginal.tipo;
        categoria = sugestaoOriginal.categoria;
      }

      // Feedback loop
      if (sugestaoOriginal && sugestaoOriginal.categoria &&
          categoria && categoria !== sugestaoOriginal.categoria &&
          typeof APRENDIZADO !== 'undefined' && APRENDIZADO.registrarCorrecao) {
        APRENDIZADO.registrarCorrecao(descricao, sugestaoOriginal.categoria, categoria);
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

      INIT_FORM.processarTransacao(tipo, valor, categoria, data, descricao, banco, cartao, nota);
    } catch (erro) {
      UTILS.mostrarToast(erro.message, 'error');
    }
  },

  /**
   * 11. UTILITÁRIOS
   */
  obterValorNumerico: function() {
    var input = document.getElementById('novo-valor');
    if (!input || !input.value) return 0;
    var clean = input.value.replace(/\./g, '').replace(',', '.');
    var val = parseFloat(clean);
    return isNaN(val) ? 0 : val;
  },

  obterDescricoesAnteriores: function() {
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
  },

  obterTransacoesFrequentes: function() {
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
  },

  preencherFormRapido: function(data) {
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
    INIT_FORM.atualizarTipoIndicator(data.tipo);
    INIT_FORM.atualizarOrcamentoPreview();

    // Scroll para o botão registrar
    var btnReg = document.querySelector('.btn-registrar');
    if (btnReg) btnReg.scrollIntoView({ behavior: 'smooth', block: 'center' });
  },

  atualizarOrcamentoPreview: function() {
    var el = document.getElementById('orcamento-preview');
    if (!el) return;
    var cat = document.getElementById('novo-categoria').value;
    var tipo = document.getElementById('novo-tipo').value;
    var val = INIT_FORM.obterValorNumerico();

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
  },

  processarTransacao: function(tipo, valor, categoria, data, descricao, banco, cartao, nota) {
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
      INIT_FORM.mostrarSucesso(nParcelas + ' parcelas de ' + UTILS.formatarMoeda(valorParcela) + ' registradas!');
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
      INIT_FORM.mostrarSucesso('Recorrência ' + freq + ' criada!');
    }
    // NORMAL
    else {
      TRANSACOES.criar(tipo, valor, categoria, data, descFinal, banco, cartao);
      if (typeof APRENDIZADO !== 'undefined') {
        APRENDIZADO.registrar(descricao, tipo, categoria, banco, cartao, valor);
      }
      INIT_FORM.mostrarSucesso('Registrado!');
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
      INIT_FORM.limparFormularioParcial();
    } else {
      INIT_FORM.limparFormularioCompleto(document.getElementById('form-transacao'));
    }
  },

  mostrarSucesso: function(msg) {
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
  },

  limparFormularioParcial: function() {
    var vi = document.getElementById('novo-valor');
    var di = document.getElementById('novo-descricao');
    if (vi) vi.value = '';
    if (di) di.value = '';
    // Resetar _manualSet para permitir auto-categorização no próximo lançamento
    var catEl = document.getElementById('novo-categoria');
    if (catEl) catEl._manualSet = false;
    INIT_FORM.limparSugestaoCategoria();
    var orc = document.getElementById('orcamento-preview');
    if (orc) orc.innerHTML = '';
    if (vi) setTimeout(function() { vi.focus(); }, 500);
  },

  limparFormularioCompleto: function(form) {
    form.reset();
    var erFeedback = document.getElementById('er-feedback');
    if (erFeedback) erFeedback.style.display = 'none';
    // Resetar grid categorias
    var grid = document.getElementById('categoria-grid');
    if (grid) grid.querySelectorAll('.cat-btn').forEach(function(b) { b.classList.remove('ativo'); });
    var catElReset = document.getElementById('novo-categoria');
    catElReset.value = '';
    catElReset._manualSet = false; // Libera auto-preenchimento
    document.getElementById('novo-tipo').value = 'despesa';
    INIT_FORM.atualizarTipoIndicator('despesa');
    INIT_FORM.limparSugestaoCategoria();
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
    INIT_FORM.renderQuickEntries();
  },

  handleOrcamentoSubmit: function(e) {
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
  },

  // Métodos auxiliares para categorias
  filtrarCategoriasPorTipo: function(tipo) {
    INIT_FORM.renderCategoriasBtns(tipo);
  },

  renderCategoriasBtns: function(tipo) {
    var grid = document.getElementById('categoria-grid');
    if (!grid) return;

    var defaultSlugs = tipo === 'receita'
      ? (CONFIG.CATEGORIAS_RECEITA || CONFIG.CATEGORIAS_RECEITA_SLUGS || [])
      : (CONFIG.CATEGORIAS_DESPESA || CONFIG.CATEGORIAS_DESPESA_SLUGS || []);

    var config = DADOS.getConfig();
    var customNomes = (config.categoriasCustom && config.categoriasCustom[tipo]) || [];

    var currentCat = (document.getElementById('novo-categoria') || {}).value || '';

    var html = '';
    defaultSlugs.forEach(function(slug) {
      var emoji = INIT_FORM.CAT_EMOJIS[slug] || '📌';
      var label = UTILS.labelCategoria(slug);
      var isAtivo = currentCat === slug ? ' ativo' : '';
      html += '<button type="button" class="cat-btn' + isAtivo + '" data-cat="' + slug + '" data-tipo="' + tipo + '">' +
        '<span class="cat-emoji">' + emoji + '</span>' +
        '<span class="cat-nome">' + label + '</span>' +
        '</button>';
    });

    customNomes.forEach(function(nome) {
      var isAtivo = currentCat === nome ? ' ativo' : '';
      html += '<button type="button" class="cat-btn' + isAtivo + '" data-cat="' + nome + '" data-tipo="' + tipo + '">' +
        '<span class="cat-emoji">✨</span>' +
        '<span class="cat-nome">' + nome + '</span>' +
        '</button>';
    });

    grid.innerHTML = html;

    var catEl = document.getElementById('novo-categoria');
    if (catEl && catEl.value && !grid.querySelector('.cat-btn.ativo')) {
      catEl.value = '';
      catEl._manualSet = false;
    }
  }
};

// Emojis por categoria
INIT_FORM.CAT_EMOJIS = {
  alimentacao: '🍔', transporte: '🚗', moradia: '🏠', saude: '⚕️',
  educacao: '📚', lazer: '🎬', outro: '📌', outros: '📌',
  salario: '💰', freelance: '💻', investimentos: '📈', vendas: '🛒'
};

// Export para compatibilidade
if (typeof module !== 'undefined' && module.exports) {
  module.exports = INIT_FORM;
}
