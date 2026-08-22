/**
 * capture-screenshots.cjs — Capturas reais do app para Play Store
 *
 * Gera telefone (1080x1920), tablet 7" retrato (1200x1920) e tablet 10"
 * paisagem (2560x1600). As de tablet nao existiam, e sem elas o Google marca o
 * app como nao otimizado para telas grandes e reduz o destaque nesses
 * aparelhos -- injusto aqui, porque em paisagem o app troca a barra inferior
 * por navegacao lateral. A captura em paisagem existe justamente para mostrar
 * isso na vitrine.
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

/**
 * Espera os valores pararem de mudar.
 *
 * Os cartoes do resumo animam o numero de 0 ate o valor final. Sem esperar, a
 * captura pega o meio da contagem -- uma geracao anterior saiu com
 * "RECEITAS R$ -31,19", que alem de errado e o tipo de imagem que derruba a
 * confianca de quem esta decidindo se instala um app de financas.
 */
async function esperarValoresEstaveis(page, tentativas) {
  var anterior = null;
  for (var i = 0; i < (tentativas || 12); i++) {
    var atual = await page.evaluate(function() {
      return [].slice.call(document.querySelectorAll('.card-valor, .saldo-value-premium'))
        .map(function(el) { return el.textContent.trim(); }).join('|');
    });
    if (atual && atual === anterior) return true;
    anterior = atual;
    await page.waitForTimeout(250);
  }
  return false;
}

async function shotPage(page, dest, device) {
  try {
    // Sem `clip`: a captura pega exatamente a viewport, ja multiplicada pelo
    // deviceScaleFactor. Com clip em px de CSS mais `scale: 'device'` o recorte
    // saia do tamanho certo mas com o conteudo so no quadrante superior
    // esquerdo, e o resto branco.
    await page.screenshot({
      path: dest,
      type: 'png',
      timeout: 12000,
      fullPage: false,
      scale: 'device',
      animations: 'disabled',
    });
  } catch (_err) {
    var cdp = await page.context().newCDPSession(page);
    var result = await cdp.send('Page.captureScreenshot', {
      format: 'png',
      clip: {
        x: 0, y: 0,
        width: device.width * device.scale,
        height: device.height * device.scale,
        scale: 1,
      },
    });
    fs.writeFileSync(dest, Buffer.from(result.data, 'base64'));
  }
}

/**
 * Formatos capturados.
 *
 * `width`/`height` sao CSS px e `scale` o deviceScaleFactor; o arquivo sai com
 * width*scale por height*scale. O Play exige ao menos 1080px no lado maior.
 */
const DEVICES = [
  { id: 'phone',    width: 360,  height: 640,  scale: 3, sufixo: '1080x1920', abas: ['resumo', 'extrato', 'orcamento'] },
  { id: 'tablet7',  width: 600,  height: 960,  scale: 2, sufixo: 'tablet-1200x1920', abas: ['resumo', 'orcamento'] },
  { id: 'tablet10', width: 1280, height: 800,  scale: 2, sufixo: 'tablet-2560x1600', abas: ['resumo', 'extrato'] },
];

/** Remove modais, toasts e banners que aparecem por conta propria durante a captura. */
async function limparSobreposicoes(page) {
  await page.evaluate(function() {
    document.querySelectorAll('.modal-overlay, .billing-overlay, .toast, #sw-update-banner')
      .forEach(function(el) { el.remove(); });
    var sk = document.getElementById('dashboard-skeleton');
    if (sk) sk.remove();
  });
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
  // PLAYWRIGHT_CHROMIUM_PATH permite apontar para um Chromium ja instalado no
  // sistema (container de CI, imagem com o browser em outro caminho). Sem isso,
  // o script so roda onde `npx playwright install chromium` baixou a versao
  // exata que o pacote espera.
  var browser = await playwright.chromium.launch({
    headless: true,
    executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH || undefined,
  });
  var seed = demoSeed();

  try {
    for (var d = 0; d < DEVICES.length; d++) {
      var device = DEVICES[d];
      var context = await browser.newContext({
        viewport: { width: device.width, height: device.height },
        deviceScaleFactor: device.scale,
        locale: 'pt-BR',
        isMobile: device.id === 'phone',
        hasTouch: true,
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
      await limparSobreposicoes(page);

      for (var i = 0; i < device.abas.length; i++) {
        var aba = device.abas[i];
        if (aba !== 'resumo') {
          await page.evaluate(function(a) {
            if (typeof mudarAba === 'function') mudarAba(a);
          }, aba);
          await page.waitForTimeout(900);
        }
        // O healthService abre um confirm ("N transacoes sem backup") alguns
        // segundos depois do boot. Numa captura de loja isso e um modal cinza
        // cobrindo o app -- ja saiu assim numa geracao anterior. Limpar antes de
        // cada disparo, e nao so no inicio, porque ele aparece com atraso.
        await limparSobreposicoes(page);
        await esperarValoresEstaveis(page);
        await limparSobreposicoes(page);
        var nome = 'screenshot-' + aba + '-' + device.sufixo + '.png';
        var dest = path.join(playStoreDir, nome);
        await shotPage(page, dest, device);
        // screenshots/ alimenta o manifest.json do PWA; docs/play-store/ e a
        // pasta que vai para o Play Console.
        fs.copyFileSync(dest, path.join(screenshotsDir, aba + '-' + device.sufixo + '.png'));
        console.log('✓ ' + nome);
      }
      await context.close();
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
