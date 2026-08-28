/**
 * auditoria-melhorias.test.js — melhorias pós-auditoria de usuários virtuais
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const dadosSrc = fs.readFileSync(path.join(root, 'js', 'core', 'dados.js'), 'utf8');
const extratoSrc = fs.readFileSync(path.join(root, 'js', 'modules', 'init-extrato.js'), 'utf8');
const navSrc = fs.readFileSync(path.join(root, 'js', 'modules', 'init-navigation.js'), 'utf8');
const dashSrc = fs.readFileSync(path.join(root, 'js', 'render-dashboard.js'), 'utf8');

function carregarDadosReal(extra) {
  const sandbox = Object.assign({
    window: global.window,
    document: global.document,
    localStorage: global.localStorage,
    console: global.console,
    setTimeout: (...a) => global.setTimeout(...a),
    clearTimeout: (...a) => global.clearTimeout(...a),
    fetch: (...a) => global.fetch(...a),
    UTILS: { mostrarToast: () => {}, mostrarBanner: () => {}, gerarId: () => 'id' },
  }, extra || {});
  sandbox.globalThis = sandbox;
  const ctx = vm.createContext(sandbox);
  for (const rel of ['js/core/config.js', 'js/core/dados.js']) {
    const file = path.join(root, rel);
    vm.runInContext(fs.readFileSync(file, 'utf8'), ctx, { filename: file });
  }
  return sandbox;
}

describe('auditoria — sync multi-aba', function() {
  test('DADOS.init liga setupStorageSync', function() {
    expect(dadosSrc).toMatch(/this\.setupStorageSync\(\)/);
    expect(dadosSrc).toMatch(/_storageSyncBound/);
  });

  test('setupStorageSync observa transações, config e contas', function() {
    expect(dadosSrc).toMatch(/CONFIG\.STORAGE_CONTAS/);
    expect(dadosSrc).toMatch(/fp-banner-multiaba/);
  });

  test('setupStorageSync registra listener apenas uma vez', function() {
    const win = { addEventListener: jest.fn() };
    const sandbox = carregarDadosReal({ window: win });
    const D = sandbox.DADOS;
    D.setupStorageSync();
    D.setupStorageSync();
    expect(D._storageSyncBound).toBe(true);
    expect(win.addEventListener).toHaveBeenCalledTimes(1);
  });
});

describe('auditoria — cota com banner exportável', function() {
  let sandbox;
  let banners;

  beforeEach(function() {
    banners = [];
    sandbox = carregarDadosReal({
      CONFIG_USER: { exportarDados: jest.fn() },
    });
    sandbox.UTILS.mostrarBanner = (opts) => banners.push(opts);
    sandbox.UTILS.mostrarToast = () => {};
    sandbox.DADOS._avisouCota = false;
    sandbox.localStorage.clear();
  });

  test('verificarCota aciona banner com ação de exportar', function() {
    sandbox.localStorage.setItem('dados', 'x'.repeat(5000));
    const bytes = sandbox.DADOS.usoArmazenamento().bytes;
    sandbox.DADOS.LIMITE_STORAGE_BYTES = Math.round(bytes / 0.9);

    sandbox.DADOS.verificarCota();

    expect(banners).toHaveLength(1);
    expect(banners[0].id).toBe('fp-banner-cota');
    expect(banners[0].acao).toMatch(/backup/i);
    banners[0].onAcao();
    expect(sandbox.CONFIG_USER.exportarDados).toHaveBeenCalled();
  });
});

describe('auditoria — transferência no Novo', function() {
  test('markup expõe CTA de transferência na aba Novo', function() {
    const novo = html.match(/id="aba-novo"[\s\S]*?<\/div>\s*<!-- ABA 3: EXTRATO -->/);
    expect(novo).toBeTruthy();
    expect(novo[0]).toMatch(/data-action="conta-transferir"/);
    expect(novo[0]).toMatch(/Transferir entre contas/);
  });

  test('init-navigation roteia conta-transferir', function() {
    expect(navSrc).toMatch(/'conta-transferir':\s*function/);
    expect(navSrc).toMatch(/CONTAS\.abrirFormTransferencia/);
  });
});

describe('auditoria — extrato mais claro', function() {
  test('contador Mostrando X de Y no markup e no módulo', function() {
    expect(html).toMatch(/id="extrato-lista-meta"/);
    expect(extratoSrc).toMatch(/_atualizarContadorExtrato/);
    expect(extratoSrc).toMatch(/Mostrando .* de .* transações/);
  });

  test('hint de ordenação no markup e sincronizado na UI', function() {
    expect(html).toMatch(/id="ordenacao-hint"/);
    expect(extratoSrc).toMatch(/ordenacao-hint/);
  });
});

describe('auditoria — saldo realizado vs projetado', function() {
  test('dashboard explica realizado e projetado', function() {
    expect(dashSrc).toMatch(/Saldo do mês \(realizado\)/);
    expect(dashSrc).toMatch(/Projetado no mês/);
    expect(dashSrc).toMatch(/title/);
  });
});

describe('auditoria — fase 2 (roadmap)', function() {
  const formSrc = fs.readFileSync(path.join(root, 'js', 'modules', 'init-form.js'), 'utf8');
  const htmlFresh = fs.readFileSync(path.join(root, 'index.html'), 'utf8');

  test('edição de transação oferece desfazer por 5s', function() {
    expect(formSrc).toMatch(/agendarExclusao\('edit-tx-'/);
    expect(formSrc).toMatch(/Alteração salva/);
    expect(formSrc).toMatch(/snapshot/);
  });

  test('extrato limita renderização e usa observer para carregar mais', function() {
    expect(extratoSrc).toMatch(/maxRendered:\s*500/);
    expect(extratoSrc).toMatch(/_vincularCarregarMaisObserver/);
    expect(extratoSrc).toMatch(/extrato-lista-limite/);
  });

  test('multi-aba documentado no perfil e na inicialização', function() {
    expect(dadosSrc).toMatch(/_mostrarDicaMultiAba/);
    expect(htmlFresh).toMatch(/perfil-dica-multiaba/);
  });

  test('dashboard onboarding para usuário casual', function() {
    expect(htmlFresh).toMatch(/id="dashboard-onboarding"/);
    expect(dashSrc).toMatch(/renderOnboarding/);
    expect(dashSrc).toMatch(/Registrar primeira transação/);
  });
});
