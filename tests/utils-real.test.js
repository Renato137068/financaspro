/**
 * utils-real.test.js — exercita js/core/utils.js REAL (cobertura de verdade)
 * Cobre: formatação (moeda/data/relativa), validação, filtros, saldo,
 *        escapeHtml, gerarId, debounce, cache DOM, storage probe, toasts.
 */
const { loadCoreModules, resetFixtures, execNoSandbox } = require('./load-sources');

// Carrega no nível do módulo para a flag __vmHasDocument existir na coleta.
// No Node 18 o document do jsdom não é utilizável no contexto VM — testes de DOM
// pulam lá e rodam no job Node 20/24 do CI (que mede cobertura).
loadCoreModules();
const domDescribe = global.__vmHasDocument ? describe : describe.skip;
const domTest = global.__vmHasDocument ? test : test.skip;
const timerDescribe = global.__vmHasTimers ? describe : describe.skip;

beforeEach(function() {
  resetFixtures();
  if (global.UTILS) global.UTILS.limparCacheDom();
  document.body.innerHTML = '';
});

describe('UTILS.comCarregamento', function() {
  function botaoFalso() {
    return {
      disabled: false,
      textContent: 'Exportar',
      _attrs: {},
      setAttribute: function(k, v) { this._attrs[k] = v; },
      removeAttribute: function(k) { delete this._attrs[k]; },
    };
  }

  test('bloqueia o botão enquanto a ação assíncrona corre', async function() {
    const btn = botaoFalso();
    let estadoDurante = null;

    await global.UTILS.comCarregamento(btn, function() {
      estadoDurante = { disabled: btn.disabled, busy: btn._attrs['aria-busy'] };
      return Promise.resolve('ok');
    });

    expect(estadoDurante).toEqual({ disabled: true, busy: 'true' });
  });

  test('libera o botão ao concluir', async function() {
    const btn = botaoFalso();
    await global.UTILS.comCarregamento(btn, function() { return Promise.resolve(1); });

    expect(btn.disabled).toBe(false);
    expect(btn._attrs['aria-busy']).toBe('false');
    expect(btn._attrs['aria-disabled']).toBeUndefined();
  });

  test('libera o botão mesmo quando a ação falha', async function() {
    // Deixar o botão travado após um erro troca um bug por outro: o usuário
    // fica sem conseguir tentar de novo.
    const btn = botaoFalso();

    await expect(
      global.UTILS.comCarregamento(btn, function() { return Promise.reject(new Error('falhou')); }),
    ).rejects.toThrow('falhou');

    expect(btn.disabled).toBe(false);
    expect(btn._attrs['aria-busy']).toBe('false');
  });

  test('libera o botão quando a ação lança de forma síncrona', async function() {
    const btn = botaoFalso();

    await expect(
      global.UTILS.comCarregamento(btn, function() { throw new Error('sync'); }),
    ).rejects.toThrow('sync');

    expect(btn.disabled).toBe(false);
  });

  test('troca e restaura o rótulo', async function() {
    const btn = botaoFalso();
    let rotuloDurante = null;

    await global.UTILS.comCarregamento(btn, function() {
      rotuloDurante = btn.textContent;
      return Promise.resolve();
    }, 'Gerando...');

    expect(rotuloDurante).toBe('Gerando...');
    expect(btn.textContent).toBe('Exportar');
  });

  test('sem rótulo, o texto do botão não é tocado', async function() {
    const btn = botaoFalso();
    await global.UTILS.comCarregamento(btn, function() { return Promise.resolve(); });

    expect(btn.textContent).toBe('Exportar');
  });

  test('devolve o valor da ação', async function() {
    await expect(
      global.UTILS.comCarregamento(null, function() { return Promise.resolve(42); }),
    ).resolves.toBe(42);
  });

  test('aceita botão nulo sem quebrar', async function() {
    // O handler pode ser disparado por teclado sem elemento associado.
    await expect(
      global.UTILS.comCarregamento(null, function() { return 'ok'; }),
    ).resolves.toBe('ok');
  });

  test('ação síncrona também resolve como Promise', async function() {
    const btn = botaoFalso();
    await expect(global.UTILS.comCarregamento(btn, function() { return 7; })).resolves.toBe(7);
    expect(btn.disabled).toBe(false);
  });
});

describe('UTILS.formatarMoeda', function() {
  test('BRL por padrão', function() {
    expect(global.UTILS.formatarMoeda(1234.5)).toMatch(/1\.234/);
  });
  test('USD usa locale en-US', function() {
    expect(global.UTILS.formatarMoeda(1234.5, 'USD')).toMatch(/1,234/);
  });
  test('EUR é aceito', function() {
    expect(typeof global.UTILS.formatarMoeda(10, 'EUR')).toBe('string');
  });
  test('moeda desconhecida cai para BRL', function() {
    expect(global.UTILS.formatarMoeda(10, 'XXX')).toMatch(/R\$|10/);
  });
});

describe('UTILS.formatarData / formatarDataHora / relativa', function() {
  test('ISO YYYY-MM-DD vira DD/MM/YYYY sem bug de timezone', function() {
    expect(global.UTILS.formatarData('2026-07-01')).toBe('01/07/2026');
  });
  test('datetime ISO usa só a parte da data', function() {
    expect(global.UTILS.formatarData('2026-12-25T23:59:00Z')).toBe('25/12/2026');
  });
  test('string não-ISO cai no Intl.DateTimeFormat', function() {
    expect(typeof global.UTILS.formatarData('2026/07/01')).toBe('string');
  });
  test('formatarDataHora devolve string com hora', function() {
    var out = global.UTILS.formatarDataHora('2026-07-01T08:30:00');
    expect(out).toMatch(/\d{2}:\d{2}/);
  });
  test('formatarDataRelativa reconhece Hoje', function() {
    var hoje = new Date();
    var iso = hoje.getFullYear() + '-' +
      String(hoje.getMonth() + 1).padStart(2, '0') + '-' +
      String(hoje.getDate()).padStart(2, '0');
    expect(global.UTILS.formatarDataRelativa(iso)).toBe('Hoje');
  });
  test('formatarDataRelativa reconhece Ontem', function() {
    var d = new Date(); d.setDate(d.getDate() - 1);
    var iso = d.getFullYear() + '-' +
      String(d.getMonth() + 1).padStart(2, '0') + '-' +
      String(d.getDate()).padStart(2, '0');
    expect(global.UTILS.formatarDataRelativa(iso)).toBe('Ontem');
  });
  test('formatarDataRelativa em data antiga devolve DD/MM/YYYY', function() {
    expect(global.UTILS.formatarDataRelativa('2020-01-15')).toBe('15/01/2020');
  });
  test('formatarDataRelativa com string não-ISO delega a formatarData', function() {
    expect(typeof global.UTILS.formatarDataRelativa('2020/01/15')).toBe('string');
  });
});

describe('UTILS.validarTransacao — todos os branches', function() {
  var base = { tipo: 'despesa', valor: 10, categoria: 'alimentacao', data: '2026-07-01' };
  test('válida', function() {
    expect(global.UTILS.validarTransacao(base).valido).toBe(true);
  });
  test('valor zero é inválido', function() {
    expect(global.UTILS.validarTransacao(Object.assign({}, base, { valor: 0 })).valido).toBe(false);
  });
  test('valor negativo é inválido', function() {
    var r = global.UTILS.validarTransacao(Object.assign({}, base, { valor: -5 }));
    expect(r.valido).toBe(false);
    expect(r.erro).toMatch(/Valor/);
  });
  test('tipo inválido rejeitado', function() {
    var r = global.UTILS.validarTransacao(Object.assign({}, base, { tipo: 'foo' }));
    expect(r.erro).toMatch(/Tipo/);
  });
  test('categoria ausente rejeitada', function() {
    var r = global.UTILS.validarTransacao(Object.assign({}, base, { categoria: '' }));
    expect(r.erro).toMatch(/Categoria/);
  });
  test('data ausente rejeitada', function() {
    var r = global.UTILS.validarTransacao(Object.assign({}, base, { data: '' }));
    expect(r.erro).toMatch(/Data/);
  });
});

describe('UTILS.calcularSaldo / filtrarPorMes / filtrarPorTipo', function() {
  var txs = [
    { tipo: 'receita', valor: 5000, data: '2026-07-01' },
    { tipo: 'despesa', valor: 1200, data: '2026-07-15' },
    { tipo: 'despesa', valor: 300,  data: '2026-06-20' },
  ];
  test('saldo = receitas - despesas', function() {
    expect(global.UTILS.calcularSaldo(txs)).toBe(3500);
  });
  test('filtrarPorMes via string ISO', function() {
    expect(global.UTILS.filtrarPorMes(txs, 7, 2026)).toHaveLength(2);
  });
  test('filtrarPorMes com objeto Date (fallback não-ISO)', function() {
    var comDate = [{ tipo: 'despesa', valor: 10, data: new Date(2026, 6, 5) }];
    expect(global.UTILS.filtrarPorMes(comDate, 7, 2026)).toHaveLength(1);
  });
  test('filtrarPorMes ignora data vazia', function() {
    expect(global.UTILS.filtrarPorMes([{ tipo: 'despesa', valor: 1, data: '' }], 7, 2026)).toHaveLength(0);
  });
  test('filtrarPorTipo', function() {
    expect(global.UTILS.filtrarPorTipo(txs, 'despesa')).toHaveLength(2);
  });
});

describe('UTILS.parseMoeda', function() {
  test('número é usado direto', function() {
    expect(global.UTILS.parseMoeda(1234.56)).toBe(1234.56);
    expect(global.UTILS.parseMoeda(50)).toBe(50);
  });
  test('formato BR: ponto milhar + vírgula decimal', function() {
    expect(global.UTILS.parseMoeda('1.234,56')).toBe(1234.56);
    expect(global.UTILS.parseMoeda('50,5')).toBe(50.5);
    expect(global.UTILS.parseMoeda('1.000.000,00')).toBe(1000000);
  });
  test('string simples (inteiro / sem separador de milhar)', function() {
    expect(global.UTILS.parseMoeda('1234')).toBe(1234);
    expect(global.UTILS.parseMoeda('1.234')).toBe(1234); // milhar BR
  });
  test('vazio / inválido / null vira 0', function() {
    expect(global.UTILS.parseMoeda('')).toBe(0);
    expect(global.UTILS.parseMoeda('   ')).toBe(0);
    expect(global.UTILS.parseMoeda('abc')).toBe(0);
    expect(global.UTILS.parseMoeda(null)).toBe(0);
    expect(global.UTILS.parseMoeda(undefined)).toBe(0);
    expect(global.UTILS.parseMoeda(NaN)).toBe(0);
  });
});

describe('UTILS.escapeHtml / labelCategoria', function() {
  test('escapa caracteres perigosos', function() {
    expect(global.UTILS.escapeHtml('<script>"&\'')).toBe('&lt;script&gt;&quot;&amp;&#039;');
  });
  test('coage não-string', function() {
    expect(global.UTILS.escapeHtml(42)).toBe('42');
  });
  test('labelCategoria conhecida', function() {
    expect(global.UTILS.labelCategoria('alimentacao')).toMatch(/Alimenta/);
  });
  test('labelCategoria desconhecida devolve a própria chave', function() {
    expect(global.UTILS.labelCategoria('inexistente')).toBe('inexistente');
  });
});

describe('UTILS.gerarId', function() {
  test('gera ids únicos', function() {
    var ids = {};
    for (var i = 0; i < 200; i++) { ids[global.UTILS.gerarId()] = true; }
    expect(Object.keys(ids)).toHaveLength(200);
  });
  test('formato timestamp-random-counter', function() {
    expect(global.UTILS.gerarId()).toMatch(/^\d+-[a-z0-9]+-\d+$/);
  });
});

timerDescribe('UTILS.debounce', function() {
  beforeAll(function() { jest.useFakeTimers(); });
  afterAll(function() { jest.useRealTimers(); });
  test('só dispara uma vez após o intervalo', function() {
    var calls = 0;
    var fn = global.UTILS.debounce(function() { calls++; }, 100);
    fn(); fn(); fn();
    expect(calls).toBe(0);
    jest.advanceTimersByTime(150);
    expect(calls).toBe(1);
  });
});

describe('UTILS cache DOM e storage probe', function() {
  domTest('obterElemento memoiza e limparCacheDom limpa', function() {
    document.body.innerHTML = '<div id="alvo"></div>';
    var el1 = global.UTILS.obterElemento('alvo');
    expect(el1).not.toBeNull();
    expect(global.UTILS.obterElemento('alvo')).toBe(el1);
    global.UTILS.limparCacheDom();
    expect(global.UTILS._domCache.alvo).toBeUndefined();
  });
  test('verificarStorageDisponivel: ok', function() {
    var r = global.UTILS.verificarStorageDisponivel({ a: 1 }, 'chave');
    expect(r.disponivel).toBe(true);
    expect(r.tamanho).toBeGreaterThan(0);
  });
  test('verificarStorageDisponivel: quota estourada', function() {
    var orig = global.localStorage.setItem;
    global.localStorage.setItem = function() { var e = new Error('cheio'); e.name = 'QuotaExceededError'; throw e; };
    try {
      var r = global.UTILS.verificarStorageDisponivel({ a: 1 }, 'k');
      expect(r.disponivel).toBe(false);
      expect(r.erro).toMatch(/cheio|Espaço/);
    } finally {
      global.localStorage.setItem = orig;
    }
  });
});

domDescribe('UTILS.mostrarToast (jsdom)', function() {
  test('injeta elemento .toast no body', function() {
    global.UTILS.mostrarToast('olá', 'success');
    expect(document.querySelector('.toast-success')).not.toBeNull();
  });
  test('mostrarToastAcao expõe fechar() e botão dispara callback', function() {
    var clicado = false;
    var ctrl = global.UTILS.mostrarToastAcao('feito', 'Desfazer', function() { clicado = true; });
    var btn = document.querySelector('.toast-acao-btn');
    expect(btn).not.toBeNull();
    btn.click();
    expect(clicado).toBe(true);
    expect(typeof ctrl.fechar).toBe('function');
  });
});

/**
 * gerarUuid alimenta o sync v2: a API só aceita UUID, e um id fora do formato
 * faz o lançamento ser recusado no servidor — offline, em silêncio, sem o
 * usuário saber que aquilo nunca vai subir. Os dois caminhos precisam valer.
 */

/**
 * gerarUuid alimenta o sync v2: a API só aceita UUID, e um id fora do formato
 * faz o lançamento ser recusado no servidor — offline, em silêncio, sem o
 * usuário saber que aquilo nunca vai subir. Os dois caminhos precisam valer.
 */

/**
 * gerarUuid alimenta o sync v2: a API só aceita UUID, e um id fora do formato
 * faz o lançamento ser recusado no servidor — offline e em silêncio, sem o
 * usuário saber que aquilo nunca vai subir.
 *
 * O sandbox do vm NÃO expõe `crypto`, então o caminho exercitado por padrão é
 * o fallback. Para cobrir o outro ramo é preciso injetar um `crypto` dentro do
 * próprio sandbox — mexer em `global.crypto` do Jest não alcança o módulo.
 */
describe('UTILS.gerarUuid', function() {
  const RE_UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  const FIXO = '3f2504e0-4f89-41d3-9a0c-0305e82c3301';

  afterEach(function() {
    execNoSandbox('crypto = undefined;');
  });

  test('usa crypto.randomUUID quando o ambiente oferece', function() {
    execNoSandbox('crypto = { randomUUID: function() { return "' + FIXO + '"; } };');
    expect(global.UTILS.gerarUuid()).toBe(FIXO);
  });

  test('sem crypto, o fallback ainda produz UUID v4 válido', function() {
    execNoSandbox('crypto = undefined;');
    expect(global.UTILS.gerarUuid()).toMatch(RE_UUID_V4);
  });

  test('fallback marca a versão 4 e o variant correto', function() {
    execNoSandbox('crypto = undefined;');
    const id = global.UTILS.gerarUuid();
    expect(id[14]).toBe('4');
    expect('89ab').toContain(id[19].toLowerCase());
  });

  test('fallback não repete ids', function() {
    execNoSandbox('crypto = undefined;');
    const ids = new Set();
    for (let i = 0; i < 200; i++) ids.add(global.UTILS.gerarUuid());
    expect(ids.size).toBe(200);
  });
});
