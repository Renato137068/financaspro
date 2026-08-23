/**
 * Gera os ícones do app a partir dos SVGs da marca.
 *
 * Regras que este script existe para garantir:
 *  - o ícone maskable tem fundo SANGRANDO até a borda e o símbolo dentro do
 *    círculo de segurança (80% da largura). Nunca o selo inteiro dentro de
 *    outro quadrado — o Android recorta em círculo, squircle ou gota e a
 *    moldura desenhada aparece como um anel.
 *  - existe versão monocromática (tema dinâmico do Android 13+) e versão de
 *    notificação, senão o sistema gera uma automática e feia.
 */
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const seloPath = path.join(root, 'icons', 'logo.svg');
const simboloPath = path.join(root, 'icons', 'logo-simbolo.svg');
const monoPath = path.join(root, 'icons', 'logo-mono.svg');
const outDir = path.join(root, 'icons', 'android');

const SIZES = [48, 72, 96, 144, 192, 512];
const MASKABLE = 512;
/** Fração da largura ocupada pelo símbolo dentro do maskable. */
const OCUPACAO = 0.62;
/** O centro geométrico parece baixo depois do recorte circular. */
const AJUSTE_OPTICO = -0.02;
/** Verde Profundo — fundo da marca. */
const FUNDO = { r: 11, g: 61, b: 46, alpha: 1 };

function exigir(arquivo) {
  if (!fs.existsSync(arquivo)) {
    console.error('Ícone fonte não encontrado:', arquivo);
    process.exit(1);
  }
  return fs.readFileSync(arquivo);
}

async function main() {
  let sharp;
  try {
    sharp = require('sharp');
  } catch (_e) {
    console.error('Instale sharp: npm install -D sharp');
    process.exit(1);
  }

  const selo = exigir(seloPath);
  const simbolo = exigir(simboloPath);
  const mono = exigir(monoPath);

  fs.mkdirSync(outDir, { recursive: true });

  for (const size of SIZES) {
    const out = path.join(outDir, `icon-${size}.png`);
    await sharp(selo).resize(size, size).png().toFile(out);
    console.log('✓', path.relative(root, out));
  }

  // Maskable: fundo sangrando + símbolo na zona segura.
  const larguraSimbolo = Math.round(MASKABLE * OCUPACAO);
  const simboloPng = await sharp(simbolo)
    .resize({ width: larguraSimbolo })
    .png()
    .toBuffer();
  const meta = await sharp(simboloPng).metadata();
  const left = Math.round((MASKABLE - meta.width) / 2);
  const top = Math.round((MASKABLE - meta.height) / 2 + MASKABLE * AJUSTE_OPTICO);

  const maskableOut = path.join(outDir, 'icon-maskable-512.png');
  await sharp({
    create: { width: MASKABLE, height: MASKABLE, channels: 4, background: FUNDO },
  })
    .composite([{ input: simboloPng, left, top }])
    .png()
    .toFile(maskableOut);
  console.log('✓', path.relative(root, maskableOut), `(símbolo ${meta.width}×${meta.height} em ${MASKABLE})`);

  // Monocromático para o tema dinâmico do Android 13+.
  const monoPng = await sharp(mono).resize({ width: larguraSimbolo }).png().toBuffer();
  const monoMeta = await sharp(monoPng).metadata();
  const monoOut = path.join(outDir, 'icon-mono-512.png');
  await sharp({
    create: { width: MASKABLE, height: MASKABLE, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
  })
    .composite([{
      input: monoPng,
      left: Math.round((MASKABLE - monoMeta.width) / 2),
      top: Math.round((MASKABLE - monoMeta.height) / 2 + MASKABLE * AJUSTE_OPTICO),
    }])
    .png()
    .toFile(monoOut);
  console.log('✓', path.relative(root, monoOut));

  // Notificação: silhueta branca, 24dp em densidade 4x.
  const notifOut = path.join(outDir, 'icon-notificacao-96.png');
  const notifSimbolo = await sharp(mono).resize({ width: 72 }).png().toBuffer();
  const notifMeta = await sharp(notifSimbolo).metadata();
  await sharp({
    create: { width: 96, height: 96, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
  })
    .composite([{
      input: notifSimbolo,
      left: Math.round((96 - notifMeta.width) / 2),
      top: Math.round((96 - notifMeta.height) / 2),
    }])
    .png()
    .toFile(notifOut);
  console.log('✓', path.relative(root, notifOut));

  const splashDir = path.join(root, 'icons', 'splash');
  fs.mkdirSync(splashDir, { recursive: true });
  await sharp(selo).resize(288, 288).png().toFile(path.join(splashDir, 'splash-icon.png'));
  console.log('✓ icons/splash/splash-icon.png');

  // Ícones da raiz usados pelo manifest e pelo iOS.
  await sharp(selo).resize(192, 192).png().toFile(path.join(root, 'icons', 'icon-192.png'));
  await sharp(selo).resize(512, 512).png().toFile(path.join(root, 'icons', 'icon-512.png'));
  await sharp(selo).resize(180, 180).png().toFile(path.join(root, 'icons', 'apple-touch-icon.png'));
  console.log('✓ icons/icon-192.png, icons/icon-512.png, icons/apple-touch-icon.png');
}

main().catch(function(err) {
  console.error(err);
  process.exit(1);
});
