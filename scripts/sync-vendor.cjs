/**
 * sync-vendor.cjs — copia dependências browser para js/vendor/
 */
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const vendorDir = path.join(root, 'js', 'vendor');
const lucideSrc = path.join(root, 'node_modules', 'lucide', 'dist', 'umd', 'lucide.min.js');
const lucideDest = path.join(vendorDir, 'lucide.min.js');

if (!fs.existsSync(lucideSrc)) {
  console.warn('[vendor:sync] lucide não encontrado — execute npm ci primeiro');
  process.exit(0);
}

fs.mkdirSync(vendorDir, { recursive: true });
fs.copyFileSync(lucideSrc, lucideDest);
console.log('[vendor:sync] lucide.min.js atualizado');
