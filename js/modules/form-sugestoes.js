/**
 * form-sugestoes.js — o que o formulário de lançamento sugere enquanto se digita.
 *
 * Autocategorização pela descrição (com contexto de valor, banco, cartão e
 * data), o card de detecção inteligente, os chips de pagamento, as sugestões
 * de descrição e o autocomplete acessível, e a agregação única do histórico
 * que alimenta tudo isso (com cache invalidado ao salvar um lançamento).
 *
 * Saiu de init-form.js, que passava de 2 mil linhas. Os métodos continuam
 * sendo de INIT_FORM: init-form.js os copia com
 * `Object.assign(INIT_FORM, FORM_SUGESTOES)`, e eles se chamam por
 * `INIT_FORM.…`. ES Module (ADR 0005), publicado por js/esm/ponte.js.
 */

import { CONFIG } from '../core/config.js';
import { UTILS } from '../core/utils.js';
import { CATEGORIZADOR } from '../categorizador.js';
import { APRENDIZADO } from '../aprendizado.js';
import { CATEGORIAS } from '../auto-categorizer.js';
import { CATEGORIES } from '../categories.js';
import { TRANSACOES } from '../transacoes.js';
const FORM_SUGESTOES = {
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
    var emoji = INIT_FORM.CAT_ICONS[sugestao.categoria] || 'sparkles';
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
    if (icon) icon.innerHTML = '<i data-lucide="' + emoji + '" aria-hidden="true"></i>';
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
      var altHtml = '';
      if (confianca === 'baixa') {
        var alternativas = (sugestao.contexto && sugestao.contexto.alternativas) || [];
        altHtml = '<span class="ia-action-hint">Escolha uma categoria para me ensinar</span>' +
          alternativas.slice(0, 3).map(function(alt) {
            return '<button type="button" class="ia-alt-btn" data-cat="' + UTILS.escapeHtml(alt.categoria) + '" data-tipo="' + UTILS.escapeHtml(alt.tipo || 'despesa') + '">' +
              UTILS.escapeHtml(UTILS.labelCategoria(alt.categoria)) + '</button>';
          }).join('');
      }
      // Sempre disponível: override manual em qualquer nível de confiança (P1.2)
      actions.innerHTML = altHtml +
        '<button type="button" class="ia-alterar-cat-btn" id="ia-alterar-categoria">' +
        'Alterar categoria</button>';

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

      var alterarBtn = document.getElementById('ia-alterar-categoria');
      if (alterarBtn) {
        alterarBtn.addEventListener('click', function() {
          INIT_FORM.mostrarGridCategoria();
        });
      }
    }

    if (typeof renderLucideIcons === 'function') renderLucideIcons(card);
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
      // Um acerto forte do categorizador (ex.: "Salário", "Aluguel", "Netflix")
      // já basta para autopreencher categoria E tipo — evita que uma receita
      // clara fique como "despesa" (padrão do formulário) por falta de confirmação.
      add(base.categoria, base.tipo, base.confianca === 'alta' ? 60 : 30, 'Padrão semântico da descrição', 'regras');
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
        mesmoBanco: !!(banco && (
          (typeof CONTAS !== 'undefined' && CONTAS.mesmaConta)
            ? CONTAS.mesmaConta(banco, tx.accountId || tx.banco)
            : tx.banco === banco
        )),
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
   * 8. AUTOCOMPLETE — combobox ARIA (teclado + leitor de tela)
   */
  setupAutocomplete: function() {
    var input = document.getElementById('novo-descricao');
    var list = document.getElementById('autocomplete-list');
    if (!input || !list) return;

    INIT_FORM._autocompleteCache = {};
    INIT_FORM._lastSearchText = '';
    INIT_FORM._autoActiveIndex = -1;

    function fecharLista() {
      list.innerHTML = '';
      list.style.display = 'none';
      list.hidden = true;
      input.setAttribute('aria-expanded', 'false');
      input.removeAttribute('aria-activedescendant');
      INIT_FORM._autoActiveIndex = -1;
    }

    function selecionarItem(el) {
      if (!el) return;
      var desc = el.getAttribute('data-desc') || el.dataset.desc || '';
      input.value = desc;
      fecharLista();
      // Evita reabrir a lista no mesmo ciclo; outros listeners de input (IA) seguem.
      INIT_FORM._autoSkipRender = true;
      input.dispatchEvent(new Event('input', { bubbles: true }));
      INIT_FORM._autoSkipRender = false;
    }

    function marcarAtivo(idx) {
      var items = list.querySelectorAll('[role="option"]');
      if (!items.length) return;
      if (idx < 0) idx = items.length - 1;
      if (idx >= items.length) idx = 0;
      INIT_FORM._autoActiveIndex = idx;
      for (var i = 0; i < items.length; i++) {
        var on = i === idx;
        items[i].classList.toggle('ativo', on);
        items[i].setAttribute('aria-selected', on ? 'true' : 'false');
      }
      input.setAttribute('aria-activedescendant', items[idx].id);
      if (items[idx].scrollIntoView) {
        items[idx].scrollIntoView({ block: 'nearest' });
      }
    }

    function renderLista(filtradas) {
      list.innerHTML = '';
      if (!filtradas.length) {
        fecharLista();
        return;
      }
      filtradas.forEach(function(sug, i) {
        var el = document.createElement('div');
        el.className = 'autocomplete-item autocomplete-rich-item';
        el.id = 'autocomplete-opt-' + i;
        el.setAttribute('role', 'option');
        el.setAttribute('aria-selected', 'false');
        el.setAttribute('data-desc', sug.descricao);
        el.innerHTML =
          '<div class="auto-title">' + UTILS.escapeHtml(sug.descricao) + '</div>' +
          '<div class="auto-meta">Último lançamento: ' + UTILS.formatarMoeda(sug.valor || 0) +
          (sug.cartao ? ' · ' + UTILS.escapeHtml(sug.cartao) : '') +
          (sug.banco ? ' · ' + UTILS.escapeHtml(sug.banco) : '') +
          (sug.recorrente ? ' · Recorrente mensal' : '') + '</div>';
        // mousedown + preventDefault: o blur do input não fecha antes do clique
        el.addEventListener('mousedown', function(e) {
          e.preventDefault();
          selecionarItem(el);
        });
        list.appendChild(el);
      });
      list.style.display = 'block';
      list.hidden = false;
      input.setAttribute('aria-expanded', 'true');
      INIT_FORM._autoActiveIndex = -1;
      input.removeAttribute('aria-activedescendant');
    }

    input.addEventListener('input', function() {
      if (INIT_FORM._autoSkipRender) return;
      var self = this;
      clearTimeout(INIT_FORM._autoDebounceTimer);
      INIT_FORM._autoDebounceTimer = setTimeout(function() {
        var texto = self.value.trim().toLowerCase();
        if (texto.length < 2) { fecharLista(); return; }

        var descricoes = INIT_FORM.obterSugestoesDescricao();
        var cacheKey = texto.substring(0, 3);
        if (!INIT_FORM._autocompleteCache[cacheKey]) {
          INIT_FORM._autocompleteCache[cacheKey] = descricoes;
        }

        var filtradas = INIT_FORM._autocompleteCache[cacheKey].filter(function(item) {
          return item.descricao.toLowerCase().indexOf(texto) > -1;
        }).slice(0, 5);

        renderLista(filtradas);
      }, 180);
    });

    input.addEventListener('keydown', function(e) {
      var aberta = input.getAttribute('aria-expanded') === 'true';
      var items = list.querySelectorAll('[role="option"]');
      if (e.key === 'ArrowDown') {
        if (!aberta || !items.length) return;
        e.preventDefault();
        marcarAtivo(INIT_FORM._autoActiveIndex + 1);
      } else if (e.key === 'ArrowUp') {
        if (!aberta || !items.length) return;
        e.preventDefault();
        marcarAtivo(INIT_FORM._autoActiveIndex < 0 ? items.length - 1 : INIT_FORM._autoActiveIndex - 1);
      } else if (e.key === 'Enter') {
        if (aberta && INIT_FORM._autoActiveIndex >= 0 && items[INIT_FORM._autoActiveIndex]) {
          e.preventDefault();
          selecionarItem(items[INIT_FORM._autoActiveIndex]);
        }
      } else if (e.key === 'Escape') {
        if (aberta) {
          e.preventDefault();
          fecharLista();
        }
      }
    });

    input.addEventListener('blur', function() {
      setTimeout(function() { fecharLista(); }, 150);
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

  obterDescricoesAnteriores: function() {
    return INIT_FORM._agregarDescricoes().descricoes;
  },

  obterSugestoesDescricao: function() {
    return INIT_FORM._agregarDescricoes().sugestoes;
  },

  obterTransacoesFrequentes: function() {
    return INIT_FORM._agregarDescricoes().frequentes;
  },

  /**
   * P2.2: uma única varredura de TRANSACOES para sugestões/frequentes/descrições.
   * Cache invalidado em _finalizarTransacao.
   */
  _agregarDescricoes: function() {
    if (INIT_FORM._aggCache) return INIT_FORM._aggCache;

    var txs = (typeof TRANSACOES !== 'undefined' && TRANSACOES.obter)
      ? (TRANSACOES.obter({}) || [])
      : [];
    var mapSug = {};
    var mapFreq = {};

    txs.forEach(function(t) {
      if (!t.descricao || !String(t.descricao).trim()) return;
      var key = String(t.descricao).trim();
      // A descrição é guardada escapada; decodifica para o texto exibido/usado.
      // Sem isso, a sugestão mostra "C&amp;A" e, ao aplicá-la, preenche o campo
      // com o valor escapado — que seria reescapado ao salvar, corrompendo.
      // A chave de agrupamento continua sendo o valor guardado (consistente).
      var display = (typeof UTILS !== 'undefined' && UTILS.desescapeHtml)
        ? UTILS.desescapeHtml(key) : key;

      if (!mapSug[key]) {
        mapSug[key] = {
          descricao: display,
          categoria: t.categoria,
          tipo: t.tipo,
          valor: t.valor,
          banco: t.banco,
          cartao: t.cartao,
          count: 0,
          meses: {}
        };
      }
      mapSug[key].count++;
      mapSug[key].valor = t.valor;
      mapSug[key].banco = t.banco || mapSug[key].banco;
      mapSug[key].cartao = t.cartao || mapSug[key].cartao;
      if (t.data) mapSug[key].meses[String(t.data).slice(0, 7)] = true;

      var freqKey = key + '|' + t.categoria + '|' + t.tipo;
      if (!mapFreq[freqKey]) {
        mapFreq[freqKey] = {
          descricao: display,
          categoria: t.categoria,
          tipo: t.tipo,
          valor: t.valor,
          count: 0
        };
      }
      mapFreq[freqKey].count++;
      mapFreq[freqKey].valor = t.valor;
    });

    var sugestoes = Object.keys(mapSug).map(function(k) {
      var item = mapSug[k];
      item.recorrente = Object.keys(item.meses || {}).length >= 2;
      return item;
    }).sort(function(a, b) { return b.count - a.count; });

    var frequentes = Object.keys(mapFreq).map(function(k) { return mapFreq[k]; });
    frequentes.sort(function(a, b) { return b.count - a.count; });

    INIT_FORM._aggCache = {
      sugestoes: sugestoes,
      frequentes: frequentes.slice(0, 4),
      descricoes: sugestoes.map(function(s) { return s.descricao; })
    };
    return INIT_FORM._aggCache;
  },

  invalidarCacheSugestoes: function() {
    INIT_FORM._autocompleteCache = {};
    INIT_FORM._aggCache = null;
  },
};

export { FORM_SUGESTOES };
export default FORM_SUGESTOES;
