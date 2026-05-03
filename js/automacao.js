/**
 * automacao.js - Auto-save + Anomaly detection
 * Tier 1: Depends on dados.js, transacoes.js, utils.js
 */

var AUTOMACAO = {
  _rascunho: {},
  _timerSave: null,
  _limiteAnomalia: 2.5, // 2.5x da média

  init: function() {
    this.setupAutoSave();
  },

  // Auto-save em tempo real
  setupAutoSave: function() {
    var inputs = document.querySelectorAll('[data-autosave]');
    var self = this;

    inputs.forEach(function(input) {
      input.addEventListener('input', function() {
        clearTimeout(self._timerSave);
        var campo = input.dataset.autosave;
        self._rascunho[campo] = input.value;
        self._timerSave = setTimeout(function() {
          self.salvarRascunho();
        }, 500);
      });

      // Restaurar rascunho ao focar
      input.addEventListener('focus', function() {
        if (self._rascunho[campo]) {
          input.value = self._rascunho[campo];
        }
      });
    });

    // Restaurar ao carregar
    this.restaurarRascunho();
  },

  salvarRascunho: function() {
    if (Object.keys(this._rascunho).length > 0) {
      try {
        localStorage.setItem('_rascunho_transacao', JSON.stringify(this._rascunho));
      } catch (e) {
        console.error('Erro ao salvar rascunho:', e);
      }
    }
  },

  restaurarRascunho: function() {
    try {
      var saved = localStorage.getItem('_rascunho_transacao');
      if (saved) {
        this._rascunho = JSON.parse(saved);
        Object.keys(this._rascunho).forEach(function(campo) {
          var input = document.querySelector('[data-autosave="' + campo + '"]');
          if (input) {
            input.value = this._rascunho[campo];
          }
        }.bind(this));
      }
    } catch (e) {
      console.error('Erro ao restaurar rascunho:', e);
    }
  },

  limparRascunho: function() {
    this._rascunho = {};
    localStorage.removeItem('_rascunho_transacao');
  },

  // Detectar gasto anômalo
  detectarAnomalia: function(valor, categoria, tipo) {
    if (tipo !== 'despesa') return null;

    var agora = new Date();
    var transacoes = DADOS.getTransacoes();
    var mesAtual = agora.getMonth() + 1;
    var anoAtual = agora.getFullYear();

    // Média dos últimos 3 meses nesta categoria
    var valores = [];
    for (var mes = 1; mes <= 3; mes++) {
      var mesAntigo = mesAtual - mes;
      var anoAntigo = anoAtual;
      if (mesAntigo <= 0) {
        mesAntigo += 12;
        anoAntigo -= 1;
      }
      var resumo = TRANSACOES.obterResumoCategoriaMes(categoria, mesAntigo, anoAntigo);
      if (resumo && resumo > 0) {
        valores.push(resumo);
      }
    }

    if (valores.length === 0) return null;

    var media = valores.reduce(function(a, b) { return a + b; }, 0) / valores.length;
    var limite = media * this._limiteAnomalia;

    if (valor > limite) {
      return {
        tipo: 'alerta',
        mensagem: 'Gasto ' + ((valor / media).toFixed(1)) + 'x acima da média em ' + UTILS.labelCategoria(categoria),
        valor: valor,
        media: media,
        limite: limite
      };
    }

    return null;
  },

  // Sugerir categoria e mostrar alerta
  processarDescricao: function(descricao, callback) {
    if (!descricao) return;

    var deteccao = CATEGORIAS.detectar(descricao);
    if (deteccao && deteccao.categoria) {
      var resultado = {
        categoria: deteccao.categoria,
        tipo: deteccao.tipo,
        mensagem: 'Categoria sugerida: ' + UTILS.labelCategoria(deteccao.categoria)
      };

      if (callback) callback(resultado);
      return resultado;
    }
  },

  // Exibir alerta visual
  mostrarAlerta: function(alerta) {
    if (!alerta) return;

    var container = DOMUTILS.get('orcamento-preview');
    if (!container) return;

    var html = '<div class="alerta alerta-' + alerta.tipo + '">' +
      '<span class="alerta-icon">⚠️</span>' +
      '<span class="alerta-text">' + UTILS.escapeHtml(alerta.mensagem) + '</span>' +
    '</div>';

    container.innerHTML = html;
  },

  limparAlerta: function() {
    var container = DOMUTILS.get('orcamento-preview');
    if (container) container.innerHTML = '';
  }
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = AUTOMACAO;
}
