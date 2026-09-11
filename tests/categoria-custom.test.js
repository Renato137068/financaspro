/**
 * categoria-custom.test.js — custom não colapsa em "outro".
 */
const CONFIG = require('../js/core/config.js');

describe('CONFIG.normalizeCategoriaFinal — categorias custom', function() {
  var prevDados;

  beforeEach(function() {
    prevDados = global.DADOS;
    global.DADOS = {
      getConfig: function() {
        return {
          categoriasCustom: {
            despesa: ['Meu stream', 'Curso de inglês'],
            receita: ['Aulas particulares'],
          },
        };
      },
    };
  });

  afterEach(function() {
    global.DADOS = prevDados;
  });

  test('despesa custom vira slug estável, não outro', function() {
    expect(CONFIG.normalizeCategoriaFinal('Meu stream', 'despesa')).toBe('meu_stream');
    expect(CONFIG.normalizeCategoriaFinal('Curso de inglês', 'despesa')).toBe('curso_de_ingles');
  });

  test('receita custom preservada', function() {
    expect(CONFIG.normalizeCategoriaFinal('Aulas particulares', 'receita')).toBe('aulas_particulares');
  });

  test('desconhecida ainda cai em outro/outros', function() {
    expect(CONFIG.normalizeCategoriaFinal('coisa inventada', 'despesa')).toBe('outro');
    expect(CONFIG.normalizeCategoriaFinal('coisa inventada', 'receita')).toBe('outros');
  });

  test('whitelist continua intacta', function() {
    expect(CONFIG.normalizeCategoriaFinal('alimentacao', 'despesa')).toBe('alimentacao');
    expect(CONFIG.normalizeCategoriaFinal('salario', 'receita')).toBe('salario');
  });

  test('getCatLabel devolve o nome custom', function() {
    expect(CONFIG.getCatLabel('meu_stream')).toBe('Meu stream');
    expect(CONFIG.getCatLabel('curso_de_ingles')).toBe('Curso de inglês');
    expect(CONFIG.getCatLabel('alimentacao')).toBe('Alimentação');
  });
});
