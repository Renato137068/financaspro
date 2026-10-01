/**
 * hospedagem-web.test.js — a web em hospedagem estática leva os cabeçalhos
 * que o servidor Express mandava.
 *
 * Com o Express fora (ADR 0007), quem serve o dist/ é um host estático
 * (Cloudflare Pages ou Netlify), que lê dist/_headers. Sem o arquivo, o app
 * iria ao ar sem HSTS, sem proteção contra ser aberto num iframe de outro site
 * e com o index.html em cache longo — preso numa versão antiga.
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const fonte = fs.readFileSync(path.join(ROOT, 'config', 'hospedagem', '_headers'), 'utf8');

/** { caminho: { Cabeçalho: valor } } no formato do _headers. */
function regras(texto) {
  const out = {};
  let atual = null;
  texto.split('\n').forEach((linha) => {
    if (!linha.trim() || linha.trim().startsWith('#')) return;
    if (!/^\s/.test(linha)) { atual = linha.trim(); out[atual] = {}; return; }
    const i = linha.indexOf(':');
    out[atual][linha.slice(0, i).trim()] = linha.slice(i + 1).trim();
  });
  return out;
}

describe('dist/_headers', () => {
  const r = regras(fonte);

  test('segurança em todas as rotas', () => {
    expect(r['/*']).toMatchObject({
      'X-Content-Type-Options': 'nosniff',
      'X-Frame-Options': 'DENY',
      'Content-Security-Policy': "frame-ancestors 'none'",
    });
    expect(r['/*']['Strict-Transport-Security']).toMatch(/max-age=31536000/);
  });

  test('a CSP do cabeçalho não restringe nada além de frame-ancestors (o resto é do <meta>)', () => {
    expect(r['/*']['Content-Security-Policy']).not.toMatch(/default-src|script-src|connect-src/);
  });

  test('ponto de entrada nunca em cache longo', () => {
    ['/', '/index.html', '/sw.js', '/manifest.json'].forEach((p) => {
      expect({ p, cache: r[p] && r[p]['Cache-Control'] }).toEqual({ p, cache: 'no-cache' });
    });
  });

  test('imutável só onde todo arquivo tem hash no nome', () => {
    expect(r['/assets/*']['Cache-Control']).toMatch(/immutable/);
    expect(r['/css/*']['Cache-Control']).toMatch(/immutable/);
    // js/ tem app.bundle.js e vendor.bundle.js sem hash.
    expect(r['/js/*']['Cache-Control']).not.toMatch(/immutable/);
  });

  test('assetlinks sai como JSON (o Google não aceita o index.html no lugar)', () => {
    expect(r['/.well-known/assetlinks.json']['Content-Type']).toBe('application/json');
  });

  test('o build copia o arquivo para a raiz do dist/', () => {
    const copy = fs.readFileSync(path.join(ROOT, 'scripts', 'copy-static.cjs'), 'utf8');
    expect(copy).toContain("path.join(root, 'config', 'hospedagem', '_headers'), path.join(dist, '_headers')");
  });

  test('o passo a passo de hospedagem existe e aponta para o arquivo', () => {
    const doc = fs.readFileSync(path.join(ROOT, 'docs', 'release', 'hospedagem-web.md'), 'utf8');
    expect(doc).toContain('config/hospedagem/_headers');
    expect(doc).toMatch(/Build output directory \| `dist`/);
  });
});
