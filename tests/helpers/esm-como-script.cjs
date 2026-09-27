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
 *   - `export { A };`, `export default A;` viram espaços;
 *   - `export const A =`  perde o `export `;
 *   - `const A =` / `let A =` de um nome exportado viram `var   A =` / `var A =`,
 *     para o nome ficar no global do contexto, como os scripts clássicos (os
 *     testes trocam dublês por ele, e o app-jsdom o lê pelo nome).
 *
 * Só esse subconjunto de sintaxe é aceito. Qualquer outro import/export no
 * topo do arquivo lança erro: melhor ampliar este conversor de propósito do
 * que medir cobertura torta sem perceber.
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ID = '[A-Za-z_$][\\w$]*';
const RE_IMPORT = new RegExp('^import\\s+(?:\\{([^}]*)\\}|(' + ID + '))\\s+from\\s+([\'"])(\\.{1,2}/[^\'"]+)\\3;?', 'gm');
const RE_EXPORT_LISTA = /^export\s*\{([^}]*)\};?/gm;
const RE_EXPORT_DEFAULT = new RegExp('^export\\s+default\\s+(' + ID + ');?', 'gm');
const RE_EXPORT_DECL = new RegExp('^export\\s+(?=(?:const|let|var|function|class)\\s+(' + ID + '))', 'gm');
const RE_SOBRA = /^\s*(import|export)\b/m;

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

/**
 * Converte um ES Module em script de mesmo tamanho.
 * @returns {{codigo:string, importa:Array<{arquivo:string, nomes:Array<{importado:string, local:string}>}>, exporta:Array<{exportado:string, local:string}>}}
 */
function converter(codigo, arquivo) {
  const importa = [];
  const exporta = [];

  codigo = codigo.replace(RE_IMPORT, (trecho, lista, padrao, _q, rel) => {
    const nomes = lista
      ? paresDaLista(lista).map((p) => ({ importado: p.de, local: p.para }))
      : [{ importado: 'default', local: padrao }];
    importa.push({ arquivo: path.resolve(path.dirname(arquivo), rel), nomes });
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

  const locais = new Set(exporta.map((e) => e.local));
  codigo = codigo.replace(new RegExp('^(const|let)(\\s+)(' + ID + ')(\\s*=)', 'gm'), (trecho, kw, esp, nome, igual) => {
    if (!locais.has(nome)) return trecho;
    return 'var' + ' '.repeat(kw.length - 3) + esp + nome + igual;
  });

  return { codigo, importa, exporta };
}

/**
 * Executa um ES Module (e o que ele importa, antes) num contexto vm já criado.
 * Cada arquivo roda uma vez por contexto, como no navegador.
 *
 * @param {object} ctx        contexto vm (o objeto global dele)
 * @param {string} arquivo    caminho absoluto
 * @param {Map}    [cache]    arquivo → exports, compartilhado entre chamadas no mesmo ctx
 * @returns {object} exports do módulo ({ default, NOME… })
 */
function executarModulo(ctx, arquivo, cache) {
  cache = cache || new Map();
  if (cache.has(arquivo)) return cache.get(arquivo);
  const fonte = fs.readFileSync(arquivo, 'utf8');
  const { codigo, importa, exporta } = converter(fonte, arquivo);

  for (const dep of importa) {
    const exps = executarModulo(ctx, dep.arquivo, cache);
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

module.exports = { ehModulo, converter, executarModulo };
