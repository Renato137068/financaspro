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

  // ── Recursos NATIVOS do Android ──────────────────────────────────────────
  // Sem isto, tudo acima serve só ao PWA: o APK continua saindo com o ícone
  // padrão do Capacitor (um X azul sobre branco) e com a splash em branco.
  // A auditoria de marca olhou icons/android/ e deu o ícone como resolvido —
  // a pasta certa era esta, e ninguém tinha olhado.
  const resDir = path.join(root, 'android', 'app', 'src', 'main', 'res');
  if (fs.existsSync(resDir)) {
    await gerarAndroidNativo(sharp, resDir, selo, simbolo);
  } else {
    console.log('· android/app/src/main/res ausente — pulando recursos nativos');
  }

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

/** Densidades do Android e o lado do ícone legado em cada uma. */
const DENSIDADES = { mdpi: 48, hdpi: 72, xhdpi: 96, xxhdpi: 144, xxxhdpi: 192 };

/**
 * Fração da largura do canvas adaptativo ocupada pelo símbolo.
 *
 * O canvas adaptativo tem 108dp e o launcher recorta os 72dp centrais; o
 * conteúdo que não pode ser cortado precisa caber num círculo de 66dp. O
 * símbolo tem proporção 32:30, então a 46dp de largura sua diagonal fica em
 * ~63dp — dentro do círculo com folga.
 */
const OCUPACAO_ADAPTATIVO = 46 / 108;

/** Fração da menor dimensão da splash ocupada pelo símbolo. */
const OCUPACAO_SPLASH = 0.26;

async function compor(sharp, largura, altura, fundo, arte, ocupacaoLargura, dyRelativo) {
  const alvo = Math.round(Math.min(largura, altura) * ocupacaoLargura);
  const png = await sharp(arte).resize({ width: alvo }).png().toBuffer();
  const meta = await sharp(png).metadata();
  return sharp({ create: { width: largura, height: altura, channels: 4, background: fundo } })
    .composite([{
      input: png,
      left: Math.round((largura - meta.width) / 2),
      top: Math.round((altura - meta.height) / 2 + altura * (dyRelativo || 0)),
    }])
    .png()
    .toBuffer();
}

async function gerarAndroidNativo(sharp, resDir, selo, simbolo) {
  // 1) Ícone legado e redondo, por densidade.
  for (const [densidade, lado] of Object.entries(DENSIDADES)) {
    const dir = path.join(resDir, 'mipmap-' + densidade);
    if (!fs.existsSync(dir)) continue;

    await sharp(selo).resize(lado, lado).png().toFile(path.join(dir, 'ic_launcher.png'));

    // O redondo é recortado em círculo pelo próprio launcher em alguns temas,
    // então o fundo precisa preencher o quadrado inteiro — nada de moldura.
    const redondo = await compor(sharp, lado, lado, FUNDO, simbolo, 0.62, AJUSTE_OPTICO);
    fs.writeFileSync(path.join(dir, 'ic_launcher_round.png'), redondo);

    // 2) Camada de frente do ícone adaptativo: fundo TRANSPARENTE (a cor vem
    //    de @color/ic_launcher_background) e símbolo dentro da zona segura.
    const canvas = Math.round(lado * 108 / 48);
    const frente = await compor(
      sharp, canvas, canvas, { r: 0, g: 0, b: 0, alpha: 0 },
      simbolo, OCUPACAO_ADAPTATIVO, 0
    );
    fs.writeFileSync(path.join(dir, 'ic_launcher_foreground.png'), frente);
    console.log('✓ mipmap-' + densidade + ' (legado, redondo e adaptativo)');
  }

  // 3) A cor de fundo do ícone adaptativo é um recurso XML, não um PNG.
  const corDir = path.join(resDir, 'values');
  if (fs.existsSync(corDir)) {
    fs.writeFileSync(
      path.join(corDir, 'ic_launcher_background.xml'),
      '<?xml version="1.0" encoding="utf-8"?>\n<resources>\n'
      + '    <color name="ic_launcher_background">#0B3D2E</color>\n</resources>\n'
    );
    console.log('✓ values/ic_launcher_background.xml → #0B3D2E');
  }

  // 4) Splash: fundo da marca com o símbolo ao centro, em toda densidade e
  //    orientação. A cor em capacitor.config.json só pinta a barra em volta —
  //    a imagem é quem aparece.
  const splashes = fs.readdirSync(resDir)
    .filter((d) => d === 'drawable' || d.startsWith('drawable-land') || d.startsWith('drawable-port'));
  for (const dir of splashes) {
    const arquivo = path.join(resDir, dir, 'splash.png');
    if (!fs.existsSync(arquivo)) continue;
    const meta = await sharp(arquivo).metadata();
    const png = await compor(sharp, meta.width, meta.height, FUNDO, simbolo, OCUPACAO_SPLASH, 0);
    fs.writeFileSync(arquivo, png);
  }
  console.log('✓ ' + splashes.length + ' splash(es) regeneradas na cor da marca');
}

main().catch(function(err) {
  console.error(err);
  process.exit(1);
});
