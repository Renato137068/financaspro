/**
 * validations.js - Input validation and sanitization
 * Tier 1: Depends on config.js, utils.js
 */

var VALIDATIONS = {
  // Validar e sanitizar entrada de texto
  sanitizarTexto: function(texto) {
    return UTILS.escapeHtml(String(texto).trim());
  },

  // Validar descrição
  validarDescricao: function(descricao) {
    var texto = this.sanitizarTexto(descricao);
    if (!texto || texto.length === 0) {
      return { valido: false, erro: 'Descrição é obrigatória' };
    }
    if (texto.length > 100) {
      return { valido: false, erro: 'Descrição não pode ter mais de 100 caracteres' };
    }
    return { valido: true, valor: texto };
  },

  // Validar valor monetário
  validarValor: function(valor) {
    var str = String(valor).replace(/\./g, '').replace(',', '.');
    var num = parseFloat(str);
    if (isNaN(num) || num <= 0) {
      return { valido: false, erro: 'Valor deve ser maior que 0' };
    }
    return { valido: true, valor: num };
  },

  // Validar data
  validarData: function(data) {
    var d = new Date(data);
    if (isNaN(d.getTime())) {
      return { valido: false, erro: 'Data inválida' };
    }
    return { valido: true, valor: data };
  },

  // Validar categoria
  validarCategoria: function(categoria, tipo) {
    if (!categoria) {
      return { valido: false, erro: 'Categoria obrigatória' };
    }
    var cats = tipo === CONFIG.TIPO_RECEITA ? CONFIG.CATEGORIAS_RECEITA : CONFIG.CATEGORIAS_DESPESA;
    if (cats.indexOf(categoria) === -1) {
      return { valido: false, erro: 'Categoria inválida' };
    }
    return { valido: true, valor: categoria };
  },

  // Validar transação completa
  validarTransacaoCompleta: function(dados) {
    var descVal = this.validarDescricao(dados.descricao);
    if (!descVal.valido) return descVal;

    var valVal = this.validarValor(dados.valor);
    if (!valVal.valido) return valVal;

    var dataVal = this.validarData(dados.data);
    if (!dataVal.valido) return dataVal;

    var catVal = this.validarCategoria(dados.categoria, dados.tipo);
    if (!catVal.valido) return catVal;

    return { valido: true };
  }
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = VALIDATIONS;
}
