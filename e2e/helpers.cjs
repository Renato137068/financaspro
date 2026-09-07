/**
 * e2e/helpers.cjs — setup compartilhado para specs offline
 */
const { expect } = require('@playwright/test');

/**
 * Faz o build de produção rodar como piloto local (sem Supabase).
 *
 * `fp-force-local` é lido por _fpWantLocal() no momento em que config.js é
 * avaliado, e o addInitScript roda antes disso. Com isto, o MESMO artefato que
 * vai para a loja atende as specs "sem backend" — antes era preciso buildar em
 * modo local, e a suíte end-to-end acabava validando um artefato diferente do
 * que era publicado.
 */
async function forcarModoLocal(page) {
  await page.addInitScript(function() {
    localStorage.setItem('fp-force-local', '1');
  });
}

async function seedOfflineStorage(page) {
  var now = new Date();
  var y = now.getFullYear();
  var m = String(now.getMonth() + 1).padStart(2, '0');

  /* Estas specs testam o app "sem backend": dashboard offline, nuvem escondida
     no Perfil, paywall que não abre. Contra um build `cloud` elas reprovavam em
     bloco — não por bug do app, mas porque o Supabase subia a tela de login na
     frente. As specs cloud (auth-offline-entrada) não chamam este seed. */
  await forcarModoLocal(page);

  await page.addInitScript(function(payload) {
    // Não sobrescrever em reload — senão o smoke "criar → reload → persistir"
    // apaga o que o teste acabou de gravar.
    if (localStorage.getItem('fp-transacoes')) return;

    localStorage.setItem('fp-config', JSON.stringify({
      nome: 'Teste E2E',
      moeda: 'BRL',
      tema: 'light',
      plano: 'free',
      pinAtivo: false,
      onboardingConcluido: true,
      renda: 5000,
      openFinance: { connections: [], lastSync: null },
      _schemaVer: 2,
    }));
    localStorage.setItem('fp-transacoes', JSON.stringify([
      {
        id: 'e2e-1',
        tipo: 'receita',
        valor: 5000,
        categoria: 'salario',
        data: payload.y + '-' + payload.m + '-01',
        descricao: 'Salário',
      },
    ]));
    localStorage.setItem('fp-contas', '[]');
  }, { y: y, m: m });
}

async function dismissOverlays(page) {
  await page.evaluate(function() {
    if (typeof ONBOARDING !== 'undefined' && ONBOARDING.encerrar) ONBOARDING.encerrar();
    var ov = document.getElementById('onboarding-overlay');
    if (ov) ov.remove();
    var auth = document.getElementById('auth-overlay');
    if (auth) auth.style.display = 'none';
    /* Esconder o overlay não basta: critical-inline.css some com header, main,
       nav e skip-link enquanto `auth-overlay-open` estiver no body
       (display:none !important). Sem tirar a classe, #aba-resumo continua com
       altura zero e o boot "falha" por um motivo que não é do app — foi o que
       fez toda a suíte reprovar contra o build cloud. */
    document.body.classList.remove('auth-overlay-open');
    var sk = document.getElementById('dashboard-skeleton');
    if (sk) sk.remove();

    // Congela animacoes e transicoes.
    //
    // O axe le a cor computada no instante em que roda. Com os cards entrando
    // por fade, ele as vezes media o meio da transicao -- verde a 1,47:1 sobre
    // branco, por exemplo -- e acusava violacao de contraste num elemento que,
    // parado, passa folgado. O resultado era um teste que reprovava uma aba
    // diferente a cada rodada, dependendo de quem ganhava a corrida.
    //
    // Isso NAO esconde problema real: o criterio de contraste do WCAG vale para
    // o estado final, que e o que o usuario le. E o mesmo que
    // scripts/capture-screenshots.cjs ja fazia para as capturas nao saírem
    // borradas.
    var congelar = document.createElement('style');
    congelar.id = 'e2e-sem-animacao';
    congelar.textContent = '*, *::before, *::after {'
      + ' animation-duration: 0s !important;'
      + ' animation-delay: 0s !important;'
      + ' transition-duration: 0s !important;'
      + ' transition-delay: 0s !important; }';
    document.head.appendChild(congelar);
  });

  // Um quadro para o estilo acima valer e o layout assentar.
  await page.waitForTimeout(250);
}

async function waitForAppBoot(page, opts) {
  opts = opts || {};
  var timeout = opts.timeout || 25000;

  await page.waitForFunction(function() {
    return typeof window.mudarAba === 'function' && typeof window.RENDER !== 'undefined';
  }, { timeout: timeout });

  await page.waitForSelector('#aba-resumo[data-dashboard-ready="1"]', { timeout: timeout });

  var card = page.locator('#card-saldo-principal');
  await expect(card).toContainText(/R\$/, { timeout: 5000 });
}

async function prepareOfflinePage(page, opts) {
  var pageErrors = [];
  if (opts && opts.captureErrors !== false) {
    page.on('pageerror', function(err) {
      pageErrors.push(err.message || String(err));
    });
  }

  await seedOfflineStorage(page);
  await page.goto('/?offline=1');

  // Scripts carregados → dispensar overlays (auth/onboarding) ANTES de exigir
  // aba visível. Sem isso o auth-overlay deixa #aba-resumo "hidden" e o boot
  // estoura timeout mesmo com data-dashboard-ready=1.
  await page.waitForFunction(function() {
    return typeof window.mudarAba === 'function' && typeof window.RENDER !== 'undefined';
  }, { timeout: (opts && opts.timeout) || 25000 });
  await dismissOverlays(page);

  await waitForAppBoot(page, opts);
  await dismissOverlays(page);

  if (pageErrors.length) {
    throw new Error('pageerror durante boot: ' + pageErrors.join(' | '));
  }
}

module.exports = {
  forcarModoLocal: forcarModoLocal,
  seedOfflineStorage: seedOfflineStorage,
  dismissOverlays: dismissOverlays,
  waitForAppBoot: waitForAppBoot,
  prepareOfflinePage: prepareOfflinePage,
};
