#!/usr/bin/env node
/**
 * generate-telas.cjs — transforma telas/<chunk>/<tela>.html em js/telas/<chunk>.js.
 *
 * Cada js/telas/<chunk>.js é um ES Module (ADR 0005) que chama
 * TELAS.registrar('<tela>', '<markup>') para as telas daquele chunk ao
 * carregar. A entrada do chunk (js/esm/chunks/<chunk>.js) o importa antes dos
 * módulos da tela: quando o init roda, as telas já estão no DOM. Ver
 * js/core/telas.js.
 *
 * O comentário de cabeçalho do .html fica de fora, e a indentação vira uma
 * quebra de linha só: o markup sai menor e renderiza igual (nenhuma tela usa
 * <pre> ou <textarea>, que seriam sensíveis a espaço; o gerador recusa).
 *
 * CSS por chunk (CSS_DOS_CHUNKS): folha usada só pelas telas de um chunk sai do
 * css/style.css (o CSS do primeiro acesso) e entra aqui, compactada, como
 * TELAS.estilo('<chunk>', '<css>') — antes do markup, para a tela nunca pintar
 * sem estilo. O <style> vai para o fim do <head>, depois do CSS do boot: cada
 * seletor da folha precisa de uma classe que o CSS do boot não usa, senão a
 * ordem da cascata mudaria (tests/telas.test.js confere).
 *
 *   node scripts/generate-telas.cjs          # regrava js/telas/
 *   node scripts/generate-telas.cjs --check  # falha se estiver defasado
 */
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const origem = path.join(root, 'telas');
const destino = path.join(root, 'js', 'telas');

// Folhas que chegam com o chunk em vez de irem no CSS do primeiro acesso.
const CSS_DOS_CHUNKS = {
  assinaturas: ['css/features/assinaturas.css'],
  conta: ['css/features/billing-planos.css', 'css/features/open-finance.css'],
  onboarding: ['css/features/onboarding.css'],
  patrimonio: ['css/features/patrimonio.css'],
  relatorios: ['css/features/relatorios.css'],
  simulador: ['css/features/simulador.css'],
};

/**
 * Compactação conservadora: tira comentários e junta espaços, sem tocar em
 * strings ("..."/'...'). Não reordena nem funde regras — o resultado é a
 * mesma folha, só menor.
 */
function compactarCss(css) {
  const TOKEN = /("(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*')|\/\*[\s\S]*?\*\/|\s+/g;
  return css
    .replace(TOKEN, (m, str) => (str ? str : (m.startsWith('/*') ? '' : ' ')))
    .replace(/("(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*')|\s*([{};])\s*/g, (m, str, sep) => (str ? str : sep))
    .replace(/;}/g, '}')
    .trim();
}

function cabecalho(chunk, origens) {
  return [
    '/**',
    ' * GERADO por scripts/generate-telas.cjs a partir de ' + origens + ' — não edite à mão.',
    ' * ES Module (ADR 0005): a entrada do chunk \'' + chunk + '\' (js/esm/chunks/' + chunk + '.js) o importa',
    ' * antes dos módulos da tela.',
    ' */',
    "import { TELAS } from '../core/telas.js';",
    '',
  ];
}

function gerar() {
  const saida = {};
  const dirs = fs.readdirSync(origem).filter((c) => fs.statSync(path.join(origem, c)).isDirectory());
  const chunks = [...new Set(dirs.concat(Object.keys(CSS_DOS_CHUNKS)))].sort();
  for (const chunk of chunks) {
    const folhas = CSS_DOS_CHUNKS[chunk] || [];
    const temTelas = dirs.includes(chunk);
    const origens = [].concat(folhas, temTelas ? ['telas/' + chunk + '/<tela>.html'] : []).join(' e ');
    const linhas = cabecalho(chunk, origens);
    if (folhas.length) {
      const css = folhas.map((f) => compactarCss(fs.readFileSync(path.join(root, f), 'utf8'))).join('');
      linhas.push('TELAS.estilo(' + JSON.stringify(chunk) + ', ' + JSON.stringify(css) + ');');
    }
    if (temTelas) {
      const dir = path.join(origem, chunk);
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
    }
    saida[chunk + '.js'] = linhas.join('\n') + '\n';
  }
  return saida;
}

module.exports = { CSS_DOS_CHUNKS, compactarCss };
if (require.main !== module) return;

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
