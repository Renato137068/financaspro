/**
 * categories-real.test.js — exercita js/categories.js REAL (CATEGORIES).
 *
 * Módulo de resolução de categorias (rótulo, ícone, cor, tipo, custom, busca)
 * carregado no index.html e consumido por init-form, auto-categorizer e
 * lifecycle — estava com 0% de cobertura. Carrega o módulo de produção num
 * contexto vm com um DADOS em memória como dependência das categorias custom.
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const FILE = path.join(__dirname, '..', 'js', 'categories.js');
const SRC = fs.readFileSync(FILE, 'utf8');

/** Carrega uma instância fresca de CATEGORIES com DADOS/BILLING injetáveis. */
function loadCategories(opts) {
  opts = opts || {};
  var store = { categoriasCustom: opts.categoriasCustom || {} };
  var DADOS = opts.DADOS || {
    getConfig: function() { return store; },
    salvarConfig: function(patch) { Object.assign(store, patch); },
  };
  // categories.js declara `const CATEGORIES` (não vira global do vm); capturamos
  // pela linha module.exports, fornecendo um module no contexto.
  var ctx = { Date, Math, Number, String, Array, Object, JSON, console, module: { exports: {} } };
  ctx.DADOS = DADOS;
  if (opts.BILLING) ctx.BILLING = opts.BILLING;
  vm.createContext(ctx);
  vm.runInContext(SRC, ctx, { filename: FILE });
  return { C: ctx.module.exports, store: store };
}

describe('CATEGORIES — resolução padrão', () => {
  const { C } = loadCategories();

  test('get devolve a definição padrão de um slug conhecido', () => {
    expect(C.get('salario')).toMatchObject({ label: 'Salário', tipo: 'receita', icon: 'wallet' });
  });

  test('get de slug desconhecido cai no fallback (label formatado, tipo inferido)', () => {
    const cat = C.get('conta_de_luz');
    expect(cat.label).toBe('Conta de luz');
    expect(cat.icon).toBe('pin');
    expect(cat.tipo).toBe('despesa');
  });

  test('getLabel / getIcon / getCor / getTipo de slug conhecido', () => {
    expect(C.getLabel('alimentacao')).toBe('Alimentação');
    expect(C.getIcon('alimentacao')).toBe('utensils');
    expect(C.getCor('alimentacao')).toBe('#c9573a');
    expect(C.getTipo('alimentacao')).toBe('despesa');
  });

  test('formatarLabel troca underscore por espaço e capitaliza', () => {
    expect(C.formatarLabel('outro_gasto')).toBe('Outro gasto');
  });

  test('inferirTipo: lista fixa de receitas, resto é despesa', () => {
    expect(C.inferirTipo('salario')).toBe('receita');
    expect(C.inferirTipo('investimentos')).toBe('receita');
    expect(C.inferirTipo('aluguel')).toBe('despesa');
  });
});

describe('CATEGORIES — listagens', () => {
  const { C } = loadCategories();

  test('listarPorTipo receita inclui as receitas padrão', () => {
    const r = C.listarPorTipo('receita', false);
    expect(r).toEqual(expect.arrayContaining(['salario', 'freelance', 'investimentos']));
    expect(r).not.toContain('alimentacao');
  });

  test('listarParaForm devolve {value,label} com ícone no markup', () => {
    const form = C.listarParaForm('despesa');
    const ali = form.find(function(o) { return o.value === 'alimentacao'; });
    expect(ali.label).toContain('data-lucide="utensils"');
    expect(ali.label).toContain('Alimentação');
  });

  test('getEstatisticas conta padrões e customizadas', () => {
    const est = C.getEstatisticas('receita');
    expect(est.total).toBeGreaterThanOrEqual(5);
    expect(est.customizadas).toBe(0);
  });
});

describe('CATEGORIES — validação e busca', () => {
  const { C } = loadCategories();

  test('existe: verdadeiro para padrão, falso para inexistente', () => {
    expect(C.existe('moradia')).toBe(true);
    expect(C.existe('categoria_que_nao_existe')).toBe(false);
  });

  test('validar respeita o tipo esperado', () => {
    expect(C.validar('salario', 'receita')).toBe(true);
    expect(C.validar('salario', 'despesa')).toBe(false);
    expect(C.validar('alimentacao')).toBe(true);
  });

  test('buscar ordena por relevância e limita resultados', () => {
    const res = C.buscar('trans'); // "transporte" (slug)
    expect(res[0].slug).toBe('transporte');
    expect(res.length).toBeLessThanOrEqual(10);
  });

  test('buscar por rótulo acentuado encontra a categoria', () => {
    const res = C.buscar('alimenta');
    expect(res.some(function(r) { return r.slug === 'alimentacao'; })).toBe(true);
  });
});

describe('CATEGORIES — categorias customizadas (DADOS)', () => {
  test('adicionar cria, persiste, invalida cache e passa a existir', () => {
    const { C, store } = loadCategories();
    expect(C.adicionarCustom('hobbies', 'despesa')).toBe(true);
    expect(store.categoriasCustom.despesa).toContain('hobbies');
    expect(C.existe('hobbies')).toBe(true);
    expect(C.getTipo('hobbies')).toBe('despesa');
    expect(C.listarCustom('despesa')).toContain('hobbies');
    // entra na listagem com incluirCustom
    expect(C.listarPorTipo('despesa', true)).toContain('hobbies');
  });

  test('adicionar duplicado devolve false', () => {
    const { C } = loadCategories({ categoriasCustom: { despesa: ['hobbies'] } });
    expect(C.adicionarCustom('hobbies', 'despesa')).toBe(false);
  });

  test('remover apaga e invalida', () => {
    const { C, store } = loadCategories({ categoriasCustom: { despesa: ['hobbies'] } });
    expect(C.removerCustom('hobbies', 'despesa')).toBe(true);
    expect(store.categoriasCustom.despesa).not.toContain('hobbies');
    expect(C.removerCustom('hobbies', 'despesa')).toBe(false); // já não existe
  });

  test('quota do plano bloqueia a criação (BILLING)', () => {
    const { C } = loadCategories({ BILLING: { guardQuota: function() { return false; } } });
    expect(C.adicionarCustom('premium', 'despesa')).toBe(false);
  });

  test('carregarCustomCache tolera DADOS que estoura (degrada para vazio)', () => {
    const { C } = loadCategories({
      DADOS: { getConfig: function() { throw new Error('sem config'); }, salvarConfig: function() {} },
    });
    expect(C.listarCustom('despesa')).toEqual([]);
    expect(C.existe('qualquer')).toBe(false);
  });
});

describe('CATEGORIES — camada de compatibilidade', () => {
  const { C } = loadCategories();

  test('compat.getLabels devolve mapa slug→label', () => {
    expect(C.compat.getLabels().salario).toBe('Salário');
  });

  test('compat.getCatsForm usa o formato antigo {v,l}', () => {
    const cats = C.compat.getCatsForm('receita');
    expect(cats[0]).toHaveProperty('v');
    expect(cats[0]).toHaveProperty('l');
  });

  test('limparCache zera o cache customizado', () => {
    C.customCache = { despesa: ['x'] };
    C.limparCache();
    expect(C.customCache).toBeNull();
  });
});
