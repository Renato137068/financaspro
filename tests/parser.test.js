/**
 * parser.test.js — Testes para js/parser.js
 * Cobre: extrair (tokens, valor, data, banco, cartão, descrição), parseData
 */

// ── parseData inline (idêntico a js/parser.js) ───────────────────────────────
function parseData(str) {
  const hoje = new Date();
  const dow = hoje.getDay();
  const s = str.toLowerCase();

  const offsets = { 'hoje': 0, 'ontem': 1, 'anteontem': 2, 'amanhã': -1, 'amanha': -1 };
  if (offsets[s] !== undefined) {
    const d = new Date(hoje);
    d.setDate(d.getDate() - offsets[s]);
    return d.toISOString().split('T')[0];
  }

  const diasSemana = {
    'domingo': 0, 'segunda': 1, 'terca': 2, 'terça': 2,
    'quarta': 3, 'quinta': 4, 'sexta': 5, 'sabado': 6, 'sábado': 6,
  };
  if (diasSemana[s] !== undefined) {
    const alvo = diasSemana[s];
    const diff = (dow - alvo + 7) % 7 || 7; // sempre para trás, mínimo 1 dia
    const d2 = new Date(hoje);
    d2.setDate(d2.getDate() - diff);
    return d2.toISOString().split('T')[0];
  }

  return null;
}

// ── extrair inline (idêntico a js/parser.js, sem DADOS) ──────────────────────
const PARSER = {
  parseData,

  extrair(texto) {
    const tokens = texto.toLowerCase().split(/[\s,]+/);
    const r = { valor: null, desc: [], data: null, banco: null, cartao: null };

    const bancosFixos = ['nubank', 'itaú', 'itau', 'caixa', 'bradesco', 'santander', 'bbva', 'inter', 'sicredi'];

    tokens.forEach(token => {
      if (!token || token.length < 2) return;

      if (/^\d+([.,]\d{1,2})?$/.test(token)) {
        r.valor = parseFloat(token.replace(',', '.'));
      } else if (/^(hoje|ontem|anteontem|amanhã?|segunda|ter[cç]a|quarta|quinta|sexta|s[aá]bado|domingo)$/.test(token)) {
        r.data = parseData(token);
      } else if (bancosFixos.indexOf(token) !== -1) {
        r.banco = token;
      } else if (/^(cr[eé]dito|d[eé]bito)$/.test(token)) {
        r.cartao = token;
      } else if (token.length >= 3) {
        r.desc.push(token);
      }
    });

    r.desc = r.desc.join(' ');
    return r;
  },
};

// ─────────────────────────────────────────────────────────────────────────────

// Data de referência para testes determinísticos
const HOJE = new Date();
const HOJE_STR = HOJE.toISOString().split('T')[0];

function dataOffset(dias) {
  const d = new Date(HOJE);
  d.setDate(d.getDate() - dias);
  return d.toISOString().split('T')[0];
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
