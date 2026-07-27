/**
 * pipeline-real.test.js — exercita js/pipeline.js REAL (processar + preencherForm)
 * Usa jsdom para os caminhos que tocam o DOM.
 */
const { loadCoreModules, resetFixtures } = require('./load-sources');

// Carrega no nível do módulo para que a flag __vmHasDocument exista já na coleta
// (permite describe.skip condicional). No Node 18 o document do jsdom não é
// utilizável dentro do contexto VM — os testes de DOM são pulados lá e rodam no
// job Node 20/24 do CI (que mede a cobertura).
loadCoreModules();
const domDescribe = global.__vmHasDocument ? describe : describe.skip;

beforeEach(function() {
  resetFixtures();
  document.body.innerHTML = '';
});

describe('PIPELINE.processar', function() {
  test('input curto (<2) devolve null', function() {
    expect(global.PIPELINE.processar('a')).toBeNull();
    expect(global.PIPELINE.processar('')).toBeNull();
  });
  test('extrai valor e devolve estrutura completa', function() {
    var r = global.PIPELINE.processar('mercado 150');
    expect(r).toBeDefined();
    expect(r.valor).toBe(150);
    expect(r).toHaveProperty('categoria');
    expect(r).toHaveProperty('confianca');
    expect(r).toHaveProperty('score');
  });
  test('reconhece banco no texto', function() {
    var r = global.PIPELINE.processar('nubank 90 farmacia');
    expect(r.banco).toBe('nubank');
  });
});

domDescribe('PIPELINE.preencherForm (jsdom)', function() {
  test('r nulo devolve false', function() {
    expect(global.PIPELINE.preencherForm(null)).toBe(false);
  });

  test('preenche valor e data em campos vazios', function() {
    document.body.innerHTML =
      '<input id="novo-valor"><input id="novo-data">' +
      '<select id="novo-banco"></select><select id="novo-cartao"></select>';
    var ok = global.PIPELINE.preencherForm({
      valor: 42.5, data: '2026-07-01', banco: null, cartao: null,
    });
    expect(ok).toBe(true);
    expect(document.getElementById('novo-valor').value).toBe('42,50');
    expect(document.getElementById('novo-data').value).toBe('2026-07-01');
  });

  test('não sobrescreve valor já preenchido', function() {
    document.body.innerHTML = '<input id="novo-valor" value="99,00">';
    global.PIPELINE.preencherForm({ valor: 10 });
    expect(document.getElementById('novo-valor').value).toBe('99,00');
  });

  test('_setSelectComOpcao cria opção ausente e seleciona', function() {
    document.body.innerHTML = '<select id="novo-banco"></select>';
    global.PIPELINE._setSelectComOpcao('novo-banco', 'inter');
    var sel = document.getElementById('novo-banco');
    expect(sel.value).toBe('inter');
    expect(sel.options.length).toBe(1);
  });

  test('_setSelectComOpcao com valor falsy não faz nada', function() {
    document.body.innerHTML = '<select id="novo-banco"></select>';
    global.PIPELINE._setSelectComOpcao('novo-banco', null);
    expect(document.getElementById('novo-banco').options.length).toBe(0);
  });

  test('_setSelectComOpcao reaproveita opção existente', function() {
    document.body.innerHTML = '<select id="novo-cartao"><option value="credito">credito</option></select>';
    global.PIPELINE._setSelectComOpcao('novo-cartao', 'credito');
    var sel = document.getElementById('novo-cartao');
    expect(sel.value).toBe('credito');
    expect(sel.options.length).toBe(1); // não duplicou
  });
});
