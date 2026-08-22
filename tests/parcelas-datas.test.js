/**
 * parcelas-datas.test.js — trava os dois bugs de parcelamento diagnosticados
 * na auditoria de 2026-08.
 *
 * BUG A — resíduo de arredondamento
 *   `Math.round((valor / n) * 100) / 100` aplicado a TODAS as parcelas descarta
 *   o resto da divisão. R$ 100 em 3x gravava 3 × 33,33 = R$ 99,99: um centavo
 *   simplesmente desaparecia do extrato. R$ 1.000 em 6x fazia o oposto e criava
 *   R$ 0,02 do nada. Num app de finanças isso não é arredondamento, é erro de
 *   saldo — e o usuário descobre conferindo a fatura.
 *
 * BUG B — overflow de dia do mês
 *   `d.setMonth(d.getMonth() + p)` sobre 31/01 não devolve 28/02: o Date
 *   transborda para 03/03. Uma compra em 31/01 em 5x gerava parcelas em
 *   jan, MAR, mar, MAI, mai — fevereiro e abril sem parcela nenhuma e março e
 *   maio com duas. O orçamento mensal do usuário fica irreconhecível.
 *
 * Ambos os helpers vivem em UTILS porque o mesmo cálculo é feito em três
 * lugares (parcelamento, contas a pagar e worker de recorrentes) e as três
 * cópias divergiram.
 */
const { loadCoreModules } = require('./load-sources');

beforeAll(() => { loadCoreModules(); });

describe('UTILS.dividirEmParcelas', () => {
  test('a soma das parcelas é exatamente o valor original', () => {
    const casos = [
      [100, 3], [1000, 6], [10, 3], [0.1, 3], [99.99, 7],
      [1, 3], [0.03, 2], [1234.56, 12], [50, 2], [7.77, 9],
    ];

    casos.forEach(([valor, n]) => {
      const parcelas = UTILS.dividirEmParcelas(valor, n);
      const soma = UTILS.somarMoeda(parcelas);
      expect(soma).toBeCloseTo(valor, 10);
    });
  });

  test('R$ 100 em 3x devolve 33,34 + 33,33 + 33,33 — o resíduo vai na primeira', () => {
    expect(UTILS.dividirEmParcelas(100, 3)).toEqual([33.34, 33.33, 33.33]);
  });

  test('R$ 1000 em 6x não inventa centavo', () => {
    const p = UTILS.dividirEmParcelas(1000, 6);
    expect(UTILS.somarMoeda(p)).toBe(1000);
    expect(p).toHaveLength(6);
  });

  test('divisão exata não gera resíduo', () => {
    expect(UTILS.dividirEmParcelas(100, 4)).toEqual([25, 25, 25, 25]);
  });

  test('as parcelas nunca diferem entre si por mais de um centavo', () => {
    const p = UTILS.dividirEmParcelas(99.99, 7);
    expect(Math.max.apply(null, p) - Math.min.apply(null, p)).toBeCloseTo(0.01, 10);
  });

  test('n inválido devolve lista vazia em vez de NaN', () => {
    expect(UTILS.dividirEmParcelas(100, 0)).toEqual([]);
    expect(UTILS.dividirEmParcelas(100, -1)).toEqual([]);
    expect(UTILS.dividirEmParcelas(100, null)).toEqual([]);
  });

  test('uma parcela devolve o valor íntegro', () => {
    expect(UTILS.dividirEmParcelas(33.33, 1)).toEqual([33.33]);
  });

  test('valor menor que o número de parcelas ainda fecha a soma', () => {
    // R$ 0,02 em 5x não tem como dar parcelas iguais; o que não pode é
    // a soma deixar de ser R$ 0,02.
    const p = UTILS.dividirEmParcelas(0.02, 5);
    expect(UTILS.somarMoeda(p)).toBe(0.02);
    expect(p).toHaveLength(5);
  });
});

describe('UTILS.addMesesClamp', () => {
  test('31/01 + 1 mês vira 28/02, não 03/03', () => {
    expect(UTILS.addMesesClamp('2026-01-31', 1)).toBe('2026-02-28');
  });

  test('respeita ano bissexto', () => {
    expect(UTILS.addMesesClamp('2024-01-31', 1)).toBe('2024-02-29');
  });

  test('a sequência de parcelas cobre um mês distinto por parcela', () => {
    const meses = [];
    for (let p = 0; p < 5; p++) meses.push(UTILS.addMesesClamp('2026-01-31', p));

    expect(meses).toEqual([
      '2026-01-31', '2026-02-28', '2026-03-31', '2026-04-30', '2026-05-31',
    ]);

    // Nenhum mês repetido — era exatamente o que o setMonth cru quebrava.
    const chaves = meses.map((d) => d.slice(0, 7));
    expect(new Set(chaves).size).toBe(5);
  });

  test('31/08 em 5x não pula setembro nem novembro', () => {
    const meses = [];
    for (let p = 0; p < 5; p++) meses.push(UTILS.addMesesClamp('2026-08-31', p));
    expect(meses).toEqual([
      '2026-08-31', '2026-09-30', '2026-10-31', '2026-11-30', '2026-12-31',
    ]);
  });

  test('dia que existe em todos os meses passa intacto', () => {
    expect(UTILS.addMesesClamp('2026-03-15', 2)).toBe('2026-05-15');
  });

  test('atravessa a virada de ano', () => {
    expect(UTILS.addMesesClamp('2026-11-30', 3)).toBe('2027-02-28');
    expect(UTILS.addMesesClamp('2026-12-31', 1)).toBe('2027-01-31');
  });

  test('aceita deslocamento negativo', () => {
    expect(UTILS.addMesesClamp('2026-03-31', -1)).toBe('2026-02-28');
  });

  test('data inválida devolve null em vez de "Invalid Date"', () => {
    expect(UTILS.addMesesClamp('nao-e-data', 1)).toBeNull();
    expect(UTILS.addMesesClamp('', 1)).toBeNull();
    expect(UTILS.addMesesClamp(null, 1)).toBeNull();
  });

  test('aceita ISO completo e devolve só a data', () => {
    expect(UTILS.addMesesClamp('2026-01-31T15:30:00.000Z', 1)).toBe('2026-02-28');
  });

  test('não depende do fuso: meia-noite não escorrega para o dia anterior', () => {
    // O bug clássico é ancorar em T00:00 e deixar o toISOString voltar um dia
    // em fusos negativos. Ancorar ao meio-dia (ou montar a string à mão)
    // elimina a classe inteira.
    expect(UTILS.addMesesClamp('2026-01-01', 0)).toBe('2026-01-01');
    expect(UTILS.addMesesClamp('2026-01-01', 1)).toBe('2026-02-01');
  });
});

describe('parcelamento ponta a ponta — o caso que motivou a correção', () => {
  test('R$ 1.000 em 3x a partir de 31/01: soma exata e três meses distintos', () => {
    const valor = 1000;
    const n = 3;
    const dataBase = '2026-01-31';

    const valores = UTILS.dividirEmParcelas(valor, n);
    const datas = [];
    for (let p = 0; p < n; p++) datas.push(UTILS.addMesesClamp(dataBase, p));

    expect(UTILS.somarMoeda(valores)).toBe(valor);
    expect(datas).toEqual(['2026-01-31', '2026-02-28', '2026-03-31']);
    expect(new Set(datas.map((d) => d.slice(0, 7))).size).toBe(n);
  });
});
