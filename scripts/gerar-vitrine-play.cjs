/**
 * gerar-vitrine-play.cjs — capturas com legenda e gráfico de destaque da Play.
 *
 * Gera em docs/play-store/vitrine/:
 *   01..08-*.png        capturas de celular 1080×1920, uma frase de benefício
 *                       no topo e o app de verdade num aparelho abaixo;
 *   destaque-1024x500.png  gráfico de destaque (feature graphic).
 *
 * O roteiro das oito telas é o da auditoria de ASO de 04/out
 * (docs/auditorias/auditoria-play-store-aso-2026-10-04.html). As telas são o
 * build real (dist/) com dados de exemplo (scripts/lib/vitrine-dados.cjs) e o
 * relógio fixo no dia 24 do mês corrente: mês com movimento e nada vazio.
 * A composição é HTML renderizado pelo mesmo Chromium, sem dependência nova.
 *
 * Regras de política nas imagens (Play Console): sem "grátis", "baixe agora",
 * "#1", "melhor" ou promoções. As legendas dizem o que o app faz.
 *
 * Uso:
 *   npm run build
 *   npm run vitrine:gerar
 * PLAYWRIGHT_CHROMIUM_PATH aponta para um Chromium já instalado, se preciso.
 */
/* global mudarAba, CARTOES, INIT_NAVIGATION, INIT_CONFIG, LOCAL_CRYPTO, ONBOARDING, BILLING -- globais do app, usados dentro de page.evaluate */
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const { dadosDaVitrine } = require('./lib/vitrine-dados.cjs');

const root = path.join(__dirname, '..');
const distDir = path.join(root, 'dist');
const saida = path.join(root, 'docs', 'play-store', 'vitrine');
const PORTA = 4398;
const BASE = 'http://127.0.0.1:' + PORTA + '/?offline=1';

/** Tela do aparelho em px de CSS; sai em 3× (1080 de largura). */
const TELA = { largura: 360, altura: 640, escala: 3 };

const CORES = {
  fundo1: '#0B3D2E',
  fundo2: '#12694E',
  destaque: '#7EE2B8',
  texto: '#FFFFFF',
  textoSuave: 'rgba(255,255,255,0.78)',
};

/**
 * O roteiro: legenda, apoio (linha menor) e como chegar na tela.
 * `preparar` roda no navegador, com o app aberto no Resumo.
 */
const CAPTURAS = [
  {
    arquivo: '01-resumo',
    legenda: 'Saiba quanto sobra no fim do mês',
    apoio: 'Receitas, despesas e saldo num só lugar',
    preparar: async function(page) {
      await page.evaluate(function() {
        var al = document.getElementById('dashboard-alertas');
        if (al) al.style.display = 'none';
      });
    },
  },
  {
    arquivo: '02-lancamento',
    legenda: 'Registre um gasto em segundos',
    apoio: 'Atalhos dos seus gastos mais comuns',
    preparar: async function(page) {
      await irPara(page, 'novo');
      await page.evaluate(function() {
        [['novo-valor', '48,90'], ['novo-descricao', 'Padaria']].forEach(function(par) {
          var el = document.getElementById(par[0]);
          if (!el) return;
          el.value = par[1];
          el.dispatchEvent(new Event('input', { bubbles: true }));
        });
        var ac = document.getElementById('autocomplete-list');
        if (ac) ac.hidden = true;
      });
      await rolarAte(page, '.quick-label', 10);
    },
  },
  {
    arquivo: '03-orcamento',
    legenda: 'Orçamento 50/30/20 pronto',
    apoio: 'Necessidades, desejos e poupança',
    preparar: async function(page) {
      await irPara(page, 'orcamento');
      await rolarAte(page, '.orc-regra', 64);
    },
  },
  {
    arquivo: '04-cartao',
    legenda: 'A fatura do cartão, com as parcelas',
    apoio: 'Quanto já está comprometido nos próximos meses',
    preparar: async function(page) {
      await page.evaluate(function() {
        var al = document.getElementById('dashboard-alertas');
        if (al) al.style.display = 'none';
        document.querySelectorAll('.dashboard-mais').forEach(function(el) { el.classList.remove('dashboard-mais'); });
        if (typeof CARTOES !== 'undefined' && CARTOES.render) CARTOES.render();
      });
      await rolarAte(page, '#secao-cartoes', 8);
    },
  },
  {
    arquivo: '05-extrato',
    legenda: 'Encontre qualquer gasto',
    apoio: 'Busca e filtros por mês, categoria e conta',
    preparar: async function(page) {
      await irPara(page, 'extrato');
      // Até o título da lista, para aparecerem vários lançamentos.
      await page.evaluate(function() {
        var titulo = [].slice.call(document.querySelectorAll('#aba-extrato h2, #aba-extrato h3'))
          .filter(function(h) { return /transa/i.test(h.textContent); })[0];
        if (titulo) titulo.setAttribute('data-vitrine-alvo', '1');
      });
      await rolarAte(page, '[data-vitrine-alvo], #extrato-busca', 10);
    },
  },
  {
    arquivo: '06-metas',
    legenda: 'Metas que mostram o seu ritmo',
    apoio: 'Quanto falta e quando você chega lá',
    preparar: async function(page) {
      await page.evaluate(function() { mudarAba('orcamento', { orcSub: 'metas' }); });
      await esperar(page, 2500);
      await rolarAte(page, '#metas-section', 8);
    },
  },
  {
    arquivo: '07-previsao',
    legenda: 'Veja o mês antes de ele acabar',
    apoio: 'Previsão do saldo no fim do mês · Pro',
    pro: true,
    preparar: async function(page) {
      await page.evaluate(function() {
        var al = document.getElementById('dashboard-alertas');
        if (al) al.style.display = 'none';
        document.querySelectorAll('.dashboard-mais').forEach(function(el) { el.classList.remove('dashboard-mais'); });
        if (typeof INIT_NAVIGATION !== 'undefined') INIT_NAVIGATION.togglePrevisao();
      });
      await esperar(page, 2500);
      await rolarAte(page, '#previsao-painel', 4);
    },
  },
  {
    arquivo: '08-privacidade',
    legenda: 'Seus lançamentos protegidos',
    apoio: 'PIN para abrir e dados cifrados no aparelho',
    preparar: async function(page) {
      await irPara(page, 'config-seguranca');
      // As duas proteções ligadas, com os textos que o app mostra nesse estado
      // (INIT_CONFIG: PIN e _refreshCryptoToggle).
      await page.evaluate(function() {
        var pin = document.getElementById('chk-pin');
        if (pin) pin.checked = true;
        var st = document.getElementById('perfil-pin-toggle-status');
        if (st) st.textContent = 'Ativo — oculta saldos';
        var pill = document.getElementById('security-pin-status');
        if (pill) pill.classList.remove('security-indicator--neutro');
        if (typeof LOCAL_CRYPTO !== 'undefined' && typeof INIT_CONFIG !== 'undefined') {
          LOCAL_CRYPTO.isEnabled = function() { return true; };
          LOCAL_CRYPTO.nivelDeProtecao = function() { return 'dispositivo'; };
          INIT_CONFIG._refreshCryptoToggle();
        }
      });
      await rolarAte(page, '#chk-pin', 120);
    },
  },
];

function esperar(page, ms) {
  return page.clock.runFor(ms).then(function() { return page.waitForTimeout(Math.min(ms, 800)); });
}

async function irPara(page, aba) {
  await page.evaluate(function(a) { mudarAba(a); }, aba);
  await esperar(page, 2500);
}

/** Rola até o primeiro seletor que existir, deixando `margem` px de CSS acima. */
async function rolarAte(page, seletores, margem) {
  await page.evaluate(function(args) {
    var el = null;
    args.sel.split(',').some(function(s) { el = document.querySelector(s.trim()); return !!el; });
    if (!el) return;
    var header = document.querySelector('header, .app-header');
    var alturaHeader = header ? header.getBoundingClientRect().height : 0;
    var y = el.getBoundingClientRect().top + window.scrollY - alturaHeader - args.margem;
    window.scrollTo(0, Math.max(0, y));
  }, { sel: seletores, margem: margem || 0 });
  await page.waitForTimeout(300);
}

/** O que aparece sozinho e não é a tela: avisos, toasts, banners. */
async function limparSobreposicoes(page) {
  await page.evaluate(function() {
    if (typeof ONBOARDING !== 'undefined' && ONBOARDING.encerrar) ONBOARDING.encerrar();
    document.querySelectorAll('#onboarding-overlay, #dashboard-skeleton, .modal-overlay, .billing-overlay, .toast, #sw-update-banner, #backup-reminder-banner, .fp-banner')
      .forEach(function(el) { el.remove(); });
    var auth = document.getElementById('auth-overlay');
    if (auth) auth.style.display = 'none';
    document.body.classList.remove('auth-overlay-open');
  });
}

function iniciarServidor() {
  var bin = path.join(root, 'node_modules', 'http-server', 'bin', 'http-server');
  var proc = spawn(process.execPath, [bin, distDir, '-p', String(PORTA), '-s', '-c-1'], { stdio: 'ignore' });
  return new Promise(function(resolve) { setTimeout(function() { resolve(proc); }, 1500); });
}

/** Dia 24 do mês corrente, 10h: mês com movimento e fatura já fechada. */
function hojeDaVitrine() {
  var d = new Date();
  d.setDate(24);
  d.setHours(10, 0, 0, 0);
  return d;
}

async function capturarTelas(browser, hoje) {
  var brutas = {};
  var so = process.env.VITRINE_SO ? process.env.VITRINE_SO.split(',') : null;
  for (var i = 0; i < CAPTURAS.length; i++) {
    var c = CAPTURAS[i];
    if (so && so.indexOf(c.arquivo.slice(0, 2)) === -1) continue;
    var ctx = await browser.newContext({
      viewport: { width: TELA.largura, height: TELA.altura },
      deviceScaleFactor: TELA.escala,
      locale: 'pt-BR',
      timezoneId: 'America/Sao_Paulo',
      isMobile: true,
      hasTouch: true,
    });
    await ctx.addInitScript(function(dados) {
      if (sessionStorage.getItem('vitrine-semeada')) return;
      Object.keys(dados).forEach(function(k) { localStorage.setItem(k, dados[k]); });
      // Modo local: sem a tela de login do build cloud por cima.
      localStorage.setItem('fp-force-local', '1');
      sessionStorage.setItem('vitrine-semeada', '1');
    }, dadosDaVitrine(hoje));
    if (c.pro) {
      // Tela de recurso Pro: mostra o recurso como quem assina o vê.
      await ctx.addInitScript(function() {
        var trocar = function() {
          if (typeof BILLING === 'undefined' || !BILLING.getTier) return false;
          BILLING.getTier = function() { return 'PRO'; };
          if (BILLING.hasFeature) BILLING.hasFeature = function() { return true; };
          if (BILLING.isPro) BILLING.isPro = function() { return true; };
          return true;
        };
        var t = setInterval(function() { if (trocar()) clearInterval(t); }, 20);
      });
    }
    var page = await ctx.newPage();
    await page.clock.install({ time: hoje });
    page.on('pageerror', function(e) { console.warn('  [pageerror ' + c.arquivo + '] ' + e.message); });
    await page.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForFunction(function() { return typeof window.mudarAba === 'function'; }, null, { timeout: 30000 });
    await esperar(page, 4000);
    await page.addStyleTag({ content: '*,*::before,*::after{animation-duration:0s!important;animation-delay:0s!important;transition-duration:0s!important;transition-delay:0s!important;caret-color:transparent!important}' });
    await limparSobreposicoes(page);
    await c.preparar(page);
    await limparSobreposicoes(page);
    await esperar(page, 1200);
    await limparSobreposicoes(page);
    brutas[c.arquivo] = await page.screenshot({ type: 'png', scale: 'device', animations: 'disabled', fullPage: !!process.env.VITRINE_PAGINA_INTEIRA });
    if (process.env.VITRINE_BRUTAS) fs.writeFileSync(path.join(process.env.VITRINE_BRUTAS, c.arquivo + '.png'), brutas[c.arquivo]);
    await ctx.close();
    console.log('  tela ' + c.arquivo);
  }
  return brutas;
}

function esc(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function dataUri(buf) { return 'data:image/png;base64,' + buf.toString('base64'); }

/** Página 1080×1920 da captura com legenda. */
function htmlCaptura(c, tela) {
  return '<!doctype html><html><head><meta charset="utf-8"><style>'
    + 'html,body{margin:0;width:1080px;height:1920px;overflow:hidden}'
    + 'body{background:linear-gradient(165deg,' + CORES.fundo2 + ' 0%,' + CORES.fundo1 + ' 62%);'
    + 'font-family:"Inter","Segoe UI",Roboto,Arial,sans-serif;color:' + CORES.texto + ';position:relative}'
    + '.topo{position:absolute;left:90px;right:90px;top:120px;text-align:center}'
    + 'h1{margin:0;font-size:78px;line-height:1.08;font-weight:800;letter-spacing:-1.5px;text-wrap:balance}'
    + 'p{margin:26px 0 0;font-size:38px;line-height:1.25;color:' + CORES.textoSuave + ';font-weight:500}'
    + '.aparelho{position:absolute;left:50%;top:470px;transform:translateX(-50%);width:780px;'
    + 'padding:22px;border-radius:84px;background:#0a1f18;box-shadow:0 40px 90px rgba(0,0,0,.45),inset 0 0 0 3px #1e3d33}'
    + '.aparelho img{display:block;width:780px;height:1387px;border-radius:62px}'
    + '</style></head><body>'
    + '<div class="topo"><h1>' + esc(c.legenda) + '</h1><p>' + esc(c.apoio) + '</p></div>'
    + '<div class="aparelho"><img src="' + dataUri(tela) + '"></div>'
    + '</body></html>';
}

/** Gráfico de destaque 1024×500: frase à esquerda, o Resumo à direita. */
function htmlDestaque(tela, icone) {
  return '<!doctype html><html><head><meta charset="utf-8"><style>'
    + 'html,body{margin:0;width:1024px;height:500px;overflow:hidden}'
    + 'body{background:linear-gradient(120deg,' + CORES.fundo1 + ' 0%,' + CORES.fundo2 + ' 100%);'
    + 'font-family:"Inter","Segoe UI",Roboto,Arial,sans-serif;color:#fff;position:relative}'
    + '.txt{position:absolute;left:64px;top:0;bottom:0;width:520px;display:flex;flex-direction:column;justify-content:center}'
    + '.marca{display:flex;align-items:center;gap:16px;font-size:30px;font-weight:700;margin-bottom:28px}'
    + '.marca img{width:56px;height:56px;border-radius:14px}'
    + 'h1{margin:0;font-size:56px;line-height:1.05;font-weight:800;letter-spacing:-1px}'
    + 'p{margin:20px 0 0;font-size:24px;color:' + CORES.textoSuave + ';line-height:1.3}'
    + '.aparelho{position:absolute;right:70px;top:46px;width:300px;padding:10px;border-radius:40px;'
    + 'background:#0a1f18;box-shadow:0 24px 60px rgba(0,0,0,.45),inset 0 0 0 2px #1e3d33}'
    + '.aparelho img{display:block;width:300px;height:533px;border-radius:30px}'
    + '</style></head><body>'
    + '<div class="txt"><div class="marca">' + (icone ? '<img src="' + icone + '">' : '') + 'FinançasPro</div>'
    + '<h1>Saiba quanto sobra no fim do mês</h1>'
    + '<p>Controle de gastos, orçamento e metas, direto no celular.</p></div>'
    + '<div class="aparelho"><img src="' + dataUri(tela) + '"></div>'
    + '</body></html>';
}

async function renderizar(browser, html, largura, altura, destino) {
  var ctx = await browser.newContext({ viewport: { width: largura, height: altura }, deviceScaleFactor: 1 });
  var page = await ctx.newPage();
  await page.setContent(html, { waitUntil: 'load' });
  await page.screenshot({ path: destino, type: 'png' });
  await ctx.close();
}

async function main() {
  var playwright = require('playwright');
  if (!fs.existsSync(path.join(distDir, 'index.html'))) {
    console.error('Sem dist/. Rode npm run build antes.');
    process.exit(1);
  }
  fs.mkdirSync(saida, { recursive: true });
  var servidor = await iniciarServidor();
  var browser = await playwright.chromium.launch({
    headless: true,
    executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH || undefined,
    args: ['--lang=pt-BR'],
  });
  try {
    var brutas = await capturarTelas(browser, hojeDaVitrine());
    for (var i = 0; i < CAPTURAS.length; i++) {
      var c = CAPTURAS[i];
      if (!brutas[c.arquivo]) continue;
      var destino = path.join(saida, c.arquivo + '.png');
      await renderizar(browser, htmlCaptura(c, brutas[c.arquivo]), 1080, 1920, destino);
      console.log('✓ docs/play-store/vitrine/' + c.arquivo + '.png');
    }
    if (!brutas['01-resumo']) return;
    var iconePath = path.join(root, 'icons', 'icon-512.png');
    var icone = fs.existsSync(iconePath) ? dataUri(fs.readFileSync(iconePath)) : null;
    await renderizar(browser, htmlDestaque(brutas['01-resumo'], icone), 1024, 500, path.join(saida, 'destaque-1024x500.png'));
    console.log('✓ docs/play-store/vitrine/destaque-1024x500.png');
  } finally {
    await browser.close();
    servidor.kill();
  }
}

if (require.main === module) {
  main().catch(function(err) { console.error(err); process.exit(1); });
}

module.exports = { CAPTURAS };
