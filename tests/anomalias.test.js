/**
 * anomalias.test.js — o alerta de gasto incomum precisa ser verdadeiro e útil.
 *
 * A versão anterior tinha três problemas, e os três corroem confiança:
 *
 * 1. A MENSAGEM ERA FALSA. Dizia "Valor 3x acima da média" usando o z-score,
 *    que é o número de DESVIOS-PADRÃO, não um múltiplo da média. Um gasto de
 *    R$ 130 numa categoria de média R$ 100 podia ser anunciado como "3x acima
 *    da média". O usuário confere, vê que não bate, e para de acreditar no app.
 *
 * 2. NÃO TINHA RECORTE DE TEMPO. Uma anomalia de oito meses atrás aparecia
 *    como novidade no dashboard de hoje.
 *
 * 3. NÃO DIZIA O QUE FAZER COM AQUILO. "Gasto incomum" sem o valor de
 *    referência não é informação — é sobressalto.
 *
 * A detecção passou a usar MEDIANA e MAD (desvio absoluto mediano) em vez de
 * média e desvio-padrão. Com amostras pequenas — o caso normal aqui — o próprio
 * outlier puxa a média e o desvio para cima e se esconde. A mediana não se move
 * com um ponto extremo, então o gasto atípico continua atípico.
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

function loadAiEngine() {
  const ctx = vm.createContext({ Date, Math, Number, String, Array, Object, JSON });
  // config.js junto: a mensagem de anomalia traduz o slug da categoria pelo
  // CONFIG.CATEGORIAS_LABELS. Sem ele o teste validaria um fallback que nunca
  // acontece em produção.
  const cfgFile = path.join(__dirname, '..', 'js', 'core', 'config.js');
  vm.runInContext(fs.readFileSync(cfgFile, 'utf8'), ctx, { filename: cfgFile });

  const file = path.join(__dirname, '..', 'js', 'ai-engine.js');
  vm.runInContext(fs.readFileSync(file, 'utf8'), ctx, { filename: file });
  return ctx.AI_ENGINE;
}
const AI = loadAiEngine();

const HOJE = new Date(2026, 7, 10);

function tx(valor, dia, categoria, descricao) {
  return {
    id: 'id-' + valor + '-' + dia,
    tipo: 'despesa',
    valor,
    categoria: categoria || 'alimentacao',
    data: '2026-08-' + String(dia).padStart(2, '0'),
    descricao: descricao || 'Compra',
  };
}

describe('detectarAnomalias — detecção', () => {
  test('encontra o gasto muito acima do padrão da categoria', () => {
    const txs = [
      tx(100, 1), tx(110, 2), tx(95, 3), tx(105, 4), tx(90, 5),
      tx(600, 6, 'alimentacao', 'Jantar caro'),
    ];

    const a = AI.detectarAnomalias(txs, HOJE);
    expect(a).toHaveLength(1);
    expect(a[0].transacao.descricao).toBe('Jantar caro');
  });

  test('gasto dentro do padrão não vira alerta', () => {
    const txs = [tx(100, 1), tx(110, 2), tx(95, 3), tx(105, 4), tx(120, 5)];
    expect(AI.detectarAnomalias(txs, HOJE)).toEqual([]);
  });

  test('o outlier não se esconde atrás da própria média', () => {
    // Com média e desvio-padrão, um único valor gigante infla os dois e o
    // z-score dele cai abaixo do corte — o alerta some justamente no caso
    // mais grave. Mediana e MAD não se movem com um ponto extremo.
    const txs = [
      tx(50, 1), tx(52, 2), tx(48, 3), tx(51, 4),
      tx(5000, 5, 'alimentacao', 'Erro de digitação?'),
    ];

    const a = AI.detectarAnomalias(txs, HOJE);
    expect(a.length).toBeGreaterThan(0);
    expect(a[0].transacao.descricao).toBe('Erro de digitação?');
  });

  test('categoria com poucos lançamentos não gera alerta', () => {
    // Dois pontos não formam padrão; alertar aqui seria adivinhação.
    const txs = [
      tx(100, 1, 'lazer'), tx(900, 2, 'lazer'),
      tx(100, 3), tx(105, 4), tx(95, 5),
    ];
    expect(AI.detectarAnomalias(txs, HOJE).every((a) => a.transacao.categoria !== 'lazer')).toBe(true);
  });

  test('receita nunca é anomalia de gasto', () => {
    const txs = [
      tx(100, 1), tx(105, 2), tx(95, 3), tx(110, 4),
      Object.assign(tx(9000, 5), { tipo: 'receita', categoria: 'salario' }),
    ];
    expect(AI.detectarAnomalias(txs, HOJE).every((a) => a.transacao.tipo === 'despesa')).toBe(true);
  });

  test('transferência nunca é anomalia de gasto', () => {
    const txs = [
      tx(100, 1), tx(105, 2), tx(95, 3), tx(110, 4),
      Object.assign(tx(9000, 5), { tipo: 'transferencia', contaDestino: 'Poupança' }),
    ];
    expect(AI.detectarAnomalias(txs, HOJE).every((a) => a.transacao.tipo === 'despesa')).toBe(true);
  });
});

describe('detectarAnomalias — recorte de tempo', () => {
  test('ignora anomalia antiga', () => {
    const txs = [
      tx(100, 1), tx(105, 2), tx(95, 3), tx(110, 4),
      { id: 'velha', tipo: 'despesa', valor: 5000, categoria: 'alimentacao',
        data: '2025-11-15', descricao: 'Ano passado' },
    ];

    const a = AI.detectarAnomalias(txs, HOJE);
    expect(a.every((x) => x.transacao.descricao !== 'Ano passado')).toBe(true);
  });

  test('a janela é configurável', () => {
    const txs = [
      tx(100, 1), tx(105, 2), tx(95, 3), tx(110, 4),
      { id: 'velha', tipo: 'despesa', valor: 5000, categoria: 'alimentacao',
        data: '2025-11-15', descricao: 'Ano passado' },
    ];

    const a = AI.detectarAnomalias(txs, HOJE, { diasJanela: 400 });
    expect(a.some((x) => x.transacao.descricao === 'Ano passado')).toBe(true);
  });

  test('o histórico de referência usa tudo, mesmo alertando só o recente', () => {
    // Meses de gastos normais formam a referência; o alerta é do mês atual.
    const antigos = [];
    for (let m = 1; m <= 6; m++) {
      antigos.push({
        id: 'a' + m, tipo: 'despesa', valor: 100, categoria: 'alimentacao',
        data: '2026-0' + m + '-10', descricao: 'Normal',
      });
    }
    const txs = antigos.concat([tx(900, 5, 'alimentacao', 'Fora do padrão')]);

    const a = AI.detectarAnomalias(txs, HOJE);
    expect(a[0].transacao.descricao).toBe('Fora do padrão');
  });
});

describe('detectarAnomalias — a mensagem', () => {
  const txs = [
    tx(100, 1), tx(110, 2), tx(95, 3), tx(105, 4), tx(90, 5),
    tx(600, 6, 'alimentacao', 'Jantar caro'),
  ];

  test('informa o valor de referência, não um múltiplo inventado', () => {
    const a = AI.detectarAnomalias(txs, HOJE)[0];
    // O habitual é a mediana da categoria — perto dos lançamentos comuns
    // (90 a 110) e bem longe do outlier de 600.
    expect(a.valorHabitual).toBeGreaterThanOrEqual(90);
    expect(a.valorHabitual).toBeLessThanOrEqual(115);
  });

  test('o múltiplo declarado bate com a conta', () => {
    // R$ 600 sobre um habitual de ~R$ 100 é cerca de 6x — e o número
    // apresentado tem que ser esse, não o z-score.
    const a = AI.detectarAnomalias(txs, HOJE)[0];
    expect(a.multiplo).toBeCloseTo(a.transacao.valor / a.valorHabitual, 1);
  });

  test('a frase usa o nome legível da categoria', () => {
    const a = AI.detectarAnomalias(txs, HOJE)[0];
    expect(a.motivo).toMatch(/Alimenta/i);
    expect(a.motivo).not.toMatch(/alimentacao/);
  });

  test('a frase traz o valor habitual em reais', () => {
    const a = AI.detectarAnomalias(txs, HOJE)[0];
    expect(a.motivo).toMatch(/R\$/);
  });

  test('não promete "Nx acima da média" com número de desvios', () => {
    const a = AI.detectarAnomalias(txs, HOJE)[0];
    // O texto antigo era "Valor 3x acima da média em alimentacao".
    expect(a.motivo).not.toMatch(/\dx acima da média/);
  });
});

describe('detectarAnomalias — robustez', () => {
  test('entrada vazia ou curta devolve lista vazia', () => {
    expect(AI.detectarAnomalias([], HOJE)).toEqual([]);
    expect(AI.detectarAnomalias(null, HOJE)).toEqual([]);
    expect(AI.detectarAnomalias([tx(100, 1)], HOJE)).toEqual([]);
  });

  test('valores idênticos não geram divisão por zero', () => {
    const txs = [tx(100, 1), tx(100, 2), tx(100, 3), tx(100, 4), tx(100, 5)];
    expect(() => AI.detectarAnomalias(txs, HOJE)).not.toThrow();
    expect(AI.detectarAnomalias(txs, HOJE)).toEqual([]);
  });

  test('devolve no máximo cinco, do mais grave para o menos', () => {
    const txs = [];
    for (let i = 1; i <= 10; i++) txs.push(tx(100, i));
    for (let i = 11; i <= 20; i++) txs.push(tx(500 + i * 50, i, 'alimentacao', 'Alto ' + i));

    const a = AI.detectarAnomalias(txs, HOJE);
    expect(a.length).toBeLessThanOrEqual(5);
    for (let i = 1; i < a.length; i++) {
      expect(a[i - 1].multiplo).toBeGreaterThanOrEqual(a[i].multiplo);
    }
  });

  test('transação sem data não derruba a detecção', () => {
    const txs = [
      tx(100, 1), tx(105, 2), tx(95, 3), tx(110, 4),
      { id: 'x', tipo: 'despesa', valor: 900, categoria: 'alimentacao' },
    ];
    expect(() => AI.detectarAnomalias(txs, HOJE)).not.toThrow();
  });
});
