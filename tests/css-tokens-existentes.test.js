/**
 * css-tokens-existentes.test.js — todo var(--token) usado no CSS precisa
 * existir no design system.
 *
 * Motivo: `var(--color-surface, #fff)` passa despercebido em revisão e parece
 * defensivo, mas quando o token não existe quem pinta é o fallback — literal,
 * fixo, e errado no tema escuro. `var(--color-text)` sem token nem chega a
 * aplicar: a declaração é inválida e a cor vem por herança.
 *
 * O gate de dívida pega o literal; este teste pega o token fantasma.
 */
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const cssDir = path.join(root, 'css');

function arquivosCss(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) return arquivosCss(p);
    return e.name.endsWith('.css') ? [p] : [];
  });
}

// Um token pode ser definido em qualquer folha (há escopos locais legítimos).
const arquivos = arquivosCss(cssDir);
const definidos = new Set();
arquivos.forEach((arq) => {
  (fs.readFileSync(arq, 'utf8').match(/^\s*(--[a-z0-9-]+)\s*:/gim) || [])
    .forEach((l) => definidos.add(l.trim().replace(/\s*:$/, '')));
});

describe('CSS — nenhum token fantasma', () => {
  test('o design system define os tokens que ele mesmo declara', () => {
    expect(definidos.size).toBeGreaterThan(50);
  });

  test('nenhum token fantasma de COR ou TRANSIÇÃO, nem com fallback', () => {
    /* Fallback de dimensão (64px, 56px) é inofensivo: o valor é o mesmo nos
       dois temas. Fallback de cor não é — um rgba literal fica idêntico no
       claro e no escuro, e foi assim que `rgba(0,0,0,.08)` virou uma borda
       invisível no tema escuro. Transição idem: --transition-base era chamado
       com .2s num arquivo e .4s noutro, então definir o token um dia quebraria
       um dos dois.

       Dimensões toleradas hoje: --nav-bottom-height, --saldo-emoji-*. */
    const suspeitos = [];
    arquivos.forEach((arq) => {
      const src = fs.readFileSync(arq, 'utf8');
      const re = /var\(\s*(--[a-z0-9-]+)\s*,/gi;
      let m;
      while ((m = re.exec(src)) !== null) {
        const nome = m[1];
        if (definidos.has(nome)) continue;
        if (/color|bg|border|text|shadow|transition/.test(nome)) {
          suspeitos.push(path.relative(root, arq) + ' → ' + nome);
        }
      }
    });
    expect([...new Set(suspeitos)]).toEqual([]);
  });

  test('nenhum var(--token) sem fallback aponta para token inexistente', () => {
    /* Sem fallback e sem token = declaração inválida: o navegador descarta a
       linha inteira. Um font-size some e o texto herda o tamanho do pai; um
       background some e o card fica transparente. Falha silenciosa, das
       piores de achar depois. */
    const orfaos = [];
    arquivos.forEach((arq) => {
      const src = fs.readFileSync(arq, 'utf8');
      const re = /var\(\s*(--[a-z0-9-]+)\s*(,)?/gi;
      let m;
      while ((m = re.exec(src)) !== null) {
        const [, nome, temFallback] = m;
        if (!temFallback && !definidos.has(nome)) {
          orfaos.push(path.relative(root, arq) + ' → ' + nome);
        }
      }
    });
    expect([...new Set(orfaos)]).toEqual([]);
  });
});
