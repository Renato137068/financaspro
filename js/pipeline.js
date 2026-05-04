/**
 * pipeline.js - Unified processing pipeline
 */

var PIPELINE = {
  processar: function(input) {
    if (!input || input.length < 2) return null;

    var parsed = PARSER.extrair(input);
    var aprend = APRENDIZADO.sugerir(parsed.desc);
    var fuzzy  = typeof CATEGORIZADOR !== 'undefined' ? CATEGORIZADOR.detectar(parsed.desc) : null;
    var score  = SCORE.calcular(fuzzy, aprend);

    return {
      categoria : score.categoria,
      tipo      : score.tipo,
      banco     : parsed.banco  || (aprend && aprend.banco)  || null,
      cartao    : parsed.cartao || (aprend && aprend.cartao) || null,
      valor     : parsed.valor,
      data      : parsed.data,
      descricao : parsed.desc,
      confianca : score.confianca,
      score     : score.score,
      fonte     : score.fonte
    };
  },

  _setSelectComOpcao: function(id, valor) {
    if (!valor) return;
    var el = document.getElementById(id);
    if (!el) return;
    var existe = false;
    for (var i = 0; i < el.options.length; i++) {
      if (el.options[i].value === valor) { existe = true; break; }
    }
    if (!existe) {
      var opt = document.createElement('option');
      opt.value = opt.textContent = valor;
      el.appendChild(opt);
    }
    el.value = valor;
  },

  preencherForm: function(r) {
    if (!r) return false;

    var catEl = document.getElementById('novo-categoria');
    if (r.categoria && catEl && !catEl._manualSet) {
      DOMUTILS.set('novo-categoria', r.categoria);
      DOMUTILS.set('novo-tipo', r.tipo);
      var grid = document.getElementById('categoria-grid');
      if (grid) {
        var btns = grid.querySelectorAll('.cat-btn');
        for (var i = 0; i < btns.length; i++) {
          btns[i].classList.toggle('ativo', btns[i].dataset.cat === r.categoria);
        }
      }
      if (typeof atualizarTipoIndicator === 'function') atualizarTipoIndicator(r.tipo);
    }

    this._setSelectComOpcao('novo-banco',  r.banco);
    this._setSelectComOpcao('novo-cartao', r.cartao);

    var vEl = document.getElementById('novo-valor');
    if (r.valor && vEl && !vEl.value) {
      vEl.value = r.valor.toFixed(2).replace('.', ',');
    }
    var dEl = document.getElementById('novo-data');
    if (r.data && dEl && !dEl.value) {
      dEl.value = r.data;
    }

    if (typeof atualizarBadgeConfianca === 'function') atualizarBadgeConfianca(r.confianca);
    return true;
  }
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = PIPELINE;
}
