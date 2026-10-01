/**
 * fonte-com-partes.cjs — o texto de um módulo junto com as partes dele.
 *
 * Módulos grandes foram divididos em fachada + partes na pasta com o nome do
 * módulo (js/billing.js → js/billing/, js/modules/init-extrato.js →
 * js/modules/extrato/). Checagens estáticas que procuram um padrão "no
 * módulo" têm de olhar a fachada e as partes que ela importa, nessa ordem.
 */
const fs = require('fs');
const path = require('path');

function pastaDasPartes(arquivo) {
  return path.join(path.dirname(arquivo), path.basename(arquivo, '.js').replace(/^init-/, '')) + path.sep;
}

function fonteComPartes(arquivo) {
  const familia = pastaDasPartes(arquivo);
  const ehParte = (f) => f.startsWith(familia);
  const vistos = new Set();
  const textos = [];
  (function visitar(arq) {
    if (vistos.has(arq)) return;
    vistos.add(arq);
    const codigo = fs.readFileSync(arq, 'utf8');
    textos.push(codigo);
    for (const m of codigo.matchAll(/^import\s+(?:[^'"]*?from\s+)?['"](\.[^'"]+)['"]/gm)) {
      const dep = path.resolve(path.dirname(arq), m[1]);
      if (ehParte(dep)) visitar(dep);
    }
  })(arquivo);
  return textos.join('\n');
}

module.exports = { pastaDasPartes, fonteComPartes };
