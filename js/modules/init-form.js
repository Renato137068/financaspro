/**
 * init-form.js - Sistema de formulário de transações
 * Extraído do init.js para modularização
 * Responsabilidades: setup completo do form novo, validação, submit
 *
 * Sugestões (autocategorização, contexto de pagamento, autocomplete da
 * descrição) moram em js/modules/form-sugestoes.js, que as copia para
 * INIT_FORM ao carregar: quem chama continua usando
 * INIT_FORM.obterSugestaoContextual etc.
 *
 * ES Module (ADR 0005): os scripts clássicos o recebem como global por
 * js/esm/ponte.js.
 */

import { CONFIG } from '../core/config.js';
import { UTILS } from '../core/utils.js';
import { FINANCE_CONTRACT } from '../core/finance-contract.js';
import { AVALIACAO_LOJA } from '../avaliacao-loja.js';
import { DOMUTILS } from '../core/domUtils.js';
import { FUNIL } from '../utilities/funil.js';
import { SCORE } from '../score.js';
import { APRENDIZADO } from '../aprendizado.js';
import { TRANSACOES } from '../transacoes.js';
import { ORCAMENTO } from '../orcamento.js';
import { CATEGORIES } from '../categories.js';
import { CONTAS } from '../contas.js';
import { PIPELINE } from '../pipeline.js';
import { PERSIST_QUEUE } from '../core/persist-queue.js';
import { MICRO } from '../micro-interactions.js';
import { INSIGHTS } from '../insights.js';
import { RENDER } from '../render.js';
import { BILLING } from '../billing.js';
import { DADOS } from '../core/dados.js';

const INIT_FORM = {
  _submitBusy: false,
  _persistUnsub: null,

  /**
   * Inicializa sistema de formulário
   */
  init: function() {
    INIT_FORM.setupFormNovo();
    INIT_FORM._ligarPersistStatus();
    INIT_FORM._bindTags();
  },

  /** Liga o campo de tags: pré-visualiza os chips normalizados enquanto digita. */
  _bindTags: function() {
    var el = document.getElementById('novo-tags');
    if (!el || el._tagsBound) return;
    el._tagsBound = true;
    el.addEventListener('input', function() { INIT_FORM._renderTagsChips(); });
    INIT_FORM._renderTagsChips();
  },

  /** Lê e normaliza as tags do formulário. */
  _coletarTags: function() {
    var el = document.getElementById('novo-tags');
    if (!el) return [];
    return (typeof TRANSACOES !== 'undefined' && TRANSACOES.normalizarTags)
      ? TRANSACOES.normalizarTags(el.value) : [];
  },

  /** Mostra os chips já normalizados abaixo do campo (só leitura). */
  _renderTagsChips: function() {
    var box = document.getElementById('novo-tags-chips');
    if (!box) return;
    box.innerHTML = INIT_FORM._coletarTags().map(function(t) {
      return '<span class="tags-chip">#' + UTILS.escapeHtml(t) + '</span>';
    }).join('');
  },

  _ligarPersistStatus: function() {
    if (typeof PERSIST_QUEUE === 'undefined' || !PERSIST_QUEUE.onChange) return;
    if (INIT_FORM._persistUnsub) return;
    var self = INIT_FORM;
    INIT_FORM._persistUnsub = PERSIST_QUEUE.onChange(function(snap) {
      self._renderPersistStatus(snap);
    });
    INIT_FORM._renderPersistStatus(PERSIST_QUEUE.getSnapshot());
  },

  _renderPersistStatus: function(snap) {
    var el = document.getElementById('persist-status');
    var retryBtn = document.getElementById('persist-retry-btn');
    var progressEl = document.getElementById('persist-progress');
    if (!snap) return;

    var texto = '';
    var estado = 'idle';
    if (snap.saving > 0) {
      texto = 'Salvando ' + snap.saving + ' lançamento(s)…';
      estado = 'saving';
    } else if (snap.pending > 0) {
      texto = snap.pending + ' lançamento(s) pendente(s) na fila';
      estado = 'pending';
    } else if (snap.failed > 0) {
      texto = snap.failed + ' lançamento(s) falharam — toque em Tentar de novo';
      estado = 'failed';
    } else if (snap.saved > 0) {
      texto = 'Salvo';
      estado = 'saved';
    }

    if (el) {
      el.setAttribute('data-persist-state', estado);
      el.textContent = texto;
    }
    if (retryBtn) {
      retryBtn.style.display = snap.failed > 0 ? '' : 'none';
      retryBtn.disabled = snap.saving > 0 || snap.pending > 0;
    }
    if (progressEl) {
      var totalWork = snap.pending + snap.saving + snap.failed + snap.saved;
      var done = snap.saved;
      if (totalWork > 1 && (snap.pending + snap.saving + snap.failed) > 0) {
        progressEl.style.display = '';
        progressEl.setAttribute('aria-valuenow', String(done));
        progressEl.setAttribute('aria-valuemax', String(totalWork));
        progressEl.textContent = done + ' / ' + totalWork;
      } else if (estado === 'idle' || estado === 'saved') {
        progressEl.style.display = 'none';
      }
    }

    var btn = document.querySelector('.btn-registrar');
    if (btn && !btn.dataset.manualLock) {
      if (snap.saving > 0) {
        btn.disabled = true;
        if (!btn.dataset.persistLabel) btn.dataset.persistLabel = btn.innerHTML;
        btn.innerHTML = 'Salvando…';
      } else if (btn.dataset.persistLabel && snap.failed === 0) {
        btn.innerHTML = btn.dataset.persistLabel;
        delete btn.dataset.persistLabel;
        btn.disabled = false;
      } else if (snap.failed > 0) {
        btn.disabled = false;
        if (btn.dataset.persistLabel) {
          btn.innerHTML = btn.dataset.persistLabel;
          delete btn.dataset.persistLabel;
        }
      }
    }

    if (el && texto && (estado === 'saved' || estado === 'failed' || estado === 'pending')) {
      if (el.dataset.lastAnnounced !== texto) {
        el.dataset.lastAnnounced = texto;
        if (typeof ariaLive !== 'undefined' && typeof ariaLive.announce === 'function') {
          try { ariaLive.announce(texto); } catch (e) { /* noop */ }
        }
      }
    }
  },

  _setRegistrarBusy: function(busy, label) {
    var btn = document.querySelector('.btn-registrar');
    if (!btn) return;
    if (busy) {
      btn.dataset.manualLock = '1';
      if (!btn.dataset.persistLabel) btn.dataset.persistLabel = btn.innerHTML;
      btn.disabled = true;
      btn.innerHTML = label || 'Salvando…';
    } else {
      delete btn.dataset.manualLock;
      if (btn.dataset.persistLabel) {
        btn.innerHTML = btn.dataset.persistLabel;
        delete btn.dataset.persistLabel;
      }
      btn.disabled = false;
    }
  },

  retryPersistFailed: function() {
    if (typeof PERSIST_QUEUE === 'undefined') return;
    var n = PERSIST_QUEUE.retryFailed();
    if (n && typeof UTILS !== 'undefined' && UTILS.mostrarToast) {
      UTILS.mostrarToast('Retentando ' + n + ' lançamento(s)…', 'info');
    }
  },

  /**
   * Configura todos os subsistemas do formulário
   */
  setupFormNovo: function() {
    var fns = [
      INIT_FORM.setupEntradaRapida,
      INIT_FORM.setupTipoToggle,
      INIT_FORM.setupMascaraValor,
      INIT_FORM.setupQuickAmounts,
      INIT_FORM.setupCategoriaGrid,
      INIT_FORM.setupDateChips,
      INIT_FORM.setupExtrasToggle,
      INIT_FORM.setupRecorrencia,
      INIT_FORM.setupParcelamento,
      INIT_FORM.setupAutoCategorizacao,
      INIT_FORM.setupContextoCategorizacao,
      INIT_FORM.setupSmartDescriptionSuggestions,
      INIT_FORM.setupPaymentContextChips,
      INIT_FORM.setupAutocomplete,
      INIT_FORM.setupFormSubmit,
      INIT_FORM.setupParcelaPreview,
      INIT_FORM.setupFormProgress,
      INIT_FORM.setupPersistRetry
    ];

    fns.forEach(function(fn) {
      try {
        if (typeof fn === 'function') fn();
      } catch (e) {
        console.warn('Setup falhou:', fn.name, e);
        try {
          if (typeof OBS !== 'undefined' && OBS && typeof OBS.captureError === 'function') {
            OBS.captureError(e, { contexto: 'form-setup:' + (fn.name || 'anon') });
          }
        } catch (_obs) { /* observabilidade nunca pode quebrar o setup */ }
      }
    });
  },

  setupPersistRetry: function() {
    var btn = document.getElementById('persist-retry-btn');
    if (!btn || btn.dataset.bound) return;
    btn.dataset.bound = '1';
    btn.addEventListener('click', function() {
      INIT_FORM.retryPersistFailed();
    });
  },

  /**
   * 1. MÁSCARA DE VALOR (R$ brasileiro)
   * Inteiros e milhares em reais: 6000 e 6.000 → R$ 6.000,00 (não centavos).
   */
  setupMascaraValor: function() {
    var input = UTILS.obterElemento('novo-valor');
    if (!input) return;

    var preview = document.getElementById('valor-preview');
    if (!preview && input.parentElement) {
      preview = document.createElement('p');
      preview.id = 'valor-preview';
      preview.className = 'campo-moeda-preview';
      preview.hidden = true;
      preview.setAttribute('aria-live', 'polite');
      var erro = document.getElementById('valor-error');
      if (erro && erro.parentElement) {
        erro.parentElement.insertBefore(preview, erro);
      } else {
        input.parentElement.insertAdjacentElement('afterend', preview);
      }
    }

    var atualizarValor = UTILS.debounce(function() {
      INIT_FORM.atualizarParcelaPreview();
      INIT_FORM.atualizarOrcamentoPreview();
    }, 100);

    UTILS.bindCampoMoeda(input, {
      previewEl: preview,
      onChange: function() { atualizarValor(); }
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
    // Grid começa oculto — a IA preenche; P1.2 expõe via "Alterar categoria"
    INIT_FORM.esconderGridCategoria();

    grid.addEventListener('click', function(e) {
      var btn = e.target.closest('.cat-btn');
      if (!btn) return;

      grid.querySelectorAll('.cat-btn').forEach(function(b) { b.classList.remove('ativo'); });
      btn.classList.add('ativo');

      var cat = btn.dataset.cat;
      var tipo = btn.dataset.tipo;
      var catEl = UTILS.obterElemento('novo-categoria');
      var sugestaoAnterior = (INIT_FORM._iaSuggestion && INIT_FORM._iaSuggestion.categoria) || '';
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

      // Correção manual vs sugestão da IA → aprendizado
      var desc = (document.getElementById('novo-descricao') || {}).value || '';
      if (sugestaoAnterior && cat && cat !== sugestaoAnterior &&
          typeof APRENDIZADO !== 'undefined' && APRENDIZADO.registrarCorrecao) {
        APRENDIZADO.registrarCorrecao(desc, sugestaoAnterior, cat);
        INIT_FORM.mostrarFeedbackAprendizado('Categoria atualizada. Vou melhorar as próximas sugestões.');
      }

      INIT_FORM.esconderGridCategoria();
      var savePrev = document.getElementById('ia-save-preview');
      if (savePrev) {
        savePrev.textContent = 'Categoria final: ' + (typeof UTILS.labelCategoria === 'function'
          ? UTILS.labelCategoria(cat) : cat);
      }
    });
  },

  mostrarGridCategoria: function() {
    var grid = document.getElementById('categoria-grid');
    if (!grid) return;
    grid.style.display = '';
    if (grid.parentElement) grid.parentElement.style.display = '';
    var fieldset = grid.closest('fieldset') || grid.parentElement;
    if (fieldset) {
      var firstBtn = grid.querySelector('.cat-btn');
      if (firstBtn && typeof firstBtn.focus === 'function') firstBtn.focus();
    }
  },

  esconderGridCategoria: function() {
    var grid = document.getElementById('categoria-grid');
    if (!grid) return;
    grid.style.display = 'none';
    if (grid.parentElement) grid.parentElement.style.display = 'none';
  },

  setupTipoToggle: function() {
    document.querySelectorAll('.tipo-btn').forEach(function(btn) {
      btn.addEventListener('click', function() {
        var tipo = btn.dataset.tipo;
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
      var isActive = btn.dataset.tipo === tipo;
      btn.classList.toggle('ativo', isActive);
      btn.setAttribute('aria-pressed', isActive ? 'true' : 'false');
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
        chips.forEach(function(c) {
          c.classList.remove('ativo');
          c.setAttribute('aria-pressed', 'false');
        });
        chip.classList.add('ativo');
        chip.setAttribute('aria-pressed', 'true');
        var offset = parseInt(chip.dataset.offset, 10);
        var d = new Date();
        d.setDate(d.getDate() - offset);
        dateInput.value = UTILS.dataLocalIso(d);
      });
    });

    dateInput.addEventListener('change', function() {
      chips.forEach(function(c) {
        c.classList.remove('ativo');
        c.setAttribute('aria-pressed', 'false');
      });
    });

    chips.forEach(function(c, i) {
      c.setAttribute('aria-pressed', i === 0 ? 'true' : 'false');
    });
  },

  setupQuickAmounts: function() {
    document.querySelectorAll('.quick-amount').forEach(function(btn) {
      var val = btn.dataset.valor;
      btn.setAttribute('aria-label', 'Adicionar R$ ' + val + ' ao valor');
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
      if (arrow) arrow.classList.toggle('expanded', !aberto);
      // Sticky "Registrar" cobria o painel — rola e deixa folga abaixo.
      if (!aberto) {
        setTimeout(function() {
          try {
            panel.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
          } catch (e) {
            panel.scrollIntoView(true);
          }
        }, 40);
      }
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
      opcoes.style.display = chk.checked ? 'flex' : 'none';
      // Desabilitar parcelamento se recorrente
      if (chk.checked) {
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
      opcoes.style.display = chk.checked ? 'block' : 'none';
      if (chk.checked) {
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
    el.removeAttribute('aria-invalid');

    if (!valor) {
      if (el.id === 'novo-valor' || el.id === 'novo-descricao' || el.id === 'novo-data') {
        el.classList.add('error');
        el.setAttribute('aria-invalid', 'true');
        if (errorMsg) {
          errorMsg.textContent = 'Campo obrigatório';
          errorMsg.classList.add('visible');
        }
      }
    } else {
      el.classList.add('success');
      el.setAttribute('aria-invalid', 'false');
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
      // Mesma divisão usada no registro: o preview precisa mostrar o número que
      // vai ser gravado, não `val / n` cru — senão promete 33,33 e grava 33,34.
      var parcelas = UTILS.dividirEmParcelas(val, n);
      var primeira = parcelas[0];
      var ultima = parcelas[parcelas.length - 1];
      txt.textContent = primeira === ultima
        ? n + 'x de ' + UTILS.formatarMoeda(primeira)
        : n + 'x de ' + UTILS.formatarMoeda(ultima) + ' (1ª de ' + UTILS.formatarMoeda(primeira) + ')';
    } else {
      txt.textContent = '';
    }
  },

  /**
   * 9. ENTRADA RÁPIDA
   */
  setupEntradaRapida: function() {
    var input = document.getElementById('entrada-rapida-input');
    var btn = document.getElementById('btn-er-submit');
    var feedback = document.getElementById('er-feedback');
    if (!input || input.dataset.erBound === '1') return;
    input.dataset.erBound = '1';

    function processar() {
      var texto = input.value.trim();
      if (!texto) return;

      if (typeof PIPELINE === 'undefined') {
        UTILS.mostrarToast('Não foi possível ler esse arquivo agora. Recarregue a página.', 'error');
        return;
      }

      var resultado = PIPELINE.processar(texto);
      if (!resultado) {
        if (feedback) {
          feedback.textContent = 'Não entendi. Tente: mercado 50 ontem';
          feedback.className = 'er-feedback erro';
          feedback.style.display = 'block';
        }
        return;
      }

      if (resultado.descricao && DOMUTILS.elementos.novoDescricao) {
        DOMUTILS.elementos.novoDescricao.value = resultado.descricao;
      }
      PIPELINE.preencherForm(resultado);
      INIT_FORM.atualizarTipoIndicator(resultado.tipo);
      INIT_FORM.filtrarCategoriasPorTipo(resultado.tipo);
      INIT_FORM.atualizarOrcamentoPreview();

      var cat = resultado.categoria ? UTILS.labelCategoria(resultado.categoria) : '';
      var descSafe = UTILS.escapeHtml(resultado.descricao || texto);
      var catSafe = cat ? UTILS.escapeHtml(cat) : '';
      var msg = '<i data-lucide="check" aria-hidden="true"></i> ' + descSafe + (catSafe ? ' · ' + catSafe : '');
      if (resultado.valor) msg += ' · ' + UTILS.formatarMoeda(resultado.valor);
      if (feedback) {
        feedback.innerHTML = msg;
        feedback.className = 'er-feedback sucesso';
        feedback.style.display = 'block';
        if (typeof renderLucideIcons === 'function') renderLucideIcons(feedback);
      }
      input.value = '';

      // Com valor lido, o próximo passo é registrar: o botão ficava abaixo da
      // tela (auditoria de ativação, 09/10/2026). Rola até ele, no centro (a
      // barra inferior cobre o rodapé), e foca: Enter ou um toque salva. Sem
      // valor, o foco vai para o valor, como antes. Não salva sozinho: a frase
      // pode ter sido lida errado e o formulário mostra o que vai ser gravado.
      var alvo = resultado.valor ? document.querySelector('.btn-registrar') : document.getElementById('novo-valor');
      if (alvo) {
        setTimeout(function() {
          alvo.scrollIntoView({ block: 'center' });
          alvo.focus({ preventScroll: true });
        }, 80);
      }
    }

    input.addEventListener('keydown', function(e) {
      if (e.key === 'Enter') { e.preventDefault(); processar(); }
      if (e.key === 'Escape') {
        input.value = '';
        if (feedback) feedback.style.display = 'none';
      }
    });

    if (btn) btn.addEventListener('click', processar);
  },

  abrirEntradaRapida: function() {
    var input = document.getElementById('entrada-rapida-input');
    if (input) input.focus();
  },

  renderizarSelects: function() {
    var config = DADOS.getConfig();
    var bancos = config.bancos || ['Nubank', 'Itaú', 'Caixa', 'Bradesco', 'Santander'];
    // XP/B3 saíram do padrão (não são forma de pagamento do dia a dia).
    // PIX entra como opção canônica; se o usuário já tinha na config, mantém.
    var CARTAO_REMOVIDOS = { XP: 1, B3: 1, 'XP Investimentos': 1 };
    var cartoesPadrao = ['PIX', 'Crédito', 'Débito', 'Outro'];
    var cartoesRaw = config.cartoes && config.cartoes.length ? config.cartoes : cartoesPadrao;
    var cartoes = [];
    var visto = {};
    cartoesRaw.forEach(function(c) {
      var nome = typeof c === 'string' ? c : (c && c.nome) || '';
      if (!nome || CARTAO_REMOVIDOS[nome] || visto[nome]) return;
      visto[nome] = 1;
      cartoes.push(nome);
    });
    if (!visto.PIX) cartoes.unshift('PIX');
    if (!cartoes.length) cartoes = cartoesPadrao.slice();

    var seletorBanco = document.getElementById('novo-banco');
    if (seletorBanco) {
      if (typeof CONTAS !== 'undefined' && CONTAS.renderBancoSelect) {
        CONTAS.renderBancoSelect('novo-banco');
      } else {
        var valBanco = seletorBanco.value;
        var bancoOpts = bancos.map(function(b) {
          var nome = typeof b === 'string' ? b : (b.nome || b);
          return '<option value="' + UTILS.escapeHtml(nome) + '">' + UTILS.escapeHtml(nome) + '</option>';
        }).join('');
        seletorBanco.innerHTML = '<option value="">Sem banco</option>' + bancoOpts;
        seletorBanco.value = valBanco;
      }
    }

    var seletorCartao = document.getElementById('novo-cartao');
    if (seletorCartao) {
      var valCartao = seletorCartao.value;
      if (CARTAO_REMOVIDOS[valCartao]) valCartao = '';
      var cartaoOpts = cartoes.map(function(c) {
        var nome = typeof c === 'string' ? c : (c.nome || c);
        return '<option value="' + UTILS.escapeHtml(nome) + '">' + UTILS.escapeHtml(nome) + '</option>';
      }).join('');
      seletorCartao.innerHTML = '<option value="">Sem forma</option>' + cartaoOpts;
      seletorCartao.value = valCartao;
    }
  },

  atualizarBadgeConfianca: function(confianca) {
    var badge = document.getElementById('sugestao-badge');
    if (!badge) return;
    var prefixes = { alta: 'Alta:', media: 'Média:', baixa: 'Baixa:' };
    var catEl = document.getElementById('novo-categoria');
    var categoria = catEl ? catEl.value : '';
    if (categoria) {
      badge.textContent = (prefixes[confianca] || 'Sugestão:') + ' ' + UTILS.labelCategoria(categoria);
      badge.dataset.confianca = confianca;
      badge.style.display = 'block';
    }
  },

  renderQuickEntries: function() {
    var container = document.getElementById('quick-entries');
    if (!container) return;

    var frequentes = INIT_FORM.obterTransacoesFrequentes();
    if (frequentes.length === 0) { container.innerHTML = ''; return; }

    var html = '<div class="quick-label"><i data-lucide="zap" aria-hidden="true"></i> Lançamento rápido</div><div class="quick-chips">';
    frequentes.forEach(function(f) {
      var tipoIcon = f.tipo === 'receita' ? '<i data-lucide="trending-up" aria-hidden="true"></i> ' : '';
      html += '<button type="button" class="quick-chip" ' +
        'data-desc="' + UTILS.escapeHtml(f.descricao) + '" ' +
        'data-val="' + f.valor + '" ' +
        'data-cat="' + UTILS.escapeHtml(f.categoria) + '" ' +
        'data-tipo="' + f.tipo + '">' +
        tipoIcon + UTILS.escapeHtml(f.descricao) + ' <strong>' + UTILS.formatarMoeda(f.valor) + '</strong>' +
      '</button>';
    });
    html += '</div>';
    container.innerHTML = html;
    if (typeof renderLucideIcons === 'function') renderLucideIcons(container);

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

  handleFormSubmit: function(_e) {
    try {
      if (INIT_FORM._submitBusy) {
        UTILS.mostrarToast('Aguarde gravar o lançamento atual…', 'warning');
        return;
      }

      var tipo = document.getElementById('novo-tipo').value || CONFIG.TIPO_DESPESA;
      var valor = INIT_FORM.obterValorNumerico();
      var catEl = document.getElementById('novo-categoria');
      var categoria = catEl.value;
      // Categoria escolhida à mão no grid ("Alterar categoria"): a tela já
      // mostrou "Categoria final: X" e a correção já foi registrada no clique.
      var escolhaManual = !!(catEl._manualSet && categoria);
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

      // Alta confiança / confirmação: só aplica categoria se o tipo da sugestão
      // bater com o tipo escolhido no toggle. Nunca troca Receita↔Despesa em
      // silêncio (auditoria personas — UX).
      var sugestaoConfirmada = INIT_FORM._iaConfirmed === true;
      // Marco "aha" do funil: a categoria veio sozinha, sem a pessoa escolher.
      INIT_FORM._categoriaAutomatica = false;
      if (!escolhaManual && sugestaoOriginal && (sugestaoOriginal.confianca === 'alta' || sugestaoConfirmada)) {
        var tipoSug = sugestaoOriginal.tipo || tipo;
        if (tipoSug === tipo) {
          categoria = sugestaoOriginal.categoria || categoria;
          INIT_FORM._categoriaAutomatica = !!sugestaoOriginal.categoria;
        } else if (sugestaoConfirmada) {
          tipo = tipoSug;
          categoria = sugestaoOriginal.categoria || categoria;
          INIT_FORM._categoriaAutomatica = !!sugestaoOriginal.categoria;
        }
      }
      if (typeof CONFIG !== 'undefined' && typeof CONFIG.normalizeCategoriaFinal === 'function') {
        categoria = CONFIG.normalizeCategoriaFinal(categoria, tipo);
      } else if (!categoria) {
        categoria = tipo === CONFIG.TIPO_RECEITA ? 'outros' : 'outro';
      }

      // Feedback loop (a escolha manual já registrou a correção no clique)
      if (!escolhaManual && sugestaoOriginal && sugestaoOriginal.categoria &&
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

      // P2.4: descrição opcional — se vazia, deriva do rótulo da categoria (não bloqueia)
      var descEl = document.getElementById('novo-descricao');
      var descError = document.getElementById('desc-error');
      descricao = (descricao || '').trim();
      if (!descricao) {
        var rotulo = (typeof UTILS !== 'undefined' && UTILS.labelCategoria)
          ? UTILS.labelCategoria(categoria)
          : categoria;
        descricao = rotulo || 'Lançamento';
        if (descEl) descEl.value = descricao;
        if (descError) {
          descError.textContent = 'Sem descrição: usei “' + descricao + '” (categoria).';
        }
      } else if (descError) {
        descError.textContent = '';
      }

      INIT_FORM.processarTransacao(tipo, valor, categoria, data, descricao, banco, cartao, nota);
    } catch (erro) {
      UTILS.mostrarToast(erro.message, 'error');
      INIT_FORM._submitBusy = false;
      INIT_FORM._setRegistrarBusy(false);
    }
  },

  /**
   * 11. UTILITÁRIOS
   */
  obterValorNumerico: function() {
    var input = document.getElementById('novo-valor');
    if (!input || !input.value) return 0;
    return UTILS.parseMoeda(input.value);
  },

  preencherFormRapido: function(data) {
    // Preencher valor
    var valInput = document.getElementById('novo-valor');
    if (valInput) {
      valInput.value = UTILS.formatarCampoMoeda(data.val);
      valInput.dispatchEvent(new Event('input', { bubbles: true }));
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
    // Tokens do design-system (acompanham o tema escuro), não cores hex fixas:
    // antes eram valores da paleta clara cravados aqui, que não mudavam no
    // modo escuro. Aplicados inline em background/color — var() resolve normal.
    var cor = pctNovo > 100 ? 'var(--color-danger)' : pctNovo > 80 ? 'var(--color-warning)' : 'var(--color-success)';
    // Nome que a pessoa lê ('Alimentação'), inclusive de categoria criada por
    // ela; o slug capitalizado aparecia como 'ALIMENTACAO' na prévia.
    var nomeCategoria = CATEGORIES.getLabel(cat);

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
        (pctNovo > 100 ? '<span class="orc-preview-alerta"><i data-lucide="alert-triangle" aria-hidden="true"></i> Estoura o limite!</span>' :
         pctNovo > 80 ? '<span class="orc-preview-aviso"><i data-lucide="zap" aria-hidden="true"></i> Perto do limite</span>' : '') +
      '</div>' +
    '</div>';
    if (typeof renderLucideIcons === 'function') renderLucideIcons(el);
  },

  processarTransacao: function(tipo, valor, categoria, data, descricao, banco, cartao, nota) {
    var accountId = null;
    if (banco && typeof FINANCE_CONTRACT !== 'undefined' && typeof DADOS !== 'undefined' && DADOS.getContas) {
      accountId = FINANCE_CONTRACT.resolveAccountId(banco, DADOS.getContas());
    }
    var form = document.getElementById('form-transacao');
    var editId = form && form.dataset.editId;
    var chkParcelado = document.getElementById('chk-parcelado');
    var chkRecorrente = document.getElementById('chk-recorrente');
    var descFinal = descricao || nota;
    var tags = INIT_FORM._coletarTags();

    if (editId) {
      INIT_FORM._submitBusy = true;
      INIT_FORM._setRegistrarBusy(true, 'Salvando…');
      var anterior = TRANSACOES.obterPorId(editId);
      if (!anterior) {
        INIT_FORM._submitBusy = false;
        INIT_FORM._setRegistrarBusy(false);
        UTILS.mostrarToast('Transação não encontrada', 'error');
        return Promise.reject(new Error('Transação não encontrada'));
      }
      var snapshot = {
        tipo: anterior.tipo,
        valor: anterior.valor,
        categoria: anterior.categoria,
        data: anterior.data,
        descricao: anterior.descricao,
        banco: anterior.banco,
        cartao: anterior.cartao,
        accountId: anterior.accountId,
        contaDestino: anterior.contaDestino,
        contaDestinoId: anterior.contaDestinoId
      };
      try {
        TRANSACOES.atualizar(editId, {
          tipo: tipo,
          valor: valor,
          categoria: categoria,
          data: data,
          descricao: descFinal,
          banco: banco,
          cartao: cartao,
          accountId: accountId || undefined,
          tags: tags
        });
        var discoEdit = (typeof DADOS !== 'undefined' && DADOS.aguardarDisco)
          ? DADOS.aguardarDisco()
          : Promise.resolve(true);
        return discoEdit.then(function() {
          if (typeof INIT_ANEXOS !== 'undefined') INIT_ANEXOS.salvarPendentes(editId);
          delete form.dataset.editId;
          var btnReg = document.querySelector('.btn-registrar');
          if (btnReg) btnReg.textContent = 'Registrar';
          if (typeof APRENDIZADO !== 'undefined') {
            APRENDIZADO.registrar(descricao, categoria, tipo, banco, cartao, valor);
          }
          INIT_FORM.mostrarSucesso('Transação atualizada!');
          UTILS.agendarExclusao('edit-tx-' + editId, function() {}, {
            mensagem: 'Alteração salva',
            rotuloAcao: 'Desfazer',
            duracaoMs: 5000,
            tipo: 'info',
            aoDesfazer: function() {
              TRANSACOES.atualizar(editId, snapshot);
              if (typeof DADOS !== 'undefined' && DADOS.aguardarDisco) {
                return DADOS.aguardarDisco().then(function() {
                  if (typeof INIT_EXTRATO !== 'undefined') INIT_EXTRATO.filtrarExtrato();
                  if (typeof RENDER !== 'undefined') RENDER.init();
                });
              }
              if (typeof INIT_EXTRATO !== 'undefined') INIT_EXTRATO.filtrarExtrato();
              if (typeof RENDER !== 'undefined') RENDER.init();
            }
          });
          INIT_FORM._finalizarTransacao();
        }).catch(function(err) {
          UTILS.mostrarToast((err && err.message) || 'Falha ao salvar', 'error');
        }).then(function() {
          INIT_FORM._submitBusy = false;
          INIT_FORM._setRegistrarBusy(false);
        });
      } catch (errEdit) {
        INIT_FORM._submitBusy = false;
        INIT_FORM._setRegistrarBusy(false);
        UTILS.mostrarToast(errEdit.message || 'Falha ao salvar', 'error');
        return Promise.reject(errEdit);
      }
    }

    // Sem quota de transacao, de proposito. O teto de 100/mes parava de
    // aceitar os gastos do usuario por volta do dia 15 -- o gratuito virava
    // inutil justamente no mes em que ele mais precisava, e o mes ficava com
    // dados pela metade, o que estragava orcamento, insight e comparativo
    // junto. Limite de volume num app de habito e churn, nao conversao.

    INIT_FORM._submitBusy = true;
    INIT_FORM._setRegistrarBusy(true, 'Salvando…');

    var chain = Promise.resolve();
    var sucessoMsg = 'Registrado!';
    var firstTxId = null;
    var valorAprendizado = valor;

    // PARCELAMENTO — cada parcela na fila, mesma série com clientKeys distintos
    if (chkParcelado && chkParcelado.checked && tipo === 'despesa') {
      var nParcelas = parseInt(document.getElementById('num-parcelas').value, 10) || 2;
      var valoresParcelas = UTILS.dividirEmParcelas(valor, nParcelas);
      valorAprendizado = valoresParcelas.length ? valoresParcelas[0] : 0;
      sucessoMsg = nParcelas + ' parcelas de ' + UTILS.formatarMoeda(valorAprendizado) + ' registradas!';
      valoresParcelas.forEach(function(vp, p) {
        var dataParcela = UTILS.addMesesClamp(data, p) || data;
        var descParcela = descFinal + ' (' + (p + 1) + '/' + nParcelas + ')';
        chain = chain.then(function() {
          return INIT_FORM._enfileirarLancamento({
            tipo: tipo, valor: vp, categoria: categoria,
            data: dataParcela, descricao: descParcela, banco: banco, cartao: cartao,
            accountId: accountId || undefined, tags: tags
          }).then(function(item) {
            if (p === 0) firstTxId = item.txId;
            return item;
          });
        });
      });
    }
    // RECORRÊNCIA
    else if (chkRecorrente && chkRecorrente.checked) {
      // Aluguel, salario e internet cabem no gratuito. A quarta recorrente
      // indica alguem que ja organizou a vida dentro do app -- e o lancamento
      // avulso continua livre, entao ninguem fica sem registrar o gasto.
      if (typeof BILLING !== 'undefined' && !BILLING.guardQuota('recurring', 1)) {
        INIT_FORM._submitBusy = false;
        INIT_FORM._setRegistrarBusy(false);
        return Promise.reject(new Error('Limite de recorrentes do plano gratuito'));
      }
      var freqEl = document.querySelector('.rec-chip.ativo');
      var freq = freqEl ? freqEl.dataset.freq : 'mensal';
      var recData = {
        tipo: tipo, valor: valor, categoria: categoria,
        descricao: descFinal, frequencia: freq, dataInicio: data, ativo: true,
        banco: banco, cartao: cartao, accountId: accountId || undefined
      };
      DADOS.salvarRecorrente(recData);
      sucessoMsg = 'Recorrência ' + freq + ' criada!';
      chain = chain.then(function() {
        return INIT_FORM._enfileirarLancamento({
          tipo: tipo, valor: valor, categoria: categoria,
          data: data, descricao: descFinal + ' (recorrente)', banco: banco, cartao: cartao,
          accountId: accountId || undefined, tags: tags
        }).then(function(item) {
          firstTxId = item.txId;
          return item;
        });
      });
    }
    // NORMAL
    else {
      chain = chain.then(function() {
        return INIT_FORM._enfileirarLancamento({
          tipo: tipo, valor: valor, categoria: categoria,
          data: data, descricao: descFinal, banco: banco, cartao: cartao,
          accountId: accountId || undefined, tags: tags
        }).then(function(item) {
          firstTxId = item.txId;
          return item;
        });
      });
    }

    return chain.then(function() {
      if (typeof APRENDIZADO !== 'undefined') {
        APRENDIZADO.registrar(descricao, categoria, tipo, banco, cartao, valorAprendizado);
        INIT_FORM.mostrarFeedbackAprendizado('Aprendizado atualizado com sucesso.');
      }
      if (firstTxId && typeof INIT_ANEXOS !== 'undefined') INIT_ANEXOS.salvarPendentes(firstTxId);
      // Passo 3 do funil. Só o marco, sem nada do lançamento em si.
      if (typeof FUNIL !== 'undefined') {
        FUNIL.marco(FUNIL.E.PRIMEIRO_LANCAMENTO, { dia: FUNIL.diasDeUso() });
        // Passo 4: a primeira vez que a categoria foi escolhida sozinha.
        if (INIT_FORM._categoriaAutomatica) {
          FUNIL.marco(FUNIL.E.AHA_AUTOCATEGORIA, { dia: FUNIL.diasDeUso() });
        }
      }
      INIT_FORM._categoriaAutomatica = false;
      INIT_FORM.mostrarSucesso(sucessoMsg);
      INIT_FORM._finalizarTransacao();
      // Momento bom para pedir avaliação na Play (regras em avaliacao-loja.js).
      AVALIACAO_LOJA.aposLancamento();
    }).catch(function(err) {
      UTILS.mostrarToast((err && err.message) || 'Falha ao salvar lançamento', 'error');
      if (typeof ariaLive !== 'undefined' && ariaLive.announce) {
        try { ariaLive.announce('Falha ao salvar lançamento'); } catch (e) { /* noop */ }
      }
    }).then(function() {
      INIT_FORM._submitBusy = false;
      INIT_FORM._setRegistrarBusy(false);
      if (typeof PERSIST_QUEUE !== 'undefined') {
        INIT_FORM._renderPersistStatus(PERSIST_QUEUE.getSnapshot());
      }
    });
  },

  /**
   * Enfileira um lançamento e só resolve após confirmação no storage.
   */
  _enfileirarLancamento: function(payload) {
    if (typeof PERSIST_QUEUE !== 'undefined' && PERSIST_QUEUE.enqueueLancamento) {
      return PERSIST_QUEUE.enqueueLancamento(payload);
    }
    // Fallback sem fila (testes unitários antigos): cria + aguarda disco.
    var clientKey = (typeof UTILS !== 'undefined' && UTILS.gerarUuid)
      ? UTILS.gerarUuid()
      : ('ck-' + Date.now());
    var tx = TRANSACOES.criar(
      payload.tipo, payload.valor, payload.categoria, payload.data,
      payload.descricao, payload.banco, payload.cartao,
      { clientKey: clientKey, accountId: payload.accountId || undefined, tags: payload.tags }
    );
    var wait = (typeof DADOS !== 'undefined' && DADOS.aguardarDisco)
      ? DADOS.aguardarDisco()
      : Promise.resolve(true);
    return wait.then(function() {
      return { clientKey: clientKey, status: 'saved', txId: tx.id, payload: payload };
    });
  },

  _finalizarTransacao: function() {
    INIT_FORM.invalidarCacheSugestoes();
    RENDER.init();
    if (typeof INSIGHTS !== 'undefined') {
      setTimeout(function() { INSIGHTS.mostrar(); }, 100);
    }
    if (typeof SCORE !== 'undefined') {
      SCORE.limparCache();
    }
    if (typeof INIT_BILLING !== 'undefined' && INIT_BILLING.refreshPlanoCard) {
      INIT_BILLING.refreshPlanoCard();
    }
    INIT_FORM.renderSmartDescriptionSuggestions();
    INIT_FORM.renderPaymentContextChips();

    var chkContinuo = document.getElementById('chk-continuo');
    if (chkContinuo && chkContinuo.checked) {
      INIT_FORM.limparFormularioParcial();
      if (typeof INIT_ANEXOS !== 'undefined') INIT_ANEXOS.limparPendentes();
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

    var reducedMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    var confetti = overlay.querySelector('.success-confetti');
    if (confetti) {
      if (reducedMotion) {
        confetti.style.display = 'none';
      } else {
        confetti.style.display = '';
        var spans = confetti.innerHTML;
        confetti.innerHTML = '';
        confetti.innerHTML = spans;
      }
    }

    overlay.setAttribute('role', 'status');
    overlay.setAttribute('aria-live', 'polite');
    if (typeof ariaLive !== 'undefined' && typeof ariaLive.announceSuccess === 'function') {
      ariaLive.announceSuccess(msg);
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
    var ti = document.getElementById('novo-tags');
    if (ti) ti.value = '';
    INIT_FORM._renderTagsChips();
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
    INIT_FORM._renderTagsChips();
    delete form.dataset.editId;
    var btnReg = document.querySelector('.btn-registrar');
    if (btnReg) btnReg.textContent = 'Registrar';
    if (typeof INIT_ANEXOS !== 'undefined') INIT_ANEXOS.limparPendentes();
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
    if (dataInput) dataInput.value = UTILS.dataLocalIso();
    var chips = document.querySelectorAll('.data-chip');
    chips.forEach(function(c, i) {
      var isToday = i === 0;
      c.classList.toggle('ativo', isToday);
      c.setAttribute('aria-pressed', isToday ? 'true' : 'false');
    });
    // Recolher extras
    var panel = document.getElementById('extras-panel');
    if (panel) panel.style.display = 'none';
    var arrow = document.getElementById('extras-arrow');
    if (arrow) arrow.classList.remove('expanded');
    var btnExtras = document.getElementById('btn-extras');
    if (btnExtras) btnExtras.setAttribute('aria-expanded', 'false');
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

  handleOrcamentoSubmit: function(_e) {
    try {
      var cats = ['alimentacao','transporte','moradia','saude','lazer'];
      cats.forEach(function(cat) {
        var el = document.getElementById('limit-' + cat);
        var val = el ? parseFloat(el.value || 0) : 0;
        if (val > 0) ORCAMENTO.definirLimite(cat, val);
      });
      UTILS.mostrarToast('Orçamentos definidos', 'success');
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
      var label = UTILS.labelCategoria(slug);
      var isAtivo = currentCat === slug ? ' ativo' : '';
      html += '<button type="button" class="cat-btn' + isAtivo + '" data-cat="' + slug + '" data-tipo="' + tipo + '">' +
        '<span class="cat-emoji">' + INIT_FORM._catIconHtml(slug) + '</span>' +
        '<span class="cat-nome">' + label + '</span>' +
        '</button>';
    });

    customNomes.forEach(function(nome) {
      var nomeSafe = UTILS.escapeHtml(nome);
      var isAtivo = currentCat === nome ? ' ativo' : '';
      html += '<button type="button" class="cat-btn' + isAtivo + '" data-cat="' + nomeSafe + '" data-tipo="' + tipo + '">' +
        '<span class="cat-emoji"><i data-lucide="sparkles" aria-hidden="true"></i></span>' +
        '<span class="cat-nome">' + nomeSafe + '</span>' +
        '</button>';
    });

    grid.innerHTML = html;
    if (typeof renderLucideIcons === 'function') renderLucideIcons(grid);

    var catEl = document.getElementById('novo-categoria');
    if (catEl && catEl.value && !grid.querySelector('.cat-btn.ativo')) {
      catEl.value = '';
      catEl._manualSet = false;
    }
  }
};

// Ícones Lucide por categoria (slug → nome do ícone)
INIT_FORM.CAT_ICONS = {
  alimentacao: 'utensils', transporte: 'car', moradia: 'home', saude: 'pill',
  educacao: 'book-open', lazer: 'film', outro: 'pin', outros: 'pin',
  salario: 'wallet', freelance: 'laptop', investimentos: 'trending-up', vendas: 'shopping-cart',
  utilities: 'zap'
};
INIT_FORM.CAT_EMOJIS = INIT_FORM.CAT_ICONS;

INIT_FORM._catIconHtml = function(slug) {
  var icon = INIT_FORM.CAT_ICONS[slug] || 'pin';
  return '<i data-lucide="' + icon + '" aria-hidden="true"></i>';
};

export { INIT_FORM };
export default INIT_FORM;
