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
 * Arquivos alcançáveis a partir das entradas, por import relativo.
 * @param {string} raiz     diretório a que os caminhos são relativos
 * @param {string[]} entradas caminhos relativos (ex.: 'js/esm/ponte.js')
 * @returns {string[]} caminhos relativos com '/', entradas incluídas, em ordem de descoberta
 */
function grafoEsm(raiz, entradas) {
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
  }
  return [...vistos];
}

module.exports = { entradasEsm, grafoEsm };
