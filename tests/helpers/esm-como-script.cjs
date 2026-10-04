/**
 * esm-como-script.cjs — roda os ES Modules de js/ nos harnesses de teste.
 *
 * Os testes do frontend carregam os arquivos de js/ via vm, com o nome real do
 * arquivo, para a cobertura V8 contar (tests/helpers/carregar-script.cjs e
 * app-jsdom.cjs). O vm roda script, não módulo: `import`/`export` são erro de
 * sintaxe. Transpilar com um bundler resolveria a sintaxe, mas mudaria as
 * posições dos caracteres, e a cobertura V8 soma as execuções por posição.
 *
 * Por isso a conversão aqui preserva o tamanho do texto, caractere a caractere:
 *   - `import { A } from './a.js';`  vira espaços (o harness injeta A antes);
 *   - `import './a.js';` (só pelo efeito, ex.: as telas geradas) vira espaços
 *     e o harness roda a.js antes;
 *   - `export { A };`, `export default A;` viram espaços;
 *   - `export const A =`  perde o `export `;
 *   - `const A =` / `let A =` de um nome exportado viram `var   A =` / `var A =`,
 *     para o nome ficar no global do contexto, como os scripts clássicos (os
 *     testes trocam dublês por ele, e o app-jsdom o lê pelo nome);
 *   - `import('./c.js')` (chunk sob demanda, caminho literal) vira
 *     `__dimp('./c.js')`, que roda o módulo no mesmo contexto e devolve uma
 *     Promise dos exports, como o import() do navegador.
 *
 * Só esse subconjunto de sintaxe é aceito. Qualquer outro import/export no
 * topo do arquivo lança erro: melhor ampliar este conversor de propósito do
 * que medir cobertura torta sem perceber.
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { pastaDasPartes, fonteComPartes } = require('../../scripts/lib/fonte-com-partes.cjs');

const ID = '[A-Za-z_$][\\w$]*';
const RE_IMPORT = new RegExp('^import\\s+(?:\\{([^}]*)\\}|(' + ID + '))\\s+from\\s+([\'"])(\\.{1,2}/[^\'"]+)\\3;?', 'gm');
const RE_IMPORT_EFEITO = /^import\s+(['"])(\.{1,2}\/[^'"]+)\1;?/gm;
const RE_EXPORT_LISTA = /^export\s*\{([^}]*)\};?/gm;
const RE_EXPORT_DEFAULT = new RegExp('^export\\s+default\\s+(' + ID + ');?', 'gm');
const RE_EXPORT_DECL = new RegExp('^export\\s+(?=(?:const|let|var|function|class)\\s+(' + ID + '))', 'gm');
const RE_SOBRA = /^\s*(import|export)\b/m;
const RE_IMPORT_DINAMICO = /(?<![\w$.])import(\(\s*(['"])(\.{1,2}\/[^'"]+)\2\s*\))/g;
const RE_SOBRA_DINAMICO = /(?<![\w$.])import\s*\(/;
// Mesmo tamanho de `import`: as posições não mudam (cobertura V8).
const IMPORT_DINAMICO = '__dimp';

function emBranco(trecho) {
  return trecho.replace(/[^\n]/g, ' ');
}

function paresDaLista(lista) {
  return lista.split(',').map((s) => s.trim()).filter(Boolean).map((item) => {
    const m = item.match(new RegExp('^(' + ID + ')(?:\\s+as\\s+(' + ID + '))?$'));
    if (!m) throw new Error('[esm-como-script] item não suportado: "' + item + '"');
    return { de: m[1], para: m[2] || m[1] };
  });
}

/** O arquivo usa sintaxe de ES Module no topo? */
function ehModulo(codigo) {
  return /^(import|export)\b/m.test(codigo);
}

const DIRETIVA = "*/'use strict';";

/**
 * Módulo ES roda em modo estrito; script, não. Sem a diretiva, um método
 * chamado desacoplado ganharia `this` = global nos testes e undefined no
 * navegador. A diretiva entra sem deslocar nada: a última linha longa do
 * comentário de cabeçalho termina em `*\/'use strict';` e o resto do
 * comentário vira espaço (quebras de linha mantidas).
 */
function estrito(codigo, arquivo) {
  const m = codigo.match(/^\s*\/\*[\s\S]*?\*\//);
  if (!m) {
    throw new Error('[esm-como-script] ' + path.relative(process.cwd(), arquivo)
      + ' precisa começar com um comentário de bloco (o conversor põe o \'use strict\' nele).');
  }
  const fim = m[0].length;
  const corpo = m[0].slice(0, -2);
  // Última linha do comentário com espaço para a diretiva (e sem o /* de abertura).
  let fimLinha = corpo.length;
  while (fimLinha > 0) {
    const ini = corpo.lastIndexOf('\n', fimLinha - 1) + 1;
    if (fimLinha - ini >= DIRETIVA.length && ini > corpo.indexOf('/*') + 1) {
      const pos = fimLinha - DIRETIVA.length;
      return codigo.slice(0, pos) + DIRETIVA + emBranco(codigo.slice(fimLinha, fim)) + codigo.slice(fim);
    }
    fimLinha = ini - 1;
  }
  throw new Error('[esm-como-script] comentário de cabeçalho curto demais em ' + arquivo);
}

/**
 * Converte um ES Module em script de mesmo tamanho.
 * @returns {{codigo:string, importa:Array<{arquivo:string, nomes:Array<{importado:string, local:string}>}>, exporta:Array<{exportado:string, local:string}>}}
 */
function converter(codigo, arquivo) {
  const importa = [];
  const exporta = [];
  const dinamicos = [];

  // Antes do resto: `import('./x.js')` no começo de uma linha não é o import
  // estático que RE_SOBRA recusa. Procurado com os comentários em branco (um
  // comentário que cita import() não carrega nada) e trocado no original, na
  // mesma posição.
  const semComentarios = (c) => c.replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*/g, emBranco);
  for (const m of semComentarios(codigo).matchAll(RE_IMPORT_DINAMICO)) {
    dinamicos.push({ rel: m[3], arquivo: path.resolve(path.dirname(arquivo), m[3]) });
    codigo = codigo.slice(0, m.index) + IMPORT_DINAMICO + codigo.slice(m.index + IMPORT_DINAMICO.length);
  }
  const dinamicoSolto = semComentarios(codigo).match(RE_SOBRA_DINAMICO);
  if (dinamicoSolto) {
    const linha = codigo.slice(0, dinamicoSolto.index).split('\n').length;
    throw new Error('[esm-como-script] ' + path.relative(process.cwd(), arquivo) + ':' + linha
      + ' — import() fora do subconjunto suportado (só caminho literal relativo).');
  }

  codigo = codigo.replace(RE_IMPORT, (trecho, lista, padrao, _q, rel) => {
    const nomes = lista
      ? paresDaLista(lista).map((p) => ({ importado: p.de, local: p.para }))
      : [{ importado: 'default', local: padrao }];
    importa.push({ arquivo: path.resolve(path.dirname(arquivo), rel), nomes });
    return emBranco(trecho);
  });
  codigo = codigo.replace(RE_IMPORT_EFEITO, (trecho, _q, rel) => {
    importa.push({ arquivo: path.resolve(path.dirname(arquivo), rel), nomes: [] });
    return emBranco(trecho);
  });
  codigo = codigo.replace(RE_EXPORT_LISTA, (trecho, lista) => {
    paresDaLista(lista).forEach((p) => exporta.push({ exportado: p.para, local: p.de }));
    return emBranco(trecho);
  });
  codigo = codigo.replace(RE_EXPORT_DEFAULT, (trecho, nome) => {
    exporta.push({ exportado: 'default', local: nome });
    return emBranco(trecho);
  });
  codigo = codigo.replace(RE_EXPORT_DECL, (trecho, nome) => {
    exporta.push({ exportado: nome, local: nome });
    return emBranco(trecho);
  });

  const sobra = codigo.match(RE_SOBRA);
  if (sobra) {
    const linha = codigo.slice(0, sobra.index).split('\n').length;
    throw new Error('[esm-como-script] ' + path.relative(process.cwd(), arquivo) + ':' + linha
      + ' — import/export fora do subconjunto suportado. Amplie tests/helpers/esm-como-script.cjs.');
  }

  codigo = estrito(codigo, arquivo);

  const locais = new Set(exporta.map((e) => e.local));
  codigo = codigo.replace(new RegExp('^(const|let)(\\s+)(' + ID + ')(\\s*=)', 'gm'), (trecho, kw, esp, nome, igual) => {
    if (!locais.has(nome)) return trecho;
    return 'var' + ' '.repeat(kw.length - 3) + esp + nome + igual;
  });

  return { codigo, importa, exporta, dinamicos };
}

/**
 * Executa um ES Module (e o que ele importa, antes) num contexto vm já criado.
 * Cada arquivo roda uma vez por contexto, como no navegador.
 *
 * @param {object} ctx        contexto vm (o objeto global dele)
 * @param {string} arquivo    caminho absoluto
 * @param {Map}    [cache]    arquivo → exports, compartilhado entre chamadas no mesmo ctx
 * @param {object} [mocks]    nome exportado → dublê; um import coberto por inteiro não roda
 * @param {object} [opcoes]   { tdz: Set } — anota no Set quem lê um const/let
 *                            exportado antes de o módulo terminar (ver armarZonaMorta)
 * @returns {object} exports do módulo ({ default, NOME… })
 */
// Marca de módulo em execução: num ciclo de imports (a importa b, b importa a),
// quem chega de volta a um módulo ainda rodando não espera por ele.
const EM_ANDAMENTO = Symbol('em andamento');

// Um cache por contexto: chamadas separadas no mesmo ctx (config.js, depois
// um módulo que o importa) não rodam o mesmo arquivo duas vezes.
const cachePorContexto = new WeakMap();

/**
 * O conversor troca const/let por var, e var não tem zona morta: lido antes da
 * atribuição, dá undefined e segue. No navegador, ler um const de um módulo que
 * ainda não terminou (ciclo de imports) é ReferenceError e o app para, mesmo
 * dentro de `typeof`. Com { tdz: lidos }, cada const/let exportado vira um
 * acessor que anota a leitura em `lidos` até a primeira atribuição. Anota em
 * vez de só lançar: o vm do Node engole a exceção de um acessor do contexto e
 * trata o nome como ausente, e `typeof NOME` passaria quieto.
 */
const RE_LEXICO = new RegExp('^(?:export\\s+)?(?:const|let)\\s+(' + ID + ')', 'gm');

function armarZonaMorta(ctx, fonte, exporta, arquivo, lidos) {
  const lexicos = new Set([...fonte.matchAll(RE_LEXICO)].map((m) => m[1]));
  exporta.filter((e) => lexicos.has(e.local)).forEach(({ local }) => {
    Object.defineProperty(ctx, local, {
      configurable: true,
      get: () => {
        lidos.add(local + ' (de ' + path.relative(process.cwd(), arquivo) + ', ainda carregando)');
        throw new ReferenceError(local + ' lido antes de terminar de carregar');
      },
      set: (v) => { Object.defineProperty(ctx, local, { value: v, writable: true, configurable: true, enumerable: true }); },
    });
  });
}

/**
 * `__dimp` do contexto: o import() dinâmico dos módulos convertidos. Um mapa
 * por contexto, do caminho literal ao arquivo, preenchido por quem o importa.
 * Dois módulos com o mesmo caminho literal para alvos diferentes lançam: o
 * mapa não sabe de qual pasta o import() partiu.
 */
const dinamicosPorContexto = new WeakMap();

function registrarDinamicos(ctx, dinamicos, cache, mocks, opcoes) {
  let mapa = dinamicosPorContexto.get(ctx);
  if (!mapa) {
    mapa = new Map();
    dinamicosPorContexto.set(ctx, mapa);
    ctx[IMPORT_DINAMICO] = (rel) => new Promise((resolve) => {
      const alvo = mapa.get(rel);
      if (!alvo) throw new Error('[esm-como-script] import() sem alvo registrado: ' + rel);
      resolve(executarModulo(ctx, alvo.arquivo, alvo.cache, alvo.mocks, alvo.opcoes));
    });
  }
  for (const d of dinamicos) {
    const atual = mapa.get(d.rel);
    if (atual && atual.arquivo !== d.arquivo) {
      throw new Error('[esm-como-script] import(\'' + d.rel + '\') aponta para arquivos diferentes em módulos diferentes');
    }
    mapa.set(d.rel, { arquivo: d.arquivo, cache, mocks, opcoes });
  }
}

function executarModulo(ctx, arquivo, cache, mocks, opcoes) {
  if (!cache) {
    if (!cachePorContexto.has(ctx)) cachePorContexto.set(ctx, new Map());
    cache = cachePorContexto.get(ctx);
  }
  mocks = mocks || {};
  if (cache.has(arquivo)) return cache.get(arquivo);
  const fonte = fs.readFileSync(arquivo, 'utf8');
  const { codigo, importa, exporta, dinamicos } = converter(fonte, arquivo);
  cache.set(arquivo, EM_ANDAMENTO);
  if (dinamicos.length) registrarDinamicos(ctx, dinamicos, cache, mocks, opcoes);
  if (opcoes && opcoes.tdz) armarZonaMorta(ctx, fonte, exporta, arquivo, opcoes.tdz);

  for (const dep of importa) {
    // Dublê para todos os nomes deste import: o módulo real nem roda (mock).
    // Import só pelo efeito (sem nomes) sempre roda.
    if (dep.nomes.length && dep.nomes.every((n) => Object.prototype.hasOwnProperty.call(mocks, n.importado))) {
      dep.nomes.forEach((n) => { ctx[n.local] = mocks[n.importado]; });
      continue;
    }
    const exps = executarModulo(ctx, dep.arquivo, cache, mocks, opcoes);
    // Ciclo: como no navegador, os nomes do outro módulo só existem quando ele
    // termina. Aqui eles viram globais do contexto com o mesmo nome, então
    // quem os usa dentro de funções (a única forma válida num ciclo) os acha.
    if (exps === EM_ANDAMENTO) continue;
    for (const { importado, local } of dep.nomes) {
      if (!(importado in exps)) {
        throw new Error('[esm-como-script] ' + dep.arquivo + ' não exporta "' + importado + '"');
      }
      // Sem alias, o export já é global do contexto com o mesmo nome.
      if (vm.runInContext('typeof ' + local, ctx) === 'undefined') ctx[local] = exps[importado];
    }
  }

  vm.runInContext(codigo, ctx, { filename: arquivo });
  const exps = exporta.length
    ? vm.runInContext('({' + exporta.map((e) => JSON.stringify(e.exportado) + ':' + e.local).join(',') + '})', ctx, {
      filename: 'esm-como-script:exports',
    })
    : {};
  cache.set(arquivo, exps);
  return exps;
}

/** Nomes que o módulo e tudo o que ele importa declaram no topo (exports). */
function nomesDoGrafo(arquivo, vistos) {
  vistos = vistos || new Set();
  if (vistos.has(arquivo)) return [];
  vistos.add(arquivo);
  const { importa, exporta } = converter(fs.readFileSync(arquivo, 'utf8'), arquivo);
  return exporta.map((e) => e.local)
    .concat(...importa.map((dep) => nomesDoGrafo(dep.arquivo, vistos)));
}

/**
 * Roda o módulo num contexto que o teste montou com dublês: todo import cujo
 * nome o contexto já tem como propriedade própria usa o dublê (mock); o resto
 * carrega o módulo real. Para testes que criam o ctx à mão. Vale para o grafo
 * inteiro, não só os imports diretos: com o DADOS importando meio app, o
 * IDB_KV falso de um teste do DADOS é importado por ele, não pelo módulo raiz.
 */
function rodarNoContexto(ctx, arquivo) {
  const mocks = {};
  const vistos = new Set();
  const visitar = (arq) => {
    if (vistos.has(arq)) return;
    vistos.add(arq);
    for (const dep of converter(fs.readFileSync(arq, 'utf8'), arq).importa) {
      for (const { importado, local } of dep.nomes) {
        if (Object.prototype.hasOwnProperty.call(ctx, local)) mocks[importado] = ctx[local];
      }
      visitar(dep.arquivo);
    }
  };
  visitar(arquivo);
  return executarModulo(ctx, arquivo, undefined, mocks);
}

/**
 * Roda o módulo com TODOS os imports diretos como dublês: o que o contexto
 * tem como propriedade própria, ou `undefined` (ausente), como os globais que
 * faltavam ao script clássico. Nenhum módulo real além dele roda. Para testes
 * que montam um contexto mínimo à mão (antes `vm.runInContext` do arquivo).
 */
/**
 * Pasta das partes de um módulo dividido: js/modules/init-extrato.js →
 * js/modules/extrato/. Só ela entra de verdade nos carregadores isolados.
 */
function rodarIsolado(ctx, arquivo) {
  // Partes do módulo na pasta com o nome dele (js/modules/extrato/ do init-extrato.js)
  // rodam de verdade; o isolamento vale para o que elas importam de fora.
  const familia = pastaDasPartes(arquivo);
  const ehParte = (f) => f.startsWith(familia);
  const mocks = {};
  const vistos = new Set();
  (function visitar(arq) {
    if (vistos.has(arq)) return;
    vistos.add(arq);
    for (const dep of converter(fs.readFileSync(arq, 'utf8'), arq).importa) {
      if (ehParte(dep.arquivo)) { visitar(dep.arquivo); continue; }
      for (const { importado, local } of dep.nomes) {
        mocks[importado] = Object.prototype.hasOwnProperty.call(ctx, local) ? ctx[local] : undefined;
      }
    }
  })(arquivo);
  return executarModulo(ctx, arquivo, undefined, mocks);
}

/**
 * Texto do módulo mais o das partes que moram numa subpasta dele (as que ele
 * importa, na ordem do import), para os testes que conferem o fonte.
 */
module.exports = { ehModulo, converter, executarModulo, nomesDoGrafo, rodarNoContexto, rodarIsolado, fonteComPartes, pastaDasPartes };
