/**
 * apk-assets-web.test.js — o que só serve ao site fica fora do APK.
 *
 * O dist/ é o mesmo para o site e para o app (capacitor.config.json → webDir).
 * android/app/build.gradle (ignoreAssetsPattern) tira do APK as capturas da
 * instalação como PWA, a página "sobre", os artigos e os arquivos da
 * hospedagem: ~780 KB comprimidos, metade do peso web do APK.
 *
 * Isso só é seguro enquanto nada dentro do app abre esses caminhos. Se um dia
 * o app passar a linkar /sobre.html ou uma imagem de site/, este teste falha
 * antes de o link virar uma tela em branco no celular.
 * @jest-environment node
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const ler = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

const PASTAS = ['screenshots', 'site', 'artigos'];
const ARQUIVOS = ['sobre.html', 'robots.txt', 'sitemap.xml', '_headers'];

function arquivosDoApp() {
  const lista = ['index.html', 'sw.js'];
  (function andar(rel) {
    fs.readdirSync(path.join(ROOT, rel), { withFileTypes: true }).forEach(function(ent) {
      const r = rel + '/' + ent.name;
      if (ent.isDirectory()) { if (r !== 'js/vendor') andar(r); }
      else if (/\.(js|html)$/.test(ent.name)) lista.push(r);
    });
  })('js');
  (function andar(rel) {
    fs.readdirSync(path.join(ROOT, rel), { withFileTypes: true }).forEach(function(ent) {
      const r = rel + '/' + ent.name;
      if (ent.isDirectory()) andar(r);
      else if (ent.name.endsWith('.html')) lista.push(r);
    });
  })('telas');
  return lista;
}

describe('APK sem os arquivos do site', function() {
  const gradle = ler('android/app/build.gradle');
  const padrao = (gradle.match(/ignoreAssetsPattern = ([\s\S]*?)\n\s*}/) || [])[1] || '';
  const entradas = padrao.replace(/'\s*\+\s*'/g, '').replace(/'/g, '').trim().split(':');

  test('build.gradle ignora as pastas e arquivos do site', function() {
    PASTAS.forEach(function(p) { expect(entradas).toContain('!<dir>' + p); });
    ARQUIVOS.forEach(function(a) { expect(entradas).toContain('!<file>' + a); });
    // Os padrões do Capacitor continuam lá.
    expect(entradas).toContain('.*');
    expect(entradas).toContain('!.git');
  });

  test('nada no app abre esses caminhos', function() {
    const caminho = new RegExp(
      '(?:^|[\'"(=/\\s])(?:(?:' + PASTAS.join('|') + ')/|' +
      ARQUIVOS.map(function(a) { return a.replace('.', '\\.'); }).join('|') + ')'
    );
    const achados = [];
    arquivosDoApp().forEach(function(rel) {
      ler(rel).split('\n').forEach(function(linha, i) {
        if (caminho.test(linha)) achados.push(rel + ':' + (i + 1) + '  ' + linha.trim().slice(0, 120));
      });
    });
    expect(achados).toEqual([]);
  });
});
