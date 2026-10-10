/**
 * android-atalho.test.js — atalho "Novo lançamento" no ícone do Android.
 *
 * Origem: auditoria de ativação e retenção (2026-10-09). Os atalhos existiam
 * só no manifesto do site; no APK, tocar e segurar o ícone não oferecia nada.
 * O atalho abre https://app.financaspro.com/?aba=novo, e o app só aceita
 * trocar para abas de uma lista: o link nunca mexe em sessão ou conta.
 */
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const res = path.join(root, 'android', 'app', 'src', 'main', 'res');
const ler = (...p) => fs.readFileSync(path.join(...p), 'utf8');
const src = ler(root, 'js', 'capacitor-init.js');

/** Sobe o capacitor-init.js com um plugin App falso. */
function montar({ launchUrl = null, boot = false } = {}) {
  document.body.innerHTML = '<div id="aba-resumo" class="aba ativo"></div>';
  const c = { abas: [], ouvintes: {} };
  window.Capacitor = {
    isNativePlatform: () => true,
    Plugins: {
      App: {
        getLaunchUrl: () => Promise.resolve(launchUrl ? { url: launchUrl } : undefined),
        addListener: (nome, fn) => { c.ouvintes[nome] = fn; },
        minimizeApp: () => Promise.resolve(),
      },
    },
  };
  window.mudarAba = (aba) => c.abas.push(aba);
  window.__fpBootPronto = boot;
  // eslint-disable-next-line no-new-func
  new Function(src)();
  return c;
}

afterEach(() => {
  for (const k of ['Capacitor', 'mudarAba', '__fpBootPronto', '__fpAbaAtalho', '__fpAtalhoOuvindo',
    '__fpAbrirAbaDoLink', '__fpVoltarAndroid', '__fpVoltarOuvindo']) delete window[k];
});

describe('atalho no ícone (recursos Android)', () => {
  test('o manifesto declara os atalhos na activity que abre o app', () => {
    const manifesto = ler(root, 'android', 'app', 'src', 'main', 'AndroidManifest.xml');
    expect(manifesto).toMatch(/android:name="android\.app\.shortcuts"\s+android:resource="@xml\/shortcuts"/);
  });

  test('o atalho aponta para o pacote e a activity reais, com textos e ícone que existem', () => {
    const xml = ler(res, 'xml', 'shortcuts.xml');
    const gradle = ler(root, 'android', 'app', 'build.gradle');
    const appId = gradle.match(/applicationId\s+"([^"]+)"/)[1];
    expect(xml).toContain('android:targetPackage="' + appId + '"');
    expect(xml).toContain('android:targetClass="com.financaspro.app.MainActivity"');
    expect(fs.existsSync(path.join(root, 'android/app/src/main/java/com/financaspro/app/MainActivity.java'))).toBe(true);
    expect(xml).toContain('android:data="https://app.financaspro.com/?aba=novo"');

    const strings = ler(res, 'values', 'strings.xml');
    const curto = strings.match(/name="atalho_novo_curto">([^<]+)</)[1];
    const longo = strings.match(/name="atalho_novo_longo">([^<]+)</)[1];
    // Limites recomendados pelo Android: 10 e 25 caracteres.
    expect(curto.length).toBeLessThanOrEqual(10);
    expect(longo.length).toBeLessThanOrEqual(25);
    expect(fs.existsSync(path.join(res, 'drawable', 'ic_atalho_novo.xml'))).toBe(true);
  });
});

describe('atalho no ícone (app)', () => {
  test('app fechado: o link do atalho guarda a aba para o fim do boot', async () => {
    const c = montar({ launchUrl: 'https://app.financaspro.com/?aba=novo' });
    await Promise.resolve(); await Promise.resolve();
    expect(window.__fpAbaAtalho).toBe('novo');
    expect(c.abas).toEqual([]);
  });

  test('app já aberto: o atalho troca a aba na hora', () => {
    const c = montar({ boot: true });
    c.ouvintes.appUrlOpen({ url: 'https://app.financaspro.com/?aba=novo' });
    expect(c.abas).toEqual(['novo']);
  });

  test('links que não são o atalho não mexem em nada', () => {
    const c = montar({ boot: true });
    c.ouvintes.appUrlOpen({ url: 'https://outro.site/?aba=novo' });
    c.ouvintes.appUrlOpen({ url: 'http://app.financaspro.com/?aba=novo' });
    c.ouvintes.appUrlOpen({ url: 'https://app.financaspro.com/?aba=config-dados' });
    c.ouvintes.appUrlOpen({ url: 'https://app.financaspro.com/#access_token=x&aba=novo' });
    c.ouvintes.appUrlOpen({ url: 'não é url' });
    expect(c.abas).toEqual([]);
    expect(window.__fpAbaAtalho).toBeUndefined();
  });
});

describe('fim do boot (app-bootstrap.js)', () => {
  test('abre a aba guardada pelo atalho e a esquece', () => {
    const boot = ler(root, 'js', 'app-bootstrap.js');
    expect(boot).toMatch(/_bootParams\.get\('aba'\) \|\| window\.__fpAbaAtalho/);
    expect(boot).toMatch(/window\.__fpAbaAtalho = null/);
  });
});
