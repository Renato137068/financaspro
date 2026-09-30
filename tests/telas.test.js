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
const postcss = require('postcss');
const { CSS_DOS_CHUNKS, compactarCss } = require('../scripts/generate-telas.cjs');

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
    for (const chunk of new Set(arquivos.map((a) => a.chunk).concat(Object.keys(CSS_DOS_CHUNKS)))) {
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

// Achado M3 da reauditoria de 30/09: o CSS do primeiro acesso carregava as
// folhas de telas que talvez nunca abram. Elas chegam com o chunk
// (TELAS.estilo), num <style> no fim do <head> — depois do CSS do boot, então
// só é seguro se nenhuma regra delas disputar elemento com ele.
describe('CSS que chega com o chunk', () => {
  const LEIA = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
  const style = LEIA('css/style.css');
  const doBoot = [...style.matchAll(/@import\s+(?:url\()?'\.\/([^']+)'/g)].map((m) => 'css/' + m[1])
    .concat([...index.matchAll(/href="(css\/[^"?]+\.css)/g)].map((m) => m[1]).filter((f) => f !== 'css/style.css'));
  const folhas = Object.values(CSS_DOS_CHUNKS).flat();

  // Classes do elemento que o seletor estiliza (o último composto):
  // `.pat-hero-breakdown span` estiliza o <span>, não o .pat-hero-breakdown.
  const classesDoAlvo = (sel) => {
    const alvo = sel.replace(/\([^)]*\)|\[[^\]]*\]/g, '').trim().split(/\s*[\s>+~]\s*/).pop();
    return [...alvo.matchAll(/\.([\w-]+)/g)].map((m) => m[1]);
  };
  const classesDoBoot = new Set();
  const keyframesDoBoot = new Set();
  for (const f of doBoot) {
    postcss.parse(LEIA(f)).walk((n) => {
      if (n.type === 'rule') for (const sel of n.selectors) for (const c of classesDoAlvo(sel)) classesDoBoot.add(c);
      if (n.type === 'atrule' && /keyframes$/.test(n.name)) keyframesDoBoot.add(n.params);
    });
  }

  test('as folhas existem e saíram do CSS do primeiro acesso', () => {
    expect(doBoot.length).toBeGreaterThan(20);
    for (const f of folhas) {
      expect(fs.existsSync(path.join(ROOT, f))).toBe(true);
      expect(doBoot).not.toContain(f);
    }
  });

  // Cada seletor precisa citar uma classe da própria tela, que nenhuma regra
  // do boot estiliza: é o que mantém a regra presa à tela que o chunk desenha.
  // Um seletor genérico (`.btn-primario`, `h2`) aqui passaria a valer no app
  // inteiro depois que o chunk carregasse, e por cima do boot.
  test('todo seletor delas é preso a uma classe da tela, que o boot não estiliza', () => {
    const disputados = [];
    for (const f of folhas) {
      postcss.parse(LEIA(f)).walkRules((r) => {
        if (r.parent.type === 'atrule' && /keyframes$/.test(r.parent.name)) return;
        for (const sel of r.selectors) {
          const proprias = [...sel.matchAll(/\.([\w-]+)/g)].map((m) => m[1]).filter((c) => !classesDoBoot.has(c));
          if (!proprias.length) disputados.push(f + ': ' + sel);
        }
      });
      postcss.parse(LEIA(f)).walkAtRules(/keyframes$/, (a) => {
        if (keyframesDoBoot.has(a.params)) disputados.push(f + ': @keyframes ' + a.params);
      });
    }
    expect(disputados).toEqual([]);
  });

  test('a compactação não perde nem muda regra', () => {
    const plano = (css) => {
      const out = [];
      postcss.parse(css).walkDecls((d) => {
        const ctx = [];
        for (let p = d.parent; p && p.type !== 'root'; p = p.parent) ctx.push(p.type === 'rule' ? p.selector.replace(/\s+/g, ' ') : '@' + p.name + ' ' + p.params);
        out.push(ctx.join(' < ') + ' | ' + d.prop + ':' + d.value.replace(/\s+/g, ' ') + (d.important ? '!' : ''));
      });
      return out;
    };
    for (const f of folhas) {
      const css = LEIA(f);
      const compacta = compactarCss(css);
      expect(compacta.length).toBeLessThan(css.length);
      expect(plano(compacta)).toEqual(plano(css));
    }
  });
});

describe('TELAS.estilo', () => {
  test('aplica a folha uma vez só, no fim do <head>', () => {
    document.head.innerHTML = '<link rel="stylesheet" href="css/style.css">';
    const TELAS = carregarScript('js/core/telas.js');
    TELAS.estilo('teste', '.x{color:red}');
    TELAS.estilo('teste', '.x{color:red}');
    const estilos = document.head.querySelectorAll('style[data-chunk="teste"]');
    expect(estilos).toHaveLength(1);
    expect(estilos[0].textContent).toBe('.x{color:red}');
    expect(document.head.lastElementChild).toBe(estilos[0]);
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
