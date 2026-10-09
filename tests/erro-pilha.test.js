/**
 * erro-pilha.test.js — mapas de código do release e a tradução da pilha.
 *
 * Auditoria de operação de 06/10 (achado 7): a pilha de um erro relatado
 * apontava para `app.bundle.js:1:48213`, sem dizer qual função quebrou. O
 * release guarda os mapas fora do APK e `npm run erro:pilha` traduz.
 *
 * @jest-environment node
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const esbuild = require('esbuild');
const { decodificarVlq, traduzirPilha } = require('../scripts/erro-pilha.cjs');

const root = path.join(__dirname, '..');
const ler = (rel) => fs.readFileSync(path.join(root, rel), 'utf8');

function posicao(codigo, trecho) {
  const i = codigo.indexOf(trecho);
  const antes = codigo.slice(0, i);
  return { linha: antes.split('\n').length, coluna: i - antes.lastIndexOf('\n') };
}

describe('decodificarVlq', () => {
  test('valores do formato source map v3', () => {
    expect(decodificarVlq('AAAA')).toEqual([0, 0, 0, 0]);
    expect(decodificarVlq('AACA')).toEqual([0, 0, 1, 0]);
    expect(decodificarVlq('D')).toEqual([-1]);
    expect(decodificarVlq('gB')).toEqual([16]);
  });
});

describe('traduzirPilha', () => {
  let pasta;
  beforeEach(() => { pasta = fs.mkdtempSync(path.join(os.tmpdir(), 'fp-mapas-')); });
  afterEach(() => { fs.rmSync(pasta, { recursive: true, force: true }); });

  test('bundle concatenado (bundle-app): volta ao arquivo e à linha de origem', () => {
    const a = 'var A = {\n  um: function() { return 1; }\n};\n';
    const b = '// comentário\nvar B = {\n  quebra: function(x) {\n    return x.naoExiste.campo;\n  }\n};\n';
    const combinado = a + '\n;\n' + b + '\n;\n';
    const out = esbuild.transformSync(combinado, { minify: true, sourcemap: 'external', sourcefile: 'app.bundle.src.js' });
    fs.writeFileSync(path.join(pasta, 'app.bundle.js.map'), out.map);
    fs.writeFileSync(path.join(pasta, 'app.bundle.js.partes.json'), JSON.stringify([
      { arquivo: 'js/a.js', linha: 1 },
      { arquivo: 'js/b.js', linha: (a + '\n;\n').split('\n').length },
    ]));
    const p = posicao(out.code, 'naoExiste');
    const r = traduzirPilha(`TypeError: x\n    at quebra (https://app.financaspro.com/js/app.bundle.js:${p.linha}:${p.coluna})`, pasta);
    expect(r.traduzidas).toBe(1);
    expect(r.texto).toMatch(/at quebra \(js\/b\.js:4:\d+/);
  });

  test('chunk do Vite: fonte relativa vira caminho do repositório', () => {
    const src = 'export function soma(a, b) {\n  return a.valor + b.valor;\n}\n';
    const out = esbuild.transformSync(src, { minify: true, sourcemap: 'external', sourcefile: '../../js/core/soma.js', format: 'esm' });
    fs.writeFileSync(path.join(pasta, 'index-Abc123.js.map'), out.map);
    const p = posicao(out.code, '.valor');
    const r = traduzirPilha(`index-Abc123.js:${p.linha}:${p.coluna}`, pasta);
    expect(r.texto).toMatch(/^js\/core\/soma\.js:2:\d+/);
  });

  test('sem o mapa do bundle, a linha fica como estava', () => {
    const r = traduzirPilha('at x (outro-Zz9.js:1:10)', pasta);
    expect(r.texto).toBe('at x (outro-Zz9.js:1:10)');
    expect(r.semMapa).toBe(1);
  });
});

describe('mapas só no release e nunca no dist/', () => {
  test('Vite gera mapa só com FP_SOURCEMAPS=1, e sem o comentário que o anuncia', () => {
    expect(ler('vite.config.cjs')).toMatch(/sourcemap:\s*process\.env\.FP_SOURCEMAPS === '1' \? 'hidden' : false/);
  });

  test('o build tira os mapas do dist/ antes de conferir os órfãos', () => {
    const build = JSON.parse(ler('package.json')).scripts.build;
    expect(build.indexOf('sourcemaps-guardar.cjs')).toBeGreaterThan(build.indexOf('harden-csp.cjs'));
    expect(build.indexOf('sourcemaps-guardar.cjs')).toBeLessThan(build.indexOf('check-dist-orphans.cjs'));
  });

  test('o release gera os mapas no build do AAB e os guarda como artefato', () => {
    const yml = ler('.github/workflows/release.yml');
    const sync = yml.indexOf('npm run android:sync');
    expect(yml.slice(yml.lastIndexOf('- name:', sync), sync)).toMatch(/FP_SOURCEMAPS: '1'/);
    expect(yml).toMatch(/name: sourcemaps-\$\{\{ needs\.verificar\.outputs\.tag \}\}\s+path: sourcemaps\//);
  });

  test('sourcemaps/ fica fora do git', () => {
    expect(ler('.gitignore')).toMatch(/^sourcemaps\/$/m);
  });
});
