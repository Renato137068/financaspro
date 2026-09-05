/**
 * sync-vendor.cjs — copia dependências browser para js/vendor/
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

// Preferência: copiar de node_modules se o pacote estiver instalado.
const tessCandidates = [
  path.join(root, 'node_modules', 'tesseract.js', 'dist', 'tesseract.min.js'),
  path.join(root, 'node_modules', 'tesseract.js', 'dist', 'tesseract.min.cjs'),
];
const tessDest = path.join(vendorDir, 'tesseract.min.js');
var copied = false;
for (var i = 0; i < tessCandidates.length; i++) {
  if (fs.existsSync(tessCandidates[i])) {
    fs.copyFileSync(tessCandidates[i], tessDest);
    console.log('[vendor:sync] tesseract.min.js copiado de node_modules');
    copied = true;
    break;
  }
}
if (!copied && fs.existsSync(tessDest)) {
  console.log('[vendor:sync] tesseract.min.js já presente (vendor)');
} else if (!copied) {
  console.warn('[vendor:sync] tesseract.min.js ausente — OCR usa CDN (npm i tesseract.js para vendor local)');
}
