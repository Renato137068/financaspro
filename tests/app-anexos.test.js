/**
 * app-anexos.test.js — comprovantes anexados no Novo lançamento, com o app inteiro.
 * @jest-environment node
 *
 * Achado M2 da reauditoria de 30/09: a UI de anexos chega no chunk 'anexos'
 * e anexos.js estava em 32% — só validação e base64 tinham teste, porque o
 * armazenamento é IndexedDB, que o jsdom não traz. Aqui a janela ganha um
 * IndexedDB em memória (fake-indexeddb, um por teste) e o fluxo roda de ponta
 * a ponta: escolher arquivo → salvar o lançamento → gravar no banco → ver e
 * remover pelo visualizador.
 */
const { IDBFactory, IDBKeyRange } = require('fake-indexeddb');
const { subirApp } = require('./helpers/app-jsdom.cjs');
const { gestos, tique } = require('./helpers/ui-app.cjs');

let app;
afterEach(() => { if (app) app.fechar(); app = null; });

async function abrirNovo(opts) {
  app = await subirApp({
    ...(opts || {}),
    antesDoBoot: (w) => { w.indexedDB = new IDBFactory(); w.IDBKeyRange = IDBKeyRange; },
  });
  const g = gestos(app);
  g.w.mudarAba('novo');
  await app.esperar(() => g.w.INIT_ANEXOS && g.w.INIT_ANEXOS._bound);
  await app.esperar(() => g.w.ANEXOS._db);
  return g;
}

function escolherArquivos(g, arquivos) {
  const input = g.d.getElementById('anexo-file-input');
  Object.defineProperty(input, 'files', { value: arquivos, configurable: true });
  input.dispatchEvent(new g.w.Event('change', { bubbles: true }));
}

const arquivo = (g, nome, tipo, bytes) => new g.w.File([new Uint8Array(bytes || 64)], nome, { type: tipo });
const chips = (g, tipo) => [...g.d.querySelectorAll('#anexo-preview-list .anexo-chip--' + tipo + ' span')].map((s) => s.textContent);

function salvarLancamento(g, valor, descricao) {
  g.preencher('novo-valor', valor);
  g.preencher('novo-descricao', descricao);
  g.d.getElementById('form-transacao').dispatchEvent(new g.w.Event('submit', { bubbles: true, cancelable: true }));
}

test('escolher arquivos: válidos viram pendentes, tipo errado e grande demais são recusados com aviso', async () => {
  const g = await abrirNovo();
  expect(g.d.getElementById('anexo-preview-list').textContent).toMatch(/Nenhum comprovante anexado|^$/);
  escolherArquivos(g, [arquivo(g, 'nota.pdf', 'application/pdf')]);
  escolherArquivos(g, [arquivo(g, 'virus.exe', 'application/x-msdownload')]);
  expect(g.toast()).toMatch(/imagem|PDF/);
  escolherArquivos(g, [arquivo(g, 'foto.png', 'image/png', 3 * 1024 * 1024)]);
  expect(g.toast()).toMatch(/2 MB/);
  expect(chips(g, 'pendente')).toEqual(['nota.pdf']);

  g.clicar('[data-action="anexo-remover-pendente"][data-idx="0"]');
  expect(chips(g, 'pendente')).toEqual([]);
  expect(app.erros).toEqual([]);
});

test('no máximo três comprovantes por lançamento', async () => {
  const g = await abrirNovo();
  escolherArquivos(g, [1, 2, 3, 4].map((i) => arquivo(g, `r${i}.jpg`, 'image/jpeg')));
  expect(chips(g, 'pendente')).toEqual(['r1.jpg', 'r2.jpg', 'r3.jpg']);
  expect(g.toast()).toMatch(/Máximo de 3 anexos/);
});

test('salvar o lançamento grava os anexos no IndexedDB e o extrato mostra o clipe', async () => {
  const g = await abrirNovo();
  escolherArquivos(g, [arquivo(g, 'cupom.jpg', 'image/jpeg', 2048), arquivo(g, 'nota.pdf', 'application/pdf', 4096)]);
  salvarLancamento(g, '87,40', 'Farmácia');
  await app.esperar(() => g.w.DADOS.getTransacoes().length === 1);
  const tx = g.w.DADOS.getTransacoes()[0];
  await app.esperar(() => /Comprovante anexado/.test(g.toast()), 3000);

  const meta = await g.w.ANEXOS.listarMeta(tx.id);
  expect(meta.map((a) => [a.nome, a.mimeType, a.tamanho])).toEqual(expect.arrayContaining([
    ['cupom.jpg', 'image/jpeg', 2048], ['nota.pdf', 'application/pdf', 4096],
  ]));
  const reg = await g.w.ANEXOS.obter(meta[0].id);
  expect(reg.blob.byteLength).toBe(meta[0].tamanho);
  await app.esperar(() => g.w.DADOS.getTransacoes()[0].anexoCount === 2);

  // O extrato ganha o botão de ver comprovantes, que abre o visualizador
  // sem abrir a edição do lançamento.
  g.w.mudarAba('extrato');
  const botao = `.ext-tx .btn-anexo[data-transacao-id="${tx.id}"]`;
  await app.esperar(() => g.d.querySelector(botao), 4000);
  expect(g.d.querySelector(botao).getAttribute('aria-label')).toBe('Ver comprovante (2)');
  g.clicar(botao);
  await app.esperar(() => g.d.querySelector('.anexo-viewer-list'));
  const itens = [...g.d.querySelectorAll('.anexo-viewer-item span')].map((s) => s.textContent);
  expect(itens).toEqual(expect.arrayContaining(['cupom.jpg', 'nota.pdf']));
  expect(g.d.querySelector('.anexo-viewer-list').textContent).toMatch(/2 KB/);
  expect(app.erros).toEqual([]);
});

test('extrato aberto antes do chunk de anexos: o clique no clipe carrega o chunk e abre o visualizador', async () => {
  const hoje = new Date().toISOString().slice(0, 10);
  app = await subirApp({
    transacoes: [{ id: 'tx1', tipo: 'despesa', valor: 30, data: hoje, categoria: 'outro', descricao: 'Táxi', anexoCount: 1 }],
    antesDoBoot: (w) => { w.indexedDB = new IDBFactory(); w.IDBKeyRange = IDBKeyRange; },
  });
  const g = gestos(app);
  g.w.mudarAba('extrato');
  await app.esperar(() => g.d.querySelector('.ext-tx .btn-anexo[data-transacao-id="tx1"]'), 4000);
  expect(g.w.INIT_ANEXOS).toBeUndefined();
  g.clicar('.ext-tx .btn-anexo[data-transacao-id="tx1"]');
  await app.esperar(() => g.w.INIT_ANEXOS && /Nenhum anexo nesta transação/.test(g.toast()), 4000);
  expect(g.toast()).toMatch(/Nenhum anexo nesta transação/);
  // Não abriu a edição do lançamento por baixo.
  expect(g.d.getElementById('aba-novo').classList.contains('ativo')).toBe(false);
});

test('abrir comprovante: imagem abre num modal; PDF numa aba nova', async () => {
  const g = await abrirNovo();
  escolherArquivos(g, [arquivo(g, 'cupom.png', 'image/png'), arquivo(g, 'nota.pdf', 'application/pdf')]);
  salvarLancamento(g, '10,00', 'Padaria');
  await app.esperar(() => g.w.DADOS.getTransacoes().length === 1);
  const tx = g.w.DADOS.getTransacoes()[0];
  await app.esperar(() => /Comprovante anexado/.test(g.toast()), 3000);
  const meta = await g.w.ANEXOS.listarMeta(tx.id);
  expect(meta).toHaveLength(2);

  const urls = [];
  g.w.URL.createObjectURL = () => { const u = 'blob:teste/' + urls.length; urls.push(u); return u; };
  g.w.URL.revokeObjectURL = () => {};
  const abertos = [];
  g.w.open = (u) => { abertos.push(u); return null; };

  g.w.INIT_ANEXOS._mostrarModal(meta);
  const img = meta.find((a) => a.mimeType === 'image/png');
  const pdf = meta.find((a) => a.mimeType === 'application/pdf');
  g.clicar(`[data-action="anexo-abrir"][data-anexo-id="${img.id}"]`);
  await app.esperar(() => g.d.querySelector('.anexo-img-wrap img'));
  expect(g.d.querySelector('.anexo-img-wrap img').getAttribute('alt')).toBe('cupom.png');

  g.w.INIT_ANEXOS._mostrarModal(meta);
  g.clicar(`[data-action="anexo-abrir"][data-anexo-id="${pdf.id}"]`);
  await app.esperar(() => abertos.length === 1);
  expect(abertos[0]).toMatch(/^blob:teste\//);
});

test('editar lançamento: carrega os anexos salvos, e remover um apaga do banco', async () => {
  const g = await abrirNovo();
  escolherArquivos(g, [arquivo(g, 'a.jpg', 'image/jpeg'), arquivo(g, 'b.jpg', 'image/jpeg')]);
  salvarLancamento(g, '50,00', 'Mercado');
  await app.esperar(() => g.w.DADOS.getTransacoes().length === 1);
  const tx = g.w.DADOS.getTransacoes()[0];
  await app.esperar(() => /Comprovante anexado/.test(g.toast()), 3000);

  g.w.INIT_ANEXOS.carregarParaTransacao(tx.id);
  await app.esperar(() => chips(g, 'salvo').length === 2);
  const alvo = g.d.querySelector('[data-action="anexo-remover-salvo"]');
  g.clicar(alvo);
  await app.esperar(() => chips(g, 'salvo').length === 1);
  expect((await g.w.ANEXOS.listarMeta(tx.id))).toHaveLength(1);
  expect(g.toast()).toMatch(/Anexo removido/);

  g.w.INIT_ANEXOS.limparPendentes();
  expect(chips(g, 'salvo')).toEqual([]);
});

test('visualizador de lançamento sem anexo avisa em vez de abrir modal vazio', async () => {
  const g = await abrirNovo();
  g.w.INIT_ANEXOS.abrirVisualizador('nao-existe');
  await tique(30);
  expect(g.toast()).toMatch(/Nenhum anexo nesta transação/);
  expect(g.modal()).toBeNull();
});

// ─── Backup e cifra ─────────────────────────────────────────────────────────

async function comDoisAnexos() {
  const g = await abrirNovo();
  escolherArquivos(g, [arquivo(g, 'cupom.jpg', 'image/jpeg', 300), arquivo(g, 'nota.pdf', 'application/pdf', 500)]);
  salvarLancamento(g, '42,00', 'Farmácia');
  await app.esperar(() => g.w.DADOS.getTransacoes().length === 1);
  await app.esperar(() => /Comprovante anexado/.test(g.toast()), 3000);
  return { g, tx: g.w.DADOS.getTransacoes()[0] };
}

test('backup: exporta em base64 e importa de volta, recusando itens adulterados', async () => {
  const { g, tx } = await comDoisAnexos();
  const exportados = await g.w.ANEXOS.exportarTodos();
  expect(exportados.map((a) => [a.nome, a.tamanho, typeof a.dadosBase64])).toEqual(expect.arrayContaining([
    ['cupom.jpg', 300, 'string'], ['nota.pdf', 500, 'string'],
  ]));
  expect(atob(exportados[0].dadosBase64)).toHaveLength(exportados[0].tamanho);

  const adulterados = [
    ...exportados,
    { transacaoId: tx.id, nome: 'x.exe', mimeType: 'application/x-msdownload', tamanho: 10, dadosBase64: 'AAAA' },
    { transacaoId: tx.id, nome: 'grande.png', mimeType: 'image/png', tamanho: 3 * 1024 * 1024, dadosBase64: 'AAAA' },
    { nome: 'sem-dono.png', mimeType: 'image/png', tamanho: 3, dadosBase64: 'AAAA' },
  ];
  const n = await g.w.ANEXOS.importarTodos(adulterados);
  expect(n).toBe(2);
  const depois = await g.w.ANEXOS.listarMeta(tx.id);
  expect(depois.map((a) => a.nome).sort()).toEqual(['cupom.jpg', 'nota.pdf']);
  expect(g.w.DADOS.getTransacoes()[0].anexoCount).toBe(2);
  const reg = await g.w.ANEXOS.obter(depois.find((a) => a.nome === 'cupom.jpg').id);
  expect(reg.blob.byteLength).toBe(300);
});

test('"cifrar dados" ligado: o comprovante fica cifrado no IndexedDB e continua abrindo; desligar volta ao claro', async () => {
  const { g, tx } = await comDoisAnexos();
  const cru = async () => {
    const db = g.w.ANEXOS._db;
    return new Promise((ok) => {
      const req = db.transaction('anexos', 'readonly').objectStore('anexos').getAll();
      req.onsuccess = () => ok(req.result);
    });
  };
  await g.w.DADOS.aplicarCriptografia(true);
  const cifrados = await cru();
  expect(cifrados.every((r) => r.encrypted && r.blob === null && typeof r.encryptedPayload === 'string')).toBe(true);
  const meta = await g.w.ANEXOS.listarMeta(tx.id);
  const aberto = await g.w.ANEXOS.obter(meta[0].id);
  expect(aberto.blob.byteLength).toBe(meta[0].tamanho);

  await g.w.DADOS.aplicarCriptografia(false);
  const claros = await cru();
  expect(claros.every((r) => !r.encrypted && r.blob && r.blob.byteLength > 0)).toBe(true);
});

test('excluir o lançamento leva os comprovantes junto', async () => {
  const { g, tx } = await comDoisAnexos();
  await g.w.ANEXOS.excluirPorTransacao(tx.id);
  expect(await g.w.ANEXOS.listarMeta(tx.id)).toEqual([]);
});
