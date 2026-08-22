/**
 * tema-real.test.js — resolução do tema claro/escuro.
 *
 * O que precisa valer: a escolha explícita do usuário sempre vence, e a
 * ausência de escolha segue a preferência do sistema. Errar para o lado errado
 * significa entregar tela branca a quem configurou o celular em modo escuro —
 * ou pior, ignorar a escolha manual e trocar o tema por conta própria.
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.join(__dirname, '..');

/** Carrega config-user.js num contexto com DADOS e matchMedia controlados. */
function carregar({ tema, sistemaEscuro = false, semMatchMedia = false }) {
  const config = tema === undefined ? {} : { tema };
  const chamadas = { salvas: [], listeners: [] };

  const janela = semMatchMedia ? {} : {
    matchMedia(consulta) {
      return {
        matches: consulta.includes('dark') ? sistemaEscuro : false,
        addEventListener: (_e, fn) => chamadas.listeners.push(fn),
        addListener: (fn) => chamadas.listeners.push(fn),
      };
    },
  };

  const html = { attrs: {}, classes: new Set() };
  const documento = {
    documentElement: {
      setAttribute: (k, v) => { html.attrs[k] = v; },
      removeAttribute: (k) => { delete html.attrs[k]; },
      classList: { add: (c) => html.classes.add(c) },
    },
    getElementById: () => null,
  };

  const sandbox = {
    window: janela,
    document: documento,
    console,
    DADOS: {
      getConfig: () => config,
      salvarConfig: (patch) => { Object.assign(config, patch); chamadas.salvas.push(patch); },
    },
    UTILS: { mostrarToast: () => {} },
    TRANSACOES: {}, ORCAMENTO: {}, fpConfirm: () => {},
  };
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);

  const file = path.join(root, 'js', 'config-user.js');
  vm.runInContext(fs.readFileSync(file, 'utf8'), sandbox, { filename: file });

  return { CONFIG_USER: sandbox.CONFIG_USER, html, config, chamadas };
}

describe('CONFIG_USER.temaEfetivo', () => {
  test('escolha explícita "dark" vence a preferência clara do sistema', () => {
    const { CONFIG_USER } = carregar({ tema: 'dark', sistemaEscuro: false });
    expect(CONFIG_USER.temaEfetivo()).toBe('dark');
  });

  test('escolha explícita "light" vence a preferência escura do sistema', () => {
    // O caso que mais importa: quem escolheu claro de propósito não pode ter o
    // tema trocado porque o celular está em modo escuro.
    const { CONFIG_USER } = carregar({ tema: 'light', sistemaEscuro: true });
    expect(CONFIG_USER.temaEfetivo()).toBe('light');
  });

  test('sem escolha, segue o sistema em modo escuro', () => {
    const { CONFIG_USER } = carregar({ tema: undefined, sistemaEscuro: true });
    expect(CONFIG_USER.temaEfetivo()).toBe('dark');
  });

  test('sem escolha, segue o sistema em modo claro', () => {
    const { CONFIG_USER } = carregar({ tema: undefined, sistemaEscuro: false });
    expect(CONFIG_USER.temaEfetivo()).toBe('light');
  });

  test('valor inválido em config é tratado como ausência de escolha', () => {
    const { CONFIG_USER } = carregar({ tema: 'roxo', sistemaEscuro: true });
    expect(CONFIG_USER.temaEfetivo()).toBe('dark');
  });

  test('sem matchMedia cai no tema claro em vez de quebrar', () => {
    // WebView antiga do Android não expõe matchMedia.
    const { CONFIG_USER } = carregar({ tema: undefined, semMatchMedia: true });
    expect(CONFIG_USER.temaEfetivo()).toBe('light');
  });
});

describe('CONFIG_USER.aplicarTema', () => {
  test('modo escuro marca data-theme no html', () => {
    const { CONFIG_USER, html } = carregar({ tema: 'dark' });
    CONFIG_USER.aplicarTema();
    expect(html.attrs['data-theme']).toBe('dark');
  });

  test('modo claro remove o atributo', () => {
    const { CONFIG_USER, html } = carregar({ tema: 'light' });
    html.attrs['data-theme'] = 'dark';
    CONFIG_USER.aplicarTema();
    expect(html.attrs['data-theme']).toBeUndefined();
  });

  test('sistema escuro sem escolha do usuário já aplica o tema', () => {
    const { CONFIG_USER, html } = carregar({ tema: undefined, sistemaEscuro: true });
    CONFIG_USER.aplicarTema();
    expect(html.attrs['data-theme']).toBe('dark');
  });
});

describe('CONFIG_USER.toggleTema', () => {
  test('primeiro toggle a partir do sistema grava a escolha explícita', () => {
    const { CONFIG_USER, config } = carregar({ tema: undefined, sistemaEscuro: true });
    CONFIG_USER.toggleTema();

    // Estava escuro por herança do sistema → vira claro, agora explícito.
    expect(config.tema).toBe('light');
  });

  test('alterna entre os dois temas', () => {
    const { CONFIG_USER, config } = carregar({ tema: 'light' });
    CONFIG_USER.toggleTema();
    expect(config.tema).toBe('dark');
    CONFIG_USER.toggleTema();
    expect(config.tema).toBe('light');
  });
});

describe('CONFIG_USER.observarTemaDoSistema', () => {
  test('registra listener de mudança do sistema', () => {
    const { CONFIG_USER, chamadas } = carregar({ tema: undefined });
    CONFIG_USER.observarTemaDoSistema();
    expect(chamadas.listeners.length).toBeGreaterThan(0);
  });

  test('não registra duas vezes', () => {
    const { CONFIG_USER, chamadas } = carregar({ tema: undefined });
    CONFIG_USER.observarTemaDoSistema();
    CONFIG_USER.observarTemaDoSistema();
    expect(chamadas.listeners.length).toBe(1);
  });

  test('mudança no sistema não sobrescreve escolha explícita', () => {
    const { CONFIG_USER, chamadas, html } = carregar({ tema: 'light', sistemaEscuro: true });
    CONFIG_USER.observarTemaDoSistema();

    chamadas.listeners.forEach(fn => fn());

    expect(html.attrs['data-theme']).toBeUndefined();
  });

  test('sem matchMedia não lança', () => {
    const { CONFIG_USER } = carregar({ tema: undefined, semMatchMedia: true });
    expect(() => CONFIG_USER.observarTemaDoSistema()).not.toThrow();
  });
});

describe('tema antes do primeiro paint', () => {
  const guard = fs.readFileSync(path.join(root, 'js', 'pin-guard.js'), 'utf8');

  test('pin-guard resolve o tema — evita flash branco', () => {
    // Um <script> inline seria o caminho usual, mas a CSP é script-src 'self'.
    expect(guard).toMatch(/prefers-color-scheme: dark/);
    expect(guard).toMatch(/setAttribute\('data-theme', 'dark'\)/);
  });

  test('pin-guard aplica a mesma regra do temaEfetivo', () => {
    // As duas implementações precisam concordar: se divergirem, o tema pisca
    // ao trocar do valor do guard para o do módulo.
    expect(guard).toMatch(/cfg\.tema === 'dark' \|\| cfg\.tema === 'light'/);
  });

  test('pin-guard é carregado de forma bloqueante no head', () => {
    const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
    const tag = html.match(/<script[^>]*pin-guard\.js[^>]*>/);

    expect(tag).not.toBeNull();
    expect(tag[0]).not.toMatch(/\b(defer|async)\b/);
  });
});
