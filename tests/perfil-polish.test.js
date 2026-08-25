/**
 * perfil-polish.test.js — P2.1–P2.4 da aba Perfil
 * @jest-environment node
 */
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const configUser = fs.readFileSync(path.join(root, 'js', 'config-user.js'), 'utf8');
const initConfig = fs.readFileSync(path.join(root, 'js', 'modules', 'init-config.js'), 'utf8');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const css = fs.readFileSync(path.join(root, 'css', 'layouts', 'config.css'), 'utf8');
const ds = fs.readFileSync(path.join(root, 'css', 'design-system.css'), 'utf8');

describe('P2.1 — atrito de limparDados', function() {
  test('limparDados exige dupla confirmação', function() {
    const bloco = configUser.match(/limparDados:\s*function[\s\S]*?\n  \},/);
    expect(bloco).toBeTruthy();
    const confirms = bloco[0].match(/confirmar\s*\(/g) || [];
    expect(confirms.length).toBeGreaterThanOrEqual(2);
  });
});

describe('P2.2 — cartões nativos e teclado delegado', function() {
  test('aba-config: cartões de ação são button/a, sem role=button em div', function() {
    const start = html.indexOf('id="aba-config"');
    const end = html.indexOf('id="aba-editar-perfil"');
    const section = html.slice(start, end);
    expect(section).not.toMatch(/<div class="perfil-card"[^>]*role="button"/);
    expect(section).toMatch(/<button type="button" class="perfil-card"/);
    expect(section).toMatch(/<a class="perfil-card" href="privacidade\.html"/);
  });

  test('_bindKeyboardNavigation delega no container', function() {
    expect(initConfig).toMatch(/_perfilKeyNavBound/);
    expect(initConfig).toMatch(/closest\('\.perfil-card\[role="button"\]'\)/);
  });
});

describe('P2.3 — contraste folgado no tema claro', function() {
  const AA_FOLGA = 5.5;

  function lerTokens(cssText, seletor) {
    const re = new RegExp(`${seletor.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*\\{([\\s\\S]*?)\\n\\}`);
    const m = cssText.match(re);
    if (!m) return {};
    const out = {};
    for (const [, nome, valor] of m[1].matchAll(/--([a-z0-9-]+):\s*([^;]+);/g)) {
      out[nome] = valor.trim();
    }
    return out;
  }

  function resolver(tokens, valor, profundidade) {
    if (profundidade > 10) return null;
    const m = String(valor).match(/^var\(--([a-z0-9-]+)\)$/);
    if (!m) return valor;
    const alvo = tokens[m[1]];
    return alvo === undefined ? null : resolver(tokens, alvo, profundidade + 1);
  }

  function paraRgb(cor) {
    if (!cor) return null;
    const hex = String(cor).trim();
    let m = hex.match(/^#([0-9a-f]{6})$/i);
    if (m) {
      const n = parseInt(m[1], 16);
      return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
    }
    m = hex.match(/^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i);
    if (m) return [Number(m[1]), Number(m[2]), Number(m[3])];
    return null;
  }

  function blendOverWhite(fg, alpha) {
    return [
      Math.round(fg[0] * alpha + 255 * (1 - alpha)),
      Math.round(fg[1] * alpha + 255 * (1 - alpha)),
      Math.round(fg[2] * alpha + 255 * (1 - alpha)),
    ];
  }

  function luminancia([r, g, b]) {
    const canal = (c) => {
      const s = c / 255;
      return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
    };
    return 0.2126 * canal(r) + 0.7152 * canal(g) + 0.0722 * canal(b);
  }

  function razao(a, b) {
    const la = luminancia(a);
    const lb = luminancia(b);
    return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
  }

  function corNoBloco(blocoCss, seletor) {
    const esc = seletor.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const m = blocoCss.match(new RegExp(esc + '\\s*\\{([^}]*)\\}'));
    if (!m) return null;
    const cm = m[1].match(/(?:^|[\s;])color:\s*([^;]+);/);
    return cm ? cm[1].trim() : null;
  }

  test('.perfil-danger-btn e .security-indicator ≥ 5,5:1 no claro', function() {
    const pares = [
      { sel: '.perfil-danger-btn', bgRgb: [201, 87, 58], alpha: 0.08 },
      { sel: '.security-indicator', bgRgb: [47, 156, 109], alpha: 0.08 },
    ];
    for (const p of pares) {
      const fgDecl = corNoBloco(css, p.sel);
      expect(fgDecl).toBeTruthy();
      expect(fgDecl).toMatch(/^#[0-9a-f]{6}$/i);
      const fg = paraRgb(fgDecl);
      expect(fg).toBeTruthy();
      const bg = blendOverWhite(p.bgRgb, p.alpha);
      expect(razao(fg, bg)).toBeGreaterThanOrEqual(AA_FOLGA);
    }
  });

  test('dark mantém danger-light / success-light nos overrides', function() {
    expect(css).toMatch(/\[data-theme="dark"\]\s*\.perfil-danger-btn\s*\{[^}]*color:\s*var\(--color-danger-light\)/);
    expect(css).toMatch(/\[data-theme="dark"\]\s*\.security-indicator\s*\{[^}]*color:\s*var\(--color-success-light\)/);
  });
});

describe('P2.4 — limpeza', function() {
  test('modais de categorias sem style= inline', function() {
    const bloco = initConfig.match(/abrirGerenciarCategorias:\s*function[\s\S]*?adicionarCategoria:\s*function/);
    expect(bloco).toBeTruthy();
    expect(bloco[0]).not.toMatch(/style="/);
    expect(bloco[0]).toMatch(/perfil-modal-/);
  });

  test('último acesso usa ultimoAcessoApp, não hora inventada', function() {
    expect(initConfig).toMatch(/ultimoAcessoApp/);
    expect(initConfig).not.toMatch(/Hoje às/);
  });

  test('renderConfigStats removido (código morto)', function() {
    expect(initConfig).not.toMatch(/renderConfigStats\s*:/);
    expect(initConfig).not.toMatch(/cfg-stat-tx/);
  });
});
