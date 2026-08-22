/**
 * validations.test.js — Testes para js/validations.js
 * Cobre: sanitizarTexto, validarDescricao, validarValor, validarData,
 *        validarCategoria, validarTransacaoCompleta
 */

const { loadCoreModules } = require('./load-sources');

// Carrega os módulos REAIS de js/. Antes deste ajuste o arquivo declarava uma
// cópia inline de VALIDATIONS e testava a cópia — os testes passavam mesmo quando o
// código de produção divergia. Ver tests/suite-integrity.test.js.
loadCoreModules();
const VALIDATIONS = global.VALIDATIONS;

// ─────────────────────────────────────────────────────────────────────────────

describe('VALIDATIONS — sanitizarTexto', () => {
  test('remove espaços nas bordas', () => {
    expect(VALIDATIONS.sanitizarTexto('  mercado  ')).toBe('mercado');
  });

  test('escapa HTML perigoso', () => {
    expect(VALIDATIONS.sanitizarTexto('<script>alert(1)</script>')).not.toContain('<script>');
  });

  test('converte número para string sanitizada', () => {
    expect(VALIDATIONS.sanitizarTexto(42)).toBe('42');
  });

  test('preserva texto normal sem alteração', () => {
    expect(VALIDATIONS.sanitizarTexto('Aluguel Março')).toBe('Aluguel Março');
  });
});

describe('VALIDATIONS — validarDescricao', () => {
  test('descrição válida retorna { valido: true, valor }', () => {
    const r = VALIDATIONS.validarDescricao('Mercado');
    expect(r.valido).toBe(true);
    expect(r.valor).toBe('Mercado');
  });

  test('string vazia retorna erro', () => {
    const r = VALIDATIONS.validarDescricao('');
    expect(r.valido).toBe(false);
    expect(r.erro).toMatch(/obrigatória/i);
  });

  test('apenas espaços retorna erro', () => {
    const r = VALIDATIONS.validarDescricao('   ');
    expect(r.valido).toBe(false);
  });

  test('descrição com exatamente 100 caracteres é válida', () => {
    const desc = 'a'.repeat(100);
    expect(VALIDATIONS.validarDescricao(desc).valido).toBe(true);
  });

  test('descrição com 101 caracteres retorna erro', () => {
    const desc = 'a'.repeat(101);
    const r = VALIDATIONS.validarDescricao(desc);
    expect(r.valido).toBe(false);
    expect(r.erro).toMatch(/100 caracteres/i);
  });

  test('descrição é sanitizada antes da validação', () => {
    const r = VALIDATIONS.validarDescricao('  Café  ');
    expect(r.valido).toBe(true);
    expect(r.valor).toBe('Café');
  });
});

describe('VALIDATIONS — validarValor', () => {
  test('valor inteiro positivo é válido', () => {
    const r = VALIDATIONS.validarValor(100);
    expect(r.valido).toBe(true);
    expect(r.valor).toBe(100);
  });

  test('valor decimal com vírgula (formato BR) é válido', () => {
    const r = VALIDATIONS.validarValor('1.500,99');
    expect(r.valido).toBe(true);
    expect(r.valor).toBeCloseTo(1500.99);
  });

  test('valor com ponto separador de milhar é convertido', () => {
    const r = VALIDATIONS.validarValor('2.000');
    expect(r.valido).toBe(true);
    expect(r.valor).toBe(2000);
  });

  test('valor zero retorna erro', () => {
    expect(VALIDATIONS.validarValor(0).valido).toBe(false);
  });

  test('valor negativo retorna erro', () => {
    expect(VALIDATIONS.validarValor(-50).valido).toBe(false);
  });

  test('string não numérica retorna erro', () => {
    const r = VALIDATIONS.validarValor('abc');
    expect(r.valido).toBe(false);
    expect(r.erro).toMatch(/maior que 0/i);
  });

  test('string vazia retorna erro', () => {
    expect(VALIDATIONS.validarValor('').valido).toBe(false);
  });

  test('valor 0.01 (mínimo) é válido', () => {
    expect(VALIDATIONS.validarValor(0.01).valido).toBe(true);
  });
});

describe('VALIDATIONS — validarData', () => {
  test('data ISO válida é aceita', () => {
    const r = VALIDATIONS.validarData('2024-03-15');
    expect(r.valido).toBe(true);
    expect(r.valor).toBe('2024-03-15');
  });

  test('string inválida retorna erro', () => {
    const r = VALIDATIONS.validarData('nao-e-data');
    expect(r.valido).toBe(false);
    expect(r.erro).toMatch(/inválida/i);
  });

  test('data vazia retorna erro', () => {
    expect(VALIDATIONS.validarData('').valido).toBe(false);
  });

  test('data com hora ISO é válida', () => {
    expect(VALIDATIONS.validarData('2024-01-01T10:00:00Z').valido).toBe(true);
  });
});

describe('VALIDATIONS — validarCategoria', () => {
  test('categoria de despesa válida é aceita', () => {
    const r = VALIDATIONS.validarCategoria('alimentacao', 'despesa');
    expect(r.valido).toBe(true);
    expect(r.valor).toBe('alimentacao');
  });

  test('categoria de receita válida é aceita', () => {
    const r = VALIDATIONS.validarCategoria('salario', 'receita');
    expect(r.valido).toBe(true);
  });

  test('categoria inválida para o tipo retorna erro', () => {
    // 'salario' é categoria de receita, não despesa
    const r = VALIDATIONS.validarCategoria('salario', 'despesa');
    expect(r.valido).toBe(false);
    expect(r.erro).toMatch(/inválida/i);
  });

  test('categoria vazia retorna erro', () => {
    const r = VALIDATIONS.validarCategoria('', 'despesa');
    expect(r.valido).toBe(false);
    expect(r.erro).toMatch(/obrigatória/i);
  });

  test('categoria inexistente retorna erro', () => {
    expect(VALIDATIONS.validarCategoria('videogame', 'despesa').valido).toBe(false);
  });
});

describe('VALIDATIONS — validarTransacaoCompleta', () => {
  const dadosValidos = {
    descricao: 'Supermercado',
    valor: 250.50,
    data: '2024-03-15',
    categoria: 'alimentacao',
    tipo: 'despesa',
  };

  test('transação completa válida retorna { valido: true }', () => {
    expect(VALIDATIONS.validarTransacaoCompleta(dadosValidos)).toEqual({ valido: true });
  });

  test('falha em descrição retorna erro de descrição', () => {
    const r = VALIDATIONS.validarTransacaoCompleta({ ...dadosValidos, descricao: '' });
    expect(r.valido).toBe(false);
    expect(r.erro).toMatch(/obrigatória/i);
  });

  test('falha em valor retorna erro de valor', () => {
    const r = VALIDATIONS.validarTransacaoCompleta({ ...dadosValidos, valor: 0 });
    expect(r.valido).toBe(false);
    expect(r.erro).toMatch(/maior que 0/i);
  });

  test('falha em data retorna erro de data', () => {
    const r = VALIDATIONS.validarTransacaoCompleta({ ...dadosValidos, data: 'invalido' });
    expect(r.valido).toBe(false);
    expect(r.erro).toMatch(/inválida/i);
  });

  test('falha em categoria retorna erro de categoria', () => {
    const r = VALIDATIONS.validarTransacaoCompleta({ ...dadosValidos, categoria: 'salario' });
    expect(r.valido).toBe(false);
    expect(r.erro).toMatch(/inválida/i);
  });

  test('validações são executadas em ordem: descrição → valor → data → categoria', () => {
    // Todos inválidos: deve retornar o primeiro erro (descrição)
    const r = VALIDATIONS.validarTransacaoCompleta({
      descricao: '',
      valor: 0,
      data: 'invalido',
      categoria: '',
      tipo: 'despesa',
    });
    expect(r.erro).toMatch(/obrigatória/i);
  });
});
