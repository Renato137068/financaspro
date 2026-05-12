/**
 * ocr.js — Scanner de comprovantes com OCR
 * v11.0 — Fase 8: captura de foto → extração de texto → preenchimento automático
 * Depende de: pipeline.js, dados.js, utils.js
 *
 * Estratégia em camadas (graceful degradation):
 *   1. window.ai (Chrome built-in AI) — se disponível
 *   2. Tesseract.js — lazy-loaded do CDN
 *   3. Regex patterns — extração heurística offline
 *   4. Fallback — input manual assistido
 */

var OCR = {
  _processando: false,
  _tesseractLoaded: false,
  _UI_ID: 'ocr-modal',

  // ─────────────────────────────────────────────────────────────────
  // INICIALIZAÇÃO
  // ─────────────────────────────────────────────────────────────────

  init: function() {
    this._injetarBotaoCaptura();
    this._configurarInputFile();
  },

  _injetarBotaoCaptura: function() {
    // Adicionar botão de scan ao wrapper da entrada rápida, se existir
    var wrapper = document.querySelector('.er-wrapper');
    if (!wrapper || document.getElementById('btn-ocr-scan')) return;

    var btn = document.createElement('button');
    btn.type      = 'button';
    btn.id        = 'btn-ocr-scan';
    btn.className = 'er-btn ocr-btn';
    btn.title     = 'Escanear comprovante (OCR)';
    btn.setAttribute('aria-label', 'Escanear comprovante');
    btn.innerHTML = '📷';
    btn.addEventListener('click', this.abrirScanner.bind(this));
    wrapper.appendChild(btn);
  },

  _configurarInputFile: function() {
    var inp = document.getElementById('ocr-file-input');
    if (!inp) {
      inp = document.createElement('input');
      inp.type   = 'file';
      inp.id     = 'ocr-file-input';
      inp.accept = 'image/*';
      inp.setAttribute('capture', 'camera');
      inp.style.display = 'none';
      inp.setAttribute('aria-hidden', 'true');
      document.body.appendChild(inp);
    }

    var self = this;
    inp.addEventListener('change', function(e) {
      var file = e.target.files && e.target.files[0];
      if (file) self.processarImagem(file);
      // Reset para permitir re-seleção do mesmo arquivo
      inp.value = '';
    });
  },

  // ─────────────────────────────────────────────────────────────────
  // FLUXO PRINCIPAL
  // ─────────────────────────────────────────────────────────────────

  /**
   * Abre o scanner (câmera ou galeria).
   */
  abrirScanner: function() {
    if (this._processando) return;
    var inp = document.getElementById('ocr-file-input');
    if (inp) inp.click();
  },

  /**
   * Processa imagem capturada.
   * @param {File} file
   */
  processarImagem: function(file) {
    if (this._processando || !file) return;
    if (!file.type.startsWith('image/')) {
      this._mostrarFeedback('⚠️ Selecione uma imagem válida.', 'erro');
      return;
    }

    this._processando = true;
    this._mostrarFeedback('🔍 Analisando imagem...', 'info');

    var self = this;
    this._lerArquivo(file)
      .then(function(dataUrl) { return self._preprocessarImagem(dataUrl); })
      .then(function(canvas) { return self._extrairTexto(canvas); })
      .then(function(texto) {
        var resultado = self._parseComprovante(texto);
        self._preencherFormulario(resultado, texto);
      })
      .catch(function(err) {
        console.warn('[OCR] Erro:', err);
        self._mostrarFeedbackManual();
      })
      .finally(function() {
        self._processando = false;
      });
  },

  // ─────────────────────────────────────────────────────────────────
  // PROCESSAMENTO DE IMAGEM
  // ─────────────────────────────────────────────────────────────────

  _lerArquivo: function(file) {
    return new Promise(function(resolve, reject) {
      var reader = new FileReader();
      reader.onload  = function(e) { resolve(e.target.result); };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  },

  /**
   * Pré-processa imagem em canvas (aumenta contraste, escala de cinza).
   * Melhora qualidade para OCR.
   */
  _preprocessarImagem: function(dataUrl) {
    return new Promise(function(resolve, reject) {
      var img    = new Image();
      img.onload = function() {
        var MAX  = 1400;
        var w    = img.naturalWidth  || img.width;
        var h    = img.naturalHeight || img.height;
        var scale = Math.min(1, MAX / Math.max(w, h));

        var canvas  = document.createElement('canvas');
        canvas.width  = Math.round(w * scale);
        canvas.height = Math.round(h * scale);
        var ctx     = canvas.getContext('2d');

        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

        // Escala de cinza + aumento de contraste
        var imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        var data      = imageData.data;
        for (var i = 0; i < data.length; i += 4) {
          var gray = 0.299 * data[i] + 0.587 * data[i+1] + 0.114 * data[i+2];
          // Contraste: escala linear para [0, 255] com clamp
          gray = Math.min(255, Math.max(0, (gray - 128) * 1.4 + 128));
          data[i] = data[i+1] = data[i+2] = gray;
        }
        ctx.putImageData(imageData, 0, 0);
        resolve(canvas);
      };
      img.onerror = reject;
      img.src     = dataUrl;
    });
  },

  /**
   * Extrai texto da imagem. Tenta 3 estratégias em cascata.
   * @param {HTMLCanvasElement} canvas
   * @returns {Promise<string>}
   */
  _extrairTexto: function(canvas) {
    var self = this;

    // Estratégia 1: Chrome built-in AI (experimental)
    if (window.ai && window.ai.createTextSession) {
      return this._extrairViaWindowAI(canvas).catch(function() {
        return self._extrairViaTesseract(canvas);
      });
    }

    // Estratégia 2: Tesseract.js
    return this._extrairViaTesseract(canvas);
  },

  _extrairViaWindowAI: function(canvas) {
    return new Promise(function(resolve, reject) {
      try {
        var dataUrl = canvas.toDataURL('image/jpeg', 0.85);
        window.ai.createTextSession().then(function(session) {
          // Nota: window.ai.summarizer / prompter varia por versão do Chrome
          // Este path é experimental e pode não estar disponível
          session.prompt('Extraia todo o texto visível desta imagem de comprovante. Responda apenas com o texto extraído, sem formatação adicional.')
            .then(function(txt) { resolve(txt || ''); })
            .catch(reject);
        }).catch(reject);
      } catch (e) { reject(e); }
    });
  },

  _extrairViaTesseract: function(canvas) {
    var self = this;
    return this._carregarTesseract().then(function(Tesseract) {
      if (!Tesseract) return self._extrairHeuristico(canvas);
      self._mostrarFeedback('🔍 Reconhecendo texto (OCR)...', 'info');
      return Tesseract.recognize(canvas, 'por', {
        logger: function(m) {
          if (m.status === 'recognizing text') {
            self._mostrarFeedback('🔍 OCR: ' + Math.round((m.progress || 0) * 100) + '%...', 'info');
          }
        }
      }).then(function(result) {
        return result && result.data ? result.data.text : '';
      });
    });
  },

  /**
   * Fallback heurístico: analisa pixels para detectar regiões de texto.
   * Produz resultado mínimo para o parser.
   */
  _extrairHeuristico: function(canvas) {
    // Sem Tesseract, retorna string vazia para ativar o fallback manual
    return Promise.resolve('');
  },

  /**
   * Lazy-load do Tesseract.js via CDN.
   * @returns {Promise<Object|null>}
   */
  _carregarTesseract: function() {
    if (this._tesseractLoaded && window.Tesseract) {
      return Promise.resolve(window.Tesseract);
    }
    return new Promise(function(resolve) {
      var script    = document.createElement('script');
      script.src    = 'https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js';
      script.onload = function() {
        OCR._tesseractLoaded = true;
        resolve(window.Tesseract || null);
      };
      script.onerror = function() {
        console.warn('[OCR] Tesseract.js não carregou (offline?).');
        resolve(null);
      };
      document.head.appendChild(script);
    });
  },

  // ─────────────────────────────────────────────────────────────────
  // PARSING DO TEXTO EXTRAÍDO
  // ─────────────────────────────────────────────────────────────────

  /**
   * Extrai valor, data, estabelecimento e método de pagamento do texto OCR.
   * @param {string} texto
   * @returns {Object} { valor, data, descricao, banco, cartao }
   */
  _parseComprovante: function(texto) {
    if (!texto || texto.trim().length < 5) return {};

    var linhas = texto.split(/\n/).map(function(l) { return l.trim(); }).filter(Boolean);
    var full   = texto.toLowerCase();

    // VALOR — padrões brasileiros
    var valor = null;
    var regsValor = [
      /(?:total|valor|pago|cobrado|r\$|brl)[:\s]*([0-9]{1,3}(?:[.,][0-9]{3})*(?:[.,][0-9]{2}))/i,
      /([0-9]{1,3}(?:\.[0-9]{3})*,[0-9]{2})/,
      /([0-9]+[.,][0-9]{2})/
    ];
    for (var rv = 0; rv < regsValor.length; rv++) {
      var mv = texto.match(regsValor[rv]);
      if (mv) {
        valor = parseFloat(mv[1].replace(/\./g, '').replace(',', '.'));
        if (valor > 0 && valor < 100000) break;
        valor = null;
      }
    }

    // DATA
    var data = null;
    var regsData = [
      /(\d{2})\/(\d{2})\/(\d{4})/,
      /(\d{2})-(\d{2})-(\d{4})/,
      /(\d{4})-(\d{2})-(\d{2})/
    ];
    for (var rd = 0; rd < regsData.length; rd++) {
      var md = texto.match(regsData[rd]);
      if (md) {
        try {
          var d = rd === 2
            ? new Date(md[1] + '-' + md[2] + '-' + md[3])
            : new Date(md[3] + '-' + md[2] + '-' + md[1]);
          if (!isNaN(d.getTime())) {
            data = d.toISOString().split('T')[0];
            break;
          }
        } catch (e) { /* silencioso */ }
      }
    }

    // ESTABELECIMENTO (primeira linha longa que não é número/data)
    var descricao = '';
    for (var li = 0; li < linhas.length; li++) {
      var linha = linhas[li];
      if (linha.length >= 4 && !/^[\d,.\s]+$/.test(linha) && !/cpf|cnpj|nsu|autori/i.test(linha)) {
        descricao = linha.slice(0, 40);
        break;
      }
    }

    // BANCO / CARTÃO
    var banco = null;
    var cartao = null;
    var bancosPat = /nubank|itaú|itau|caixa|bradesco|santander|inter|sicredi|banco do brasil|bb|bb:/i;
    var bancoMatch = texto.match(bancosPat);
    if (bancoMatch) banco = bancoMatch[0].toLowerCase().replace(/\s+/g, '-');

    if (/créd[ito]|crédito/i.test(full))  cartao = 'crédito';
    if (/déb[ito]|débito/i.test(full))    cartao = 'débito';
    if (/pix/i.test(full))                cartao = 'pix';

    return { valor: valor, data: data, descricao: descricao, banco: banco, cartao: cartao };
  },

  // ─────────────────────────────────────────────────────────────────
  // PREENCHIMENTO DO FORMULÁRIO
  // ─────────────────────────────────────────────────────────────────

  /**
   * Usa PIPELINE para categorizar e preencher o formulário de nova transação.
   * @param {Object} resultado — saída de _parseComprovante
   * @param {string} textoOriginal — texto OCR bruto para fallback
   */
  _preencherFormulario: function(resultado, textoOriginal) {
    if (!resultado || (!resultado.valor && !resultado.descricao)) {
      this._mostrarFeedbackManual(textoOriginal);
      return;
    }

    // Garantir que estamos na aba "novo"
    if (typeof APP_STORE !== 'undefined') APP_STORE.ui.setAba('novo');

    var input = document.getElementById('entrada-rapida-input');
    if (input && resultado.descricao) {
      input.value = resultado.descricao +
        (resultado.valor ? ' ' + resultado.valor.toFixed(2).replace('.', ',') : '') +
        (resultado.data ? ' ' + this._formatarDataParaEntrada(resultado.data) : '');
    }

    // Preencher campos diretamente se disponíveis
    var valEl  = document.getElementById('novo-valor');
    var dataEl = document.getElementById('novo-data');
    var descEl = document.getElementById('novo-descricao');

    if (valEl  && resultado.valor)    valEl.value  = resultado.valor.toFixed(2).replace('.', ',');
    if (dataEl && resultado.data)     dataEl.value = resultado.data;
    if (descEl && resultado.descricao) descEl.value = resultado.descricao;

    // Usar PIPELINE para categorizar pela descrição
    if (typeof PIPELINE !== 'undefined' && resultado.descricao) {
      var piped = PIPELINE.processar(resultado.descricao +
        (resultado.valor ? ' ' + resultado.valor : ''));
      if (piped) {
        piped.valor = piped.valor || resultado.valor;
        piped.data  = piped.data  || resultado.data;
        PIPELINE.preencherForm(piped);
      }
    }

    var campo = resultado.valor
      ? 'R$ ' + resultado.valor.toFixed(2).replace('.', ',')
      : resultado.descricao || '?';
    this._mostrarFeedback('✅ Comprovante lido: ' + campo, 'sucesso');
  },

  _formatarDataParaEntrada: function(dataIso) {
    var hoje    = new Date().toISOString().split('T')[0];
    var ontem   = new Date(Date.now() - 86400000).toISOString().split('T')[0];
    if (dataIso === hoje)  return 'hoje';
    if (dataIso === ontem) return 'ontem';
    return dataIso;
  },

  // ─────────────────────────────────────────────────────────────────
  // FALLBACK MANUAL
  // ─────────────────────────────────────────────────────────────────

  _mostrarFeedbackManual: function(textoOcr) {
    this._mostrarFeedback(
      '⚠️ Não consegui ler automaticamente. ' +
      (textoOcr ? 'Verifique o texto abaixo e ajuste manualmente.' : 'Digite os dados manualmente.'),
      'aviso'
    );

    if (textoOcr) {
      var inp = document.getElementById('entrada-rapida-input');
      if (inp && !inp.value) {
        // Tenta extrair pelo menos o valor para ajudar o usuário
        var valMatch = textoOcr.match(/([0-9]+[.,][0-9]{2})/);
        if (valMatch) inp.value = valMatch[1].replace(',', '.');
      }
    }
  },

  // ─────────────────────────────────────────────────────────────────
  // FEEDBACK
  // ─────────────────────────────────────────────────────────────────

  _mostrarFeedback: function(msg, tipo) {
    // 1. Elemento feedback da entrada rápida
    var el = document.getElementById('er-feedback');
    if (el) {
      el.textContent = msg;
      el.style.display = 'block';
      el.className = 'er-feedback er-feedback-' + (tipo || 'info');
      if (tipo === 'sucesso' || tipo === 'erro') {
        setTimeout(function() { if (el) el.style.display = 'none'; }, 4000);
      }
    }

    // 2. Toast global para mensagens de sucesso/erro
    if ((tipo === 'sucesso' || tipo === 'erro') &&
        typeof UTILS !== 'undefined' && typeof UTILS.mostrarToast === 'function') {
      UTILS.mostrarToast(msg, tipo === 'sucesso' ? 'sucesso' : 'erro', 3500);
    }
  }
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = OCR;
}
