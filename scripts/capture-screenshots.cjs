/**
 * capture-screenshots.cjs — Capturas reais do app para Play Store (1080×1920)
 *
 * Uso:
 *   npm install -D playwright
 *   npx playwright install chromium
 *   npm run screenshots:capture
 */
const fs = require('fs');
const path = require('path');
const { spawn, execSync } = require('child_process');

const root = path.join(__dirname, '..');
const distDir = path.join(root, 'dist');
const screenshotsDir = path.join(root, 'screenshots');
const playStoreDir = path.join(root, 'docs', 'play-store');
const PORT = 4321;
const BASE = 'http://127.0.0.1:' + PORT + '/?offline=1';

function demoSeed() {
  var now = new Date();
  var y = now.getFullYear();
  var m = String(now.getMonth() + 1).padStart(2, '0');

  var config = {
    nome: 'Maria Silva',
    moeda: 'BRL',
    tema: 'light',
    plano: 'free',
    renda: 8500,
    pinAtivo: false,
    onboardingConcluido: true,
    orcamentos: { alimentacao: 1200, transporte: 600, moradia: 2000 },
    regra503020: { necessidades: 50, desejos: 30, poupanca: 20 },
    metas: [
      { id: 'meta-1', nome: 'Reserva de emergência', valorAlvo: 10000, valorAtual: 4200, prazo: y + '-12-31' },
    ],
    assinaturas: [
      { id: 'sub-1', nome: 'Streaming', valor: 55.9, diaCobranca: 10, ativa: true, categoria: 'assinaturas' },
    ],
    patrimonio: {
      ativos: [{ id: 'a1', nome: 'Poupança', valor: 12400, tipo: 'conta' }],
      dividas: [{ id: 'd1', nome: 'Cartão', valor: 1800, tipo: 'cartao' }],
    },
    _schemaVer: 2,
  };

  var transacoes = [
    { id: 'tx-1', tipo: 'receita', valor: 8500, categoria: 'salario', data: y + '-' + m + '-05', descricao: 'Salário mensal' },
    { id: 'tx-2', tipo: 'despesa', valor: 248.9, categoria: 'alimentacao', data: y + '-' + m + '-08', descricao: 'Supermercado' },
    { id: 'tx-3', tipo: 'despesa', valor: 89.9, categoria: 'transporte', data: y + '-' + m + '-10', descricao: 'Combustível' },
    { id: 'tx-4', tipo: 'despesa', valor: 55.9, categoria: 'assinaturas', data: y + '-' + m + '-10', descricao: 'Streaming' },
    { id: 'tx-5', tipo: 'despesa', valor: 1200, categoria: 'moradia', data: y + '-' + m + '-12', descricao: 'Aluguel' },
    { id: 'tx-6', tipo: 'receita', valor: 450, categoria: 'freelance', data: y + '-' + m + '-15', descricao: 'Projeto freelance' },
  ];

  return {
    'fp-config': JSON.stringify(config),
    'fp-transacoes': JSON.stringify(transacoes),
    'fp-contas': JSON.stringify([]),
  };
}

function ensureBuild() {
  if (!fs.existsSync(path.join(distDir, 'index.html'))) {
    console.log('Build ausente — executando npm run build…');
    execSync('npm run build', { cwd: root, stdio: 'inherit' });
  }
}

function startServer() {
  return new Promise(function(resolve, reject) {
    var bin = path.join(root, 'node_modules', 'http-server', 'bin', 'http-server');
    var proc = spawn(process.execPath, [bin, distDir, '-p', String(PORT), '-s', '-c-1'], {
      cwd: root,
      stdio: 'pipe',
    });
    var ready = false;
    proc.stderr.on('data', function() {});
    proc.stdout.on('data', function(buf) {
      var text = buf.toString();
      if (!ready && /Hit CTRL-C|Available on|Starting/.test(text)) {
        ready = true;
        setTimeout(function() { resolve(proc); }, 600);
      }
    });
    setTimeout(function() {
      if (!ready) {
        ready = true;
        resolve(proc);
      }
    }, 2500);
    proc.on('error', reject);
  });
}

async function shotPage(page, dest) {
  try {
    await page.screenshot({
      path: dest,
      type: 'png',
      timeout: 12000,
      clip: { x: 0, y: 0, width: 360, height: 640 },
      scale: 'device',
      animations: 'disabled',
    });
  } catch (_err) {
    var cdp = await page.context().newCDPSession(page);
    var result = await cdp.send('Page.captureScreenshot', {
      format: 'png',
      clip: { x: 0, y: 0, width: 1080, height: 1920, scale: 1 },
    });
    fs.writeFileSync(dest, Buffer.from(result.data, 'base64'));
  }
}

async function capture() {
  var playwright;
  try {
    playwright = require('playwright');
  } catch (_e) {
    console.error('Instale Playwright: npm install -D playwright && npx playwright install chromium');
    process.exit(1);
  }

  ensureBuild();
  fs.mkdirSync(screenshotsDir, { recursive: true });
  fs.mkdirSync(playStoreDir, { recursive: true });

  var server = await startServer();
  var browser = await playwright.chromium.launch({ headless: true });
  var seed = demoSeed();

  var shots = [
    { aba: 'resumo', file: 'screenshot-resumo-1080x1920.png', alias: 'phone-1080x1920.png' },
    { aba: 'extrato', file: 'screenshot-extrato-1080x1920.png', alias: 'extrato-1080x1920.png' },
    { aba: 'orcamento', file: 'screenshot-orcamento-1080x1920.png', alias: 'orcamento-1080x1920.png' },
  ];

  try {
    var context = await browser.newContext({
      viewport: { width: 360, height: 640 },
      deviceScaleFactor: 3,
      locale: 'pt-BR',
    });

    await context.addInitScript(function(data) {
      Object.keys(data).forEach(function(key) {
        localStorage.setItem(key, data[key]);
      });
    }, seed);

    var page = await context.newPage();
    await page.route('**/*', function(route) {
      if (route.request().resourceType() === 'font') {
        route.abort();
      } else {
        route.continue();
      }
    });
    await page.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForTimeout(1200);

    await page.evaluate(function() {
      if (typeof ONBOARDING !== 'undefined' && ONBOARDING.encerrar) ONBOARDING.encerrar();
      var ov = document.getElementById('onboarding-overlay');
      if (ov) ov.remove();
      var auth = document.getElementById('auth-overlay');
      if (auth) auth.style.display = 'none';
      var style = document.createElement('style');
      style.textContent = '*, *::before, *::after { animation: none !important; transition: none !important; }';
      document.head.appendChild(style);
    });

    for (var i = 0; i < shots.length; i++) {
      var shot = shots[i];
      if (shot.aba !== 'resumo') {
        await page.evaluate(function(aba) {
          if (typeof mudarAba === 'function') mudarAba(aba);
        }, shot.aba);
        await page.waitForTimeout(900);
      }
      var dest = path.join(playStoreDir, shot.file);
      await shotPage(page, dest);
      fs.copyFileSync(dest, path.join(screenshotsDir, shot.alias));
      console.log('✓ ' + shot.file);
    }
  } finally {
    await browser.close();
    server.kill();
  }

  console.log('');
  console.log('Capturas salvas em screenshots/ e docs/play-store/');
}

capture().catch(function(err) {
  console.error(err);
  process.exit(1);
});
