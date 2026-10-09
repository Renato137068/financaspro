/**
 * vendor-supabase-versao.test.js — a cópia do supabase-js que o app carrega é
 * a versão do package-lock.
 *
 * O app não importa o supabase-js de node_modules: carrega js/vendor/supabase.js
 * (vira o vendor.bundle.js). Subir a versão no package.json sem regerar a cópia
 * deixava a correção de segurança fora do app sem ninguém notar. Regerar:
 * `npm ci` (o postinstall roda scripts/sync-vendor.cjs) e commitar a cópia.
 */
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');

test('js/vendor/supabase.js é a versão do package-lock', () => {
  const lock = JSON.parse(fs.readFileSync(path.join(root, 'package-lock.json'), 'utf8'));
  const versao = lock.packages['node_modules/@supabase/supabase-js'].version;
  const vendor = fs.readFileSync(path.join(root, 'js/vendor/supabase.js'), 'utf8');
  expect(vendor).toContain('realtime-js/' + versao);
});
