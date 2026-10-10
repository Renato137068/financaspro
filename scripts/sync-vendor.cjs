/**
 * sync-vendor.cjs — copia dependências browser para js/vendor/
 *
 * OCR/tesseract foi removido do produto (09/2026): não copiar nem avisar CDN.
 */
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const vendorDir = path.join(root, 'js', 'vendor');
fs.mkdirSync(vendorDir, { recursive: true });

const lucideSrc = path.join(root, 'node_modules', 'lucide', 'dist', 'umd', 'lucide.min.js');
const lucideDest = path.join(vendorDir, 'lucide.min.js');

if (fs.existsSync(lucideSrc)) {
  fs.copyFileSync(lucideSrc, lucideDest);
  console.log('[vendor:sync] lucide.min.js atualizado');
} else {
  console.warn('[vendor:sync] lucide não encontrado — execute npm ci primeiro');
}

// supabase-js: o app carrega a cópia em js/vendor/ (vira o vendor.bundle.js).
// Copiar daqui faz o `npm install` de uma versão nova (inclusive a de um PR do
// Dependabot) chegar de fato ao app. tests/vendor-supabase-versao.test.js
// falha se a cópia commitada não for a versão do package-lock.
const supaSrc = path.join(root, 'node_modules', '@supabase', 'supabase-js', 'dist', 'umd', 'supabase.js');
const supaDest = path.join(vendorDir, 'supabase.js');
if (fs.existsSync(supaSrc)) {
  fs.copyFileSync(supaSrc, supaDest);
  console.log('[vendor:sync] supabase.js atualizado');
} else {
  console.warn('[vendor:sync] @supabase/supabase-js não encontrado — execute npm ci primeiro');
}

const tessDest = path.join(vendorDir, 'tesseract.min.js');
if (fs.existsSync(tessDest)) {
  fs.unlinkSync(tessDest);
  console.log('[vendor:sync] removido residual tesseract.min.js');
}
