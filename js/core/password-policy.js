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

  /**
   * Senhas que um ataque de dicionário testa nos primeiros segundos.
   * Lista curta e local de propósito: consultar um serviço externo (HIBP)
   * exigiria abrir a CSP e mandar dado de senha para fora — o oposto do
   * posicionamento do app. Cobre o que aparece no topo dos vazamentos BR,
   * já normalizado (minúsculas, sem acento, sem separador).
   */
  COMUNS: [
    '12345678', '123456789', '1234567890', '12345678910', '987654321',
    'senha123', 'senha1234', 'minhasenha', 'senhasenha', 'password',
    'password1', 'password123', 'passw0rd', 'qwerty123', 'qwertyui',
    'abc12345', 'abcd1234', 'a1b2c3d4', '11223344', '10203040',
    'brasil123', 'brasil2026', 'saopaulo', 'flamengo1', 'corinthians',
    'palmeiras', 'gremio123', 'vasco123', 'santos123', 'cruzeiro1',
    'familia1', 'familia123', 'amor1234', 'deusefiel', 'deusnocontrole',
    'teamo123', 'meuamor1', 'jesus123', 'jesuscristo', 'principal',
    'admin123', 'administrador', 'usuario123', 'teste123', 'teste1234',
    'financas1', 'financas123', 'dinheiro1', 'dinheiro123', 'banco123',
    'iloveyou', 'sunshine1', 'welcome1', 'letmein1', 'monkey123',
  ],

  /** Reduz a senha à forma que um dicionário usaria: sem acento, sem ruído. */
  _normalizar: function(senha) {
    var s = String(senha == null ? '' : senha).toLowerCase();
    if (s.normalize) s = s.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    return s.replace(/[^a-z0-9]/g, '');
  },

  /** Um único caractere repetido, ou sequência crescente/decrescente. */
  _trivial: function(s) {
    if (/^(.)\1+$/.test(s)) return true;
    var seqs = ['0123456789', 'abcdefghijklmnopqrstuvwxyz', 'qwertyuiopasdfghjklzxcvbnm'];
    for (var i = 0; i < seqs.length; i++) {
      var seq = seqs[i];
      var inv = seq.split('').reverse().join('');
      if (s.length >= 6 && (seq.indexOf(s) >= 0 || inv.indexOf(s) >= 0)) return true;
    }
    return false;
  },

  ehComum: function(senha) {
    var n = this._normalizar(senha);
    if (!n) return false;
    if (this._trivial(n)) return true;
    return this.COMUNS.indexOf(n) >= 0;
  },

  /**
   * Força de 0 a 4, para o medidor visual. Não substitui validar():
   * uma senha fraca porém válida continua sendo aceita — o medidor informa,
   * não bloqueia.
   */
  forca: function(senha) {
    var s = String(senha == null ? '' : senha);
    if (!s) return { nota: 0, rotulo: '' };
    if (this.ehComum(s)) return { nota: 0, rotulo: 'Muito fraca — senha conhecida' };

    var pontos = 0;
    if (s.length >= 8) pontos++;
    if (s.length >= 12) pontos++;
    if (s.length >= 16) pontos++;
    var variedade = 0;
    if (/[a-z]/.test(s)) variedade++;
    if (/[A-Z]/.test(s)) variedade++;
    if (/[0-9]/.test(s)) variedade++;
    if (/[^a-zA-Z0-9]/.test(s)) variedade++;
    if (variedade >= 3) pontos++;
    if (variedade === 4) pontos++;

    var nota = Math.max(1, Math.min(4, pontos));
    var rotulos = ['', 'Fraca', 'Razoável', 'Boa', 'Forte'];
    return { nota: nota, rotulo: rotulos[nota] };
  },

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
    if (this.ehComum(s)) {
      return {
        valido: false,
        erro: 'Essa senha é conhecida por atacantes. Escolha outra que só você usaria.',
      };
    }
    return { valido: true, valor: s };
  },
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = PASSWORD_POLICY;
}
