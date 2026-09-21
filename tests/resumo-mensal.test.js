/**
 * resumo-mensal.test.js — texto compartilhável do mês (RESUMO_MENSAL).
 * Carrega o módulo puro num contexto vm com RELATORIOS/UTILS mockados.
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.join(__dirname, '..');

function carregar(resumoMes) {
  const ctx = {
    Math: Math, Number: Number, Date: Date,
    RELATORIOS: { resumoMes: function() { return resumoMes; } },
    UTILS: { formatarMoeda: function(v) { return 'R$ ' + Number(v).toFixed(2); } },
  };
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(path.join(root, 'js/resumo-mensal.js'), 'utf8'), ctx,
    { filename: path.join(root, 'js/resumo-mensal.js') });
  return ctx.RESUMO_MENSAL;
}

describe('RESUMO_MENSAL.dados', function() {
  test('mês sem lançamentos devolve null', function() {
    expect(carregar({ transacoes: 0 }).dados(9, 2026)).toBeNull();
    expect(carregar(null).dados(9, 2026)).toBeNull();
  });

  test('deriva taxa de poupança quando há sobra', function() {
    const d = carregar({
      transacoes: 10, receitas: 5000, despesas: 3200, saldo: 1800,
      topCategorias: [{ label: 'Alimentação', valor: 900, percentual: 28 }],
    }).dados(9, 2026);
    expect(d.taxaPoupanca).toBe(36); // 1800/5000
    expect(d.topCategoria.label).toBe('Alimentação');
  });

  test('saldo negativo não gera taxa de poupança', function() {
    const d = carregar({ transacoes: 5, receitas: 1000, despesas: 1500, saldo: -500, topCategorias: [] }).dados(9, 2026);
    expect(d.taxaPoupanca).toBeNull();
  });
});

describe('RESUMO_MENSAL.texto', function() {
  test('mês vazio → null', function() {
    expect(carregar({ transacoes: 0 }).texto(9, 2026)).toBeNull();
  });

  test('mês positivo tem receitas, despesas, poupança e maior gasto', function() {
    const t = carregar({
      transacoes: 10, receitas: 5000, despesas: 3200, saldo: 1800,
      topCategorias: [{ label: 'Alimentação', valor: 900, percentual: 28 }],
    }).texto(9, 2026);
    expect(t).toContain('Meu mês em números');
    expect(t).toContain('Receitas: R$ 5000.00');
    expect(t).toContain('Despesas: R$ 3200.00');
    expect(t).toContain('Você poupou 36% do que ganhou');
    expect(t).toContain('Maior gasto: Alimentação — R$ 900.00 (28%)');
    expect(t).toContain('Organizado no FinançasPro');
  });

  test('mês no vermelho é honesto e sem poupança', function() {
    const t = carregar({ transacoes: 5, receitas: 1000, despesas: 1500, saldo: -500, topCategorias: [] }).texto(9, 2026);
    expect(t).toContain('fechou no vermelho');
    expect(t).not.toMatch(/poupou/);
  });

  test('não termina em exclamação (voz da marca)', function() {
    const t = carregar({
      transacoes: 3, receitas: 100, despesas: 50, saldo: 50, topCategorias: [],
    }).texto(9, 2026);
    expect(t.trim().endsWith('!')).toBe(false);
  });
});
