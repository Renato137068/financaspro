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
  //
  // Delega o parsing a UTILS.parseMoeda. A implementação anterior fazia
  // `String(valor).replace(/\./g, '')` diretamente, tratando o ponto sempre
  // como separador de milhar — o que corrompia números JS legítimos:
  // validarValor(25.5) devolvia 255, inflando o lançamento em 10x.
  // parseMoeda já trata o caso `typeof input === 'number'` antes de aplicar as
  // regras de formato brasileiro.
  validarValor: function(valor) {
    var num = UTILS.parseMoeda(valor);
    if (!isFinite(num) || isNaN(num) || num <= 0) {
      return { valido: false, erro: 'Valor deve ser maior que 0' };
    }
    if (num > 999999999999.99) {
      return { valido: false, erro: 'Valor acima do limite permitido' };
    }
    return { valido: true, valor: num };
  },

  // Validar data
  validarData: function(data) {
    var s = String(data == null ? '' : data).trim();
    if (!s) {
      return { valido: false, erro: 'Data inválida' };
    }
    var iso = s.split('T')[0];
    if (/^\d{4}-\d{2}-\d{2}$/.test(iso)) {
      if (UTILS.dataIsoValida && UTILS.dataIsoValida(iso)) {
        return { valido: true, valor: iso };
      }
      return { valido: false, erro: 'Data inválida' };
    }
    var d = new Date(s);
    if (isNaN(d.getTime())) {
      return { valido: false, erro: 'Data inválida' };
    }
    return { valido: true, valor: s };
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
  },

  /** Alinhado ao registerSchema do backend */
  validarSenha: function(senha) {
    if (typeof PASSWORD_POLICY !== 'undefined') {
      return PASSWORD_POLICY.validar(senha);
    }
    var s = String(senha == null ? '' : senha);
    if (s.length < 8) return { valido: false, erro: 'Senha deve ter pelo menos 8 caracteres' };
    return { valido: true, valor: s };
  },
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = VALIDATIONS;
}
