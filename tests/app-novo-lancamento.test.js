/**
 * app-novo-lancamento.test.js — a tela "Novo lançamento" com o app inteiro.
 * @jest-environment node
 *
 * O app sobe num jsdom com o index.html real e todos os scripts (ver
 * tests/helpers/app-jsdom.cjs). O teste digita, toca e envia como o usuário, e
 * confere o que ele veria: o lançamento salvo, o saldo do dashboard e o aviso
 * de erro. Nada de dublê para o formulário, o DADOS ou o render.
 */
const { subirApp } = require('./helpers/app-jsdom.cjs');

const SALARIO = { id: 's1', tipo: 'receita', valor: 5000, categoria: 'salario', data: '2026-09-01', descricao: 'Salário' };

let app;
afterEach(() => { if (app) app.fechar(); app = null; });

function digitar(el, texto) {
  el.value = texto;
  el.dispatchEvent(new app.window.Event('input', { bubbles: true }));
}

function enviar() {
  const form = app.document.getElementById('form-transacao');
  form.dispatchEvent(new app.window.Event('submit', { bubbles: true, cancelable: true }));
}

function saldoDoMes() {
  return app.document.getElementById('card-saldo-principal').textContent.replace(/\s+/g, ' ');
}

function toasts() {
  return Array.from(app.document.querySelectorAll('.toast')).map((t) => t.textContent.trim());
}

function lancamentos() {
  return app.window.DADOS.getTransacoes();
}

describe('Novo lançamento', () => {
  test('despesa com descrição conhecida é salva com a categoria deduzida e baixa o saldo', async () => {
    app = await subirApp({ transacoes: [SALARIO] });
    expect(saldoDoMes()).toMatch(/R\$ 5\.000,00/);

    app.window.mudarAba('novo');
    digitar(app.document.getElementById('novo-valor'), '42,50');
    digitar(app.document.getElementById('novo-descricao'), 'Mercado');
    enviar();

    expect(await app.esperar(() => lancamentos().length === 2)).toBe(true);
    const novo = lancamentos().find((t) => t.id !== 's1');
    expect(novo).toMatchObject({ tipo: 'despesa', valor: 42.5, categoria: 'alimentacao', descricao: 'Mercado' });
    expect(await app.esperar(() => /R\$ 4\.957,50/.test(saldoDoMes()))).toBe(true);
    // O formulário volta limpo para o próximo lançamento.
    expect(app.document.getElementById('novo-valor').value).toBe('');
    expect(app.erros).toEqual([]);
  });

  test('receita: o botão Receita muda o tipo gravado', async () => {
    app = await subirApp();
    app.window.mudarAba('novo');
    app.document.querySelector('#form-transacao .tipo-btn[data-tipo="receita"]').click();
    digitar(app.document.getElementById('novo-valor'), '1.200,00');
    digitar(app.document.getElementById('novo-descricao'), 'Freela site');
    enviar();

    expect(await app.esperar(() => lancamentos().length === 1)).toBe(true);
    expect(lancamentos()[0]).toMatchObject({ tipo: 'receita', valor: 1200 });
  });

  test('sem valor: nada é gravado e o usuário vê o motivo', async () => {
    app = await subirApp({ transacoes: [SALARIO] });
    app.window.mudarAba('novo');
    digitar(app.document.getElementById('novo-descricao'), 'Mercado');
    enviar();

    await app.esperar(() => toasts().length > 0, 1000);
    expect(toasts().join(' ')).toMatch(/Informe o valor/);
    expect(lancamentos()).toHaveLength(1);
  });

  test('dois envios seguidos não duplicam o lançamento', async () => {
    app = await subirApp();
    app.window.mudarAba('novo');
    digitar(app.document.getElementById('novo-valor'), '15,00');
    digitar(app.document.getElementById('novo-descricao'), 'Uber');
    enviar();
    enviar();

    await app.esperar(() => lancamentos().length > 0);
    await new Promise((r) => setTimeout(r, 300));
    expect(lancamentos()).toHaveLength(1);
    expect(lancamentos()[0]).toMatchObject({ valor: 15, categoria: 'transporte' });
  });

  test('centavos não se perdem na soma do dashboard', async () => {
    app = await subirApp({ transacoes: [SALARIO] });
    for (const v of ['0,10', '0,20']) {
      app.window.mudarAba('novo');
      digitar(app.document.getElementById('novo-valor'), v);
      digitar(app.document.getElementById('novo-descricao'), 'Café');
      enviar();
      const alvo = v === '0,10' ? 2 : 3;
      expect(await app.esperar(() => lancamentos().length === alvo)).toBe(true);
      await app.esperar(() => app.document.getElementById('novo-valor').value === '', 1000);
    }
    // 5000 - 0,10 - 0,20 = 4999,70 (não 4999,699999…)
    expect(await app.esperar(() => /R\$ 4\.999,70/.test(saldoDoMes()))).toBe(true);
  });
});
