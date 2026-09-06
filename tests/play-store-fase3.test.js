/**
 * play-store-fase3.test.js — guardas Fase 3 (paginação, R8, CSP, export).
 */
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const root = path.join(__dirname, '..');

describe('Play Store Fase 3 — Supabase pull paginado', () => {
  test('supabase-sync pagina selects grandes', () => {
    const src = fs.readFileSync(path.join(root, 'js/core/supabase-sync.js'), 'utf8');
    expect(src).toContain('fetchAllRows');
    expect(src).toContain('PULL_PAGE_SIZE');
    expect(src).toContain('.range(offset');
  });
});

describe('Play Store Fase 3 — Android endurecido', () => {
  test('release usa minify e shrinkResources', () => {
    const gradle = fs.readFileSync(path.join(root, 'android/app/build.gradle'), 'utf8');
    expect(gradle).toMatch(/minifyEnabled\s+true/);
    expect(gradle).toMatch(/shrinkResources\s+true/);
  });

  test('proguard mantém Capacitor e plugins do app', () => {
    const rules = fs.readFileSync(path.join(root, 'android/app/proguard-rules.pro'), 'utf8');
    expect(rules).toContain('CapacitorPlugin');
    expect(rules).toContain('com.financaspro.app');
  });

  test('FileProvider limitado ao cache interno', () => {
    const xml = fs.readFileSync(
      path.join(root, 'android/app/src/main/res/xml/file_paths.xml'),
      'utf8',
    );
    expect(xml).toContain('cache-path');
    expect(xml).not.toContain('external-path');
  });
});

describe('Play Store Fase 3 — CSP produção', () => {
  test('harden-csp remove localhost de HTML de exemplo', () => {
    const harden = path.join(root, 'scripts/harden-csp.cjs');
    // tmp — não deixar arquivo órfão em tests/ (marca-nome-unico varre a pasta).
    const sample = path.join(require('os').tmpdir(), 'fp-csp-sample-' + process.pid + '.html');
    fs.writeFileSync(
      sample,
      '<meta http-equiv="Content-Security-Policy" content="connect-src \'self\' http://localhost:4000 https://api.example.com;">',
      'utf8',
    );
    try {
      execSync('node "' + harden + '" "' + sample + '"', { stdio: 'pipe' });
      const out = fs.readFileSync(sample, 'utf8');
      expect(out).not.toMatch(/localhost/i);
      expect(out).toContain('https://api.example.com');
    } finally {
      try { fs.unlinkSync(sample); } catch (_e) { /* */ }
    }
  });
});

describe('Play Store Fase 3 — export e criptografia honestos', () => {
  test('export hint distingue nuvem', () => {
    const cfg = fs.readFileSync(path.join(root, 'js/modules/init-config.js'), 'utf8');
    expect(cfg).toContain('_refreshExportHint');
    expect(cfg).toContain('isCloudUser');
    expect(fs.readFileSync(path.join(root, 'index.html'), 'utf8'))
      .toContain('id="perfil-export-hint"');
  });

  test('crypto hint menciona localStorage e anexos', () => {
    const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
    expect(html).toMatch(/localStorage/i);
    expect(html).toMatch(/anexos/i);
  });
});
