/**
 * esm-fundacao.test.js — as regras da migração para ES Modules (ADR 0005).
 *
 * Um módulo com `import`/`export` só funciona se for alcançado pela entrada
 * `<script type="module">` do index.html. Carregado como script clássico
 * (tag defer ou chunk lazy), é erro de sintaxe e o app para de subir. Fora do
 * grafo, nenhum navegador o executa.
 */
const fs = require('fs');
const path = require('path');
const { entradasEsm, grafoEsm } = require('../scripts/lib/esm-grafo.cjs');
const { ehModulo, converter } = require('./helpers/esm-como-script.cjs');
const { carregarScript } = require('./helpers/carregar-script.cjs');

function scriptsDoIndex(texto) {
  return [...texto.matchAll(/<script[^>]+src="([^"]+)"[^>]*><\/script>/g)]
    .map((m) => m[1]).filter((src) => !/^https?:/.test(src)).map((src) => src.replace(/^\//, ''));
}

const ROOT = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const grafo = grafoEsm(ROOT, entradasEsm(html));

function arquivosJs(dir) {
  return fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true }).flatMap((ent) => {
    const rel = dir + '/' + ent.name;
    if (ent.isDirectory()) return ent.name === 'vendor' ? [] : arquivosJs(rel);
    return ent.name.endsWith('.js') ? [rel] : [];
  });
}

describe('fundação ES Modules', () => {
  test('uma entrada só, a ponte, antes dos scripts do app', () => {
    expect(entradasEsm(html)).toEqual(['js/esm/ponte.js']);
    const ordem = scriptsDoIndex(html);
    // Só o coletor de erros roda antes: no build, a entrada do Vite vai para o
    // <head>, antes do app.bundle.js. Desenvolvimento e produção na mesma ordem.
    expect(ordem.indexOf('js/esm/ponte.js')).toBe(ordem.indexOf('js/utilities/observability.js') + 1);
  });

  test('todo arquivo com import/export em js/ está no grafo da ponte', () => {
    const modulos = arquivosJs('js').filter((rel) => ehModulo(fs.readFileSync(path.join(ROOT, rel), 'utf8')));
    expect(modulos.sort()).toEqual([...grafo].sort());
  });

  test('nenhum módulo é carregado como script clássico', () => {
    const classicos = scriptsDoIndex(html).filter((rel) => !entradasEsm(html).includes(rel));
    const bundle = fs.readFileSync(path.join(ROOT, 'scripts', 'bundle-app.cjs'), 'utf8');
    const lazy = bundle.slice(bundle.indexOf('const LAZY_CHUNKS'), bundle.indexOf('const lazySet'));
    for (const rel of grafo) {
      expect(classicos).not.toContain(rel);
      expect(lazy).not.toContain("'" + rel + "'");
    }
  });

  test('um módulo migrado usa outro por import, nunca pelo global (ADR 0005)', () => {
    const info = new Map(grafo.map((rel) => {
      const arquivo = path.join(ROOT, rel);
      return [rel, converter(fs.readFileSync(arquivo, 'utf8'), arquivo)];
    }));
    const dono = new Map();
    for (const [rel, { exporta }] of info) {
      exporta.filter((e) => e.exportado !== 'default').forEach((e) => dono.set(e.local, rel));
    }
    const faltando = [];
    for (const [rel, { codigo, importa, exporta }] of info) {
      if (rel === 'js/esm/ponte.js') continue;
      const proprios = new Set(exporta.map((e) => e.local));
      const importados = new Set(importa.flatMap((i) => i.nomes.map((n) => n.local)));
      for (const [nome, de] of dono) {
        if (de === rel || proprios.has(nome) || importados.has(nome)) continue;
        if (new RegExp('\\b' + nome + '\\b').test(codigo)) faltando.push(rel + ' usa ' + nome + ' sem importar de ' + de);
      }
    }
    expect(faltando).toEqual([]);
  });

  // Módulo ES roda em modo estrito: método chamado desacoplado (passado como
  // callback, ex.: { idFactory: UTILS.gerarId }) recebe `this` undefined. No
  // script clássico o `this` virava window e o erro passava despercebido. Os
  // módulos usam o próprio nome; só os mixins (copiados para outro objeto por
  // Object.assign, como DADOS_EXPRESS em DADOS) dependem de `this` de propósito.
  test('módulo migrado não usa this, exceto mixins', () => {
    const js = arquivosJs('js').map((rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8')).join('\n');
    const mixins = new Set([...js.matchAll(/Object\.assign\(\s*[A-Z_]+\s*,\s*([A-Z_]+)\s*\)/g)].map((m) => m[1]));
    const comThis = [];
    for (const rel of grafo) {
      const arquivo = path.join(ROOT, rel);
      const { codigo, exporta } = converter(fs.readFileSync(arquivo, 'utf8'), arquivo);
      if (exporta.some((e) => mixins.has(e.local))) continue;
      const semComentarios = codigo.replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*/g, '');
      if (/\bthis\b/.test(semComentarios)) comThis.push(rel);
    }
    expect([...mixins].sort()).toEqual(['DADOS_EXPRESS', 'FORM_SUGESTOES']);
    expect(comThis).toEqual([]);
  });

  test('sem resto do padrão CommonJS nos módulos', () => {
    for (const rel of grafo) {
      expect(fs.readFileSync(path.join(ROOT, rel), 'utf8')).not.toMatch(/module\.exports|typeof module/);
    }
  });

  test('a conversão dos testes preserva posição de cada caractere (cobertura V8)', () => {
    for (const rel of grafo) {
      const arquivo = path.join(ROOT, rel);
      const fonte = fs.readFileSync(arquivo, 'utf8');
      const { codigo } = converter(fonte, arquivo);
      expect(codigo.length).toBe(fonte.length);
      expect(codigo.split('\n').length).toBe(fonte.split('\n').length);
      expect(ehModulo(codigo)).toBe(false);
    }
  });

  test('a conversão recusa sintaxe fora do subconjunto', () => {
    expect(() => converter("export * from './x.js';\n", path.join(ROOT, 'js', 'x.js'))).toThrow(/subconjunto/);
    expect(() => converter("import('./x.js');\nexport default 1;\n", path.join(ROOT, 'js', 'x.js'))).toThrow(/subconjunto/);
  });

  test('a ponte publica os módulos migrados em window', () => {
    const nomes = ['CATEGORIA_VISUAL', 'TRANSACTION_SERVICE', 'BUDGET_SERVICE', 'INSIGHT_ACOES',
      'PASSWORD_POLICY', 'VALIDATIONS', 'FINANCE_CONTRACT', 'SYNC_MERGE', 'SESSION_LOG', 'IDB_KV', 'TELAS',
      'CONFIG', 'UTILS'];
    try {
      carregarScript('js/esm/ponte.js');
      nomes.forEach((n) => expect(typeof window[n]).toBe('object'));
      // Uma instância só: o BUDGET_SERVICE usa o mesmo TRANSACTION_SERVICE publicado.
      expect(window.BUDGET_SERVICE.calculateSpent(
        [{ tipo: 'despesa', categoria: 'lazer', valor: 10.1, data: '2026-09-02' },
          { tipo: 'despesa', categoria: 'lazer', valor: 0.2, data: '2026-09-03' }],
        'lazer', 9, 2026,
      )).toBe(10.3);
    } finally {
      nomes.forEach((n) => { delete window[n]; });
    }
  });
});
