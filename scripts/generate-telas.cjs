#!/usr/bin/env node
/**
 * generate-telas.cjs — transforma telas/<chunk>/<tela>.html em js/telas/<chunk>.js.
 *
 * Cada js/telas/<chunk>.js chama TELAS.registrar('<tela>', '<markup>') para as
 * telas daquele chunk lazy. Ele entra no chunk (LAZY_CHUNKS em
 * scripts/bundle-app.cjs, antes dos scripts da tela) e no index.html (sem
 * build, todo script carrega no boot). Ver js/core/telas.js.
 *
 * O comentário de cabeçalho do .html fica de fora, e a indentação vira uma
 * quebra de linha só: o markup sai menor e renderiza igual (nenhuma tela usa
 * <pre> ou <textarea>, que seriam sensíveis a espaço; o gerador recusa).
 *
 *   node scripts/generate-telas.cjs          # regrava js/telas/
 *   node scripts/generate-telas.cjs --check  # falha se estiver defasado
 */
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const origem = path.join(root, 'telas');
const destino = path.join(root, 'js', 'telas');

function gerar() {
  const saida = {};
  for (const chunk of fs.readdirSync(origem).sort()) {
    const dir = path.join(origem, chunk);
    if (!fs.statSync(dir).isDirectory()) continue;
    const linhas = [
      '/* GERADO por scripts/generate-telas.cjs a partir de telas/' + chunk + '/*.html — não edite à mão. */',
    ];
    for (const arq of fs.readdirSync(dir).filter((f) => f.endsWith('.html')).sort()) {
      const tela = arq.replace(/\.html$/, '');
      let html = fs.readFileSync(path.join(dir, arq), 'utf8');
      html = html.replace(/^\s*<!--[\s\S]*?-->\s*/, '');
      if (/<(pre|textarea)\b/i.test(html)) {
        throw new Error('[telas] ' + chunk + '/' + arq + ' tem <pre>/<textarea>: a compactação de espaço mudaria o conteúdo');
      }
      html = html.replace(/\n\s+/g, '\n').trim();
      linhas.push('TELAS.registrar(' + JSON.stringify(tela) + ', ' + JSON.stringify(html) + ');');
    }
    saida[chunk + '.js'] = linhas.join('\n') + '\n';
  }
  return saida;
}

const esperado = gerar();
const atuais = fs.existsSync(destino) ? fs.readdirSync(destino).filter((f) => f.endsWith('.js')) : [];

if (process.argv.includes('--check')) {
  const defasados = Object.keys(esperado).filter((f) => {
    const p = path.join(destino, f);
    return !fs.existsSync(p) || fs.readFileSync(p, 'utf8') !== esperado[f];
  });
  const sobrando = atuais.filter((f) => !(f in esperado));
  if (defasados.length || sobrando.length) {
    console.error('[telas] js/telas/ defasado: ' + defasados.concat(sobrando).join(', '));
    console.error('        Rode: npm run telas:gerar');
    process.exit(1);
  }
  console.log('[telas] ✓ js/telas/ em dia com telas/');
} else {
  fs.mkdirSync(destino, { recursive: true });
  atuais.filter((f) => !(f in esperado)).forEach((f) => fs.unlinkSync(path.join(destino, f)));
  for (const [f, conteudo] of Object.entries(esperado)) fs.writeFileSync(path.join(destino, f), conteudo);
  console.log('[telas] ' + Object.keys(esperado).length + ' arquivo(s) gravado(s) em js/telas/');
}
