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
const { entradasEsm, grafoEsm, chunksEsm } = require('../scripts/lib/esm-grafo.cjs');
const vm = require('vm');
const { ehModulo, converter, executarModulo, nomesDoGrafo } = require('./helpers/esm-como-script.cjs');
const { carregarScript, nomesDoGlobal } = require('./helpers/carregar-script.cjs');

function scriptsDoIndex(texto) {
  return [...texto.matchAll(/<script[^>]+src="([^"]+)"[^>]*><\/script>/g)]
    .map((m) => m[1]).filter((src) => !/^https?:/.test(src)).map((src) => src.replace(/^\//, ''));
}

const ROOT = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const grafo = grafoEsm(ROOT, entradasEsm(html));
// Arquivo → chunk sob demanda a que pertence ('boot' para o grafo estático).
const chunkDe = new Map();
for (const [entrada, arquivos] of chunksEsm(ROOT, entradasEsm(html))) arquivos.forEach((rel) => chunkDe.set(rel, entrada));
const chunk = (rel) => chunkDe.get(rel) || 'boot';

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
      // Nome de um chunk sob demanda, visto de fora dele, não é import: o
      // módulo só existe depois do LAZY.load, e chega por window (guardado
      // por `typeof X !== 'undefined'`). Importar puxaria o chunk para o boot.
      const proprios = new Set(exporta.map((e) => e.local));
      const importados = new Set(importa.flatMap((i) => i.nomes.map((n) => n.local)));
      // Citar o nome num comentário ou numa string ('Indicador ok') não é usar.
      const semComentarios = codigo.replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*/g, '')
        .replace(/'(?:\\.|[^'\\\n])*'|"(?:\\.|[^"\\\n])*"/g, "''");
      for (const [nome, de] of dono) {
        if (de === rel || proprios.has(nome) || importados.has(nome)) continue;
        if (chunk(de) !== 'boot' && chunk(de) !== chunk(rel)) continue;
        // `obj.NOME` e a chave `NOME:` são propriedades, não o global.
        if (new RegExp('(?<![.\\w$])' + nome + '\\b(?!\\s*:)').test(semComentarios)) faltando.push(rel + ' usa ' + nome + ' sem importar de ' + de);
      }
    }
    expect(faltando).toEqual([]);
  });

  // Um import estático de um módulo do chunk, em qualquer módulo do boot, o
  // traria para o boot em silêncio: o chunk continuaria existindo, vazio.
  test('o que um chunk sob demanda publica não é carregado pelo boot', () => {
    const boot = new Set(grafoEsm(ROOT, entradasEsm(html), { soEstatico: true }));
    const chunks = chunksEsm(ROOT, entradasEsm(html));
    expect(chunks.size).toBeGreaterThan(0);
    for (const [entrada, arquivos] of chunks) {
      expect(entrada).toMatch(/^js\/esm\/chunks\/[\w-]+\.js$/);
      const { importa } = converter(fs.readFileSync(path.join(ROOT, entrada), 'utf8'), path.join(ROOT, entrada));
      const publicados = importa.map((i) => path.relative(ROOT, i.arquivo).split(path.sep).join('/'));
      expect(publicados.length).toBeGreaterThan(0);
      publicados.forEach((rel) => {
        expect(boot.has(rel)).toBe(false);
        expect(arquivos).toContain(rel);
      });
    }
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

  // No navegador cada módulo tem escopo próprio; nos testes, o conversor roda
  // todos como script no mesmo contexto, e o que é declarado no topo vira
  // global dele. Dois módulos com a mesma função auxiliar de topo (ex.: um
  // `_buildResumoTabela` em cada gráfico) fariam um chamar a do outro só nos
  // testes. Auxiliar fica dentro de uma IIFE, como em PERSIST_QUEUE.
  test('nome declarado no topo não se repete entre módulos (contexto único nos testes)', () => {
    const dono = new Map();
    const repetidos = [];
    for (const rel of grafo) {
      const fonte = fs.readFileSync(path.join(ROOT, rel), 'utf8');
      for (const m of fonte.matchAll(/^(?:var|let|const|function|class)\s+([A-Za-z_$][\w$]*)/gm)) {
        if (dono.has(m[1])) repetidos.push(m[1] + ': ' + dono.get(m[1]) + ' e ' + rel);
        else dono.set(m[1], rel);
      }
    }
    expect(repetidos).toEqual([]);
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
    // import() só com caminho literal: é o que o Vite consegue dividir em chunk.
    expect(() => converter("/** x */\nconst m = import(caminho);\nexport default m;\n", path.join(ROOT, 'js', 'x.js'))).toThrow(/subconjunto/);
  });

  test('import() com caminho literal vira __dimp, do mesmo tamanho', () => {
    const fonte = "/**\n * carregador de teste para o import() dinâmico\n */\nconst L = { abrir: () => import('../esm/chunks/inexistente.js') };\nexport { L };\n";
    const { codigo, dinamicos } = converter(fonte, path.join(ROOT, 'js', 'core', 'x.js'));
    expect(codigo.length).toBe(fonte.length);
    expect(codigo).toContain("__dimp('../esm/chunks/inexistente.js')");
    expect(dinamicos.map((d) => path.relative(ROOT, d.arquivo))).toEqual([path.join('js', 'esm', 'chunks', 'inexistente.js')]);
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

  // A ponte roda antes dos scripts clássicos (no build, antes do app.bundle.js).
  // Módulo que lê um global clássico ao carregar acha `undefined` e segue
  // quieto, sem erro — `typeof DADOS !== 'undefined'` na carga desliga um
  // recurso sem ninguém perceber. Aqui cada global clássico é um getter que
  // anota quem o leu enquanto o grafo inteiro da ponte é avaliado. E, com os
  // ciclos de import (o DADOS importa quem o importa), ler ao carregar um const
  // de módulo que ainda não terminou é ReferenceError no navegador: o { tdz }
  // do conversor reproduz isso, na ordem de avaliação real.
  test('nenhum módulo lê global clássico nem const de módulo inacabado ao carregar (ordem de boot)', () => {
    const ponte = path.join(ROOT, 'js', 'esm', 'ponte.js');
    const doGrafo = new Set(nomesDoGrafo(ponte));
    const classicos = Object.keys(require('../config/frontend-globals.json').globals)
      .filter((n) => !doGrafo.has(n));
    const lidos = new Set();
    const antes = new Set(Object.keys(window));
    // Como em carregarScript: os globais do jsdom só resolvem no vm com getter.
    const sandbox = Object.create(globalThis);
    const soClassicos = new Set(classicos);
    nomesDoGlobal().forEach((nome) => {
      if (soClassicos.has(nome)) return;
      Object.defineProperty(sandbox, nome, { get: () => globalThis[nome], configurable: true });
    });
    classicos.forEach((nome) => {
      Object.defineProperty(sandbox, nome, {
        get: () => { lidos.add(nome); return undefined; },
        configurable: true,
      });
    });
    // No navegador, módulo roda com o documento em 'interactive': quem espera o
    // DOMContentLoaded (que só dispara depois dos scripts clássicos) espera. O
    // jsdom do teste já está em 'complete'; sem isto, esses módulos rodariam
    // o init na hora e acusariam leituras que não acontecem de verdade.
    Object.defineProperty(document, 'readyState', { get: () => 'interactive', configurable: true });
    const inacabados = new Set();
    let erro = null;
    try {
      executarModulo(vm.createContext(sandbox), ponte, undefined, undefined, { tdz: inacabados });
    } catch (e) {
      erro = e; // leitura direta de um inacabado para a carga; a lista diz qual
    } finally {
      delete document.readyState;
      Object.keys(window).filter((k) => !antes.has(k)).forEach((k) => { delete window[k]; });
    }
    expect(classicos.length).toBeGreaterThan(20);
    expect([...lidos].sort()).toEqual([]);
    expect([...inacabados].sort()).toEqual([]);
    if (erro) throw erro;
  });
});
