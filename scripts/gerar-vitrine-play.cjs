/**
 * gerar-vitrine-play.cjs — capturas com legenda e gráfico de destaque da Play.
 *
 * Gera em docs/play-store/vitrine/:
 *   01..08-*.png        capturas de celular 1080×1920, uma frase de benefício
 *                       no topo e o app de verdade num aparelho abaixo;
 *   tablet/01..08-*.png as mesmas oito em tablet de 7" (1080×1920);
 *   tablet-10/01..08-*.png e em tablet de 10" (1440×2560);
 *   destaque-1024x500.png  gráfico de destaque (feature graphic);
 *   promocional/*.png   imagens 1920×1080 do conteúdo promocional da Play.
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

/**
 * Formatos gerados. `tela` é a viewport do app em px de CSS e a escala;
 * `saida`, a imagem final. Os tablets em retrato são o que a Play pede para o
 * app aparecer bem em tablets e Chromebooks (achado A10 da auditoria).
 *
 * Toda saída é 9:16: a Play só aceita essa proporção nas capturas de tablet
 * (as de 1200×1920, 16:10, ficavam de fora; revisão da vitrine de 04/out).
 * A tela do tablet continua 16:10 dentro do aparelho; o que é 9:16 é a peça.
 * A composição é desenhada em 1080×1920 e ampliada para a saída.
 */
const FORMATOS = [
  { id: 'celular', pasta: '', tela: { largura: 360, altura: 640, escala: 3, movel: true }, saida: { largura: 1080, altura: 1920 } },
  { id: 'tablet', pasta: 'tablet', tela: { largura: 600, altura: 960, escala: 2 }, saida: { largura: 1080, altura: 1920 } },
  { id: 'tablet-10', pasta: 'tablet-10', tela: { largura: 800, altura: 1280, escala: 2 }, saida: { largura: 1440, altura: 2560 } },
];
const BASE_PECA = { largura: 1080, altura: 1920 };

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
    preparar: async function(page, tela) {
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
      // Do título da aba ("Novo lançamento"), nos três formatos. No celular,
      // a linha de apoio do título e a entrada por frase saem da foto para o valor
      // caber acima da barra com o título à vista.
      if (tela.largura < 500) {
        await page.evaluate(function() {
          document.querySelectorAll('#aba-novo .perfil-header .perfil-meta, #aba-novo .er-wrapper')
            .forEach(function(el) { el.style.setProperty('display', 'none', 'important'); });
        });
      }
      await rolarAte(page, '#aba-novo .perfil-header', 8);
    },
  },
  {
    arquivo: '03-orcamento',
    legenda: 'Orçamento 50/30/20 pronto',
    apoio: 'Necessidades, desejos e poupança',
    preparar: async function(page) {
      await irPara(page, 'orcamento');
      await rolarAte(page, '.orc-regra', 8);
    },
  },
  {
    arquivo: '04-cartao',
    legenda: 'A fatura do cartão, com as parcelas',
    apoio: 'Quanto já está comprometido nos próximos meses',
    preparar: async function(page, tela) {
      await page.evaluate(function() {
        var al = document.getElementById('dashboard-alertas');
        if (al) al.style.display = 'none';
        document.querySelectorAll('.dashboard-mais').forEach(function(el) { el.classList.remove('dashboard-mais'); });
        if (typeof CARTOES !== 'undefined' && CARTOES.render) CARTOES.render();
      });
      // No tablet de 10" o Resumo tem duas colunas e os cartões ficam na da
      // direita: a tela começa na linha das últimas transações, para as duas
      // colunas abrirem inteiras, com a fatura logo abaixo.
      await rolarAte(page, tela.largura >= 768 ? '#secao-ultimas-transacoes' : '#secao-cartoes', 8);
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
      // Do título da tela (Segurança), com o cartão do PIN logo abaixo.
      await page.evaluate(function() {
        var t = [].slice.call(document.querySelectorAll('.perfil-header .perfil-nome'))
          .filter(function(h) { return h.textContent.trim() === 'Segurança' && h.getClientRects().length; })[0];
        if (t) t.closest('.perfil-header').setAttribute('data-vitrine-alvo', '1');
      });
      await rolarAte(page, '[data-vitrine-alvo], #chk-pin', 8);
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

/**
 * Rola até o primeiro seletor que existir, deixando `margem` px de CSS entre
 * ele e o que fica preso no topo (cabeçalho fixo, abas "sticky"). O que sobra
 * cortado acima do alvo (meio cartão, a última linha de uma lista) fica
 * coberto pelo fundo do app: a tela começa limpa no alvo.
 */
async function rolarAte(page, seletores, margem) {
  var args = { sel: seletores, margem: margem || 0 };
  // Espaço no fim da página, para o alvo chegar ao topo mesmo perto do fim
  // (sem isso a rolagem para antes e sobra conteúdo cortado acima dele).
  await page.evaluate(function() {
    var main = document.querySelector('main') || document.body;
    var folga = document.createElement('div');
    folga.style.height = window.innerHeight + 'px';
    main.appendChild(folga);
  });
  // Duas passadas: a primeira rola; a segunda vê o que grudou no topo depois
  // da rolagem e desce o que faltar para o alvo não ficar por baixo.
  for (var passada = 0; passada < 2; passada++) {
    await page.evaluate(function(a) {
      var el = null;
      a.sel.split(',').some(function(s) { el = document.querySelector(s.trim()); return !!el; });
      if (!el) return;
      var topo = 0;
      [].forEach.call(document.querySelectorAll('header, .app-header, [class], [id]'), function(n) {
        var cs = getComputedStyle(n);
        if ((cs.position !== 'fixed' && cs.position !== 'sticky') || cs.display === 'none' || cs.visibility === 'hidden') return;
        if (n.contains(el) || n.classList.contains('nav-bottom') || n.closest('.nav-bottom')) return;
        var r = n.getBoundingClientRect();
        if (r.height < 1 || r.top < -1 || r.top > window.innerHeight / 4 || r.bottom <= 0 || r.height > window.innerHeight / 4) return;
        topo = Math.max(topo, r.bottom);
      });
      var y = window.scrollY + el.getBoundingClientRect().top - topo - a.margem;
      window.scrollTo(0, Math.max(0, y));
    }, args);
    await page.waitForTimeout(300);
  }
  await page.evaluate(function(a) {
    var el = null;
    a.sel.split(',').some(function(s) { el = document.querySelector(s.trim()); return !!el; });
    if (!el || window.scrollY === 0) return;
    // O que ficou inteiro acima do alvo, ou cortado pela borda de cima (meio
    // cartão, o cabeçalho que some ao rolar), some da foto: a tela começa
    // limpa no alvo. Com duas colunas, cada uma perde só o que está acima da
    // linha do alvo. O que fica preso no topo (abas "sticky") continua.
    var linha = el.getBoundingClientRect().top + 1;
    var presos = [].filter.call(document.querySelectorAll('[class], [id], header'), function(n) {
      var p = getComputedStyle(n).position;
      return (p === 'fixed' || p === 'sticky') && n.getBoundingClientRect().top >= -1;
    });
    [].forEach.call(document.querySelectorAll('main *, header, .app-header'), function(n) {
      if (n.contains(el) || el.contains(n)) return;
      if (presos.some(function(p) { return p.contains(n) || n.contains(p); })) return;
      if (n.closest('.nav-bottom')) return;
      var r = n.getBoundingClientRect();
      if (r.height < 1 || r.bottom <= 0 || r.bottom > linha) return;
      n.style.setProperty('visibility', 'hidden', 'important');
    });
  }, args);
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

/**
 * A barra de navegação flutua translúcida sobre a lista. Numa foto parada isso
 * vira texto fantasma atrás dos ícones e uma linha cortada abaixo da barra.
 * Na captura, a barra fica opaca e o espaço até a borda da tela ganha o fundo
 * do app, como se a lista terminasse ali.
 */
async function assentarNavegacao(page) {
  await page.evaluate(function() {
    var nav = document.querySelector('.nav-bottom');
    if (!nav || getComputedStyle(nav).display === 'none') return;
    var cs = getComputedStyle(document.body);
    var fundo = cs.backgroundColor && cs.backgroundColor !== 'rgba(0, 0, 0, 0)' ? cs.backgroundColor : '#f5f8f6';
    var cartao = getComputedStyle(document.documentElement).getPropertyValue('--color-bg-card').trim() || '#ffffff';
    nav.style.setProperty('background', cartao, 'important');
    nav.style.setProperty('backdrop-filter', 'none', 'important');
    nav.style.setProperty('-webkit-backdrop-filter', 'none', 'important');
    var r = nav.getBoundingClientRect();
    var faixa = document.getElementById('vitrine-faixa-nav') || document.createElement('div');
    faixa.id = 'vitrine-faixa-nav';
    faixa.style.cssText = 'position:fixed;left:0;right:0;bottom:0;height:' + Math.ceil(window.innerHeight - r.top + 14) + 'px;'
      + 'background:' + fundo + ';z-index:' + ((parseInt(getComputedStyle(nav).zIndex, 10) || 100) - 1) + ';pointer-events:none';
    document.body.appendChild(faixa);
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

async function capturarTelas(browser, hoje, TELA) {
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
      // Só o celular simula viewport móvel: no tablet, um elemento mais largo
      // que a tela faria o Chromium afastar o zoom e cortar a barra de baixo.
      isMobile: !!TELA.movel,
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
    await c.preparar(page, TELA);
    await limparSobreposicoes(page);
    await esperar(page, 1200);
    await limparSobreposicoes(page);
    await assentarNavegacao(page);
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

/** Página da captura com legenda, no tamanho do formato (celular ou tablet). */
function htmlCaptura(c, tela, fmt) {
  // O aparelho ocupa a altura que sobra abaixo da legenda; a largura segue a
  // proporção da tela do formato.
  var altImg = 1387;
  var largImg = Math.round(altImg * fmt.tela.largura / fmt.tela.altura);
  return '<!doctype html><html><head><meta charset="utf-8"><style>'
    + 'html,body{margin:0;width:' + BASE_PECA.largura + 'px;height:' + BASE_PECA.altura + 'px;overflow:hidden}'
    + 'body{background:linear-gradient(165deg,' + CORES.fundo2 + ' 0%,' + CORES.fundo1 + ' 62%);'
    + 'font-family:"Inter","Segoe UI",Roboto,Arial,sans-serif;color:' + CORES.texto + ';position:relative}'
    + '.topo{position:absolute;left:90px;right:90px;top:120px;text-align:center}'
    + 'h1{margin:0;font-size:78px;line-height:1.08;font-weight:800;letter-spacing:-1.5px;text-wrap:balance}'
    + 'p{margin:26px 0 0;font-size:38px;line-height:1.25;color:' + CORES.textoSuave + ';font-weight:500}'
    + '.aparelho{position:absolute;left:50%;top:470px;transform:translateX(-50%);width:' + largImg + 'px;'
    + 'padding:22px;border-radius:84px;background:#0a1f18;box-shadow:0 40px 90px rgba(0,0,0,.45),inset 0 0 0 3px #1e3d33}'
    + '.aparelho img{display:block;width:' + largImg + 'px;height:' + altImg + 'px;border-radius:62px}'
    + '</style></head><body>'
    + '<div class="topo"><h1>' + esc(c.legenda) + '</h1><p>' + esc(c.apoio) + '</p></div>'
    + '<div class="aparelho"><img src="' + dataUri(tela) + '"></div>'
    + '</body></html>';
}

/**
 * Peças horizontais: frase à esquerda, uma tela do app à direita.
 * O gráfico de destaque (1024×500) e as imagens de conteúdo promocional da
 * Play (1920×1080, 16:9) usam o mesmo desenho, em escala.
 */
function htmlPeca(tela, icone, peca) {
  var k = peca.largura / 1024;
  var px = function(n) { return Math.round(n * k) + 'px'; };
  var altAparelho = peca.altura - 2 * Math.round(46 * k);
  var largTela = Math.round((altAparelho - 20 * k) * 9 / 16);
  return '<!doctype html><html><head><meta charset="utf-8"><style>'
    + 'html,body{margin:0;width:' + peca.largura + 'px;height:' + peca.altura + 'px;overflow:hidden}'
    + 'body{background:linear-gradient(120deg,' + CORES.fundo1 + ' 0%,' + CORES.fundo2 + ' 100%);'
    + 'font-family:"Inter","Segoe UI",Roboto,Arial,sans-serif;color:#fff;position:relative}'
    + '.txt{position:absolute;left:' + px(64) + ';top:0;bottom:0;width:' + px(540) + ';display:flex;flex-direction:column;justify-content:center}'
    + '.marca{display:flex;align-items:center;gap:' + px(16) + ';font-size:' + px(30) + ';font-weight:700;margin-bottom:' + px(28) + '}'
    + '.marca img{width:' + px(56) + ';height:' + px(56) + ';border-radius:' + px(14) + '}'
    + 'h1{margin:0;font-size:' + px(56) + ';line-height:1.05;font-weight:800;letter-spacing:-1px;text-wrap:balance}'
    + 'p{margin:' + px(20) + ' 0 0;font-size:' + px(24) + ';color:' + CORES.textoSuave + ';line-height:1.3}'
    + '.aparelho{position:absolute;right:' + px(70) + ';top:' + px(46) + ';padding:' + px(10) + ';border-radius:' + px(40) + ';'
    + 'background:#0a1f18;box-shadow:0 24px 60px rgba(0,0,0,.45),inset 0 0 0 2px #1e3d33}'
    + '.aparelho img{display:block;width:' + largTela + 'px;height:' + Math.round(largTela * 16 / 9) + 'px;border-radius:' + px(30) + '}'
    + '</style></head><body>'
    + '<div class="txt"><div class="marca">' + (icone ? '<img src="' + icone + '">' : '') + 'FinançasPro</div>'
    + '<h1>' + esc(peca.titulo) + '</h1>'
    + '<p>' + esc(peca.apoio) + '</p></div>'
    + '<div class="aparelho"><img src="' + dataUri(tela) + '"></div>'
    + '</body></html>';
}

/**
 * Conteúdo promocional da Play nas datas em que mais gente procura controle
 * financeiro (etapa 3 da auditoria de ASO). Textos e quando publicar:
 * docs/play-store/conteudo-promocional.md.
 */
const PROMOCIONAIS = [
  { arquivo: 'promo-13-salario', tela: '06-metas', titulo: 'Seu 13º com destino certo', apoio: 'Separe uma parte para as suas metas antes de gastar.' },
  { arquivo: 'promo-ano-novo', tela: '03-orcamento', titulo: 'Ano novo, orçamento novo', apoio: 'Comece o ano com a regra 50/30/20 pronta.' },
  { arquivo: 'promo-imposto-de-renda', tela: '05-extrato', titulo: 'O ano inteiro anotado', apoio: 'Encontre qualquer gasto e exporte em CSV.' },
  { arquivo: 'promo-black-friday', tela: '04-cartao', titulo: 'Antes de comprar, veja a fatura', apoio: 'Saiba quanto do cartão já está comprometido.' },
];

async function renderizar(browser, html, largura, altura, destino, escala) {
  var ctx = await browser.newContext({ viewport: { width: largura, height: altura }, deviceScaleFactor: escala || 1 });
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
    var formatos = process.env.VITRINE_FORMATO
      ? FORMATOS.filter(function(f) { return f.id === process.env.VITRINE_FORMATO; })
      : FORMATOS;
    var brutasCelular = null;
    for (var f = 0; f < formatos.length; f++) {
      var fmt = formatos[f];
      var pasta = path.join(saida, fmt.pasta);
      fs.mkdirSync(pasta, { recursive: true });
      var brutas = await capturarTelas(browser, hojeDaVitrine(), fmt.tela);
      if (fmt.id === 'celular') brutasCelular = brutas;
      for (var i = 0; i < CAPTURAS.length; i++) {
        var c = CAPTURAS[i];
        if (!brutas[c.arquivo]) continue;
        await renderizar(browser, htmlCaptura(c, brutas[c.arquivo], fmt), BASE_PECA.largura, BASE_PECA.altura,
          path.join(pasta, c.arquivo + '.png'), fmt.saida.largura / BASE_PECA.largura);
        console.log('✓ docs/play-store/vitrine/' + (fmt.pasta ? fmt.pasta + '/' : '') + c.arquivo + '.png');
      }
    }
    if (!brutasCelular || !brutasCelular['01-resumo']) return;
    var iconePath = path.join(root, 'icons', 'icon-512.png');
    var icone = fs.existsSync(iconePath) ? dataUri(fs.readFileSync(iconePath)) : null;
    await renderizar(browser, htmlPeca(brutasCelular['01-resumo'], icone, {
      largura: 1024, altura: 500,
      titulo: 'Saiba quanto sobra no fim do mês',
      apoio: 'Controle de gastos, orçamento e metas, direto no celular.',
    }), 1024, 500, path.join(saida, 'destaque-1024x500.png'));
    console.log('✓ docs/play-store/vitrine/destaque-1024x500.png');
    var pastaPromo = path.join(saida, 'promocional');
    fs.mkdirSync(pastaPromo, { recursive: true });
    for (var p = 0; p < PROMOCIONAIS.length; p++) {
      var promo = PROMOCIONAIS[p];
      if (!brutasCelular[promo.tela]) continue;
      await renderizar(browser, htmlPeca(brutasCelular[promo.tela], icone, {
        largura: 1920, altura: 1080, titulo: promo.titulo, apoio: promo.apoio,
      }), 1920, 1080, path.join(pastaPromo, promo.arquivo + '-1920x1080.png'));
      console.log('✓ docs/play-store/vitrine/promocional/' + promo.arquivo + '-1920x1080.png');
    }
  } finally {
    await browser.close();
    servidor.kill();
  }
}

if (require.main === module) {
  main().catch(function(err) { console.error(err); process.exit(1); });
}

module.exports = { CAPTURAS, FORMATOS, PROMOCIONAIS };
