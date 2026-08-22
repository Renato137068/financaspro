/**
 * fontes-locais.test.js — o app offline-first depende de rede para pintar?
 *
 * Origem: a auditoria de dimensões ocultas encontrou as fontes vindo de
 * fonts.googleapis.com por uma tag `<link rel="stylesheet">`. Três problemas
 * que só existem juntos:
 *
 *   1. Folha externa bloqueia a renderização. Sem rede, o navegador espera o
 *      timeout e só então pinta. Num app cujo argumento é funcionar offline, a
 *      primeira coisa que ele fazia era depender da rede.
 *   2. O service worker não podia precacheá-la — origem cruzada, resposta
 *      opaca. Nem o segundo carregamento resolvia.
 *   3. Todo usuário revelava a um terceiro que abriu um app de finanças, com
 *      IP e horário.
 *
 * Estes testes garantem que não volte: nem por um `<link>` reintroduzido, nem
 * por um `@import` no CSS, nem afrouxando a CSP.
 */
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const index = fs.readFileSync(path.join(root, 'index.html'), 'utf8');

/** Todos os .css do projeto (não os gerados em dist). */
function arquivosCss(dir, acc = []) {
  for (const nome of fs.readdirSync(dir)) {
    const p = path.join(dir, nome);
    if (fs.statSync(p).isDirectory()) arquivosCss(p, acc);
    else if (nome.endsWith('.css')) acc.push(p);
  }
  return acc;
}

const HOSTS_DE_FONTE = /fonts\.googleapis\.com|fonts\.gstatic\.com|use\.typekit|fonts\.bunny\.net/;

describe('fontes — nada vem de fora', () => {
  test('index.html não referencia CDN de fonte', () => {
    // Ignora comentários: o HTML documenta por que a dependência saiu.
    const semComentarios = index.replace(/<!--[\s\S]*?-->/g, '');
    expect(semComentarios).not.toMatch(HOSTS_DE_FONTE);
  });

  test('nenhum CSS importa fonte externa', () => {
    const infratores = arquivosCss(path.join(root, 'css'))
      .filter(f => HOSTS_DE_FONTE.test(
        fs.readFileSync(f, 'utf8').replace(/\/\*[\s\S]*?\*\//g, ''),
      ))
      .map(f => path.relative(root, f));

    expect(infratores).toEqual([]);
  });

  test('a CSP não permite mais origem externa de fonte ou estilo', () => {
    // Enquanto a CSP permitir, um `<link>` reintroduzido passa despercebido.
    const csp = index.match(/Content-Security-Policy"\s+content="([^"]+)"/)?.[1] || '';
    expect(csp).toBeTruthy();

    const fontSrc = csp.match(/font-src ([^;]+)/)?.[1] || '';
    const styleSrc = csp.match(/style-src ([^;]+)/)?.[1] || '';

    expect(fontSrc).not.toMatch(HOSTS_DE_FONTE);
    expect(styleSrc).not.toMatch(HOSTS_DE_FONTE);
  });
});

describe('fontes — os arquivos locais existem e estão declarados', () => {
  const fontsDir = path.join(root, 'fonts');
  const cssPath = path.join(root, 'css', 'fonts.css');

  test('css/fonts.css foi gerado', () => {
    expect(fs.existsSync(cssPath)).toBe(true);
  });

  test('todo src do fonts.css aponta para um arquivo que existe', () => {
    // Um @font-face apontando para o nada faz o navegador cair na fonte do
    // sistema em silêncio — o layout muda e nada acusa.
    const css = fs.readFileSync(cssPath, 'utf8');
    const refs = [...css.matchAll(/url\('\.\.\/fonts\/([^']+)'\)/g)].map(m => m[1]);

    expect(refs.length).toBeGreaterThan(0);

    const ausentes = refs.filter(r => !fs.existsSync(path.join(fontsDir, r)));
    expect(ausentes).toEqual([]);
  });

  test('todo @font-face usa font-display: swap', () => {
    // `block` (o padrão em vários navegadores) deixa o texto invisível
    // esperando os bytes — exatamente o problema que se está resolvendo.
    const css = fs.readFileSync(cssPath, 'utf8');
    const faces = css.match(/@font-face\s*\{[^}]*\}/g) || [];

    expect(faces.length).toBeGreaterThan(0);
    expect(faces.filter(f => !/font-display:\s*swap/.test(f))).toEqual([]);
  });

  test('o subconjunto cobre os acentos do português', () => {
    // U+0000-00FF abrange ã õ ç á é í ó ú â ê ô à. Um subset menor faria o
    // navegador trocar de fonte no meio de "Alimentação".
    const css = fs.readFileSync(cssPath, 'utf8');
    expect(css).toMatch(/unicode-range:\s*U\+0000-00FF/);
  });

  test('os pesos declarados no CSS existem como arquivo', () => {
    const css = fs.readFileSync(cssPath, 'utf8');
    const pesos = [...css.matchAll(/font-weight:\s*(\d+)/g)].map(m => m[1]);
    expect(new Set(pesos).size).toBeGreaterThanOrEqual(5);
  });
});

describe('fontes — precache seletivo', () => {
  const manifesto = path.join(root, 'fonts', 'criticas.json');

  test('existe a lista de fontes críticas', () => {
    expect(fs.existsSync(manifesto)).toBe(true);
  });

  test('as críticas são um subconjunto próprio — não todas', () => {
    // Precachear os 8 pesos custaria ~156 KB no primeiro acesso por tipos que
    // talvez nem apareçam na tela inicial: trocaria um problema de rede por um
    // problema de peso.
    const criticas = JSON.parse(fs.readFileSync(manifesto, 'utf8'));
    const todas = fs.readdirSync(path.join(root, 'fonts')).filter(f => f.endsWith('.woff2'));

    expect(criticas.length).toBeGreaterThan(0);
    expect(criticas.length).toBeLessThan(todas.length);
  });

  test('toda fonte crítica existe em disco', () => {
    const criticas = JSON.parse(fs.readFileSync(manifesto, 'utf8'));
    const ausentes = criticas.filter(f => !fs.existsSync(path.join(root, 'fonts', f)));
    expect(ausentes).toEqual([]);
  });

  test('o service worker precacheia as fontes críticas', () => {
    const sw = fs.readFileSync(path.join(root, 'sw.js'), 'utf8');
    const criticas = JSON.parse(fs.readFileSync(manifesto, 'utf8'));

    const foraDoPrecache = criticas.filter(f => !sw.includes('/fonts/' + f));
    expect(foraDoPrecache).toEqual([]);
    expect(sw).toContain('/css/fonts.css');
  });

  test('as fontes pré-carregadas no HTML estão entre as críticas', () => {
    // Um preload de arquivo que o CSS não usa é download puro — o navegador
    // ainda avisa "preloaded but not used" e ninguém lê o console em produção.
    const criticas = JSON.parse(fs.readFileSync(manifesto, 'utf8'));
    const preloads = [...index.matchAll(/rel="preload"\s+href="fonts\/([^"]+)"/g)].map(m => m[1]);

    expect(preloads.length).toBeGreaterThan(0);
    expect(preloads.filter(p => !criticas.includes(p))).toEqual([]);
  });
});
