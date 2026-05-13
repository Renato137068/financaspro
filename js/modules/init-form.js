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
      this.setupContextoCategorizacao,
      this.setupSmartDescriptionSuggestions,
      this.setupPaymentContextChips,
      this.setupAutocomplete,
      this.setupFormSubmit,
      this.setupParcelaPreview,
      this.setupFormProgress
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
    // Categoria fica oculta, atuando por trás (IA define automaticamente)
    grid.style.display = 'none';
    if (grid.parentElement) grid.parentElement.style.display = 'none';

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
      INIT_FORM.atualizarProgressoFormulario();

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
    // Estado inicial: despesa (mas Receita aparece primeiro visualmente)
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

  setupFormProgress: function() {
    var campos = ['novo-valor', 'novo-descricao', 'novo-categoria', 'novo-data'];
    campos.forEach(function(id) {
      var el = document.getElementById(id);
      if (!el) return;
      el.addEventListener('input', INIT_FORM.atualizarProgressoFormulario);
      el.addEventListener('change', INIT_FORM.atualizarProgressoFormulario);
      el.addEventListener('input', INIT_FORM.validarCampo);
      el.addEventListener('blur', INIT_FORM.validarCampo);
    });
    INIT_FORM.atualizarProgressoFormulario();
  },

  atualizarProgressoFormulario: function() {
    var campos = ['novo-valor', 'novo-descricao', 'novo-categoria', 'novo-data'];
    var preenchidos = campos.filter(function(id) {
      var el = document.getElementById(id);
      return el && el.value && el.value.trim();
    }).length;
    var progresso = (preenchidos / campos.length) * 100;
    var barra = document.getElementById('form-progress-bar');
    if (barra) barra.style.width = progresso + '%';
  },

  validarCampo: function(e) {
    var el = e.target || e;
    if (!el || !el.id) return;

    var valor = el.value ? el.value.trim() : '';
    var formGroup = el.closest('.form-group');
    var errorMsg = null;

    if (formGroup) {
      errorMsg = formGroup.querySelector('.form-error-message');
    } else {
      // Para campos fora de form-group (como valor)
      var errorId = el.getAttribute('aria-describedby');
      if (errorId) {
        errorMsg = document.getElementById(errorId);
      }
    }

    el.classList.remove('error', 'success');
    if (errorMsg) errorMsg.classList.remove('visible');

    if (!valor) {
      if (el.id === 'novo-valor' || el.id === 'novo-descricao' || el.id === 'novo-data') {
        el.classList.add('error');
        if (errorMsg) {
          errorMsg.textContent = 'Campo obrigatório';
          errorMsg.classList.add('visible');
        }
      }
    } else {
      el.classList.add('success');
    }
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
    var card = document.getElementById('ia-deteccao-card');
    if (!descInput) return;

    // Esconder card inicialmente
    if (card) card.style.display = 'none';
    INIT_FORM.renderDeteccaoInteligente(null);

    var timeout = null;
    descInput.addEventListener('input', function() {
      clearTimeout(timeout);
      var texto = this.value;
      timeout = setTimeout(function() {
        if (texto.trim()) {
          if (card) card.style.display = 'block';
          var sugestao = INIT_FORM.obterSugestaoContextual(texto);
          if (sugestao) {
            INIT_FORM.aplicarSugestaoCategoria(sugestao);
          } else {
            INIT_FORM.limparSugestaoCategoria();
          }
        } else {
          if (card) card.style.display = 'none';
          INIT_FORM.limparSugestaoCategoria();
        }
      }, 300);
    });
  },

  setupContextoCategorizacao: function() {
    var ids = ['novo-valor', 'novo-banco', 'novo-cartao', 'novo-data'];
    var atualizar = UTILS.debounce(function() {
      var descInput = document.getElementById('novo-descricao');
      if (!descInput || !descInput.value.trim()) return;
      INIT_FORM.atualizarPaymentChipsAtivos();
      var sugestao = INIT_FORM.obterSugestaoContextual(descInput.value);
      if (sugestao) INIT_FORM.aplicarSugestaoCategoria(sugestao);
    }, 300);

    ids.forEach(function(id) {
      var el = document.getElementById(id);
      if (!el) return;
      el.addEventListener('input', atualizar);
      el.addEventListener('change', atualizar);
    });
  },

  setupSmartDescriptionSuggestions: function() {
    INIT_FORM.renderSmartDescriptionSuggestions();
  },

  setupPaymentContextChips: function() {
    INIT_FORM.renderPaymentContextChips();
  },

  aplicarSugestaoCategoria: function(sugestao) {
    var confianca = sugestao.confianca || 'baixa';
    var deveAplicar = confianca === 'alta' || sugestao.confirmada === true;
    INIT_FORM._iaSuggestion = sugestao;
    INIT_FORM._iaConfirmed = sugestao.confirmada === true;

    INIT_FORM.renderDeteccaoInteligente(sugestao);

    if (!deveAplicar) {
      var catElPendente = document.getElementById('novo-categoria');
      if (catElPendente && !catElPendente._manualSet) catElPendente.value = '';
      return;
    }

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

    INIT_FORM.atualizarOrcamentoPreview();
    INIT_FORM.atualizarProgressoFormulario();

    // Esconder parcelamento para receitas
    var grupoParcelas = document.getElementById('grupo-parcelas');
    if (grupoParcelas) {
      grupoParcelas.style.display = sugestao.tipo === 'receita' ? 'none' : '';
    }
  },

  limparSugestaoCategoria: function() {
    INIT_FORM._iaSuggestion = null;
    INIT_FORM._iaConfirmed = false;
    INIT_FORM.renderDeteccaoInteligente(null);
  },

  renderDeteccaoInteligente: function(sugestao) {
    var card = document.getElementById('ia-deteccao-card');
    if (!card) return;

    var badge = document.getElementById('ia-confidence-badge');
    var icon = document.getElementById('ia-category-icon');
    var title = document.getElementById('ia-category-title');
    var subtitle = document.getElementById('ia-category-subtitle');
    var context = document.getElementById('ia-context-list');
    var savePreview = document.getElementById('ia-save-preview');
    var actions = document.getElementById('ia-action-list');
    var desc = (document.getElementById('novo-descricao') || {}).value || '';

    card.classList.remove('ia-alta', 'ia-media', 'ia-baixa', 'ia-empty', 'ia-updated');
    void card.offsetWidth;
    card.classList.add('ia-updated');

    if (!sugestao || !desc.trim()) {
      card.classList.add('ia-empty');
      if (badge) { badge.className = 'ia-confidence-badge neutral'; badge.textContent = 'Aguardando descrição'; }
      if (icon) icon.textContent = 'AI';
      if (title) title.textContent = 'Digite uma descrição';
      if (subtitle) subtitle.textContent = 'A IA analisará automaticamente este lançamento.';
      if (context) {
        context.innerHTML = '<span>Contexto financeiro</span><span>Histórico recente</span><span>Padrões anteriores</span>';
      }
      if (savePreview) savePreview.textContent = 'Categoria final: aguardando análise';
      if (actions) actions.innerHTML = '';
      return;
    }

    var confianca = sugestao.confianca || 'baixa';
    var label = UTILS.labelCategoria(sugestao.categoria || 'outro');
    var emoji = INIT_FORM.CAT_EMOJIS[sugestao.categoria] || 'AI';
    var textos = {
      alta: {
        badge: 'Alta confiança',
        title: label,
        subtitle: 'Categoria detectada e aplicada automaticamente.'
      },
      media: {
        badge: 'Média confiança',
        title: 'Talvez seja ' + label,
        subtitle: 'Sugestão pronta para confirmar em um toque.'
      },
      baixa: {
        badge: 'Baixa confiança',
        title: 'Não tenho certeza da categoria',
        subtitle: 'Vou observar mais contexto antes de aplicar automaticamente.'
      }
    };
    var copy = textos[confianca] || textos.baixa;
    var aplicada = confianca === 'alta' || sugestao.confirmada === true;

    card.classList.add('ia-' + confianca);
    if (badge) { badge.className = 'ia-confidence-badge ' + confianca; badge.textContent = copy.badge; }
    if (icon) icon.textContent = emoji;
    if (title) title.textContent = copy.title;
    if (subtitle) subtitle.textContent = copy.subtitle;
    if (savePreview) {
      savePreview.textContent = aplicada
        ? 'Será salvo como: ' + label
        : 'Pendente: confirme ' + label + ' ou será salvo como Outro';
      savePreview.className = 'ia-save-preview ' + (aplicada ? 'aplicada' : 'pendente');
    }

    if (context) {
      var contexto = sugestao.contexto || {};
      var razoes = contexto.razoes && contexto.razoes.length ? contexto.razoes.slice(0, 3) : [
        'Padrão de descrição detectado',
        'Aprendizado ativo',
        'Contexto financeiro'
      ];
      var partes = razoes.map(function(r) {
        return '<span>' + UTILS.escapeHtml(r) + '</span>';
      });
      if (confianca === 'media') {
        partes.push('<button type="button" class="ia-confirm-btn" id="ia-confirm-category">Confirmar ' + UTILS.escapeHtml(label) + '</button>');
      }
      context.innerHTML = partes.join('');
      var confirmBtn = document.getElementById('ia-confirm-category');
      if (confirmBtn) {
        confirmBtn.addEventListener('click', function() {
          var confirmada = Object.assign({}, INIT_FORM._iaSuggestion || sugestao, { confirmada: true, confianca: 'alta' });
          INIT_FORM.aplicarSugestaoCategoria(confirmada);
          INIT_FORM.mostrarFeedbackAprendizado('Sugestão confirmada. Aprendizado atualizado.');
        });
      }
    }

    if (actions) {
      if (confianca === 'baixa') {
        var alternativas = (sugestao.contexto && sugestao.contexto.alternativas) || [];
        actions.innerHTML = '<span class="ia-action-hint">Escolha uma categoria para me ensinar</span>' +
          alternativas.slice(0, 3).map(function(alt) {
            return '<button type="button" class="ia-alt-btn" data-cat="' + UTILS.escapeHtml(alt.categoria) + '" data-tipo="' + UTILS.escapeHtml(alt.tipo || 'despesa') + '">' +
              UTILS.escapeHtml(UTILS.labelCategoria(alt.categoria)) + '</button>';
          }).join('');
        actions.querySelectorAll('.ia-alt-btn').forEach(function(btn) {
          btn.addEventListener('click', function() {
            var confirmada = {
              categoria: this.dataset.cat,
              tipo: this.dataset.tipo || 'despesa',
              confianca: 'alta',
              confirmada: true,
              contexto: { razoes: ['Categoria ensinada manualmente', 'Aprendizado ativo'] }
            };
            INIT_FORM.aplicarSugestaoCategoria(confirmada);
            INIT_FORM.mostrarFeedbackAprendizado('Entendido. Vou melhorar as próximas sugestões.');
          });
        });
      } else {
        actions.innerHTML = '';
      }
    }
  },

  mostrarFeedbackAprendizado: function(msg) {
    var el = document.getElementById('ia-learning-feedback');
    if (!el) return;
    el.textContent = msg || 'Entendido. Vou melhorar as próximas sugestões.';
    el.classList.add('visivel');
    clearTimeout(INIT_FORM._iaLearningTimer);
    INIT_FORM._iaLearningTimer = setTimeout(function() {
      el.classList.remove('visivel');
    }, 2600);
  },

  detectarRecorrenciaDescricao: function(desc) {
    if (!desc || typeof TRANSACOES === 'undefined') return false;
    var base = String(desc).toLowerCase().trim();
    var txs = TRANSACOES.obter({}) || [];
    var matches = txs.filter(function(t) {
      return t.descricao && String(t.descricao).toLowerCase().indexOf(base) > -1;
    });
    return matches.length >= 2;
  },

  obterSugestaoContextual: function(descricao) {
    if (!descricao || !String(descricao).trim()) return null;

    var contexto = INIT_FORM.obterContextoLancamento(descricao);
    var candidatos = {};

    function add(cat, tipo, pontos, razao, fonte) {
      if (!cat) return;
      candidatos[cat] = candidatos[cat] || {
        categoria: cat,
        tipo: tipo || (typeof CATEGORIES !== 'undefined' ? CATEGORIES.getTipo(cat) : 'despesa'),
        pontos: 0,
        razoes: [],
        fontes: {}
      };
      candidatos[cat].pontos += pontos;
      if (razao && candidatos[cat].razoes.indexOf(razao) === -1) candidatos[cat].razoes.push(razao);
      if (fonte) candidatos[cat].fontes[fonte] = true;
    }

    var base = null;
    if (typeof CATEGORIZADOR !== 'undefined' && typeof CATEGORIZADOR.detectar === 'function') {
      base = CATEGORIZADOR.detectar(descricao);
    }
    if (!base && typeof CATEGORIAS !== 'undefined' && typeof CATEGORIAS.detectar === 'function') {
      base = CATEGORIAS.detectar(descricao);
    }
    if (base) {
      add(base.categoria, base.tipo, base.confianca === 'alta' ? 42 : 26, 'Padrão semântico da descrição', 'regras');
    }

    var aprendida = typeof APRENDIZADO !== 'undefined' && APRENDIZADO.sugerir
      ? APRENDIZADO.sugerir(descricao)
      : null;
    if (aprendida) {
      add(aprendida.categoria, aprendida.tipo, 18 + Math.min((aprendida.contador || 0) * 3, 18), 'Correções e usos anteriores', 'aprendizado');
      if (aprendida.banco && contexto.banco && aprendida.banco === contexto.banco) {
        add(aprendida.categoria, aprendida.tipo, 8, 'Mesmo banco usado antes', 'banco');
      }
      if (aprendida.cartao && contexto.cartao && aprendida.cartao === contexto.cartao) {
        add(aprendida.categoria, aprendida.tipo, 8, 'Mesmo cartão usado antes', 'cartao');
      }
      if (aprendida.mediaValor && contexto.valor > 0) {
        var diffApr = Math.abs(contexto.valor - aprendida.mediaValor) / Math.max(aprendida.mediaValor, 1);
        if (diffApr <= 0.25) add(aprendida.categoria, aprendida.tipo, 7, 'Valor próximo ao padrão aprendido', 'valor');
      }
    }

    contexto.matches.forEach(function(match) {
      var tx = match.tx;
      var peso = match.exata ? 30 : 16;
      if (match.prefixo) peso += 6;
      if (match.valorProximo) peso += 10;
      if (match.mesmoBanco) peso += 7;
      if (match.mesmoCartao) peso += 7;
      if (match.diaMesProximo) peso += 5;
      if (match.recente) peso += 4;
      add(tx.categoria, tx.tipo, peso, match.exata ? 'Descrição já registrada antes' : 'Histórico parecido encontrado', 'historico');
      if (match.valorProximo) add(tx.categoria, tx.tipo, 0, 'Valor compatível com lançamentos anteriores', 'valor');
      if (match.diaMesProximo) add(tx.categoria, tx.tipo, 0, 'Dia do mês parecido', 'data');
      if (match.mesmoBanco || match.mesmoCartao) add(tx.categoria, tx.tipo, 0, 'Meio de pagamento compatível', 'pagamento');
    });

    contexto.recorrentes.forEach(function(rec) {
      add(rec.categoria, rec.tipo, 24, 'Recorrência cadastrada semelhante', 'recorrencia');
    });

    var melhor = null;
    Object.keys(candidatos).forEach(function(cat) {
      if (!melhor || candidatos[cat].pontos > melhor.pontos) melhor = candidatos[cat];
    });
    var alternativas = Object.keys(candidatos).map(function(cat) {
      return candidatos[cat];
    }).sort(function(a, b) {
      return b.pontos - a.pontos;
    }).filter(function(item) {
      return item.categoria !== (melhor && melhor.categoria);
    });

    if (!melhor) {
      return {
        categoria: 'outro',
        tipo: 'despesa',
        confianca: 'baixa',
        contexto: {
          razoes: ['Pouco histórico para comparar'],
          alternativas: INIT_FORM.obterCategoriasAlternativas('despesa')
        }
      };
    }

    var confianca = melhor.pontos >= 58 ? 'alta' : (melhor.pontos >= 34 ? 'media' : 'baixa');
    return {
      categoria: melhor.categoria,
      tipo: melhor.tipo || 'despesa',
      confianca: confianca,
      score: Math.round(melhor.pontos),
      contexto: {
        razoes: melhor.razoes,
        fontes: Object.keys(melhor.fontes),
        matches: contexto.matches.length,
        recorrencia: contexto.recorrentes.length > 0,
        alternativas: alternativas.length ? alternativas : INIT_FORM.obterCategoriasAlternativas(melhor.tipo)
      }
    };
  },

  obterCategoriasAlternativas: function(tipo) {
    var lista = [];
    var slugs = tipo === 'receita'
      ? (CONFIG.CATEGORIAS_RECEITA || CONFIG.CATEGORIAS_RECEITA_SLUGS || ['salario','freelance','investimentos'])
      : (CONFIG.CATEGORIAS_DESPESA || CONFIG.CATEGORIAS_DESPESA_SLUGS || ['alimentacao','transporte','moradia']);
    slugs.slice(0, 4).forEach(function(slug, i) {
      lista.push({ categoria: slug, tipo: tipo || 'despesa', pontos: 10 - i });
    });
    return lista;
  },

  obterContextoLancamento: function(descricao) {
    var descNorm = INIT_FORM.normalizarTexto(descricao);
    var valor = INIT_FORM.obterValorNumerico();
    var bancoEl = document.getElementById('novo-banco');
    var cartaoEl = document.getElementById('novo-cartao');
    var dataEl = document.getElementById('novo-data');
    var banco = bancoEl ? bancoEl.value : '';
    var cartao = cartaoEl ? cartaoEl.value : '';
    var data = dataEl ? dataEl.value : '';
    var dia = data ? new Date(data + 'T12:00:00').getDate() : null;
    var txs = typeof TRANSACOES !== 'undefined' ? (TRANSACOES.obter({}) || []) : [];
    var config = typeof DADOS !== 'undefined' && DADOS.getConfig ? DADOS.getConfig() : {};
    var recorrentes = Array.isArray(config.recorrentes) ? config.recorrentes : [];
    var tokens = descNorm.split(/\s+/).filter(function(t) { return t.length >= 3; });

    var matches = txs.map(function(tx) {
      if (!tx.descricao || !tx.categoria) return null;
      var txDesc = INIT_FORM.normalizarTexto(tx.descricao);
      var common = tokens.filter(function(t) { return txDesc.indexOf(t) > -1; }).length;
      var exata = txDesc === descNorm;
      var prefixo = txDesc.indexOf(descNorm) === 0 || descNorm.indexOf(txDesc) === 0;
      if (!exata && !prefixo && common === 0) return null;
      var txValor = Number(tx.valor) || 0;
      var valorProximo = valor > 0 && txValor > 0 && Math.abs(valor - txValor) / Math.max(txValor, 1) <= 0.25;
      var txDia = tx.data ? new Date(String(tx.data).slice(0, 10) + 'T12:00:00').getDate() : null;
      var diaMesProximo = dia && txDia && Math.abs(dia - txDia) <= 3;
      var dataTx = tx.data ? new Date(String(tx.data).slice(0, 10) + 'T12:00:00') : null;
      var recente = dataTx && ((Date.now() - dataTx.getTime()) / 86400000) <= 120;
      return {
        tx: tx,
        exata: exata,
        prefixo: prefixo,
        valorProximo: valorProximo,
        mesmoBanco: !!(banco && tx.banco === banco),
        mesmoCartao: !!(cartao && tx.cartao === cartao),
        diaMesProximo: diaMesProximo,
        recente: recente,
        common: common
      };
    }).filter(Boolean).sort(function(a, b) {
      return (b.exata - a.exata) || (b.common - a.common);
    }).slice(0, 12);

    var recMatches = recorrentes.filter(function(rec) {
      if (!rec.descricao || !rec.categoria) return false;
      var recDesc = INIT_FORM.normalizarTexto(rec.descricao);
      return recDesc.indexOf(descNorm) > -1 || descNorm.indexOf(recDesc) > -1 ||
        tokens.some(function(t) { return recDesc.indexOf(t) > -1; });
    }).slice(0, 4);

    return {
      descricao: descNorm,
      valor: valor,
      banco: banco,
      cartao: cartao,
      data: data,
      dia: dia,
      matches: matches,
      recorrentes: recMatches
    };
  },

  normalizarTexto: function(texto) {
    return String(texto || '')
      .toLowerCase()
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .replace(/[^\w\s]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  },

  /**
   * 8. AUTOCOMPLETE
   */
  setupAutocomplete: function() {
    var input = document.getElementById('novo-descricao');
    var list = document.getElementById('autocomplete-list');
    if (!input || !list) return;

    INIT_FORM._autocompleteCache = {};
    INIT_FORM._lastSearchText = '';

    input.addEventListener('input', function() {
      var texto = this.value.trim().toLowerCase();
      list.innerHTML = '';
      if (texto.length < 2) { list.style.display = 'none'; return; }

      var descricoes = INIT_FORM.obterSugestoesDescricao();

      var cacheKey = texto.substring(0, 3);
      if (!INIT_FORM._autocompleteCache[cacheKey]) {
        INIT_FORM._autocompleteCache[cacheKey] = descricoes;
      }

      var filtradas = INIT_FORM._autocompleteCache[cacheKey].filter(function(item) {
        return item.descricao.toLowerCase().indexOf(texto) > -1;
      }).slice(0, 5);

      if (filtradas.length === 0) { list.style.display = 'none'; return; }

      filtradas.forEach(function(sug) {
        var el = document.createElement('div');
        el.className = 'autocomplete-item autocomplete-rich-item';
        el.dataset.desc = sug.descricao;
        el.innerHTML =
          '<div class="auto-title">' + UTILS.escapeHtml(sug.descricao) + '</div>' +
          '<div class="auto-meta">Último lançamento: ' + UTILS.formatarMoeda(sug.valor || 0) +
          (sug.cartao ? ' · ' + UTILS.escapeHtml(sug.cartao) : '') +
          (sug.banco ? ' · ' + UTILS.escapeHtml(sug.banco) : '') +
          (sug.recorrente ? ' · Recorrente mensal' : '') + '</div>';
        el.addEventListener('mousedown', function(e) {
          e.preventDefault();
          input.value = el.dataset.desc;
          list.style.display = 'none';
          input.dispatchEvent(new Event('input', { bubbles: true }));
        });
        list.appendChild(el);
      });
      list.style.display = 'block';
    });

    input.addEventListener('blur', function() {
      setTimeout(function() { list.style.display = 'none'; }, 150);
    });
  },

  renderSmartDescriptionSuggestions: function() {
    var container = document.getElementById('smart-description-suggestions');
    if (!container) return;
    var sugestoes = INIT_FORM.obterSugestoesDescricao().slice(0, 3);
    if (!sugestoes.length) {
      container.innerHTML = '<span class="smart-empty">Sugestões recentes aparecerão aqui quando houver histórico.</span>';
      return;
    }
    container.innerHTML = sugestoes.map(function(sug) {
      return '<button type="button" class="smart-desc-chip" data-desc="' + UTILS.escapeHtml(sug.descricao) + '" data-val="' + Number(sug.valor || 0) + '" data-cat="' + UTILS.escapeHtml(sug.categoria || '') + '" data-tipo="' + UTILS.escapeHtml(sug.tipo || 'despesa') + '">' +
        '<strong>' + UTILS.escapeHtml(sug.descricao) + '</strong>' +
        '<span>' + UTILS.formatarMoeda(sug.valor || 0) + (sug.recorrente ? ' · recorrente' : '') + '</span>' +
      '</button>';
    }).join('');
    container.querySelectorAll('.smart-desc-chip').forEach(function(btn) {
      btn.addEventListener('click', function() {
        INIT_FORM.preencherFormRapido(this.dataset);
        var descInput = document.getElementById('novo-descricao');
        if (descInput) descInput.dispatchEvent(new Event('input', { bubbles: true }));
      });
    });
  },

  renderPaymentContextChips: function() {
    var container = document.getElementById('payment-context-chips');
    if (!container) return;
    var txs = TRANSACOES.obter({}) || [];
    var bancos = {}, cartoes = {};
    txs.forEach(function(t) {
      if (t.banco) bancos[t.banco] = (bancos[t.banco] || 0) + 1;
      if (t.cartao) cartoes[t.cartao] = (cartoes[t.cartao] || 0) + 1;
    });
    function top(map) {
      return Object.keys(map).sort(function(a, b) { return map[b] - map[a]; }).slice(0, 2);
    }
    var html = '<span class="payment-context-label">Contexto rápido</span>';
    top(bancos).forEach(function(b) {
      html += '<button type="button" class="payment-chip" data-kind="banco" data-value="' + UTILS.escapeHtml(b) + '">' + UTILS.escapeHtml(b) + '</button>';
    });
    top(cartoes).forEach(function(c) {
      html += '<button type="button" class="payment-chip" data-kind="cartao" data-value="' + UTILS.escapeHtml(c) + '">' + UTILS.escapeHtml(c) + '</button>';
    });
    if (html.indexOf('payment-chip') === -1) {
      html += '<button type="button" class="payment-chip" data-kind="banco" data-value="Nubank">Nubank</button>' +
        '<button type="button" class="payment-chip" data-kind="cartao" data-value="Crédito">Crédito</button>';
    }
    container.innerHTML = html;
    container.querySelectorAll('.payment-chip').forEach(function(btn) {
      btn.addEventListener('click', function() {
        var target = document.getElementById(this.dataset.kind === 'banco' ? 'novo-banco' : 'novo-cartao');
        if (!target) return;
        target.value = this.dataset.value;
        target.dispatchEvent(new Event('change', { bubbles: true }));
        INIT_FORM.atualizarPaymentChipsAtivos();
      });
    });
    INIT_FORM.atualizarPaymentChipsAtivos();
  },

  atualizarPaymentChipsAtivos: function() {
    var banco = (document.getElementById('novo-banco') || {}).value || '';
    var cartao = (document.getElementById('novo-cartao') || {}).value || '';
    document.querySelectorAll('.payment-chip').forEach(function(btn) {
      var ativo = (btn.dataset.kind === 'banco' && btn.dataset.value === banco) ||
        (btn.dataset.kind === 'cartao' && btn.dataset.value === cartao);
      btn.classList.toggle('ativo', ativo);
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

      // Detectar sugestao com fallback (garante auto-categorizacao no submit)
      var sugestaoOriginal = null;
      if (descricao) {
        sugestaoOriginal = INIT_FORM.obterSugestaoContextual(descricao);
      }

      // Alta confiança aplica automaticamente; média só entra após confirmação.
      var sugestaoConfirmada = INIT_FORM._iaConfirmed === true;
      if (sugestaoOriginal && (sugestaoOriginal.confianca === 'alta' || sugestaoConfirmada)) {
        tipo = sugestaoOriginal.tipo || tipo;
        categoria = sugestaoOriginal.categoria || categoria;
      }
      if (typeof CONFIG !== 'undefined' && typeof CONFIG.normalizeCategoriaFinal === 'function') {
        categoria = CONFIG.normalizeCategoriaFinal(categoria, tipo);
      } else if (!categoria) {
        categoria = tipo === CONFIG.TIPO_RECEITA ? 'outros' : 'outro';
      }

      // Feedback loop
      if (sugestaoOriginal && sugestaoOriginal.categoria &&
          categoria && categoria !== sugestaoOriginal.categoria &&
          typeof APRENDIZADO !== 'undefined' && APRENDIZADO.registrarCorrecao) {
        APRENDIZADO.registrarCorrecao(descricao, sugestaoOriginal.categoria, categoria);
        INIT_FORM.mostrarFeedbackAprendizado('Entendido. Vou melhorar as próximas sugestões.');
      }

      if (!valor || valor <= 0) {
        UTILS.mostrarToast('Informe o valor da transação', 'error');
        if (typeof MICRO !== 'undefined' && MICRO.shakeField) {
          MICRO.shakeField('novo-valor');
        }
        return;
      }
      if (!data) {
        UTILS.mostrarToast('Selecione a data', 'error');
        if (typeof MICRO !== 'undefined' && MICRO.shakeField) {
          MICRO.shakeField('novo-data');
        }
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

  obterSugestoesDescricao: function() {
    var txs = TRANSACOES.obter({}) || [];
    var map = {};
    txs.forEach(function(t) {
      if (!t.descricao || !t.descricao.trim()) return;
      var key = t.descricao.trim();
      if (!map[key]) {
        map[key] = {
          descricao: key,
          categoria: t.categoria,
          tipo: t.tipo,
          valor: t.valor,
          banco: t.banco,
          cartao: t.cartao,
          count: 0,
          meses: {}
        };
      }
      map[key].count++;
      map[key].valor = t.valor;
      map[key].banco = t.banco || map[key].banco;
      map[key].cartao = t.cartao || map[key].cartao;
      if (t.data) map[key].meses[String(t.data).slice(0, 7)] = true;
    });

    return Object.keys(map).map(function(k) {
      var item = map[k];
      item.recorrente = Object.keys(item.meses || {}).length >= 2;
      return item;
    }).sort(function(a, b) {
      return b.count - a.count;
    });
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
        APRENDIZADO.registrar(descricao, categoria, tipo, banco, cartao, valorParcela);
        INIT_FORM.mostrarFeedbackAprendizado('Aprendizado atualizado com sucesso.');
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
        APRENDIZADO.registrar(descricao, categoria, tipo, banco, cartao, valor);
        INIT_FORM.mostrarFeedbackAprendizado('Recorrência aprendida para próximas sugestões.');
      }
      INIT_FORM.mostrarSucesso('Recorrência ' + freq + ' criada!');
    }
    // NORMAL
    else {
      TRANSACOES.criar(tipo, valor, categoria, data, descFinal, banco, cartao);
      if (typeof APRENDIZADO !== 'undefined') {
        APRENDIZADO.registrar(descricao, categoria, tipo, banco, cartao, valor);
        INIT_FORM.mostrarFeedbackAprendizado('Aprendizado atualizado com sucesso.');
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
    INIT_FORM.renderSmartDescriptionSuggestions();
    INIT_FORM.renderPaymentContextChips();

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
    var msgEl   = document.getElementById('success-msg');
    var saldoEl = document.getElementById('success-saldo');
    if (!overlay) { UTILS.mostrarToast(msg, 'success'); return; }

    if (msgEl) msgEl.textContent = msg;
    if (saldoEl) {
      var agora  = new Date();
      var resumo = TRANSACOES.obterResumoMes(agora.getMonth() + 1, agora.getFullYear());
      saldoEl.textContent = 'Saldo do mês: ' + UTILS.formatarMoeda(resumo.saldo);
    }

    /* Reinicia confetti: remove e recria os spans para repetir animação */
    var confetti = overlay.querySelector('.success-confetti');
    if (confetti) {
      var spans = confetti.innerHTML;
      confetti.innerHTML = '';
      confetti.innerHTML = spans;
    }

    overlay.style.display = 'flex';
    overlay.classList.add('animando');

    setTimeout(function() {
      overlay.classList.remove('animando');
      overlay.style.display = 'none';
    }, 1900);
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
    INIT_FORM.renderSmartDescriptionSuggestions();
    INIT_FORM.atualizarPaymentChipsAtivos();
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
    INIT_FORM.renderSmartDescriptionSuggestions();
    INIT_FORM.atualizarPaymentChipsAtivos();
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




