/**
 * index-com-telas.cjs — o index.html como o usuário o vê depois de abrir tudo.
 *
 * Telas usadas só por um chunk lazy moram em telas/<chunk>/<tela>.html, e o
 * index.html guarda só a casca vazia (ver js/core/telas.js). Testes que
 * conferem o markup de uma tela (IDs, rótulos, acessibilidade) leem por aqui:
 * a casca volta preenchida com o conteúdo do arquivo da tela.
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..');
// Grupos: 1 = tela, 2 = atributos extras da casca (role, aria-label…), 3 = chunk.
const CASCA = /<div id="aba-([\w-]+)" class="aba"([^>]*?) data-tela="\1" aria-busy="true"><!-- telas\/([\w-]+)\/\1\.html --><\/div>/g;

function conteudoDaTela(chunk, tela) {
  const html = fs.readFileSync(path.join(ROOT, 'telas', chunk, tela + '.html'), 'utf8');
  return html.replace(/^\s*<!--[\s\S]*?-->\s*/, '');
}

function indexComTelas() {
  const index = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  return index.replace(CASCA, (_casca, tela, extras, chunk) =>
    '<div id="aba-' + tela + '" class="aba"' + extras + '>\n' + conteudoDaTela(chunk, tela) + '</div>');
}

module.exports = { indexComTelas, CASCA };
