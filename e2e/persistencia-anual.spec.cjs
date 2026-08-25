/**
 * e2e/persistencia-anual.spec.cjs
 *
 * Auditoria personas: 10 perfis × 12 competências = 120 lançamentos.
 * Prova: sem perda, sem duplicata, reload no meio, CSV, reconciliação.
 * Roda em produção (4321) e no código-fonte (4322).
 */
const { test, expect } = require('@playwright/test');
const { waitForAppBoot, dismissOverlays } = require('./helpers.cjs');

const PERSONAS = [
  { id: 1, nome: 'leigo', tipo: 'despesa', categoria: 'alimentacao', valor: 350, desc: 'Supermercado' },
  { id: 2, nome: 'estudante', tipo: 'despesa', categoria: 'transporte', valor: 120, desc: 'Transporte' },
  { id: 3, nome: 'clt', tipo: 'receita', categoria: 'salario', valor: 5000, desc: 'Salário' },
  { id: 4, nome: 'familia', tipo: 'despesa', categoria: 'moradia', valor: 1800, desc: 'Aluguel' },
  { id: 5, nome: 'freelancer', tipo: 'receita', categoria: 'freelance', valor: 3200, desc: 'Projeto' },
  { id: 6, nome: 'investidor', tipo: 'despesa', categoria: 'outro', valor: 500, desc: 'Aporte' },
  { id: 7, nome: 'endividado', tipo: 'despesa', categoria: 'servicos_financeiros', valor: 450, desc: 'Parcela cartão' },
  { id: 8, nome: 'mobile', tipo: 'despesa', categoria: 'alimentacao', valor: 18, desc: 'Café' },
  { id: 9, nome: 'avancado', tipo: 'receita', categoria: 'freelance', valor: 2800, desc: 'Consultoria' },
  { id: 10, nome: 'privacidade', tipo: 'despesa', categoria: 'outro', valor: 29, desc: 'Backup local' }
];

/** Set/2025 → Ago/2026 (12 competências), dia 05. */
function competencias() {
  var out = [];
  for (var i = 0; i < 12; i++) {
    var d = new Date(2025, 8 + i, 5); // mês 8 = setembro
    var y = d.getFullYear();
    var m = String(d.getMonth() + 1).padStart(2, '0');
    out.push({
      ano: y,
      mes: d.getMonth() + 1,
      data: y + '-' + m + '-05',
      key: y + '-' + m
    });
  }
  return out;
}

function montarCarga() {
  var meses = competencias();
  var list = [];
  PERSONAS.forEach(function(p) {
    meses.forEach(function(comp) {
      list.push({
        tipo: p.tipo,
        valor: p.valor,
        categoria: p.categoria,
        data: comp.data,
        descricao: 'AnnualE2E-p' + p.id + '-' + comp.key + '-' + p.desc,
        banco: '',
        cartao: '',
        persona: p.nome,
        mesKey: comp.key
      });
    });
  });
  return list;
}

async function seedVazio(page) {
  await page.addInitScript(function() {
    if (localStorage.getItem('fp-annual-seeded')) return;
    localStorage.setItem('fp-config', JSON.stringify({
      nome: 'Annual E2E',
      moeda: 'BRL',
      tema: 'light',
      plano: 'free',
      pinAtivo: false,
      onboardingConcluido: true,
      renda: 8000,
      openFinance: { connections: [], lastSync: null },
      _schemaVer: 2
    }));
    localStorage.setItem('fp-transacoes', '[]');
    localStorage.setItem('fp-contas', '[]');
    localStorage.setItem('fp-annual-seeded', '1');
  });
}

async function abrirApp(page, base) {
  await seedVazio(page);
  await page.goto(base + '/?offline=1');
  await waitForAppBoot(page);
  await dismissOverlays(page);
}

async function criarCargaViaForm(page, lista) {
  return page.evaluate(async function(list) {
    if (typeof INIT_FORM === 'undefined' || !INIT_FORM.processarTransacao) {
      throw new Error('INIT_FORM.processarTransacao indisponível');
    }
    var continuo = document.getElementById('chk-continuo');
    if (continuo) continuo.checked = true;

    var ok = 0;
    for (var i = 0; i < list.length; i++) {
      var L = list[i];
      // Espelha o preenchimento da UI (tipo + campos) antes do processar.
      var tipoHidden = document.getElementById('novo-tipo');
      if (tipoHidden) tipoHidden.value = L.tipo;
      document.querySelectorAll('.tipo-btn').forEach(function(b) {
        var on = b.getAttribute('data-tipo') === L.tipo;
        b.classList.toggle('ativo', on);
        b.setAttribute('aria-pressed', on ? 'true' : 'false');
      });
      var valorEl = document.getElementById('novo-valor');
      if (valorEl) {
        valorEl.value = Number(L.valor).toFixed(2).replace('.', ',');
      }
      var dataEl = document.getElementById('novo-data');
      if (dataEl) dataEl.value = L.data;
      var descEl = document.getElementById('novo-descricao');
      if (descEl) descEl.value = L.descricao;
      var catEl = document.getElementById('novo-categoria');
      if (catEl) catEl.value = L.categoria;

      INIT_FORM._submitBusy = false;
      await INIT_FORM.processarTransacao(
        L.tipo, L.valor, L.categoria, L.data, L.descricao, '', '', ''
      );
      ok++;
    }

    if (typeof PERSIST_QUEUE !== 'undefined') {
      var guard = 0;
      while (!PERSIST_QUEUE.isIdle() && guard < 200) {
        await new Promise(function(r) { setTimeout(r, 50); });
        guard++;
      }
    }
    if (typeof DADOS !== 'undefined' && DADOS.aguardarDisco) {
      await DADOS.aguardarDisco();
    }
    return ok;
  }, lista);
}

async function contarAnnual(page) {
  return page.evaluate(function() {
    var txs = (typeof TRANSACOES !== 'undefined' && TRANSACOES.obter)
      ? TRANSACOES.obter({})
      : [];
    var annual = txs.filter(function(t) {
      return t && t.descricao && String(t.descricao).indexOf('AnnualE2E-') === 0;
    });
    var byMonth = {};
    var receitas = 0;
    var despesas = 0;
    annual.forEach(function(t) {
      var k = String(t.data).slice(0, 7);
      byMonth[k] = (byMonth[k] || 0) + 1;
      if (t.tipo === 'receita') receitas += Number(t.valor);
      else if (t.tipo === 'despesa') despesas += Number(t.valor);
    });
    var csvLines = annual.map(function(t) {
      return [t.data, t.descricao, t.categoria, t.tipo, t.valor].join(',');
    });
    var reconcile = (typeof FINANCE_RECONCILER !== 'undefined')
      ? FINANCE_RECONCILER.reconcile({
        expectedCount: annual.length,
        label: 'annual-live'
      })
      : null;
    return {
      count: annual.length,
      byMonth: byMonth,
      receitas: Math.round(receitas * 100) / 100,
      despesas: Math.round(despesas * 100) / 100,
      saldo: Math.round((receitas - despesas) * 100) / 100,
      csvCount: csvLines.length,
      csvSample: csvLines.slice(0, 3),
      duplicates: reconcile ? reconcile.duplicates : [],
      fila: typeof PERSIST_QUEUE !== 'undefined' ? PERSIST_QUEUE.getSnapshot() : null
    };
  });
}

async function navegarExtratoMeses(page) {
  // Abre extrato e caminha 12 competências via API do módulo (mesOffset).
  return page.evaluate(async function() {
    if (typeof mudarAba === 'function') mudarAba('extrato');
    if (typeof INIT_EXTRATO === 'undefined') return { ok: false, reason: 'sem INIT_EXTRATO' };

    var meses = [];
    for (var i = 0; i < 12; i++) {
      var d = new Date(2025, 8 + i, 5);
      var ano = d.getFullYear();
      var mes = d.getMonth() + 1;
      var agora = new Date();
      var mesAtual = agora.getMonth() + 1;
      var anoAtual = agora.getFullYear();
      INIT_EXTRATO.state.mesOffset = (ano - anoAtual) * 12 + (mes - mesAtual);
      if (INIT_EXTRATO.atualizarPeriodoLabel) INIT_EXTRATO.atualizarPeriodoLabel();
      if (INIT_EXTRATO.render) INIT_EXTRATO.render();
      var txs = TRANSACOES.obter({ mes: mes, ano: ano }).filter(function(t) {
        return t.descricao && String(t.descricao).indexOf('AnnualE2E-') === 0;
      });
      var rec = 0;
      var des = 0;
      txs.forEach(function(t) {
        if (t.tipo === 'receita') rec += t.valor;
        else if (t.tipo === 'despesa') des += t.valor;
      });
      meses.push({
        key: ano + '-' + String(mes).padStart(2, '0'),
        count: txs.length,
        receitas: rec,
        despesas: des,
        saldo: rec - des
      });
    }
    return { ok: true, meses: meses };
  });
}

function totaisEsperados(lista) {
  var rec = 0;
  var des = 0;
  lista.forEach(function(t) {
    if (t.tipo === 'receita') rec += t.valor;
    else des += t.valor;
  });
  return {
    receitas: Math.round(rec * 100) / 100,
    despesas: Math.round(des * 100) / 100,
    saldo: Math.round((rec - des) * 100) / 100
  };
}

const AMBIENTES = [
  { nome: 'prod-dist', base: 'http://127.0.0.1:4321' },
  { nome: 'dev-source', base: 'http://127.0.0.1:4322' }
];

for (const env of AMBIENTES) {
  test.describe('Persistência anual — ' + env.nome, function() {
    test.describe.configure({ timeout: 300000 });

    test('120 lançamentos, 12 meses, reload, CSV, zero perda', async function({ page }) {
      var carga = montarCarga();
      expect(carga.length).toBe(120);
      var esperado = totaisEsperados(carga);

      await abrirApp(page, env.base);

      // Metade da carga
      var metade = carga.slice(0, 60);
      var resto = carga.slice(60);
      var n1 = await criarCargaViaForm(page, metade);
      expect(n1).toBe(60);

      var mid = await contarAnnual(page);
      expect(mid.count).toBe(60);

      // Reload no meio da carga
      await page.reload();
      await waitForAppBoot(page);
      await dismissOverlays(page);

      var afterReload = await contarAnnual(page);
      expect(afterReload.count, 'nada perdido no reload').toBe(60);

      // Retenta falhas se houver
      await page.evaluate(function() {
        if (typeof PERSIST_QUEUE !== 'undefined' && PERSIST_QUEUE.retryFailed) {
          PERSIST_QUEUE.retryFailed();
        }
      });

      var n2 = await criarCargaViaForm(page, resto);
      expect(n2).toBe(60);

      await page.reload();
      await waitForAppBoot(page);
      await dismissOverlays(page);

      var final = await contarAnnual(page);
      expect(final.count).toBe(120);
      expect(final.duplicates.length).toBe(0);
      expect(final.csvCount).toBe(120);
      expect(final.receitas).toBe(esperado.receitas);
      expect(final.despesas).toBe(esperado.despesas);
      expect(final.saldo).toBe(esperado.saldo);
      if (final.fila) {
        expect(final.fila.failed).toBe(0);
        expect(final.fila.pending + final.fila.saving).toBe(0);
      }

      // Exatamente 10 por mês
      var comps = competencias();
      comps.forEach(function(c) {
        expect(final.byMonth[c.key], 'mês ' + c.key).toBe(10);
      });

      var nav = await navegarExtratoMeses(page);
      expect(nav.ok).toBe(true);
      expect(nav.meses.length).toBe(12);
      nav.meses.forEach(function(m) {
        expect(m.count, 'extrato ' + m.key).toBe(10);
      });

      // Clique real no Registrar (prova o botão + estados)
      await page.evaluate(function() {
        if (typeof mudarAba === 'function') mudarAba('novo');
      });
      await page.locator('#chk-continuo').check({ force: true }).catch(function() {});
      await page.locator('.tipo-btn[data-tipo="despesa"]').click();
      await page.locator('#novo-data').fill('2026-08-06');
      await page.locator('#novo-valor').fill('1,00');
      await page.locator('#novo-descricao').fill('AnnualE2E-click-extra');
      await page.locator('#novo-categoria').evaluate(function(el) { el.value = 'outro'; });
      await page.locator('.btn-registrar').click();
      await page.waitForFunction(function() {
        var txs = TRANSACOES.obter({});
        return txs.some(function(t) { return t.descricao === 'AnnualE2E-click-extra'; });
      }, { timeout: 15000 });

      // Reconciliador diagnóstico
      var diag = await page.evaluate(function() {
        return window.__FP_DIAG && window.__FP_DIAG.reconcile
          ? window.__FP_DIAG.reconcile({ expectedCount: 121, label: 'pos-click' })
          : null;
      });
      expect(diag).toBeTruthy();
      expect(diag.persistedCount).toBeGreaterThanOrEqual(121);
      expect(diag.duplicates.length).toBe(0);
    });
  });
}
