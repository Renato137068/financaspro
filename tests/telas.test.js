/**
 * telas.test.js — telas fora do index.html (js/core/telas.js).
 *
 * O markup de uma tela lazy mora em telas/<chunk>/<tela>.html, vira
 * js/telas/<chunk>.js e chega com o chunk. Se a casca, o arquivo, o chunk e o
 * index.html não baterem, a tela abre vazia — e nada no console avisa.
 */
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const { carregarScript } = require('./helpers/carregar-script.cjs');
const { indexComTelas, CASCA } = require('./helpers/index-com-telas.cjs');

const ROOT = path.join(__dirname, '..');
const index = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');

const cascas = [...index.matchAll(CASCA)].map((m) => ({ tela: m[1], chunk: m[3] }));
const arquivos = fs.readdirSync(path.join(ROOT, 'telas')).flatMap((chunk) =>
  fs.readdirSync(path.join(ROOT, 'telas', chunk)).map((f) => ({ tela: f.replace(/\.html$/, ''), chunk })));

/** Imports da entrada do chunk (js/esm/chunks/<chunk>.js), em ordem. */
function importsDoChunk(chunk) {
  const arq = path.join(ROOT, 'js', 'esm', 'chunks', chunk + '.js');
  if (!fs.existsSync(arq)) return null;
  return [...fs.readFileSync(arq, 'utf8').matchAll(/^import\s+(?:[^'"]*?from\s+)?['"]([^'"]+)['"]/gm)]
    .map((m) => path.relative(ROOT, path.resolve(path.dirname(arq), m[1])).split(path.sep).join('/'));
}

describe('telas fora do index.html', () => {
  test('cada casca tem seu arquivo, e cada arquivo tem sua casca', () => {
    expect(cascas.length).toBeGreaterThan(0);
    const chave = (t) => t.chunk + '/' + t.tela;
    expect(cascas.map(chave).sort()).toEqual(arquivos.map(chave).sort());
    // Nenhuma casca esquecida em outro formato (sem o comentário que aponta o arquivo).
    expect((index.match(/data-tela="/g) || []).length).toBe(cascas.length);
  });

  // No ES Module, os imports avaliam em ordem: o markup entra no DOM antes de
  // o módulo da tela carregar.
  test('js/telas/<chunk>.js é o primeiro import da entrada do chunk, e o index.html não o carrega', () => {
    for (const chunk of new Set(arquivos.map((a) => a.chunk))) {
      const lista = importsDoChunk(chunk);
      expect(lista).not.toBeNull();
      expect(lista[0]).toBe('js/telas/' + chunk + '.js');
      expect(index).not.toContain('src="js/telas/' + chunk + '.js"');
    }
  });

  test('js/telas/ está em dia com telas/', () => {
    const r = spawnSync(process.execPath, [path.join(ROOT, 'scripts', 'generate-telas.cjs'), '--check'], { encoding: 'utf8' });
    expect(r.stderr).toBe('');
    expect(r.status).toBe(0);
  });

  test('IDs continuam únicos com as telas de volta no documento', () => {
    const ids = [...indexComTelas().matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]);
    const repetidos = ids.filter((id, i) => ids.indexOf(id) !== i);
    expect(repetidos).toEqual([]);
  });

  test('o index.html do primeiro acesso encolheu', () => {
    const cheio = Buffer.byteLength(indexComTelas());
    expect(Buffer.byteLength(index)).toBeLessThan(cheio - 25 * 1024);
  });
});

describe('TELAS.registrar', () => {
  let TELAS;
  let eventos;
  const ouvir = (e) => eventos.push(e.detail.nome);

  beforeEach(() => {
    document.body.innerHTML = '<div id="aba-teste" class="aba" data-tela="teste" aria-busy="true"></div>';
    TELAS = carregarScript('js/core/telas.js');
    eventos = [];
    document.addEventListener('fp:tela-carregada', ouvir);
  });
  afterEach(() => document.removeEventListener('fp:tela-carregada', ouvir));

  test('preenche a casca, tira o aria-busy e avisa quem escuta', () => {
    TELAS.registrar('teste', '<p id="dentro">oi</p>');
    const casca = document.getElementById('aba-teste');
    expect(casca.querySelector('#dentro').textContent).toBe('oi');
    expect(casca.hasAttribute('aria-busy')).toBe(false);
    expect(TELAS.carregada('teste')).toBe(true);
    expect(eventos).toEqual(['teste']);
  });

  test('registrar de novo não apaga o que a tela já mudou', () => {
    TELAS.registrar('teste', '<p id="dentro">oi</p>');
    document.getElementById('dentro').textContent = 'editado';
    TELAS.registrar('teste', '<p id="dentro">oi</p>');
    expect(document.getElementById('dentro').textContent).toBe('editado');
    expect(eventos).toEqual(['teste']);
  });

  test('sem casca: erro no console, nada quebra', () => {
    const erro = jest.spyOn(console, 'error').mockImplementation(() => {});
    TELAS.registrar('inexistente', '<p></p>');
    expect(erro).toHaveBeenCalledWith(expect.stringMatching(/#aba-inexistente/));
    expect(TELAS.carregada('inexistente')).toBe(false);
    erro.mockRestore();
  });
});
