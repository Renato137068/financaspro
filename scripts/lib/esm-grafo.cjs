/**
 * esm-grafo.cjs — os ES Modules do app, a partir das entradas do index.html.
 *
 * `<script type="module" src>` é entrada do Vite no build (ADR 0005), que
 * junta a entrada e tudo o que ela importa num arquivo só. Os scripts que
 * tratam o resto de js/ (bundle-app, generate-sw-cache) precisam saber quais
 * arquivos são desse grafo: no build, para não empacotá-los de novo e apagar
 * as cópias cruas; no service worker de desenvolvimento, para precacheá-los.
 */
const fs = require('fs');
const path = require('path');

const RE_TAG_MODULO = /<script[^>]+type="module"[^>]+src="([^"]+)"[^>]*><\/script>/g;
const RE_IMPORT = /^\s*(?:import|export)\b[^'";]*?\bfrom\s*['"](\.{1,2}\/[^'"]+)['"]|^\s*import\s*['"](\.{1,2}\/[^'"]+)['"]/gm;
// import() dinâmico com caminho literal: os chunks sob demanda (LAZY.load).
const RE_IMPORT_DINAMICO = /(?<![\w$.])import\(\s*['"](\.{1,2}\/[^'"]+)['"]\s*\)/g;

/** `src` (relativo, sem barra inicial) dos `<script type="module">` locais. */
function entradasEsm(html) {
  const lista = [];
  let m;
  RE_TAG_MODULO.lastIndex = 0;
  while ((m = RE_TAG_MODULO.exec(html))) {
    if (!/^https?:/.test(m[1])) lista.push(m[1].replace(/^\//, ''));
  }
  return lista;
}

/**
 * Arquivos alcançáveis a partir das entradas, por import relativo, estático
 * ou dinâmico (`import('./x.js')`, os chunks sob demanda).
 * @param {string} raiz     diretório a que os caminhos são relativos
 * @param {string[]} entradas caminhos relativos (ex.: 'js/esm/ponte.js')
 * @param {object} [opcoes] { soEstatico: true } — só o que carrega no boot
 * @returns {string[]} caminhos relativos com '/', entradas incluídas, em ordem de descoberta
 */
function grafoEsm(raiz, entradas, opcoes) {
  const soEstatico = !!(opcoes && opcoes.soEstatico);
  const vistos = new Set();
  const fila = entradas.map((e) => path.join(raiz, e));
  while (fila.length) {
    const arquivo = fila.shift();
    const rel = path.relative(raiz, arquivo).split(path.sep).join('/');
    if (vistos.has(rel)) continue;
    vistos.add(rel);
    const codigo = fs.readFileSync(arquivo, 'utf8');
    let m;
    RE_IMPORT.lastIndex = 0;
    while ((m = RE_IMPORT.exec(codigo))) {
      fila.push(path.resolve(path.dirname(arquivo), m[1] || m[2]));
    }
    if (soEstatico) continue;
    // Comentário não carrega nada: só o código conta.
    const semComentarios = codigo.replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*/g, '');
    RE_IMPORT_DINAMICO.lastIndex = 0;
    while ((m = RE_IMPORT_DINAMICO.exec(semComentarios))) {
      fila.push(path.resolve(path.dirname(arquivo), m[1]));
    }
  }
  return [...vistos];
}

/**
 * Chunks sob demanda: para cada alvo de `import()` dinâmico, os arquivos que
 * ele traz além do que o boot já carregou.
 * @returns {Map<string, string[]>} entrada do chunk → arquivos do chunk (ela inclusa)
 */
function chunksEsm(raiz, entradas) {
  const eager = new Set(grafoEsm(raiz, entradas, { soEstatico: true }));
  const chunks = new Map();
  for (const rel of grafoEsm(raiz, entradas)) {
    const codigo = fs.readFileSync(path.join(raiz, rel), 'utf8').replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*/g, '');
    let m;
    RE_IMPORT_DINAMICO.lastIndex = 0;
    while ((m = RE_IMPORT_DINAMICO.exec(codigo))) {
      const alvo = path.relative(raiz, path.resolve(path.dirname(path.join(raiz, rel)), m[1])).split(path.sep).join('/');
      if (chunks.has(alvo)) continue;
      chunks.set(alvo, grafoEsm(raiz, [alvo], { soEstatico: true }).filter((r) => !eager.has(r)));
    }
  }
  return chunks;
}

module.exports = { entradasEsm, grafoEsm, chunksEsm };
