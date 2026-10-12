/**
 * salvar-arquivo.test.js — UTILS.salvarArquivo entrega CSV, backup e relatório.
 *
 * Achado da auditoria de exportação de 11/10: no APK o WebView do Capacitor
 * ignora o <a download> (não há DownloadListener), então nada era salvo, mas o
 * app dizia "Backup exportado" e marcava o backup como feito, calando o
 * lembrete. No nativo o arquivo vai para o cache e abre a folha de
 * compartilhar; o resultado diz se o arquivo de fato saiu.
 */
const { loadCoreModules } = require('./load-sources');

loadCoreModules();

const U = () => global.UTILS;

function capacitorNativo(plugins) {
  window.Capacitor = { isNativePlatform: () => true, Plugins: plugins };
}

afterEach(() => { delete window.Capacitor; });

describe('UTILS.salvarArquivo', () => {
  // O caminho do navegador (<a download>) é coberto por app-extrato-acoes.test.js.

  test('no APK grava no cache e abre a folha de compartilhar', async () => {
    const gravado = [];
    const compartilhado = [];
    capacitorNativo({
      Filesystem: { writeFile: async (o) => { gravado.push(o); return { uri: 'file:///cache/' + o.path }; } },
      Share: { share: async (o) => { compartilhado.push(o); return {}; } },
    });
    const r = await U().salvarArquivo('backup.json', '{"a":1}', 'application/json', 'Backup');
    expect(r).toEqual({ ok: true });
    expect(gravado[0]).toMatchObject({ path: 'backup.json', data: '{"a":1}', directory: 'CACHE', encoding: 'utf8' });
    expect(compartilhado[0]).toMatchObject({ title: 'Backup', files: ['file:///cache/backup.json'] });
  });

  test('fechar a folha de compartilhar não conta como salvo', async () => {
    capacitorNativo({
      Filesystem: { writeFile: async () => ({ uri: 'file:///c/x' }) },
      Share: { share: async () => { throw new Error('Share canceled'); } },
    });
    expect(await U().salvarArquivo('x.csv', 'a')).toEqual({ ok: false, cancelado: true });
  });

  test('sem os plugins nativos não finge que salvou', async () => {
    capacitorNativo({});
    const r = await U().salvarArquivo('x.csv', 'a');
    expect(r.ok).toBe(false);
  });
});
