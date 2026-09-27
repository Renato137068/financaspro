/**
 * app-novo-atalhos.test.js — os atalhos da tela "Novo lançamento".
 * @jest-environment node
 *
 * Entrada rápida por frase, chips de lançamento rápido e a troca manual da
 * categoria sugerida, com o app inteiro (tests/helpers/app-jsdom.cjs). Eram os
 * trechos de init-form.js sem teste que exercitasse o comportamento.
 */
const { subirApp } = require('./helpers/app-jsdom.cjs');

let app;
afterEach(() => { if (app) app.fechar(); app = null; });

const $ = (id) => app.document.getElementById(id);

function digitar(el, texto) {
  el.value = texto;
  el.dispatchEvent(new app.window.Event('input', { bubbles: true }));
}

function tecla(el, key) {
  el.dispatchEvent(new app.window.KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }));
}

function enviar() {
  $('form-transacao').dispatchEvent(new app.window.Event('submit', { bubbles: true, cancelable: true }));
}

const lancamentos = () => app.window.DADOS.getTransacoes();

describe('entrada rápida', () => {
  test('uma frase preenche valor, descrição e categoria do formulário', async () => {
    app = await subirApp();
    app.window.mudarAba('novo');
    const frase = $('entrada-rapida-input');

    digitar(frase, 'mercado 50');
    tecla(frase, 'Enter');

    expect($('novo-valor').value).toMatch(/50,00/);
    expect($('novo-categoria').value).toBe('alimentacao');
    expect($('novo-tipo').value).toBe('despesa');
    expect($('er-feedback').className).toMatch(/sucesso/);
    expect($('er-feedback').textContent).toMatch(/R\$ 50,00/);
    expect(frase.value).toBe('');
    expect(app.erros).toEqual([]);
  });

  test('o botão faz o mesmo que o Enter; Esc limpa e esconde o aviso', async () => {
    app = await subirApp();
    app.window.mudarAba('novo');
    const frase = $('entrada-rapida-input');

    digitar(frase, 'uber 23,90');
    $('btn-er-submit').click();
    expect($('novo-valor').value).toMatch(/23,90/);
    expect($('er-feedback').style.display).toBe('block');

    digitar(frase, 'rascunho');
    tecla(frase, 'Escape');
    expect(frase.value).toBe('');
    expect($('er-feedback').style.display).toBe('none');
  });

  test('frase curta demais: explica o formato em vez de preencher', async () => {
    app = await subirApp();
    app.window.mudarAba('novo');
    const frase = $('entrada-rapida-input');

    digitar(frase, 'x');
    tecla(frase, 'Enter');

    expect($('er-feedback').className).toMatch(/erro/);
    expect($('er-feedback').textContent).toMatch(/mercado 50 ontem/);
    expect($('novo-valor').value).toBe('');
  });
});

describe('lançamento rápido', () => {
  test('o chip de um lançamento frequente preenche o formulário inteiro', async () => {
    const uber = (id, data) => ({ id, tipo: 'despesa', valor: 25, categoria: 'transporte', data, descricao: 'Uber' });
    app = await subirApp({ transacoes: [uber('u1', '2026-09-01'), uber('u2', '2026-09-08'), uber('u3', '2026-09-15')] });
    app.window.mudarAba('novo');

    expect(await app.esperar(() => app.document.querySelector('#quick-entries .quick-chip'))).toBe(true);
    app.document.querySelector('#quick-entries .quick-chip').click();

    expect($('novo-descricao').value).toBe('Uber');
    expect($('novo-valor').value).toMatch(/25,00/);
    expect($('novo-categoria').value).toBe('transporte');
    expect($('novo-tipo').value).toBe('despesa');
    expect(app.document.querySelector('#categoria-grid .cat-btn.ativo').dataset.cat).toBe('transporte');
  });
});

describe('trocar a categoria sugerida', () => {
  // Até 27/09/2026 o envio recalculava a sugestão e, com confiança alta,
  // trocava de volta a categoria escolhida à mão: a tela dizia "Categoria
  // final: Lazer" e o lançamento era gravado como Alimentação.
  test('a escolha manual vale no lançamento e ensina a próxima sugestão', async () => {
    app = await subirApp();
    app.window.mudarAba('novo');
    const correcoes = [];
    const aprendizado = app.global('APRENDIZADO');
    aprendizado.registrarCorrecao = (desc, de, para) => correcoes.push({ desc, de, para });

    digitar($('novo-valor'), '80,00');
    digitar($('novo-descricao'), 'Mercado');
    expect(await app.esperar(() => $('ia-alterar-categoria'))).toBe(true);
    expect($('novo-categoria').value).toBe('alimentacao');

    $('ia-alterar-categoria').click();
    const grid = $('categoria-grid');
    expect(grid.style.display).toBe('');

    grid.querySelector('.cat-btn[data-cat="lazer"]').click();

    expect($('novo-categoria').value).toBe('lazer');
    expect(grid.style.display).toBe('none');
    expect($('ia-save-preview').textContent).toMatch(/Categoria final: Lazer/);
    expect(correcoes).toEqual([{ desc: 'Mercado', de: 'alimentacao', para: 'lazer' }]);

    enviar();
    expect(await app.esperar(() => lancamentos().length === 1)).toBe(true);
    expect(lancamentos()[0]).toMatchObject({ categoria: 'lazer', valor: 80, descricao: 'Mercado' });
    // A correção conta uma vez só (no clique), não de novo no envio.
    expect(correcoes).toHaveLength(1);
    expect(app.erros).toEqual([]);
  });
});
