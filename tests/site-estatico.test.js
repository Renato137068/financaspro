/**
 * site-estatico.test.js — página do app e artigos (site/).
 *
 * Itens das etapas 2 e 3 da auditoria de ASO de 04/out: um lugar fora da loja
 * que confirma que a marca existe, com o link da Play e a política, e artigos
 * que trazem visita de busca. São páginas sem JavaScript, servidas pela mesma
 * hospedagem da web (scripts/copy-static.cjs) e empacotadas no APK com o
 * dist/, por isso leves.
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const SITE = path.join(ROOT, 'site');
const ler = (rel) => fs.readFileSync(path.join(SITE, rel), 'utf8');
const PLAY = 'https://play.google.com/store/apps/details?id=com.financaspro.mobile';

const paginas = ['sobre.html'].concat(
  fs.readdirSync(path.join(SITE, 'artigos')).map((f) => 'artigos/' + f),
);

/** Caminho servido (/x) → arquivo de origem no repositório. */
function origemDe(servido) {
  const rel = servido.replace(/^\//, '').split('#')[0];
  if (rel === 'privacidade.html' || rel === 'index.html' || rel.startsWith('icons/')) return path.join(ROOT, rel);
  if (rel.startsWith('site/')) return path.join(SITE, rel.slice('site/'.length));
  return path.join(SITE, rel);
}

describe('site estático', () => {
  test('a página do app e pelo menos três artigos', () => {
    expect(paginas).toContain('sobre.html');
    expect(paginas.filter((p) => p.startsWith('artigos/')).length).toBeGreaterThanOrEqual(3);
  });

  test.each(paginas)('%s: CSP sem script, título, descrição e canonical', (p) => {
    const html = ler(p);
    const csp = (html.match(/http-equiv="Content-Security-Policy" content="([^"]+)"/) || [])[1];
    expect(csp).toMatch(/default-src 'none'/);
    expect(csp).not.toMatch(/script-src|unsafe-inline|unsafe-eval/);
    // Só dado estruturado: nenhum script executável.
    const scripts = html.match(/<script\b[^>]*>/g) || [];
    scripts.forEach((s) => expect(s).toMatch(/type="application\/ld\+json"/));
    expect(html).toMatch(/<html lang="pt-BR">/);
    expect(html).toMatch(/<title>[^<]{10,70}<\/title>/);
    const desc = (html.match(/<meta name="description" content="([^"]+)"/) || [])[1];
    expect(desc.length).toBeGreaterThan(70);
    expect(desc.length).toBeLessThanOrEqual(170);
    expect(html).toContain('<link rel="canonical" href="https://app.financaspro.com/' + p + '">');
  });

  test.each(paginas)('%s: leva para a Play e todo link interno existe', (p) => {
    const html = ler(p);
    expect(html).toContain('href="' + PLAY + '"');
    const internos = [...html.matchAll(/(?:href|src)="(\/[^"]*)"/g)].map((m) => m[1]);
    expect(internos.length).toBeGreaterThan(3);
    internos.forEach((l) => expect(fs.existsSync(origemDe(l))).toBe(true));
  });

  test.each(paginas)('%s: não promete o que o app da loja não faz', (p) => {
    const texto = ler(p).replace(/<[^>]+>/g, ' ');
    // O app da loja pede conta (ver tests/play-store-honestidade.test.js).
    expect(texto).not.toMatch(/sem conta|sem cadastro|sem login/i);
    // Open Finance saiu do escopo (ADR 0007).
    expect(texto).not.toMatch(/Open Finance|conecta(?:r)? (?:ao|com o) (?:seu )?banco automaticamente/i);
    // Nenhuma nota ou número de avaliações inventado.
    expect(ler(p)).not.toMatch(/aggregateRating|ratingValue/);
  });

  test('o sitemap lista todas as páginas, e o robots aponta para ele', () => {
    const sitemap = ler('sitemap.xml');
    paginas.forEach((p) => expect(sitemap).toContain('<loc>https://app.financaspro.com/' + p + '</loc>'));
    expect(ler('robots.txt')).toContain('Sitemap: https://app.financaspro.com/sitemap.xml');
  });

  test('imagens leves (vão no APK)', () => {
    const img = path.join(SITE, 'img');
    fs.readdirSync(img).forEach((f) => {
      expect(fs.statSync(path.join(img, f)).size).toBeLessThan(60 * 1024);
    });
  });

  test('o build copia o site para o dist', () => {
    const copia = fs.readFileSync(path.join(ROOT, 'scripts/copy-static.cjs'), 'utf8');
    expect(copia).toMatch(/copiarSite\(\)/);
    ['sobre.html', 'robots.txt', 'sitemap.xml', "'artigos'", "'estilo.css'", "'img'"].forEach((t) => expect(copia).toContain(t));
  });

  test('a ficha da Play informa o site', () => {
    const ficha = fs.readFileSync(path.join(ROOT, 'docs/play-store-ficha.md'), 'utf8');
    expect(ficha).toMatch(/\*\*Site\*\*: `https:\/\/app\.financaspro\.com\/sobre\.html`/);
  });
});
