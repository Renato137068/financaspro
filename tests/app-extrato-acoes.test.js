/**
 * app-extrato-acoes.test.js — editar, excluir e exportar lançamentos pelo Extrato, com o app inteiro.
 * @jest-environment node
 *
 * Achado da auditoria de qualidade de 08/10: js/modules/extrato/acoes.js estava
 * em 33% de linhas e só tinha teste da função que neutraliza fórmulas no CSV.
 * Cobrir de verdade achou três bugs que custavam dinheiro ou confiança:
 *  - editar um lançamento apagava a conta e o cartão dele (o form não os
 *    preenchia e salvar gravava "Sem banco"/"Sem forma"): a compra sumia da
 *    fatura e do saldo da conta;
 *  - o resumo do CSV saía como "R$ 5.000,00" sem aspas, e a vírgula partia o
 *    valor em duas colunas no Excel;
 *  - o "Saldo acumulado" do CSV somava da mais recente para a mais antiga e
 *    tratava transferência como despesa, então não fechava com o saldo do mês.
 */
const { subirApp } = require('./helpers/app-jsdom.cjs');
const { gestos } = require('./helpers/ui-app.cjs');

const AGORA = '2026-09-20T12:00:00.000-03:00';

const SALARIO = { id: 'r1', tipo: 'receita', valor: 5000, categoria: 'salario', data: '2026-09-01', descricao: 'Salário', banco: 'Nubank' };
const ALUGUEL = { id: 'd1', tipo: 'despesa', valor: 1234.56, categoria: 'moradia', data: '2026-09-05', descricao: 'Aluguel', banco: 'Nubank' };
const MERCADO = { id: 'd2', tipo: 'despesa', valor: 100, categoria: 'alimentacao', data: '2026-09-10', descricao: 'Mercado', banco: 'Nubank', cartao: 'Crédito' };
const TRANSF = { id: 't1', tipo: 'transferencia', valor: 1000, categoria: 'transferencia', data: '2026-09-06', descricao: 'Para a reserva', banco: 'Nubank', contaDestino: 'Inter' };

let app;
afterEach(() => { if (app) app.fechar(); app = null; });

async function abrirExtrato(opts) {
  app = await subirApp({ agora: AGORA, ...(opts || {}) });
  app.window.mudarAba('extrato');
  const ok = await app.esperar(() => app.window.INIT_EXTRATO && app.window.INIT_EXTRATO.editarTransacao);
  expect(ok).toBe(true);
  return gestos(app);
}

const tx = (id) => app.window.DADOS.getTransacoes().find((t) => t.id === id);

function enviarForm() {
  app.document.getElementById('form-transacao')
    .dispatchEvent(new app.window.Event('submit', { bubbles: true, cancelable: true }));
}

/** Roda a exportação e devolve o texto do CSV que iria para o download. */
async function exportarCsv() {
  let blob = null;
  let nomeArquivo = '';
  app.window.URL.createObjectURL = (b) => { blob = b; return 'blob:teste'; };
  app.window.HTMLAnchorElement.prototype.click = function() { nomeArquivo = this.download; };
  app.window.INIT_EXTRATO.exportarExcel();
  if (!blob) return { texto: null, nomeArquivo };
  const texto = await new Promise((resolve) => {
    const fr = new app.window.FileReader();
    fr.onload = () => resolve(fr.result);
    fr.readAsText(blob);
  });
  return { texto: texto.replace(/^﻿/, ''), nomeArquivo };
}

/** Linhas de dados da tabela do CSV (depois do cabeçalho "Data,..."). */
function linhasTabela(csv) {
  const linhas = csv.split('\n');
  const ini = linhas.findIndex((l) => l.startsWith('Data,'));
  return linhas.slice(ini + 1).filter((l) => /^\d{2}\/\d{2}\/\d{4},/.test(l));
}

/** Divide uma linha CSV respeitando aspas (o que o Excel faz). */
function colunas(linha) {
  const out = [];
  let atual = '';
  let aspas = false;
  for (let i = 0; i < linha.length; i++) {
    const c = linha[i];
    if (aspas) {
      if (c === '"' && linha[i + 1] === '"') { atual += '"'; i++; }
      else if (c === '"') aspas = false;
      else atual += c;
    } else if (c === '"') aspas = true;
    else if (c === ',') { out.push(atual); atual = ''; }
    else atual += c;
  }
  out.push(atual);
  return out;
}

describe('Editar lançamento', () => {
  test('o formulário abre com a conta e o cartão do lançamento', async () => {
    await abrirExtrato({ transacoes: [SALARIO, MERCADO] });
    app.window.INIT_EXTRATO.editarTransacao('d2');
    const d = app.document;
    expect(d.getElementById('novo-banco').value).toBe('Nubank');
    expect(d.getElementById('novo-cartao').value).toBe('Crédito');
    expect(d.getElementById('novo-descricao').value).toBe('Mercado');
    expect(d.getElementById('form-transacao').dataset.editId).toBe('d2');
    expect(d.querySelector('.btn-registrar').textContent).toBe('Atualizar');
  });

  test('salvar a edição muda o valor e mantém conta e cartão (a compra não sai da fatura)', async () => {
    const g = await abrirExtrato({ transacoes: [SALARIO, MERCADO] });
    app.window.INIT_EXTRATO.editarTransacao('d2');
    g.preencher('novo-valor', '120,00');
    enviarForm();
    expect(await app.esperar(() => tx('d2').valor === 120)).toBe(true);
    expect(tx('d2')).toMatchObject({ banco: 'Nubank', cartao: 'Crédito', categoria: 'alimentacao', descricao: 'Mercado' });
    expect(app.window.DADOS.getTransacoes()).toHaveLength(2);
    expect(app.erros).toEqual([]);
  });

  test('Desfazer depois de salvar a edição volta valor, conta e cartão de antes', async () => {
    const g = await abrirExtrato({ transacoes: [SALARIO, MERCADO] });
    app.window.INIT_EXTRATO.editarTransacao('d2');
    g.preencher('novo-valor', '250,00');
    app.document.getElementById('novo-cartao').value = 'Débito';
    enviarForm();
    expect(await app.esperar(() => tx('d2').valor === 250)).toBe(true);
    expect(tx('d2').cartao).toBe('Débito');
    expect(await app.esperar(() => !!app.document.querySelector('.toast-acao-btn'))).toBe(true);
    g.clicar('.toast-acao-btn');
    expect(await app.esperar(() => tx('d2').valor === 100)).toBe(true);
    expect(tx('d2')).toMatchObject({ banco: 'Nubank', cartao: 'Crédito' });
    expect(app.erros).toEqual([]);
  });

  test('banco removido das configurações continua no lançamento editado', async () => {
    const antigo = { ...MERCADO, banco: 'Banco Extinto', cartao: 'Cartão Antigo' };
    const g = await abrirExtrato({ transacoes: [antigo] });
    app.window.INIT_EXTRATO.editarTransacao('d2');
    expect(app.document.getElementById('novo-banco').value).toBe('Banco Extinto');
    g.preencher('novo-valor', '90,00');
    enviarForm();
    expect(await app.esperar(() => tx('d2').valor === 90)).toBe(true);
    expect(tx('d2')).toMatchObject({ banco: 'Banco Extinto', cartao: 'Cartão Antigo' });
  });

  test('lançamento que não existe mais não abre o formulário', async () => {
    await abrirExtrato({ transacoes: [SALARIO] });
    app.window.INIT_EXTRATO.editarTransacao('nao-existe');
    expect(app.document.getElementById('form-transacao').dataset.editId).toBeUndefined();
  });
});

describe('Excluir lançamento', () => {
  test('confirmar esconde na hora e Desfazer devolve sem apagar', async () => {
    const g = await abrirExtrato({ transacoes: [SALARIO, ALUGUEL] });
    app.window.INIT_EXTRATO.deletarTransacao('d1');
    g.confirmar();
    expect(app.window.INIT_EXTRATO.state.pendenteExclusao.d1).toBe(true);
    g.clicar('.toast-acao-btn');
    expect(app.window.INIT_EXTRATO.state.pendenteExclusao.d1).toBeUndefined();
    expect(tx('d1')).toBeDefined();
  });

  test('sem desfazer, o lançamento é apagado depois do aviso', async () => {
    const g = await abrirExtrato({ transacoes: [SALARIO, ALUGUEL] });
    app.window.INIT_EXTRATO.deletarTransacao('d1');
    g.confirmar();
    expect(await app.esperar(() => !tx('d1'), 7000)).toBe(true);
    expect(tx('r1')).toBeDefined();
    expect(app.window.INIT_EXTRATO.state.pendenteExclusao.d1).toBeUndefined();
  });

  test('cancelar a confirmação não mexe em nada', async () => {
    const g = await abrirExtrato({ transacoes: [ALUGUEL] });
    app.window.INIT_EXTRATO.deletarTransacao('d1');
    g.cancelar();
    expect(app.window.INIT_EXTRATO.state.pendenteExclusao.d1).toBeUndefined();
    expect(tx('d1')).toBeDefined();
  });
});

describe('Exportar CSV', () => {
  test('resumo com um valor por coluna e saldo acumulado que fecha com o saldo do período', async () => {
    await abrirExtrato({ transacoes: [SALARIO, ALUGUEL, TRANSF, MERCADO] });
    const { texto, nomeArquivo } = await exportarCsv();
    expect(nomeArquivo).toBe('extrato_setembro_2026.csv');

    const resumo = (rotulo) => colunas(texto.split('\n').find((l) => l.startsWith(rotulo)));
    // Uma célula de rótulo + uma de valor: "R$ 5.000,00" sem aspas virava três.
    expect(resumo('Receitas Total')).toEqual(['Receitas Total', '5000.00']);
    expect(resumo('Despesas Total')).toEqual(['Despesas Total', '1334.56']);
    expect(resumo('Saldo do Período')).toEqual(['Saldo do Período', '3665.44']);

    const linhas = linhasTabela(texto).map(colunas);
    // Ordem cronológica: o acumulado só faz sentido do dia 1 em diante.
    expect(linhas.map((c) => c[0])).toEqual(['01/09/2026', '05/09/2026', '06/09/2026', '10/09/2026']);
    expect(linhas.map((c) => c[5])).toEqual(['5000.00', '3765.44', '3765.44', '3665.44']);
    // A última linha fecha com o resumo.
    expect(linhas[linhas.length - 1][5]).toBe(resumo('Saldo do Período')[1]);
    expect(texto).toMatch(/Total de transações,4/);
  });

  test('transferência entre contas sai como Transferência, sem mexer no saldo', async () => {
    await abrirExtrato({ transacoes: [SALARIO, TRANSF] });
    const { texto } = await exportarCsv();
    const transf = linhasTabela(texto).map(colunas).find((c) => c[1] === 'Para a reserva');
    expect(transf[3]).toBe('Transferência');
    expect(transf[4]).toBe('1000.00');
    expect(transf[5]).toBe('5000.00');
  });

  test('descrição com fórmula ou aspas não vira comando nem quebra a coluna', async () => {
    const perigosa = { ...ALUGUEL, descricao: '=HYPERLINK("http://x","clique")' };
    await abrirExtrato({ transacoes: [perigosa] });
    const { texto } = await exportarCsv();
    const [linha] = linhasTabela(texto).map(colunas);
    expect(linha).toHaveLength(6);
    expect(linha[1]).toBe('\'=HYPERLINK("http://x","clique")');
  });

  test('mês sem lançamentos avisa e não baixa nada', async () => {
    const g = await abrirExtrato({ transacoes: [] });
    const { texto } = await exportarCsv();
    expect(texto).toBeNull();
    expect(g.toast()).toMatch(/Nenhuma transação para exportar/);
  });
});

describe('Exportar PDF', () => {
  function capturarJanela() {
    const janela = { html: '', impresso: false };
    app.window.open = () => ({
      document: { write: (h) => { janela.html += h; }, close() {} },
      focus() {},
      print() { janela.impresso = true; },
    });
    return janela;
  }

  test('no plano grátis abre o paywall em vez de gerar', async () => {
    await abrirExtrato({ transacoes: [ALUGUEL] });
    const janela = capturarJanela();
    let pedido = null;
    app.window.BILLING.canUse = (f) => f !== 'exportPdf';
    app.window.BILLING.onPaymentRequired = (p) => { pedido = p; };
    app.window.INIT_EXTRATO.exportarExtrato();
    expect(pedido).toMatchObject({ gate: 'exportPdf' });
    expect(janela.html).toBe('');
  });

  test('com o Pro: escapa a descrição, rotula a transferência e manda imprimir', async () => {
    const xss = { ...ALUGUEL, descricao: '<img src=x onerror=alert(1)>' };
    await abrirExtrato({ transacoes: [SALARIO, xss, TRANSF] });
    const janela = capturarJanela();
    app.window.BILLING.canUse = () => true;
    app.window.INIT_EXTRATO.exportarExtrato();
    expect(janela.html).toMatch(/Extrato de Setembro de 2026/);
    expect(janela.html).not.toMatch(/<img src=x/);
    expect(janela.html).toMatch(/&lt;img src=x onerror=alert\(1\)&gt;/);
    expect(janela.html).toMatch(/<td>Transferência<\/td><td class="transferencia">R\$\s?1\.000,00<\/td>/);
    expect(janela.html).toMatch(/<td class="despesa">-R\$\s?1\.234,56<\/td>/);
    expect(await app.esperar(() => janela.impresso, 1000)).toBe(true);
  });

  test('pop-up bloqueado: avisa como liberar', async () => {
    const g = await abrirExtrato({ transacoes: [ALUGUEL] });
    app.window.open = () => null;
    app.window.BILLING.canUse = () => true;
    app.window.INIT_EXTRATO.exportarExtrato();
    expect(g.toast()).toMatch(/bloqueou a janela de impressão/);
  });
});
