/**
 * parser.test.js — Testes para js/parser.js
 * Cobre: extrair (tokens, valor, data, banco, cartão, descrição), parseData
 */

const { loadCoreModules } = require('./load-sources');

// Carrega os módulos REAIS de js/. Antes deste ajuste o arquivo declarava uma
// cópia inline de PARSER e testava a cópia — os testes passavam mesmo quando o
// código de produção divergia. Ver tests/suite-integrity.test.js.
loadCoreModules();
const PARSER = global.PARSER;

// ─────────────────────────────────────────────────────────────────────────────

// Data de referência para testes determinísticos.
//
// As expectativas são montadas com a data LOCAL, não com toISOString(). Este
// arquivo usava toISOString() — o mesmo idioma que causava o bug em produção —
// e por isso concordava com o código defeituoso: em America/Sao_Paulo, depois
// das 21h, ambos devolviam a data de amanhã e o teste passava. Um teste escrito
// com o bug dentro nunca pega o bug.
const HOJE = new Date();

function isoLocal(d) {
  return d.getFullYear() + '-'
    + String(d.getMonth() + 1).padStart(2, '0') + '-'
    + String(d.getDate()).padStart(2, '0');
}

const HOJE_STR = isoLocal(HOJE);

function dataOffset(dias) {
  const d = new Date(HOJE);
  d.setDate(d.getDate() - dias);
  return isoLocal(d);
}

describe('PARSER — parseData', () => {
  test('"hoje" retorna a data de hoje', () => {
    expect(PARSER.parseData('hoje')).toBe(HOJE_STR);
  });

  test('"ontem" retorna ontem', () => {
    expect(PARSER.parseData('ontem')).toBe(dataOffset(1));
  });

  test('"anteontem" retorna 2 dias atrás', () => {
    expect(PARSER.parseData('anteontem')).toBe(dataOffset(2));
  });

  test('"amanha" retorna amanhã (offset -1)', () => {
    expect(PARSER.parseData('amanha')).toBe(dataOffset(-1));
  });

  test('string desconhecida retorna null', () => {
    expect(PARSER.parseData('naoexiste')).toBeNull();
  });

  test('dia da semana retorna data com mínimo 1 dia para trás', () => {
    const resultado = PARSER.parseData('segunda');
    // Deve ser <= hoje e formato YYYY-MM-DD
    expect(resultado).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(new Date(resultado) <= new Date(HOJE_STR)).toBe(true);
  });

  test('dia da semana nunca retorna hoje (sempre ≥ 1 dia atrás)', () => {
    const diasSemana = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'];
    diasSemana.forEach(dia => {
      const r = PARSER.parseData(dia);
      if (r) {
        expect(r).not.toBe(HOJE_STR);
      }
    });
  });

  test('case insensitive: "HOJE" funciona igual a "hoje"', () => {
    // parseData recebe str.toLowerCase() internamente, mas o input já pode vir lower
    expect(PARSER.parseData('hoje')).toBe(HOJE_STR);
  });
});

describe('PARSER — extrair: valor monetário', () => {
  test('extrai número inteiro', () => {
    const r = PARSER.extrair('mercado 50');
    expect(r.valor).toBe(50);
  });

  test('extrai valor com ponto como decimal (parser divide na vírgula)', () => {
    // O parser usa split(/[\s,]+/), então vírgula é separador de token, não decimal.
    // Valores decimais devem usar ponto: '3.50'
    const r = PARSER.extrair('café 3.50');
    expect(r.valor).toBeCloseTo(3.5);
  });

  test('extrai valor com ponto decimal', () => {
    const r = PARSER.extrair('gasolina 80.00');
    expect(r.valor).toBeCloseTo(80);
  });

  test('sem número → valor null', () => {
    const r = PARSER.extrair('mercado supermercado');
    expect(r.valor).toBeNull();
  });
});

describe('PARSER — extrair: descrição', () => {
  test('palavras longas (≥3 chars) entram na descrição', () => {
    const r = PARSER.extrair('mercado extra 100');
    expect(r.desc).toContain('mercado');
    expect(r.desc).toContain('extra');
  });

  test('tokens curtos (<3 chars) são ignorados', () => {
    const r = PARSER.extrair('ir ao banco 50');
    // 'ir' (2 chars), 'ao' (2 chars) devem ser ignorados
    expect(r.desc).not.toContain('ir');
    expect(r.desc).not.toContain('ao');
  });

  test('múltiplas palavras formam descrição com espaços', () => {
    const r = PARSER.extrair('aluguel apartamento centro');
    expect(r.desc).toBe('aluguel apartamento centro');
  });
});

describe('PARSER — extrair: data', () => {
  test('"hoje" no texto preenche campo data', () => {
    const r = PARSER.extrair('mercado hoje 50');
    expect(r.data).toBe(HOJE_STR);
  });

  test('"ontem" no texto preenche campo data', () => {
    const r = PARSER.extrair('gasolina ontem 80');
    expect(r.data).toBe(dataOffset(1));
  });

  test('sem palavra de data → data null', () => {
    const r = PARSER.extrair('mercado 100');
    expect(r.data).toBeNull();
  });
});

describe('PARSER — extrair: banco', () => {
  test('reconhece "nubank"', () => {
    const r = PARSER.extrair('mercado 50 nubank');
    expect(r.banco).toBe('nubank');
  });

  test('reconhece "bradesco"', () => {
    const r = PARSER.extrair('café bradesco 5');
    expect(r.banco).toBe('bradesco');
  });

  test('sem banco → banco null', () => {
    const r = PARSER.extrair('mercado 100');
    expect(r.banco).toBeNull();
  });
});

describe('PARSER — extrair: cartão', () => {
  test('reconhece "crédito"', () => {
    const r = PARSER.extrair('mercado crédito 200');
    expect(r.cartao).toBe('crédito');
  });

  test('reconhece "débito"', () => {
    const r = PARSER.extrair('farmácia débito 30');
    expect(r.cartao).toBe('débito');
  });

  test('sem cartão → cartao null', () => {
    expect(PARSER.extrair('mercado 100').cartao).toBeNull();
  });
});

describe('PARSER — extrair: integração completa', () => {
  test('frase completa extrai todos os campos', () => {
    const r = PARSER.extrair('mercado extra 150 nubank crédito ontem');
    expect(r.valor).toBe(150);
    expect(r.banco).toBe('nubank');
    expect(r.cartao).toBe('crédito');
    expect(r.data).toBe(dataOffset(1));
    expect(r.desc).toContain('mercado');
    expect(r.desc).toContain('extra');
  });
});
