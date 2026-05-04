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
    var parts = String(data).split('T')[0].split('-');
    if (parts.length === 3) {
      return parts[2] + '/' + parts[1] + '/' + parts[0];
    }
    return new Intl.DateTimeFormat('pt-BR').format(new Date(data));
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
      var data = new Date(t.data);
      return data.getMonth() === mes - 1 && data.getFullYear() === ano;
    });
  },

  filtrarPorTipo: function(transacoes, tipo) {
    return transacoes.filter(function(t) { return t.tipo === tipo; });
  },

  escapeHtml: function(text) {
    var map = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' };
    return String(text).replace(/[&<>"']/g, function(m) { return map[m]; });
  },

  labelCategoria: function(key) {
    return CONFIG.CATEGORIAS_MAP[key] || key;
  },

  formatarDataRelativa: function(data) {
    var parts = String(data).split('T')[0].split('-');
    if (parts.length !== 3) return this.formatarData(data);
    var hoje = new Date();
    var d = new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]));
    var ontem = new Date(hoje); ontem.setDate(hoje.getDate() - 1);
    if (d.toDateString() === hoje.toDateString()) return 'Hoje';
    if (d.toDateString() === ontem.toDateString()) return 'Ontem';
    return this.formatarData(data);
  },

  _idCounter: 0,
  gerarId: function() {
    var timestamp = Date.now();
    var randomPart = Math.random().toString(36).substr(2, 9);
    var counter = (this._idCounter = (this._idCounter || 0) 