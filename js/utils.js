/**
 * utils.js - Utility Functions
 * Tier 1: Depends on config.js
 */

var UTILS = {
  formatarMoeda: function(valor, moeda) {
    moeda = moeda || 'BRL';
    var config = CONFIG.MOEDA_FORMATACAO[moeda] || CONFIG.MOEDA_FORMATACAO.BRL;
    return new Intl.NumberFormat(config.locale, {
      style: 'currency',
      currency: config.currency
    }).format(valor);
  },

  formatarData: function(data) {
    if (typeof data === 'string') {
      if (/^\d{4}-\d{2}-\d{2}$/.test(data)) {
        data = new Date(data + 'T12:00:00');
      } else {
        data = new Date(data);
      }
    }
    return new Intl.DateTimeFormat('pt-BR', {
      year: 'numeric', month: '2-digit', day: '2-digit'
    }).format(data);
  },

  formatarDataHora: function(data) {
    if (typeof data === 'string') data = new Date(data);
    return new Intl.DateTimeFormat('pt-BR', {
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit'
    }).format(data);
  },

  validarTransacao: function(transacao) {
    if (!transacao.valor || transacao.valor <= 0) {
      return { valido: false, erro: 'Valor deve ser maior que 0' };
    }
    if (!transacao.tipo || [CONFIG.TIPO_RECEITA, CONFIG.TIPO_DESPESA].indexOf(transacao.tipo) === -1) {
      return { valido: false, erro: 'Tipo invalido' };
    }
    if (!transacao.categoria) {
      return { valido: false, erro: 'Categoria obrigatoria' };
    }
    if (!transacao.data) {
      return { valido: false, erro: 'Data obrigatoria' };
    }
    return { valido: true };
  },

  mostrarToast: function(mensagem, tipo) {
    tipo = tipo || 'info';
    var toast = document.createElement('div');
    toast.className = 'toast toast-' + tipo;
    toast.textContent = mensagem;
    toast.setAttribute('role', 'status');
    toast.setAttribute('aria-live', 'polite');
    document.body.appendChild(toast);
    setTimeout(function() { toast.classList.add('show'); }, 10);
    setTimeout(function() {
      toast.classList.remove('show');
      setTimeout(function() { toast.remove(); }, 300);
    }, 3000);
  },

  calcularSaldo: function(transacoes) {
    return transacoes.reduce(function(acc, t) {
      return t.tipo === CONFIG.TIPO_RECEITA ? acc + t.valor : acc - t.valor;
    }, 0);
  },

  filtrarPorMes: function(transacoes, mes, ano) {
    return transacoes.filter(function(t) {
      var dataStr = t.data;
      if (typeof dataStr === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(dataStr)) {
        var parts = dataStr.split('-');
        return parseInt(parts[1], 10) === mes && parseInt(parts[0], 10) === ano;
      }
      var data = new Date(dataStr + 'T12:00:00');
      return data.getMonth() === mes - 1 && data.getFullYear() === ano;
    });
  },

  filtrarPorTipo: function(transacoes, tipo) {
    return transacoes.filter(function(t) { return t.tipo === tipo; });
  },

  escapeHtml: function(text) {
    var str = String(text);
    str = str.replace(/&/g, '\x26amp;');
    str = str.replace(/</g, '\x26lt;');
    str = str.replace(/>/g, '\x26gt;');
    str = str.replace(/"/g, '\x26quot;');
    str = str.replace(/'/g, '\x26#039;');
    return str;
  },

  _idCounter: 0,
  gerarId: function() {
    var timestamp = Date.now();
    var randomPart = Math.random().toString(36).substr(2, 9);
    var counter = (this._idCounter = (this._idCounter || 0) + 1);
    return timestamp + '-' + randomPart + '-' + counter;
  }
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = UTILS;
}
