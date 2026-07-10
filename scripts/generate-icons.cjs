const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const svgPath = path.join(root, 'icons', 'logo.svg');
const outDir = path.join(root, 'icons', 'android');

const SIZES = [48, 72, 96, 144, 192, 512];
const MASKABLE = 512;

async function main() {
  let sharp;
  try {
    sharp = require('sharp');
  } catch (_e) {
    console.error('Instale sharp: npm install -D sharp');
    process.exit(1);
  }

  if (!fs.existsSync(svgPath)) {
    console.error('Ícone fonte não encontrado:', svgPath);
    process.exit(1);
  }

  fs.mkdirSync(outDir, { recursive: true });
  const svg = fs.readFileSync(svgPath);

  for (const size of SIZES) {
    const out = path.join(outDir, `icon-${size}.png`);
    await sharp(svg).resize(size, size).png().toFile(out);
    console.log('✓', path.relative(root, out));
  }

  const maskableOut = path.join(outDir, 'icon-maskable-512.png');
  const padding = Math.round(MASKABLE * 0.1);
  const inner = MASKABLE - padding * 2;
  const resized = await sharp(svg).resize(inner, inner).png().toBuffer();
  await sharp({
    create: {
      width: MASKABLE,
      height: MASKABLE,
      channels: 4,
      background: { r: 0, g: 114, b: 63, alpha: 1 },
    },
  })
    .composite([{ input: resized, gravity: 'centre' }])
    .png()
    .toFile(maskableOut);
  console.log('✓', path.relative(root, maskableOut));

  const splashDir = path.join(root, 'icons', 'splash');
  fs.mkdirSync(splashDir, { recursive: true });
  await sharp(svg)
    .resize(288, 288)
    .png()
    .toFile(path.join(splashDir, 'splash-icon.png'));
  console.log('✓ icons/splash/splash-icon.png');
}

main().catch(function(err) {
  console.error(err);
  process.exit(1);
});
