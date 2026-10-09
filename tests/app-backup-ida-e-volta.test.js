/**
 * app-backup-ida-e-volta.test.js — o backup que o app gera volta inteiro num aparelho novo?
 * @jest-environment node
 *
 * backup-simetria.test.js confere a estrutura (cada campo exportado é lido na
 * importação) e avisa o próprio limite: "não que o valor sobrevive intacto à
 * viagem". Este teste faz a viagem: exporta pelo Perfil de um app, importa o
 * arquivo pelo Perfil de outro app vazio e compara.
 *
 * Achado da auditoria de qualidade de 08/10: a validação da importação só
 * aceitava 'receita' e 'despesa'. Quem tivesse feito UMA transferência entre
 * contas gerava um backup que o próprio app recusava inteiro ("Schema
 * inválido: tipo inválido") — o backup existia, mas não restaurava.
 */
const { subirApp } = require('./helpers/app-jsdom.cjs');
const { gestos } = require('./helpers/ui-app.cjs');

const AGORA = '2026-09-20T12:00:00.000-03:00';

const TRANSACOES = [
  { id: 'r1', tipo: 'receita', valor: 5000, categoria: 'salario', data: '2026-09-01', descricao: 'Salário', banco: 'Nubank' },
  { id: 'd1', tipo: 'despesa', valor: 89.9, categoria: 'alimentacao', data: '2026-09-10', descricao: 'Mercado & cia', banco: 'Nubank', cartao: 'Crédito', tags: ['casa'] },
  { id: 't1', tipo: 'transferencia', valor: 1000, categoria: 'transferencia', data: '2026-09-06', descricao: 'Para a reserva', banco: 'Nubank', contaDestino: 'Inter', cartao: '' },
];

const abertos = [];
afterEach(() => { while (abertos.length) abertos.pop().fechar(); });

async function abrirPerfil(opts) {
  const app = await subirApp({ agora: AGORA, ...(opts || {}) });
  abertos.push(app);
  app.window.mudarAba('config');
  expect(await app.esperar(() => app.window.INIT_CONFIG && app.window.INIT_CONFIG.exportarDados)).toBe(true);
  return app;
}

async function exportar(app) {
  let blob = null;
  app.window.URL.createObjectURL = (b) => { blob = b; return 'blob:teste'; };
  app.window.HTMLAnchorElement.prototype.click = function() {};
  // null = "Exportar sem senha" na pergunta do backup-cifrado.js (PR 108);
  // sem argumento, o app abriria essa pergunta e o arquivo não sairia.
  app.window.INIT_CONFIG.exportarDados(null);
  expect(await app.esperar(() => !!blob)).toBe(true);
  return new Promise((resolve) => {
    const fr = new app.window.FileReader();
    fr.onload = () => resolve(fr.result);
    fr.readAsText(blob);
  });
}

function importar(app, texto) {
  const arquivo = new app.window.File([texto], 'financaspro_backup.json', { type: 'application/json' });
  app.window.INIT_CONFIG.processarImport(arquivo);
}

/** O que importa de um lançamento para o usuário (sem carimbos de hora). */
const essencial = (t) => ({
  id: t.id, tipo: t.tipo, valor: t.valor, categoria: t.categoria, data: t.data,
  descricao: t.descricao, banco: t.banco || '', cartao: t.cartao || '', contaDestino: t.contaDestino,
  tags: t.tags || [],
});
const porId = (a, b) => (a.id < b.id ? -1 : 1);

test('exportar e importar num app vazio devolve lançamentos (com transferência), orçamento e preferências', async () => {
  const origem = await abrirPerfil({
    transacoes: TRANSACOES,
    config: {
      nome: 'Ana',
      orcamentos: { alimentacao: { limite: 800, definidoEm: '2026-09-01T00:00:00.000Z' } },
    },
  });
  const texto = await exportar(origem);
  const backup = JSON.parse(texto);
  expect(backup.transacoes).toHaveLength(3);
  // O próprio app aceita o que ele gerou.
  expect(origem.window.INIT_CONFIG._validateImportSchema(backup)).toEqual({ valid: true });

  const destino = await abrirPerfil();
  const g = gestos(destino);
  importar(destino, texto);
  expect(await destino.esperar(() => destino.window.DADOS.getTransacoes().length === 3)).toBe(true);
  expect(await destino.esperar(() => /Importado/.test(g.toast()))).toBe(true);

  const antes = origem.window.DADOS.getTransacoes().map(essencial).sort(porId);
  const depois = destino.window.DADOS.getTransacoes().map(essencial).sort(porId);
  expect(depois).toEqual(antes);
  expect(destino.window.DADOS.getConfig().nome).toBe('Ana');
  expect(destino.global('ORCAMENTO').obterLimite('alimentacao')).toBe(800);
  expect(destino.erros).toEqual([]);
});

test('importar o mesmo backup duas vezes não duplica lançamentos', async () => {
  const origem = await abrirPerfil({ transacoes: TRANSACOES });
  const texto = await exportar(origem);
  const destino = await abrirPerfil();
  importar(destino, texto);
  expect(await destino.esperar(() => destino.window.DADOS.getTransacoes().length === 3)).toBe(true);
  const g = gestos(destino);
  importar(destino, texto);
  expect(await destino.esperar(() => /configurações/.test(g.toast()))).toBe(true);
  expect(destino.window.DADOS.getTransacoes()).toHaveLength(3);
});

test('arquivo que não é backup é recusado sem mexer em nada', async () => {
  const destino = await abrirPerfil({ transacoes: [TRANSACOES[0]] });
  const g = gestos(destino);
  importar(destino, '{ isto não é json');
  expect(await destino.esperar(() => /não parece ser um backup/.test(g.toast()))).toBe(true);

  importar(destino, JSON.stringify({ transacoes: [null, { id: 'x', tipo: 'saque', valor: 1, data: '2026-09-01', categoria: 'outro' }] }));
  expect(await destino.esperar(() => /Schema inválido/.test(g.toast()))).toBe(true);
  expect(destino.window.DADOS.getTransacoes()).toHaveLength(1);
});

// Auditoria de integridade (09/10): a restauração gravava lançamento por
// lançamento; uma falha no meio (cota cheia) deixava parte dentro e parte fora,
// e o aviso dizia "Nada foi alterado".
test('restaurar grava os lançamentos numa escrita só; se o disco recusar, nada entra', async () => {
  const origem = await abrirPerfil({ transacoes: TRANSACOES });
  const texto = await exportar(origem);

  const destino = await abrirPerfil({ transacoes: [TRANSACOES[0]] });
  const D = destino.window.DADOS;
  const real = D._storageSetTransacoes;
  let escritas = 0;
  D._storageSetTransacoes = function(lista) { escritas++; return real.call(this, lista); };
  importar(destino, texto);
  expect(await destino.esperar(() => D.getTransacoes().length === 3)).toBe(true);
  expect(escritas).toBe(1);

  const terceiro = await abrirPerfil({ transacoes: [TRANSACOES[0]] });
  const g = gestos(terceiro);
  terceiro.window.DADOS._storageSetTransacoes = function() { throw new Error('QuotaExceededError'); };
  importar(terceiro, texto);
  expect(await terceiro.esperar(() => /Nada foi alterado/.test(g.toast()))).toBe(true);
  expect(terceiro.window.DADOS.getTransacoes().map((t) => t.id)).toEqual(['r1']);
});
