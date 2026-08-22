/**
 * dist-orphans.test.js — a rede que impede o purge de apagar o que é preciso.
 *
 * O script de purge apaga arquivos do build. Se a noção de "alcançável" estiver
 * errada, ele apaga algo que o runtime pede — e a falha aparece só em produção,
 * silenciosamente, porque quase tudo no app está atrás de guardas
 * `typeof X !== 'undefined'` que engolem a ausência.
 *
 * O caso perigoso não é o óbvio. É o arquivo cujo caminho é MONTADO em runtime:
 *
 *     s.src = 'js/lazy/' + chunk + '.bundle.js';
 *
 * Nenhuma busca textual encontra `js/lazy/conta.bundle.js` no código. Um purge
 * ingênuo apagaria billing, 2FA e Open Finance inteiros.
 */
const path = require('path');
const fs = require('fs');
const {
  classificar, referenciasDe, ALCANCAVEL_EM_RUNTIME,
} = require('../scripts/check-dist-orphans.cjs');

describe('extração de referências', () => {
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

  test('chunk lazy sobrevive mesmo sem ninguém citá-lo — o caminho é montado', () => {
    const r = classificar(
      ['js/lazy/conta.bundle.js', 'js/lazy/previsao.bundle.js', 'js/lazy/relatorios.bundle.js'],
      new Set(),
    );
    expect(r.orfaos).toEqual([]);
    expect(r.usados).toHaveLength(3);
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

  test('lazy-load.js realmente monta js/lazy/<chunk>.bundle.js', () => {
    const src = fs.readFileSync(path.join(root, 'js/core/lazy-load.js'), 'utf8');
    expect(src).toContain("'js/lazy/'");
    expect(src).toContain(".bundle.js'");
    // Se alguém trocar o esquema de nomes, o padrão abaixo para de casar e este
    // teste falha antes de o purge apagar os chunks em produção.
    expect(ALCANCAVEL_EM_RUNTIME.some((re) => re.test('js/lazy/conta.bundle.js'))).toBe(true);
  });

  test('lucide-init.js realmente pede js/vendor/lucide-full.min.js', () => {
    const src = fs.readFileSync(path.join(root, 'js/lucide-init.js'), 'utf8');
    expect(src).toContain('js/vendor/lucide-full.min.js');
    expect(ALCANCAVEL_EM_RUNTIME.some((re) => re.test('js/vendor/lucide-full.min.js'))).toBe(true);
  });

  test('todo chunk declarado em bundle-app tem padrão que o cobre', () => {
    const src = fs.readFileSync(path.join(root, 'scripts/bundle-app.cjs'), 'utf8');
    const bloco = src.match(/const LAZY_CHUNKS = \{([\s\S]*?)\n\};/);
    expect(bloco).toBeTruthy();
    const nomes = [...bloco[1].matchAll(/^\s{2}([a-z][a-zA-Z0-9]*):/gm)].map((m) => m[1]);
    expect(nomes.length).toBeGreaterThan(0);
    nomes.forEach((nome) => {
      const caminho = 'js/lazy/' + nome + '.bundle.js';
      expect(ALCANCAVEL_EM_RUNTIME.some((re) => re.test(caminho))).toBe(true);
    });
  });
});
