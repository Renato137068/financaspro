/**
 * patrimonio-ui-valor.test.js — auditoria da aba Patrimônio.
 *
 * Bug: init-patrimonio._salvarAtivo pré-convertia o valor com UTILS.parseMoeda
 * (tolerante → 0 para vazio/lixo) antes de entregar ao core. O core valida com
 * parseMoedaEstrita, que rejeitaria texto/vazio — mas recebia 0, um valor
 * legítimo (conta zerada). Resultado: campo vazio criava um ativo de R$ 0,00 em
 * silêncio. Correção: a UI passa a STRING crua; a validação é do core.
 *
 * Os módulos do core (utils.js, patrimonio.js) são carregados via load-sources
 * (vm), como no resto da suíte — carregá-los por require() aqui sequestraria a
 * atribuição de cobertura e derrubaria os limiares por-arquivo desses arquivos.
 * @jest-environment jsdom
 */
const { loadCoreModules, resetFixtures } = require('./load-sources');

loadCoreModules();
const PATRIMONIO = global.PATRIMONIO;
const UTILS = global.UTILS;
const DADOS = global.DADOS;

// init-patrimonio.js não tem require de utils/patrimonio (referencia globais),
// então carregá-lo por require não instrumenta os arquivos do core.
global.INIT_MODALS = { fpAlert: function() {}, confirm: function(_m, fn) { fn(); } };
const INIT_PATRIMONIO = require('../js/modules/init-patrimonio.js');

var toasts = [];
UTILS.mostrarToast = function(msg, tipo) { toasts.push({ msg: msg, tipo: tipo }); };

function montarFormAtivo(valorStr) {
  document.body.innerHTML =
    '<div id="patrimonio-panel"></div>' +
    '<input id="pat-ativo-nome" value="Conta X">' +
    '<input id="pat-ativo-valor" value="' + valorStr + '">' +
    '<select id="pat-ativo-tipo"><option value="corrente" selected>c</option></select>' +
    '<input id="pat-ativo-conta-id" value="">';
}

beforeEach(function() {
  resetFixtures();
  DADOS.salvarConfig({ patrimonio: { ativos: [], dividas: [] } });
  toasts = [];
});

describe('_salvarAtivo — valor vazio/inválido não cria ativo fantasma', function() {
  test('campo vazio → nenhum ativo criado, toast de erro', function() {
    montarFormAtivo('');
    INIT_PATRIMONIO._salvarAtivo({ remove: function() {} }, null);
    expect(PATRIMONIO.listarAtivos().length).toBe(0);
    expect(toasts.some(function(t) { return t.tipo === 'error' && /inválido/i.test(t.msg); })).toBe(true);
  });

  test('texto puro → nenhum ativo criado', function() {
    montarFormAtivo('abc');
    INIT_PATRIMONIO._salvarAtivo({ remove: function() {} }, null);
    expect(PATRIMONIO.listarAtivos().length).toBe(0);
  });

  test('valor válido pt-BR → cria com o número certo', function() {
    montarFormAtivo('1.500,00');
    INIT_PATRIMONIO._salvarAtivo({ remove: function() {} }, null);
    var ativos = PATRIMONIO.listarAtivos();
    expect(ativos.length).toBe(1);
    expect(ativos[0].valor).toBe(1500);
  });

  test('zero explícito continua válido (conta zerada é um ativo)', function() {
    montarFormAtivo('0,00');
    INIT_PATRIMONIO._salvarAtivo({ remove: function() {} }, null);
    var ativos = PATRIMONIO.listarAtivos();
    expect(ativos.length).toBe(1);
    expect(ativos[0].valor).toBe(0);
  });
});
