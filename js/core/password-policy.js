/**
 * password-policy.js — regras de senha alinhadas ao backend (registerSchema).
 * Tier 0. Sem dependências.
 */
var PASSWORD_POLICY = {
  MIN: 8,
  MAX: 128,
  /** Mesmo regex de backend/middleware/validate.js */
  REQUIRES: /[0-9!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?]/,
  HINT: 'Mínimo 8 caracteres, com pelo menos um número ou caractere especial',

  validar: function(senha) {
    var s = String(senha == null ? '' : senha);
    if (s.length < this.MIN) {
      return { valido: false, erro: 'Senha deve ter pelo menos 8 caracteres' };
    }
    if (s.length > this.MAX) {
      return { valido: false, erro: 'Senha muito longa' };
    }
    if (!this.REQUIRES.test(s)) {
      return { valido: false, erro: 'Senha deve conter pelo menos um número ou caractere especial' };
    }
    return { valido: true, valor: s };
  },
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = PASSWORD_POLICY;
}
