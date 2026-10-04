/**
 * lifecycle-real.test.js — o orquestrador de boot (js/core/lifecycle.js).
 *
 * Achado M4 da reauditoria de 1º/out: o lifecycle, que decide a ordem em que
 * os módulos sobem e o que roda depois do boot (recorrentes, reconciliação da
 * Play, lembretes), estava em 56% dos ramos. Aqui o módulo de produção roda com
 * os imports trocados por dublês no global (viaGlobalDosImports): cada caso
 * monta só o que precisa.
 *
 * Achou que a falha de um módulo crítico nunca interrompia o boot (a marca
 * `critical` se perdia no caminho) — corrigido em lifecycle.js.
 */
const { carregarScript, viaGlobalDosImports } = require('./helpers/carregar-script.cjs');

const { LIFECYCLE, LIFECYCLE_BOOT } = carregarScript('js/core/lifecycle.js', viaGlobalDosImports('js/core/lifecycle.js'));

/** Globais que o boot consulta com `typeof X !== 'undefined'`. */
const GLOBAIS = [
  'DOMUTILS', 'DADOS', 'APP_STORE', 'TRANSACOES', 'ORCAMENTO', 'CATEGORIES', 'AUTO_CATEGORIZER', 'EVENT_INIT',
  'INIT_NAVIGATION', 'INIT_FORM', 'INIT_EXTRATO', 'INIT_CONFIG', 'INSIGHT_ACOES', 'INIT_MODALS', 'METAS', 'INIT_METAS',
  'CONTAS_PAGAR', 'INIT_CONTAS_PAGAR', 'ASSINATURAS', 'INIT_ASSINATURAS', 'PATRIMONIO', 'INIT_PATRIMONIO', 'ANEXOS',
  'INIT_ANEXOS', 'INIT_SIMULADOR', 'BILLING', 'INIT_BILLING', 'INIT_2FA', 'RENDER', 'CONFIG_USER',
  'verificarPinAoAbrir', 'RENDER_CORE', 'SHORTCUTS', 'verificarBackupAutomatico', 'SUPA_AUTH', 'setupAuthUI',
  'setupLogoutButton', 'atualizarBarraSessao', 'ONBOARDING', 'RECORRENTES', 'OBS', 'DAILY_REMINDER', 'ALERTAS',
  'PREVISAO', 'INSIGHTS', 'UTILS',
];

function zerar() {
  LIFECYCLE._modules = new Map();
  LIFECYCLE._initialized = [];
  LIFECYCLE._failed = [];
  LIFECYCLE._hooks = { beforeInit: [], afterInit: [], onError: [] };
  LIFECYCLE._debug = false;
}

let avisos;
let erros;
beforeEach(() => {
  zerar();
  GLOBAIS.forEach((n) => { delete global[n]; });
  delete global.Capacitor;
  avisos = jest.spyOn(console, 'warn').mockImplementation(() => {});
  erros = jest.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => {
  jest.useRealTimers();
  jest.restoreAllMocks();
  document.body.innerHTML = '';
});

/** Roda o init com relógio falso até a promessa assentar. */
async function rodar(promessa) {
  let fim = null;
  promessa.then((v) => { fim = { ok: true, v }; }, (e) => { fim = { ok: false, e }; });
  for (let i = 0; i < 200 && !fim; i++) await jest.advanceTimersByTimeAsync(50);
  return fim;
}

// ─── Registro ───────────────────────────────────────────────────────────────

describe('register', () => {
  test('aplica os padrões e recusa nome repetido', () => {
    expect(LIFECYCLE.register('a', () => {})).toBe(true);
    expect(LIFECYCLE._modules.get('a')).toMatchObject({ depends: [], critical: true, retries: 1, timeout: 5000, initialized: false });
    expect(LIFECYCLE.register('a', () => {})).toBe(false);
    expect(avisos).toHaveBeenCalledWith('[LIFECYCLE] Módulo já registrado:', 'a');
    LIFECYCLE.register('b', () => {}, { critical: false, retries: 3, timeout: 50, depends: ['a'] });
    expect(LIFECYCLE._modules.get('b')).toMatchObject({ depends: ['a'], critical: false, retries: 3, timeout: 50 });
  });

  test('com depuração ligada, registra e conclui em voz alta', async () => {
    LIFECYCLE.setDebug(true);
    LIFECYCLE.register('a', () => {});
    await LIFECYCLE.init();
    const msgs = avisos.mock.calls.map((c) => c.join(' '));
    expect(msgs.some((m) => /Registrado: a/.test(m))).toBe(true);
    expect(msgs.some((m) => /a \(\d+\.\d{2}ms\)/.test(m))).toBe(true);
  });
});

// ─── Ordem e resultado ──────────────────────────────────────────────────────

describe('init', () => {
  test('sobe em ordem de dependência, não de registro, e chama os ganchos', async () => {
    const ordem = [];
    LIFECYCLE.register('ui', () => { ordem.push('ui'); }, { depends: ['negocio'] });
    LIFECYCLE.register('negocio', () => { ordem.push('negocio'); }, { depends: ['base'] });
    LIFECYCLE.register('base', () => { ordem.push('base'); });
    const ganchos = [];
    LIFECYCLE.beforeInit(() => ganchos.push('antes'));
    LIFECYCLE.afterInit(() => ganchos.push('depois'));
    LIFECYCLE.afterInit(() => { throw new Error('gancho quebrado'); });

    const r = await LIFECYCLE.init();
    expect(ordem).toEqual(['base', 'negocio', 'ui']);
    expect(r.success).toEqual(['base', 'negocio', 'ui']);
    expect(r.failed).toEqual([]);
    expect(typeof r.duration).toBe('number');
    expect(ganchos).toEqual(['antes', 'depois']);
    expect(avisos).toHaveBeenCalledWith('[LIFECYCLE] Hook falhou:', expect.any(Error));
    expect(LIFECYCLE.isInitialized('ui')).toBe(true);
    expect(LIFECYCLE.isInitialized('inexistente')).toBe(false);
    expect(LIFECYCLE.getStatus().base).toMatchObject({ initialized: true, attempts: 1, error: null });
  });

  test('init assíncrono espera a promessa', async () => {
    let pronto = false;
    LIFECYCLE.register('a', () => new Promise((ok) => setTimeout(() => { pronto = true; ok(); }, 5)));
    LIFECYCLE.register('b', () => { expect(pronto).toBe(true); }, { depends: ['a'] });
    expect((await LIFECYCLE.init()).success).toEqual(['a', 'b']);
  });

  test('ciclo de dependências recusa o boot', async () => {
    LIFECYCLE.register('a', () => {}, { depends: ['b'] });
    LIFECYCLE.register('b', () => {}, { depends: ['a'] });
    await expect(LIFECYCLE.init()).rejects.toThrow('Ciclo de dependências detectado!');
  });

  // Hoje uma dependência que nunca foi registrada também cai como "ciclo":
  // _resolveOrder não distingue os dois casos. Fica travado para que a mudança
  // seja deliberada.
  test('dependência não registrada também recusa o boot', async () => {
    LIFECYCLE.register('a', () => {}, { depends: ['fantasma'] });
    await expect(LIFECYCLE.init()).rejects.toThrow('Ciclo de dependências detectado!');
  });
});

// ─── Falhas ─────────────────────────────────────────────────────────────────

describe('falhas', () => {
  test('nova tentativa: falha na primeira, sobe na segunda', async () => {
    jest.useFakeTimers();
    let n = 0;
    LIFECYCLE.register('instavel', () => { n++; if (n === 1) throw new Error('rede'); }, { retries: 2 });
    const fim = await rodar(LIFECYCLE.init());
    expect(fim.ok).toBe(true);
    expect(fim.v.success).toEqual(['instavel']);
    expect(LIFECYCLE.getStatus().instavel.attempts).toBe(2);
  });

  test('promessa rejeitada conta como falha; não crítico deixa o resto subir', async () => {
    LIFECYCLE.register('opcional', () => Promise.reject(new Error('sem IDB')), { critical: false });
    LIFECYCLE.register('outro', () => {});
    const r = await LIFECYCLE.init();
    expect(r.success).toEqual(['outro']);
    expect(r.failed).toEqual([{ name: 'opcional', error: 'Falhou após 1 tentativas: sem IDB' }]);
    expect(avisos).toHaveBeenCalledWith('[LIFECYCLE] ✗', 'opcional', '-', 'Falhou após 1 tentativas: sem IDB', '(não crítico)');
  });

  test('tempo esgotado falha o módulo pelo timeout dele', async () => {
    jest.useFakeTimers();
    LIFECYCLE.register('lento', () => new Promise(() => {}), { critical: false, timeout: 30 });
    LIFECYCLE.register('rapido', () => {});
    const fim = await rodar(LIFECYCLE.init());
    expect(fim.v.failed).toEqual([{ name: 'lento', error: 'Falhou após 1 tentativas: Timeout após 30ms' }]);
    expect(fim.v.success).toEqual(['rapido']);
  });

  test('módulo crítico que falha interrompe o boot e avisa quem escuta', async () => {
    const vistos = [];
    LIFECYCLE.onError((d) => vistos.push(d));
    const depois = jest.fn();
    LIFECYCLE.register('dados', () => { throw new Error('IDB corrompido'); });
    LIFECYCLE.register('tela', depois, { critical: false });
    await expect(LIFECYCLE.init()).rejects.toThrow('Falha crítica em dados: Falhou após 1 tentativas: IDB corrompido');
    expect(depois).not.toHaveBeenCalled();
    expect(vistos).toEqual([{ module: 'dados', error: 'Falhou após 1 tentativas: IDB corrompido' }]);
    expect(erros).toHaveBeenCalledWith('[LIFECYCLE] ✗ CRÍTICO:', 'dados', '-', expect.stringMatching(/IDB corrompido/));
  });

  test('dependente de um módulo que falhou: o não crítico só é pulado; o crítico interrompe', async () => {
    LIFECYCLE.register('opcional', () => { throw new Error('x'); }, { critical: false });
    LIFECYCLE.register('usa-opcional', jest.fn(), { depends: ['opcional'], critical: false });
    let r = await LIFECYCLE.init();
    expect(r.failed.map((f) => f.name)).toEqual(['opcional', 'usa-opcional']);
    expect(r.failed[1].error).toBe('Dependência falhou: opcional - Falhou após 1 tentativas: x');

    zerar();
    LIFECYCLE.register('opcional', () => { throw new Error('x'); }, { critical: false });
    LIFECYCLE.register('essencial', jest.fn(), { depends: ['opcional'] });
    await expect(LIFECYCLE.init()).rejects.toThrow(/Falha crítica em essencial: Dependência falhou: opcional/);
  });

  test('_initModule direto: dependência inexistente, ainda não iniciada, já iniciado e nome desconhecido', async () => {
    LIFECYCLE.register('a', () => {}, { depends: ['fantasma'], critical: false });
    await LIFECYCLE._initModule('a');
    expect(LIFECYCLE._failed[0]).toEqual({ name: 'a', error: 'Dependência não existe: fantasma' });

    LIFECYCLE.register('base', () => {});
    LIFECYCLE.register('b', () => {}, { depends: ['base'], critical: false });
    await LIFECYCLE._initModule('b');
    expect(LIFECYCLE._failed[1]).toEqual({ name: 'b', error: 'Dependência não inicializada: base' });

    const init = jest.fn();
    LIFECYCLE.register('c', init);
    await LIFECYCLE._initModule('c');
    await LIFECYCLE._initModule('c');
    expect(init).toHaveBeenCalledTimes(1);
    await expect(LIFECYCLE._initModule('nao-registrado')).resolves.toBeUndefined();

    LIFECYCLE.register('d', () => {}, { depends: ['fantasma'] });
    expect(() => LIFECYCLE._initModule('d')).toThrow(/Falha crítica em d: Dependência não existe/);
  });
});

// ─── Registros padrão do app ────────────────────────────────────────────────

describe('LIFECYCLE_BOOT.registerDefaults', () => {
  function app() {
    const g = {};
    const spy = (nome, metodos) => {
      g[nome] = {};
      metodos.forEach((m) => { g[nome][m] = jest.fn(); });
      global[nome] = g[nome];
    };
    spy('DOMUTILS', ['init']);
    spy('DADOS', ['init', 'getConfig', 'salvarConfig']);
    g.DADOS.init.mockResolvedValue();
    g.DADOS.getConfig.mockReturnValue({ _migracaoPinV2: true });
    ['APP_STORE', 'TRANSACOES', 'ORCAMENTO', 'CATEGORIES', 'AUTO_CATEGORIZER', 'INIT_FORM', 'INIT_EXTRATO', 'INIT_CONFIG',
      'INSIGHT_ACOES', 'INIT_MODALS', 'METAS', 'INIT_METAS', 'INIT_CONTAS_PAGAR', 'ASSINATURAS', 'INIT_ASSINATURAS',
      'PATRIMONIO', 'INIT_PATRIMONIO', 'ANEXOS', 'INIT_ANEXOS', 'INIT_SIMULADOR', 'INIT_2FA',
      'RENDER', 'SHORTCUTS', 'ALERTAS', 'PREVISAO'].forEach((n) => spy(n, ['init']));
    spy('EVENT_INIT', ['setup']);
    spy('INIT_NAVIGATION', ['init', 'carregarChunkConta']);
    spy('CONTAS_PAGAR', ['init', 'notificarVencimentos']);
    spy('BILLING', ['init', 'isCloudUser']);
    spy('INIT_BILLING', ['init', '_reconciliarPlay']);
    spy('CONFIG_USER', ['aplicarTema']);
    spy('RENDER_CORE', ['connectToStore']);
    spy('SUPA_AUTH', ['isActive']);
    spy('ONBOARDING', ['iniciar']);
    spy('RECORRENTES', ['processarNaAbertura']);
    spy('OBS', ['captureError', 'contarSessao']);
    spy('DAILY_REMINDER', ['maybeRemind']);
    spy('INSIGHTS', ['mostrarOrcamento']);
    spy('UTILS', ['mostrarToast']);
    ['verificarPinAoAbrir', 'verificarBackupAutomatico', 'setupAuthUI', 'setupLogoutButton', 'atualizarBarraSessao']
      .forEach((n) => { g[n] = jest.fn(); global[n] = g[n]; });
    return g;
  }

  test('com o app inteiro: cada módulo sobe uma vez, e o pós-boot agenda o resto', async () => {
    jest.useFakeTimers();
    document.body.innerHTML = '<input id="novo-data"><section id="secao-alertas-painel"></section><button id="btn-fechar-alertas"></button>';
    const g = app();
    g.SUPA_AUTH.isActive.mockReturnValue(true);
    g.RECORRENTES.processarNaAbertura.mockImplementation(() => { throw new Error('recorrente quebrada'); });
    g.BILLING.isCloudUser.mockReturnValue(true);
    global.Capacitor = { isNativePlatform: () => true };
    window.Capacitor = global.Capacitor;
    g.INIT_NAVIGATION.carregarChunkConta.mockImplementation((cb) => cb());

    LIFECYCLE_BOOT.registerDefaults();
    const fim = await rodar(LIFECYCLE.init());
    expect(fim.ok).toBe(true);
    expect(fim.v.failed).toEqual([]);

    ['DOMUTILS', 'DADOS', 'APP_STORE', 'TRANSACOES', 'ORCAMENTO', 'CATEGORIES', 'INIT_NAVIGATION', 'INIT_FORM',
      'INIT_BILLING', 'RENDER', 'SHORTCUTS', 'ALERTAS', 'PREVISAO'].forEach((n) => {
      expect({ n, vezes: g[n].init.mock.calls.length }).toEqual({ n, vezes: 1 });
    });
    expect(g.EVENT_INIT.setup).toHaveBeenCalledTimes(1);
    expect(g.CONFIG_USER.aplicarTema).toHaveBeenCalled();
    expect(g.verificarPinAoAbrir).toHaveBeenCalled();
    expect(g.RENDER_CORE.connectToStore).toHaveBeenCalled();
    expect(document.getElementById('novo-data').value).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(g.DADOS.salvarConfig).toHaveBeenCalledWith({ _migracaoPinV2: false });
    expect(g.setupAuthUI).toHaveBeenCalled();
    expect(g.setupLogoutButton).toHaveBeenCalled();
    expect(g.atualizarBarraSessao).toHaveBeenCalled();
    expect(g.verificarBackupAutomatico).toHaveBeenCalled();
    // Recorrente quebrada não derruba o boot: vai para os relatórios de erro.
    expect(g.OBS.captureError).toHaveBeenCalledWith(expect.any(Error), { contexto: 'lifecycle.recorrentes' });
    expect(g.OBS.contarSessao).toHaveBeenCalled();

    // Agendados: insights 200 ms, onboarding 400, aviso do PIN 1 s,
    // lembretes 2,5 s e reconciliação da Play 2,8 s.
    expect(g.ONBOARDING.iniciar).not.toHaveBeenCalled();
    await jest.advanceTimersByTimeAsync(3000);
    expect(g.INSIGHTS.mostrarOrcamento).toHaveBeenCalled();
    expect(g.ONBOARDING.iniciar).toHaveBeenCalled();
    expect(g.UTILS.mostrarToast).toHaveBeenCalledWith(expect.stringMatching(/Recrie seu PIN/), 'warning');
    expect(g.DAILY_REMINDER.maybeRemind).toHaveBeenCalled();
    expect(g.CONTAS_PAGAR.notificarVencimentos).toHaveBeenCalled();
    expect(g.INIT_BILLING._reconciliarPlay).toHaveBeenCalledWith({ force: true });

    document.getElementById('btn-fechar-alertas').click();
    expect(document.getElementById('secao-alertas-painel').style.display).toBe('none');
    delete window.Capacitor;
  });

  test('reconciliação da Play só no aparelho e na nuvem; erro nela vai para os relatórios', async () => {
    const casos = [
      { nuvem: false, nativo: true, reconcilia: false },
      { nuvem: true, nativo: false, reconcilia: false },
      { nuvem: true, nativo: true, reconcilia: true, quebra: true },
    ];
    for (const c of casos) {
      zerar();
      jest.useFakeTimers();
      const g = app();
      g.DADOS.getConfig.mockReturnValue({});
      g.BILLING.isCloudUser.mockReturnValue(c.nuvem);
      window.Capacitor = { isNativePlatform: () => c.nativo };
      if (c.quebra) g.INIT_NAVIGATION.carregarChunkConta.mockImplementation(() => { throw new Error('chunk'); });
      LIFECYCLE_BOOT.registerDefaults();
      await rodar(LIFECYCLE.init());
      await jest.advanceTimersByTimeAsync(3000);
      expect(g.INIT_NAVIGATION.carregarChunkConta.mock.calls.length > 0).toBe(c.reconcilia);
      if (c.quebra) expect(g.OBS.captureError).toHaveBeenCalledWith(expect.any(Error), { contexto: 'lifecycle.play-reconcile-boot' });
      expect(g.UTILS.mostrarToast).not.toHaveBeenCalled(); // sem migração de PIN pendente
      expect(g.setupAuthUI).not.toHaveBeenCalled(); // SUPA_AUTH inativo
      jest.useRealTimers();
    }
    delete window.Capacitor;
  });

  test('DADOS.init falhando interrompe o boot: o app não abre pela metade', async () => {
    jest.useFakeTimers();
    const g = app();
    g.DADOS.init.mockRejectedValue(new Error('quota'));
    LIFECYCLE_BOOT.registerDefaults();
    const fim = await rodar(LIFECYCLE.init());
    expect(fim.ok).toBe(false);
    expect(fim.e.message).toMatch(/Falha crítica em dados/);
    expect(g.RENDER.init).not.toHaveBeenCalled();
    expect(g.TRANSACOES.init).not.toHaveBeenCalled();
  });
});
