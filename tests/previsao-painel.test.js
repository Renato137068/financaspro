/**
 * @jest-environment jsdom
 */
/**
 * previsao-painel.test.js — o painel de previsão (Pro).
 *
 * Cobre o que a pessoa vê: quem não é Pro vê a oferta e nada de números; quem
 * tem poucos meses vê a instrução; com dados, os cards dos meses. E um caso de
 * segurança: o nome de uma categoria personalizada é texto livre da pessoa
 * (ou vem de um backup) e não pode virar marcação na página.
 */
const { carregarScript } = require('./helpers/carregar-script.cjs');

const UTILS = carregarScript('js/core/utils.js');

function montar(opts) {
  opts = opts || {};
  document.body.innerHTML = '<div id="previsao-painel"></div><div id="previsao-mini"></div>';
  const AI = {
    prever: jest.fn(function() {
      return opts.prever || {
        meses: [
          { mesKey: '2026-11', receitaEstimada: 7000, despesaEstimada: 4000, saldoEstimado: 3000, confianca: 'alta' },
          { mesKey: '2026-12', receitaEstimada: 7000, despesaEstimada: 8000, saldoEstimado: -1000, confianca: 'baixa' },
        ],
        tendencia: 'gastos-crescendo',
        taxaPoupancaMedia: 18,
        historico: [],
      };
    }),
    calcularSaude: function() {
      return { score: 72, nivel: 'bom', detalhes: [{ item: 'Taxa de poupança', ok: true, desc: '18%' }] };
    },
    sugestaoCorte: function() {
      return opts.corte === undefined ? null : opts.corte;
    },
  };
  const configDuble = {
    getCatLabel: function(slug) { return opts.rotuloCategoria || slug; },
    CATEGORIAS_LABELS: {},
  };
  const billingDuble = { canUse: function() { return opts.pro !== false; } };
  return carregarScript('js/previsao.js', {
    AI_ENGINE: AI,
    CONFIG: configDuble,
    BILLING: billingDuble,
    DADOS: { getTransacoes: function() { return []; }, getConfig: function() { return {}; } },
    APP_STORE: { subscribe: function() {} },
    UTILS: UTILS,
  });
}

describe('PREVISAO — painel', function() {
  test('quem não é Pro vê a oferta e nenhum número de previsão', function() {
    const P = montar({ pro: false });
    P.renderizar();
    const html = document.getElementById('previsao-painel').innerHTML;
    expect(html).toContain('previsao-upsell');
    expect(html).toContain('data-action="abrir-paywall"');
    expect(html).not.toContain('previsao-card');
  });

  test('com menos de dois meses de dados, diz o que falta em vez de mostrar zeros', function() {
    const P = montar({ prever: { meses: [], tendencia: 'insuficiente', taxaPoupancaMedia: 0, historico: [] } });
    P.renderizar();
    expect(document.getElementById('previsao-painel').textContent).toMatch(/Registre ao menos 2 meses/);
  });

  test('com dados, mostra um card por mês com receitas, despesas e saldo', function() {
    const P = montar();
    P.renderizar();
    const cards = document.querySelectorAll('#previsao-painel .previsao-card');
    expect(cards).toHaveLength(2);
    expect(cards[0].textContent).toMatch(/Nov\/26/);
    expect(cards[0].querySelector('.previsao-valor.receita').textContent).toMatch(/7\.000,00/);
    expect(cards[1].querySelector('.previsao-card-saldo').classList.contains('negativo')).toBe(true);
    expect(document.querySelector('.previsao-tendencia').textContent).toMatch(/Gastos em alta/);
    expect(document.querySelector('.saude-score').textContent).toMatch(/72/);
  });

  test('sugestão de corte aparece com o nome da categoria, em negrito', function() {
    const P = montar({
      corte: { corteNecessario: 350, categoriaAlvo: 'lazer' },
      rotuloCategoria: 'Lazer',
    });
    P.renderizar();
    const corte = document.querySelector('.previsao-meta-corte');
    expect(corte).not.toBeNull();
    expect(corte.textContent).toMatch(/reduza .*350,00.* em Lazer/);
  });

  test('nome de categoria personalizada com marcação não vira elemento na página', function() {
    // Um nome digitado (ou trazido por backup) como "<img src=x onerror=...>"
    // precisa aparecer como texto, não executar.
    const P = montar({
      corte: { corteNecessario: 350, categoriaAlvo: 'x' },
      rotuloCategoria: '<img src=x onerror="window.__xss=1">Mercado',
    });
    P.renderizar();
    const painel = document.getElementById('previsao-painel');
    expect(painel.querySelector('img')).toBeNull();
    expect(window.__xss).toBeUndefined();
    expect(painel.querySelector('.previsao-meta-corte').textContent).toContain('<img src=x');
  });

  test('tendências conhecidas têm rótulo, e uma desconhecida cai em "estável"', function() {
    const P = montar();
    expect(P._tendenciaIcon('gastos-diminuindo').texto).toBe('Gastos em queda');
    expect(P._tendenciaIcon('receitas-crescendo').texto).toBe('Receitas em alta');
    expect(P._tendenciaIcon('receitas-diminuindo').texto).toBe('Receitas em queda');
    expect(P._tendenciaIcon('insuficiente').texto).toBe('Dados insuficientes');
    expect(P._tendenciaIcon('inventada').texto).toBe('Tendência estável');
  });

  test('formatação de mês e de moeda', function() {
    const P = montar();
    expect(P._formatarMes('2026-03')).toBe('Mar/26');
    expect(P._formatarMes('2026-13')).toBe('13/26');
    expect(P._formatarMoeda(1234.5)).toMatch(/1\.234,50/);
  });

  test('o cache só é reaproveitado enquanto as transações não mudam', function() {
    const P = montar();
    P.calcular(); P.calcular();
    expect(P._cache).toBeTruthy();
    P.invalidarCache();
    expect(P._cache).toBeNull();
    expect(P._cacheKey).toBe('');
  });
});
