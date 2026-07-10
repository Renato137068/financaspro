/**
 * generate-play-assets.cjs — Feature graphic e screenshots estilizados para Play Store
 * Requer: npm install -D sharp && npm run icons:generate (logo.svg)
 */
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const outDir = path.join(root, 'docs', 'play-store');
const screenshotsDir = path.join(root, 'screenshots');
const svgPath = path.join(root, 'icons', 'logo.svg');

function esc(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function mockScreenSvg(opts) {
  var title = esc(opts.title);
  var subtitle = esc(opts.subtitle);
  var accent = opts.accent || '#00723F';
  return Buffer.from(
    '<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1920">' +
      '<rect width="1080" height="1920" fill="#f5f8f6"/>' +
      '<rect x="0" y="0" width="1080" height="200" fill="' + accent + '"/>' +
      '<text x="540" y="120" text-anchor="middle" fill="#fff" font-family="Segoe UI,Arial,sans-serif" font-size="52" font-weight="700">' + title + '</text>' +
      '<text x="540" y="280" text-anchor="middle" fill="#64748b" font-family="Segoe UI,Arial,sans-serif" font-size="28">' + subtitle + '</text>' +
      '<rect x="60" y="360" width="960" height="200" rx="24" fill="#fff" stroke="#e2e8f0"/>' +
      '<text x="100" y="430" fill="#94a3b8" font-family="Segoe UI,Arial,sans-serif" font-size="22">Saldo do mês</text>' +
      '<text x="100" y="500" fill="' + accent + '" font-family="Segoe UI,Arial,sans-serif" font-size="56" font-weight="700">' + esc(opts.balance || 'R$ 3.240,00') + '</text>' +
      '<rect x="60" y="600" width="460" height="140" rx="20" fill="#fff" stroke="#e2e8f0"/>' +
      '<rect x="560" y="600" width="460" height="140" rx="20" fill="#fff" stroke="#e2e8f0"/>' +
      '<text x="100" y="660" fill="#94a3b8" font-size="20" font-family="Segoe UI,Arial,sans-serif">Receitas</text>' +
      '<text x="100" y="710" fill="#16a34a" font-size="36" font-weight="700" font-family="Segoe UI,Arial,sans-serif">' + esc(opts.income || 'R$ 8.500') + '</text>' +
      '<text x="600" y="660" fill="#94a3b8" font-size="20" font-family="Segoe UI,Arial,sans-serif">Despesas</text>' +
      '<text x="600" y="710" fill="#dc2626" font-size="36" font-weight="700" font-family="Segoe UI,Arial,sans-serif">' + esc(opts.expense || 'R$ 5.260') + '</text>' +
      (opts.extra || '') +
      '<text x="540" y="1820" text-anchor="middle" fill="#94a3b8" font-family="Segoe UI,Arial,sans-serif" font-size="24">FinançasPro v11</text>' +
    '</svg>'
  );
}

async function renderPhoneScreenshot(sharp, filename, svgBuf) {
  var out = path.join(outDir, filename);
  await sharp(svgBuf).png().toFile(out);
  console.log('✓ docs/play-store/' + filename);
  return out;
}

async function main() {
  var sharp;
  try {
    sharp = require('sharp');
  } catch (_e) {
    console.error('Instale sharp: npm install -D sharp');
    process.exit(1);
  }

  if (!fs.existsSync(svgPath)) {
    console.error('Execute npm run icons:generate primeiro (logo.svg)');
    process.exit(1);
  }

  fs.mkdirSync(outDir, { recursive: true });
  fs.mkdirSync(screenshotsDir, { recursive: true });
  var svg = fs.readFileSync(svgPath);

  var featureW = 1024;
  var featureH = 500;
  var logoSize = 200;
  var logoBuf = await sharp(svg).resize(logoSize, logoSize).png().toBuffer();
  await sharp({
    create: {
      width: featureW,
      height: featureH,
      channels: 4,
      background: { r: 0, g: 92, b: 51, alpha: 1 },
    },
  })
    .composite([{ input: logoBuf, left: 80, top: Math.round((featureH - logoSize) / 2) }])
    .png()
    .toFile(path.join(outDir, 'feature-graphic-1024x500.png'));
  console.log('✓ docs/play-store/feature-graphic-1024x500.png');

  var screens = [
    {
      file: 'screenshot-resumo-1080x1920.png',
      manifestLabel: 'Resumo financeiro',
      svg: mockScreenSvg({
        title: 'Resumo',
        subtitle: 'Receitas, despesas e saldo do mês',
        balance: 'R$ 3.240,00',
        income: 'R$ 8.500,00',
        expense: 'R$ 5.260,00',
      }),
    },
    {
      file: 'screenshot-extrato-1080x1920.png',
      manifestLabel: 'Extrato de transações',
      svg: mockScreenSvg({
        title: 'Extrato',
        subtitle: 'Filtros, busca e exportação',
        accent: '#1565c0',
        balance: 'Junho 2026',
        income: '42 lançamentos',
        expense: 'Exportar CSV',
        extra:
          '<rect x="60" y="800" width="960" height="72" rx="16" fill="#fff" stroke="#e2e8f0"/>' +
          '<text x="100" y="845" fill="#334155" font-size="24" font-family="Segoe UI,Arial,sans-serif">Supermercado · Alimentação</text>' +
          '<text x="900" y="845" text-anchor="end" fill="#dc2626" font-size="24" font-family="Segoe UI,Arial,sans-serif">- R$ 248,90</text>' +
          '<rect x="60" y="890" width="960" height="72" rx="16" fill="#fff" stroke="#e2e8f0"/>' +
          '<text x="100" y="935" fill="#334155" font-size="24" font-family="Segoe UI,Arial,sans-serif">Salário · Receita</text>' +
          '<text x="900" y="935" text-anchor="end" fill="#16a34a" font-size="24" font-family="Segoe UI,Arial,sans-serif">+ R$ 8.500,00</text>',
      }),
    },
    {
      file: 'screenshot-orcamento-1080x1920.png',
      manifestLabel: 'Orçamento e metas',
      svg: mockScreenSvg({
        title: 'Orçamento',
        subtitle: 'Metas, assinaturas e patrimônio',
        accent: '#7b1fa2',
        balance: '50/30/20',
        income: '3 metas ativas',
        expense: 'R$ 420/mês assinaturas',
        extra:
          '<rect x="60" y="800" width="960" height="48" rx="12" fill="#e2e8f0"/>' +
          '<rect x="60" y="800" width="720" height="48" rx="12" fill="#7b1fa2"/>' +
          '<text x="100" y="832" fill="#334155" font-size="22" font-family="Segoe UI,Arial,sans-serif">Alimentação · 72%</text>' +
          '<rect x="60" y="880" width="960" height="48" rx="12" fill="#e2e8f0"/>' +
          '<rect x="60" y="880" width="480" height="48" rx="12" fill="#ef6c00"/>' +
          '<text x="100" y="912" fill="#334155" font-size="22" font-family="Segoe UI,Arial,sans-serif">Transporte · 48%</text>',
      }),
    },
  ];

  for (var i = 0; i < screens.length; i++) {
    var s = screens[i];
    var dest = await renderPhoneScreenshot(sharp, s.file, s.svg);
    var manifestName = s.file.replace('screenshot-', '').replace('-1080x1920', '');
    fs.copyFileSync(dest, path.join(screenshotsDir, s.file.replace('screenshot-', '')));
    if (i === 0) {
      fs.copyFileSync(dest, path.join(screenshotsDir, 'phone-1080x1920.png'));
    }
  }

  console.log('');
  console.log('Screenshots copiados para screenshots/ e docs/play-store/');
  console.log('Substitua por capturas reais do app antes da publicação final.');
}

main().catch(function(err) {
  console.error(err);
  process.exit(1);
});
