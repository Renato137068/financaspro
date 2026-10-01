/**
 * dist-orphans.test.js — a rede que impede o purge de apagar o que é preciso.
 *
 * O script de purge apaga arquivos do build. Se a noção de "alcançável" estiver
 * errada, ele apaga algo que o runtime pede — e a falha aparece só em produção,
 * silenciosamente, porque quase tudo no app está atrás de guardas
 * `typeof X !== 'undefined'` que engolem a ausência.
 *
 * O caso perigoso não é o óbvio. É o arquivo que nenhum HTML cita: os chunks
 * sob demanda do Vite (js/<chunk>-<hash>.js), que só o bundle ES Module
 * importa, e o lucide completo, cujo caminho é montado em runtime. Um purge
 * ingênuo apagaria billing, 2FA e Open Finance inteiros.
 */
const path = require('path');
const fs = require('fs');
const {
  classificar, referenciasDe, seguirImports, ALCANCAVEL_EM_RUNTIME,
} = require('../scripts/check-dist-orphans.cjs');

describe('extração de referências', () => {
  test('segue os import() do bundle ES Module até os chunks do Vite', () => {
    // O nome do chunk leva o hash do build: só o bundle que o importa o cita.
    const arquivos = {
      'js/index-abc.js': 'const c={previsao:()=>import("./previsao-x1.js")};',
      'js/previsao-x1.js': 'import{A as a}from"./index-abc.js";import("./sub-y2.js");',
      'js/sub-y2.js': 'export{}',
    };
    const refs = seguirImports(new Set(['js/index-abc.js']), (rel) => arquivos[rel]);
    expect([...refs].sort()).toEqual(['js/index-abc.js', 'js/previsao-x1.js', 'js/sub-y2.js']);
  });

  test('lê src e href do HTML, com e sem barra inicial', () => {
    const refs = referenciasDe(
      '<link href="/css/index-abc.css"><script src="js/app.bundle.js"></script>',
    );
    expect(refs.has('css/index-abc.css')).toBe(true);
    expect(refs.has('js/app.bundle.js')).toBe(true);
  });

  test('descarta query string de cache-busting', () => {
    const refs = referenciasDe('<link href="css/style.css?v=modular-v3">');
    expect(refs.has('css/style.css')).toBe(true);
  });

  test('lê a lista de precache do service worker', () => {
    const refs = referenciasDe('const urls = ["/js/pin-guard.js", "/css/index-x.css"];');
    expect(refs.has('js/pin-guard.js')).toBe(true);
    expect(refs.has('css/index-x.css')).toBe(true);
  });

  test('não confunde URL externa com arquivo local', () => {
    const refs = referenciasDe('<script src="https://cdn.example.com/x.js"></script>');
    expect(refs.has('x.js')).toBe(false);
  });
});

describe('classificação', () => {
  test('referenciado sobrevive; não referenciado é órfão', () => {
    const r = classificar(
      ['js/app.bundle.js', 'js/parser.js'],
      new Set(['js/app.bundle.js']),
    );
    expect(r.usados).toEqual(['js/app.bundle.js']);
    expect(r.orfaos).toEqual(['js/parser.js']);
  });

  test('bundle clássico de chunk (js/lazy/) que sobrar é órfão: ninguém mais o pede', () => {
    // Os chunks viraram ES Modules; um js/lazy/*.bundle.js no dist seria
    // cópia morta de build antigo, indo para o APK.
    const r = classificar(['js/lazy/conta.bundle.js'], new Set());
    expect(r.orfaos).toEqual(['js/lazy/conta.bundle.js']);
  });

  test('o fallback completo do lucide sobrevive: só carrega se faltar ícone', () => {
    const r = classificar(['js/vendor/lucide-full.min.js'], new Set());
    expect(r.orfaos).toEqual([]);
  });

  test('o subset do lucide NÃO é exceção: ele entra no vendor.bundle', () => {
    // Distinção fina e proposital. `lucide.min.js` é concatenado no bundle;
    // `lucide-full.min.js` é buscado por <script> em runtime. Tratar os dois
    // igual deixaria 27 KB de código duplicado no APK.
    const r = classificar(['js/vendor/lucide.min.js'], new Set());
    expect(r.orfaos).toEqual(['js/vendor/lucide.min.js']);
  });

  test('só olha .js e .css — imagens e fontes têm outro dono', () => {
    const r = classificar(['js/app.bundle.js'], new Set(['js/app.bundle.js']));
    expect(r.usados.concat(r.orfaos).every((f) => /\.(js|css)$/.test(f))).toBe(true);
  });

  test('padrões de runtime são injetáveis — o teste não depende da lista real', () => {
    const r = classificar(['js/plugins/x.js'], new Set(), [/^js\/plugins\//]);
    expect(r.orfaos).toEqual([]);
  });
});

describe('os padrões declarados batem com o código que monta o caminho', () => {
  const root = path.join(__dirname, '..');

  test('lazy-load.js não monta caminho: todo chunk é import() literal, que o purge segue', () => {
    const src = fs.readFileSync(path.join(root, 'js/core/lazy-load.js'), 'utf8');
    const codigo = src.replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*/g, '');
    expect(codigo).not.toMatch(/createElement\(\s*['"]script['"]/);
    const bloco = codigo.slice(codigo.indexOf('const CHUNKS_ESM'), codigo.indexOf('const LAZY ='));
    const linhas = bloco.split('\n').filter((l) => /^\s{2}\w+:/.test(l));
    expect(linhas.length).toBeGreaterThan(0);
    linhas.forEach((l) => expect(l).toMatch(/^\s{2}(\w+): function\(\) \{ return import\('\.\.\/esm\/chunks\/\1\.js'\); \},$/));
  });

  test('lucide-init.js realmente pede js/vendor/lucide-full.min.js', () => {
    const src = fs.readFileSync(path.join(root, 'js/lucide-init.js'), 'utf8');
    expect(src).toContain('js/vendor/lucide-full.min.js');
    expect(ALCANCAVEL_EM_RUNTIME.some((re) => re.test('js/vendor/lucide-full.min.js'))).toBe(true);
  });
});
