/**
 * a11y-static.test.js — guardas de acessibilidade verificáveis no markup.
 *
 * Complementa a suíte axe-core do Playwright, que precisa de navegador. Aqui
 * ficam as verificações que dão para fazer lendo o HTML e o CSS — as que
 * podem rodar em todo commit, sem browser.
 *
 * Sobre o método: a primeira versão manual desta checagem produziu DOIS falsos
 * positivos. Procurar só por `<label for>` acusou 5 campos "sem rótulo" que na
 * verdade estavam envolvidos por `<label>` ou marcados com `aria-hidden`. E ler
 * o CSS inteiro para extrair tokens misturou tema claro e escuro, fazendo cores
 * corretas parecerem reprovadas. As duas lições estão codificadas abaixo: a
 * associação de rótulo considera as quatro formas válidas, e o contraste é
 * verificado por scripts/check-contrast.cjs, que isola o bloco :root.
 */
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8')
  .replace(/<!--[\s\S]*?-->/g, ''); // comentários não contam

/** Todos os campos interativos que o usuário realmente opera. */
function camposInterativos() {
  const out = [];
  for (const m of html.matchAll(/<(input|select|textarea)\b[^>]*>/g)) {
    const tag = m.group ? m.group(0) : m[0];
    const tipo = (tag.match(/type="([^"]+)"/) || [, 'text'])[1];
    if (['hidden', 'submit', 'button', 'reset'].includes(tipo)) continue;
    out.push({ tag, tipo, id: (tag.match(/id="([^"]+)"/) || [])[1], pos: m.index });
  }
  return out;
}

/**
 * Um campo tem rótulo se qualquer uma destas for verdadeira:
 *   1. está fora da árvore de acessibilidade (hidden / aria-hidden)
 *   2. tem aria-label ou aria-labelledby
 *   3. existe <label for="id"> apontando para ele
 *   4. está envolvido por um <label>
 * Checar apenas (3) foi o que gerou o falso positivo original.
 */
function temRotulo(campo) {
  const { tag, id, pos } = campo;

  if (/aria-hidden="true"/.test(tag) || /\bhidden\b/.test(tag)) return 'fora da árvore de a11y';
  if (/aria-label(ledby)?=/.test(tag)) return 'aria-label';
  if (id && new RegExp(`<label[^>]*for="${id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"`).test(html)) return 'label for';

  const antes = html.slice(0, pos);
  if (antes.lastIndexOf('<label') > antes.lastIndexOf('</label>')) return 'envolvido por label';

  return null;
}

describe('a11y — rótulos de formulário', () => {
  const campos = camposInterativos();

  test('a varredura encontrou campos (guarda contra teste vazio)', () => {
    expect(campos.length).toBeGreaterThan(20);
  });

  test('todo campo interativo tem rótulo acessível', () => {
    const semRotulo = campos
      .filter(c => !temRotulo(c))
      .map(c => `${c.id || '(sem id)'} [type=${c.tipo}]`);

    expect(semRotulo).toEqual([]);
  });
});

describe('a11y — navegação por teclado', () => {
  test('existe exatamente um skip link apontando para o conteúdo principal', () => {
    const matches = html.match(/class="[^"]*skip-link[^"]*"/g) || [];
    expect(matches.length).toBe(1);
    expect(html).toMatch(/<a[^>]+href="#main-content"[^>]*class="[^"]*skip-link/);
  });

  test('o skip link é o primeiro elemento focável do documento', () => {
    // Se vier depois de outro link ou botão, deixa de cumprir a função.
    const corpo = html.slice(html.indexOf('<body'));
    const primeiroFocavel = corpo.search(/<(a\s[^>]*href|button|input)\b/);
    const posSkip = corpo.indexOf('skip-link');

    expect(posSkip).toBeGreaterThan(-1);
    expect(posSkip).toBeLessThan(primeiroFocavel + 200);
  });

  test('o destino do skip link existe', () => {
    expect(html).toMatch(/id="main-content"/);
  });

  test('não há tabindex positivo — a ordem de foco segue o DOM', () => {
    // tabindex >= 1 reordena o foco de um jeito quase impossível de manter.
    const positivos = [...html.matchAll(/tabindex="(\d+)"/g)]
      .map(m => m[1])
      .filter(v => Number(v) > 0);

    expect(positivos).toEqual([]);
  });
});

describe('a11y — consistência de navegação', () => {
  test('cada destino tem um único nome acessível', () => {
    // O texto visível pode encurtar na barra inferior por falta de espaço, mas
    // o nome anunciado pelo leitor de tela não: ouvir "Ver extrato" num
    // contexto e "Ver extrato de transações" no outro sugere dois lugares.
    const porDestino = {};
    for (const m of html.matchAll(/<(?:button|a)[^>]*data-aba="([a-z-]+)"[^>]*aria-label="([^"]*)"/g)) {
      (porDestino[m[1]] = porDestino[m[1]] || new Set()).add(m[2]);
    }

    const divergentes = Object.entries(porDestino)
      .filter(([, nomes]) => nomes.size > 1)
      .map(([aba, nomes]) => `${aba}: ${[...nomes].join(' / ')}`);

    expect(divergentes).toEqual([]);
  });

  test('a varredura encontrou os destinos de navegação', () => {
    const destinos = new Set([...html.matchAll(/data-aba="([a-z-]+)"/g)].map(m => m[1]));
    expect(destinos.size).toBeGreaterThanOrEqual(5);
  });
});

describe('a11y — alvo de toque (WCAG 2.5.5)', () => {
  const polish = fs.readFileSync(path.join(root, 'css', 'utilities', 'ux-polish.css'), 'utf8');

  test('existe token para o tamanho mínimo', () => {
    expect(polish).toMatch(/--tap-target-min:\s*44px/);
  });

  test('há regra de base para dispositivos de toque', () => {
    // Uma allowlist de classes esquece todo botão novo; a regra por
    // pointer:coarse cobre o resto sem afetar o layout no desktop.
    expect(polish).toMatch(/@media \(pointer: coarse\)/);
    const bloco = polish.slice(polish.indexOf('@media (pointer: coarse)'));
    expect(bloco).toMatch(/\bbutton\b/);
    expect(bloco).toMatch(/min-height:\s*var\(--tap-target-min\)/);
  });

  test('botões de ícone recebem o mínimo nos dois eixos', () => {
    const bloco = polish.slice(polish.indexOf('@media (pointer: coarse)'));
    expect(bloco).toMatch(/min-width:\s*var\(--tap-target-min\)/);
  });
});

describe('ux — feedback em ações longas', () => {
  const utils = fs.readFileSync(path.join(root, 'js', 'core', 'utils.js'), 'utf8');
  const nav = fs.readFileSync(path.join(root, 'js', 'modules', 'init-navigation.js'), 'utf8');

  test('existe helper de estado de carregamento', () => {
    expect(utils).toMatch(/comCarregamento:\s*function/);
  });

  test('o helper marca aria-busy para leitores de tela', () => {
    const trecho = utils.slice(utils.indexOf('comCarregamento'));
    expect(trecho).toMatch(/aria-busy/);
  });

  test('as exportações usam o helper', () => {
    // São as ações mais demoradas do app e as que geram arquivo duplicado
    // quando o usuário clica duas vezes.
    for (const acao of ['exportar-excel', 'exportar-pdf', 'exportar-dados']) {
      const i = nav.indexOf(`'${acao}':`);
      expect(i).toBeGreaterThan(-1);
      expect(nav.slice(i, i + 420)).toMatch(/comCarregamento/);
    }
  });
});

describe('a11y — estrutura semântica', () => {
  test('a página declara o idioma', () => {
    expect(html).toMatch(/<html[^>]+lang="pt-BR"/);
  });

  test('o zoom não é bloqueado', () => {
    // Travar o zoom exclui quem tem baixa visão. WCAG 1.4.4 exige 200%.
    const viewport = (html.match(/name="viewport"\s+content="([^"]+)"/) || [])[1] || '';

    expect(viewport).not.toMatch(/user-scalable\s*=\s*no/);
    const maxScale = (viewport.match(/maximum-scale\s*=\s*([\d.]+)/) || [])[1];
    if (maxScale) expect(Number(maxScale)).toBeGreaterThanOrEqual(2);
  });

  test('existem landmarks para navegação por leitor de tela', () => {
    expect(html).toMatch(/<main\b/);
    expect(html).toMatch(/<nav\b/);
  });

  test('a aba ativa é anunciada com aria-current', () => {
    expect(html).toMatch(/aria-current="page"/);
  });
});

describe('a11y — cor não é o único indicador (WCAG 1.4.1)', () => {
  const base = fs.readFileSync(path.join(root, 'js', 'components', '_base.js'), 'utf8');
  const card = fs.readFileSync(path.join(root, 'js', 'components', 'CardOrcamento.js'), 'utf8');

  test('cada estado de orçamento tem ícone e texto próprios', () => {
    for (const estado of ['ok', 'alerta', 'excedido']) {
      expect(base).toMatch(new RegExp(`${estado}:\\s*\\{[^}]*icone:`));
      expect(base).toMatch(new RegExp(`${estado}:\\s*\\{[^}]*texto:`));
    }
  });

  test('os ícones dos três estados são distintos entre si', () => {
    const icones = [...base.matchAll(/icone:\s*'([^']+)'/g)].map(m => m[1]);
    expect(new Set(icones).size).toBe(icones.length);
  });

  test('o texto do estado vai para leitor de tela, não só para a tela', () => {
    expect(base).toMatch(/className\s*=\s*'sr-only'/);
  });

  test('o card de orçamento usa o badge acessível', () => {
    expect(card).toMatch(/badgeStatus\(/);
    // A construção antiga — só percentual colorido — não pode voltar.
    expect(card).not.toMatch(/badge\.textContent\s*=\s*pct/);
  });

  test('o ícone decorativo do badge é escondido do leitor de tela', () => {
    // O texto já é anunciado pelo sr-only; o ícone repetiria a informação.
    expect(base).toMatch(/setAttribute\('aria-hidden',\s*'true'\)/);
  });

  test('o badge dispara a renderização do ícone', () => {
    // Sem renderLucideIcons o <i data-lucide> fica vazio: o segundo sinal
    // visual simplesmente não aparece, e só o teste pega isso sem navegador.
    const trecho = base.slice(base.indexOf('badgeStatus'));
    expect(trecho).toMatch(/renderLucideIcons\(badge\)/);
  });

  test('o card do painel principal também mostra o estado', () => {
    // renderResumo é o que o usuário vê no dashboard; render() completo é usado
    // em outro contexto. Proteger só um dos dois deixaria metade descoberta.
    const resumo = card.slice(card.indexOf('renderResumo'));
    expect(resumo).toMatch(/badgeStatus\(/);
  });
});

describe('a11y — tokens de cor', () => {
  const ds = fs.readFileSync(path.join(root, 'css', 'design-system.css'), 'utf8');

  test('existem tokens de texto acessíveis para as quatro cores semânticas', () => {
    for (const cor of ['success', 'warning', 'danger', 'info']) {
      expect(ds).toMatch(new RegExp(`--color-${cor}-text:`));
      expect(ds).toMatch(new RegExp(`--color-${cor}-on-light:`));
    }
  });

  test('utilitários .fp-text-* usam o token acessível, não o tom vivo', () => {
    const utilitarios = ds.match(/\.fp-text-(success|danger|warning|info)\s*\{[^}]*\}/g) || [];

    expect(utilitarios.length).toBeGreaterThanOrEqual(3);
    for (const regra of utilitarios) {
      expect(regra).toMatch(/-text\)/);
    }
  });

  test('nenhum CSS de componente usa tom vivo como cor de texto', () => {
    // O tom vivo serve para preenchimento; como texto reprova AA.
    const cssDir = path.join(root, 'css');
    const arquivos = [];
    (function varrer(dir) {
      for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, ent.name);
        if (ent.isDirectory()) varrer(full);
        else if (ent.name.endsWith('.css') && ent.name !== 'design-system.css') arquivos.push(full);
      }
    })(cssDir);

    const infracoes = [];
    for (const f of arquivos) {
      if (path.basename(f) === 'toasts.css') continue; // fundo semântico, caso à parte
      const src = fs.readFileSync(f, 'utf8');
      for (const cor of ['success', 'warning', 'danger', 'info']) {
        const re = new RegExp(`(^|[{;\\s])color:\\s*var\\(--color-${cor}\\)`, 'm');
        if (re.test(src)) infracoes.push(`${path.relative(root, f)}: --color-${cor} como texto`);
      }
    }

    expect(infracoes).toEqual([]);
  });
});

/**
 * Contraste do cartão-herói `#card-saldo-principal .saldo-valor`.
 *
 * A regressão: fundo decorativo saiu (card claro) e a frente ficou branca —
 * 1,05:1. O bug passou porque nenhum teste media a razão computada deste par.
 */
describe('a11y — contraste do cartão de saldo', () => {
  const AA = 4.5;

  function lerTokens(css, seletor) {
    const re = new RegExp(`${seletor.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*\\{([\\s\\S]*?)\\n\\}`);
    const m = css.match(re);
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
    m = hex.match(/^#([0-9a-f]{3})$/i);
    if (m) {
      const [r, g, b] = m[1].split('');
      return [parseInt(r + r, 16), parseInt(g + g, 16), parseInt(b + b, 16)];
    }
    m = hex.match(/^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)\s*(?:[,/]\s*([\d.]+)\s*)?\)$/i);
    if (m) {
      return [
        Math.round(parseFloat(m[1])),
        Math.round(parseFloat(m[2])),
        Math.round(parseFloat(m[3])),
      ];
    }
    return null;
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

  /** Extrai `color:` de um bloco seletor específico (primeira ocorrência). */
  function corDoSeletor(css, seletor) {
    const esc = seletor.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const re = new RegExp(esc + '\\s*\\{([^}]*)\\}');
    const m = css.match(re);
    if (!m) return null;
    const cm = m[1].match(/color:\s*([^;]+);/);
    return cm ? cm[1].trim() : null;
  }

  function fundoDoSeletor(css, seletor) {
    const esc = seletor.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const re = new RegExp(esc + '\\s*\\{([^}]*)\\}');
    const m = css.match(re);
    if (!m) return null;
    const bm = m[1].match(/background(?:-color)?:\s*([^;]+);/);
    return bm ? bm[1].trim() : null;
  }

  const ds = fs.readFileSync(path.join(root, 'css', 'design-system.css'), 'utf8');
  const cards = fs.readFileSync(path.join(root, 'css', 'components', 'cards.css'), 'utf8');
  const dark = fs.readFileSync(path.join(root, 'css', 'themes', 'dark-mode.css'), 'utf8');
  const dash = fs.readFileSync(path.join(root, 'css', 'layouts', 'dashboard.css'), 'utf8');
  const superf = fs.readFileSync(path.join(root, 'css', 'features', 'superficie.css'), 'utf8');

  test('tema claro: .saldo-valor ≥ 4,5:1 sobre o fundo do cartão', () => {
    const tokens = lerTokens(ds, ':root');
    const corDecl = corDoSeletor(cards, '.card-saldo-principal .saldo-valor');
    const fundoDecl =
      fundoDoSeletor(cards, '.card-saldo-principal.saldo-positivo') ||
      'var(--color-bg-card)';

    expect(corDecl).toBeTruthy();
    expect(corDecl).toMatch(/text-primary/);
    expect(corDecl).not.toMatch(/color-white|#fff/i);

    const fgResolved = paraRgb(resolver(tokens, corDecl, 0));
    const bgResolved = paraRgb(resolver(tokens, fundoDecl, 0));

    expect(fgResolved).toBeTruthy();
    expect(bgResolved).toBeTruthy();
    expect(razao(fgResolved, bgResolved)).toBeGreaterThanOrEqual(AA);
  });

  test('tema escuro: .saldo-valor branco ≥ 4,5:1 sobre fundo escuro do cartão', () => {
    const tokens = {
      ...lerTokens(ds, ':root'),
      ...lerTokens(ds, '\\[data-theme="dark"\\]'),
      ...lerTokens(dark, '\\[data-theme="dark"\\]'),
    };
    // dark-mode.css redefine alguns tokens no bloco [data-theme="dark"]
    const darkBlock = dark.match(/\[data-theme="dark"\]\s*\{([\s\S]*?)\n\}/);
    if (darkBlock) {
      for (const [, nome, valor] of darkBlock[1].matchAll(/--([a-z0-9-]+):\s*([^;]+);/g)) {
        tokens[nome] = valor.trim();
      }
    }

    const corDecl = corDoSeletor(dark, '[data-theme="dark"] .card-saldo-principal .saldo-valor');
    expect(corDecl).toBeTruthy();
    expect(corDecl).toMatch(/color-white|#fff/i);

    const fg = paraRgb(resolver(tokens, corDecl, 0) || '#ffffff');
    // Fundo positivo escuro: primary-700 (dark-mode) — sólido, mensurável
    const bg = paraRgb(resolver(tokens, 'var(--color-primary-700)', 0));
    expect(fg).toBeTruthy();
    expect(bg).toBeTruthy();
    expect(razao(fg, bg)).toBeGreaterThanOrEqual(AA);
  });

  test('tema claro não declara branco no herói fora de dark-mode', () => {
    // dashboard/superficie não podem reintroduzir color: white no cartão.
    const claros = [cards, dash, superf];
    const infracoes = [];
    for (const src of claros) {
      // Remove blocos [data-theme="dark"] antes de varrer
      const semDark = src.replace(/\[data-theme="dark"\][^{]*\{[^}]*\}/g, '');
      if (/card-saldo-principal[^}]*color:\s*(var\(--color-white\)|#fff|rgba\(\s*255)/i.test(semDark)) {
        infracoes.push('branco no cartão-herói (tema claro)');
      }
    }
    expect(infracoes).toEqual([]);
  });
});

describe('a11y — anúncio do saldo (sem re-leitura a cada render)', () => {
  const dashJs = fs.readFileSync(path.join(root, 'js', 'render-dashboard.js'), 'utf8');

  test('o cartão herói não usa role="status"', () => {
    const m = html.match(/id="card-saldo-principal"[^>]*/);
    expect(m).toBeTruthy();
    expect(m[0]).not.toMatch(/role="status"/);
  });

  test('existe região aria-live dedicada ao saldo', () => {
    const m = html.match(/<span[^>]*id="saldo-anuncio"[^>]*>/);
    expect(m).toBeTruthy();
    expect(m[0]).toMatch(/aria-live="polite"/);
    expect(m[0]).toMatch(/class="[^"]*sr-only/);
  });

  test('renderCardSaldo anuncia só quando o valor muda', () => {
    expect(dashJs).toMatch(/_ultimoSaldoAnunciado/);
    expect(dashJs).toMatch(/saldo !== _ultimoSaldoAnunciado/);
    expect(dashJs).toMatch(/getElementById\('saldo-anuncio'\)/);
  });
});

describe('a11y — densidade da aba Resumo', () => {
  function pos(id) {
    return html.indexOf('id="' + id + '"');
  }

  test('blocos principais vêm antes dos colapsáveis pesados', () => {
    expect(pos('dashboard-indicadores')).toBeGreaterThan(-1);
    expect(pos('secao-orcamento-resumo')).toBeGreaterThan(pos('dashboard-indicadores'));
    expect(pos('secao-ultimas-transacoes')).toBeGreaterThan(pos('secao-orcamento-resumo'));
    expect(pos('secao-relatorios')).toBeGreaterThan(pos('secao-ultimas-transacoes'));
    expect(pos('graficos-panel')).toBeGreaterThan(pos('secao-relatorios'));
    expect(pos('secao-previsao')).toBeGreaterThan(pos('graficos-panel'));
  });

  test('seções colapsáveis iniciam fechadas', () => {
    expect(html).toMatch(/id="btn-graficos"[^>]*aria-expanded="false"/);
    expect(html).toMatch(/id="btn-previsao"[^>]*aria-expanded="false"/);
    expect(html).toMatch(/id="btn-relatorios"[^>]*aria-expanded="false"/);
    expect(html).toMatch(/id="graficos-panel"[^>]*style="display:none"/);
    expect(html).toMatch(/id="previsao-painel"[^>]*style="display:none"/);
    expect(html).toMatch(/id="relatorios-panel"[^>]*style="display:none"/);
  });

  test('módulos condicionais permanecem ocultos até ter dados', () => {
    for (var id of ['secao-cartoes', 'secao-contas-saldos', 'secao-contas-pagar',
      'secao-metas-resumo', 'secao-assinaturas-resumo', 'secao-patrimonio-resumo']) {
      var m = html.match(new RegExp('id="' + id + '"[^>]*'));
      expect(m).toBeTruthy();
      expect(m[0]).toMatch(/display:\s*none/);
    }
  });
});

/**
 * Contraste do herói de valor na aba Lançamentos (#valor-hero / #novo-valor).
 *
 * Regressão: dark-mode pintava .valor-hero com rgba translúcido; a cascata
 * deixava o cartão claro e o texto (#edf3f0) ficava ~1,1:1 — invisível.
 */
describe('a11y — contraste do valor-hero (aba Lançamentos)', () => {
  const AA = 4.5;

  function lerTokens(css, seletor) {
    const re = new RegExp(`${seletor.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*\\{([\\s\\S]*?)\\n\\}`);
    const m = css.match(re);
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
    m = hex.match(/^#([0-9a-f]{3})$/i);
    if (m) {
      const [r, g, b] = m[1].split('');
      return [parseInt(r + r, 16), parseInt(g + g, 16), parseInt(b + b, 16)];
    }
    return null;
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

  function fundoDoSeletor(css, seletor) {
    const esc = seletor.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const re = new RegExp(esc + '\\s*\\{([^}]*)\\}');
    const m = css.match(re);
    if (!m) return null;
    const bm = m[1].match(/background(?:-color)?:\s*([^;]+);/);
    return bm ? bm[1].trim() : null;
  }

  function corDoSeletor(css, seletor) {
    const esc = seletor.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const re = new RegExp(esc + '\\s*\\{([^}]*)\\}');
    const m = css.match(re);
    if (!m) return null;
    const cm = m[1].match(/color:\s*([^;]+);/);
    return cm ? cm[1].trim() : null;
  }

  const ds = fs.readFileSync(path.join(root, 'css', 'design-system.css'), 'utf8');
  const formNovo = fs.readFileSync(path.join(root, 'css', 'features', 'form-novo.css'), 'utf8');
  const dark = fs.readFileSync(path.join(root, 'css', 'themes', 'dark-mode.css'), 'utf8');

  test('tema claro: .valor-input ≥ 4,5:1 sobre .valor-hero (e variantes)', () => {
    const tokens = lerTokens(ds, ':root');
    const fgDecl = corDoSeletor(formNovo, '.valor-input');
    expect(fgDecl).toBeTruthy();

    const variantes = ['.valor-hero', '.valor-hero.tipo-despesa', '.valor-hero.tipo-receita'];
    for (const sel of variantes) {
      const bgDecl = fundoDoSeletor(formNovo, sel);
      expect(bgDecl).toBeTruthy();
      expect(bgDecl).not.toMatch(/rgba?\(/i);

      const fg = paraRgb(resolver(tokens, fgDecl, 0));
      const bg = paraRgb(resolver(tokens, bgDecl, 0));
      expect(fg).toBeTruthy();
      expect(bg).toBeTruthy();
      expect(razao(fg, bg)).toBeGreaterThanOrEqual(AA);
    }
  });

  test('tema escuro: fundo do .valor-hero é opaco escuro (≥ 4,5:1 com o texto)', () => {
    const tokens = { ...lerTokens(ds, ':root') };
    // Remapeamento de tokens no design-system (texto claro, etc.)
    const dsDark = ds.match(/\[data-theme="dark"\]\s*\{([\s\S]*?)\n\}/);
    if (dsDark) {
      for (const [, nome, valor] of dsDark[1].matchAll(/--([a-z0-9-]+):\s*([^;]+);/g)) {
        tokens[nome] = valor.trim();
      }
    }

    const fgDecl =
      corDoSeletor(dark, '[data-theme="dark"] .valor-input') ||
      corDoSeletor(formNovo, '.valor-input');
    expect(fgDecl).toBeTruthy();

    // Grupo compartilhado declara o fundo opaco para as três variantes
    const grupo = dark.match(
      /\[data-theme="dark"\]\s*\.valor-hero(?:,[^{]+)?\{([^}]*)\}/
    );
    expect(grupo).toBeTruthy();
    const bm = grupo[1].match(/background(?:-color)?:\s*([^;]+);/);
    const bgDecl = bm ? bm[1].trim() : null;
    expect(bgDecl).toBeTruthy();
    expect(bgDecl).not.toMatch(/rgba?\(/i);
    expect(bgDecl).toMatch(/color-bg-dark-card|color-bg-card/);

    const fg = paraRgb(resolver(tokens, fgDecl, 0));
    const bg = paraRgb(resolver(tokens, bgDecl, 0));
    expect(fg).toBeTruthy();
    expect(bg).toBeTruthy();
    expect(razao(fg, bg)).toBeGreaterThanOrEqual(AA);

    // Variantes só mudam borda — fundo continua o do grupo
    for (const sel of [
      '[data-theme="dark"] .valor-hero.tipo-despesa',
      '[data-theme="dark"] .valor-hero.tipo-receita',
    ]) {
      const bloco = dark.match(new RegExp(
        sel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\s*\\{([^}]*)\\}'
      ));
      expect(bloco).toBeTruthy();
      // Se redefinir background, tem que ser opaco e escuro
      const bgVar = bloco[1].match(/background(?:-color)?:\s*([^;]+);/);
      if (bgVar) {
        expect(bgVar[1].trim()).not.toMatch(/rgba?\(/i);
        const bg2 = paraRgb(resolver(tokens, bgVar[1].trim(), 0));
        expect(razao(fg, bg2)).toBeGreaterThanOrEqual(AA);
      }
    }
  });

  test('tema escuro não reintroduz rgba translúcido como fundo do valor-hero', () => {
    const blocos = dark.match(/\[data-theme="dark"\][^{]*\.valor-hero[^{]*\{[^}]*\}/g) || [];
    expect(blocos.length).toBeGreaterThan(0);
    for (const bloco of blocos) {
      if (/background(?:-color)?:/.test(bloco)) {
        expect(bloco).not.toMatch(/background(?:-color)?:\s*rgba?\(/i);
      }
    }
  });
});

describe('a11y — badges de confiança IA (aba Lançamentos)', () => {
  const AA = 4.5;
  const formNovo = fs.readFileSync(path.join(root, 'css', 'features', 'form-novo.css'), 'utf8');
  const ds = fs.readFileSync(path.join(root, 'css', 'design-system.css'), 'utf8');
  const dark = fs.readFileSync(path.join(root, 'css', 'themes', 'dark-mode.css'), 'utf8');

  function lerTokens(css, seletor) {
    const re = new RegExp(`${seletor.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*\\{([\\s\\S]*?)\\n\\}`);
    const m = css.match(re);
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
    return null;
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

  function corBadge(nivel) {
    const re = new RegExp('\\.ia-confidence-badge\\.' + nivel + '\\s*\\{([^}]*)\\}');
    const m = formNovo.match(re);
    if (!m) return null;
    const cm = m[1].match(/(?:^|[^-])color:\s*([^;]+);/);
    return cm ? cm[1].trim() : null;
  }

  test('os três badges usam tokens semânticos (sem hex fixo)', () => {
    expect(corBadge('alta')).toMatch(/var\(--color-success-text\)/);
    expect(corBadge('media')).toMatch(/var\(--color-warning-text\)/);
    expect(corBadge('baixa')).toMatch(/var\(--color-danger-text\)/);
    expect(corBadge('media')).not.toMatch(/#92400e/i);
  });

  test('claro e escuro: texto dos badges ≥ 4,5:1 sobre o card', () => {
    const tokensClaro = lerTokens(ds, ':root');
    const tokensEscuro = { ...tokensClaro };
    const dsDark = ds.match(/\[data-theme="dark"\]\s*\{([\s\S]*?)\n\}/);
    if (dsDark) {
      for (const [, nome, valor] of dsDark[1].matchAll(/--([a-z0-9-]+):\s*([^;]+);/g)) {
        tokensEscuro[nome] = valor.trim();
      }
    }
    // dark-mode.css remapeia *-text para *-light
    const darkRemap = dark.match(/\[data-theme="dark"\]\s*\{([\s\S]*?)\n\}/);
    if (darkRemap) {
      for (const [, nome, valor] of darkRemap[1].matchAll(/--([a-z0-9-]+):\s*([^;]+);/g)) {
        tokensEscuro[nome] = valor.trim();
      }
    }

    const bgClaro = paraRgb(resolver(tokensClaro, 'var(--color-bg-card)', 0));
    const bgEscuro = paraRgb(resolver(tokensEscuro, 'var(--color-bg-dark-card)', 0));

    for (const nivel of ['alta', 'media', 'baixa']) {
      const decl = corBadge(nivel);
      const fgClaro = paraRgb(resolver(tokensClaro, decl, 0));
      const fgEscuro = paraRgb(resolver(tokensEscuro, decl, 0));
      expect(fgClaro).toBeTruthy();
      expect(fgEscuro).toBeTruthy();
      expect(razao(fgClaro, bgClaro)).toBeGreaterThanOrEqual(AA);
      expect(razao(fgEscuro, bgEscuro)).toBeGreaterThanOrEqual(AA);
    }
  });
});

/**
 * Contraste da aba Extrato — linhas .ext-tx e cartões .kpi-card.
 * Regressão: no dark as superfícies ficavam claras com texto clareado (~1–2,5:1).
 */
describe('a11y — contraste do extrato (lista e KPIs)', () => {
  const AA = 4.5;
  const extrato = fs.readFileSync(path.join(root, 'css', 'layouts', 'extrato.css'), 'utf8');
  const ds = fs.readFileSync(path.join(root, 'css', 'design-system.css'), 'utf8');
  const dark = fs.readFileSync(path.join(root, 'css', 'themes', 'dark-mode.css'), 'utf8');

  function lerTokens(css, seletor) {
    const re = new RegExp(`${seletor.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*\\{([\\s\\S]*?)\\n\\}`);
    const m = css.match(re);
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
    return null;
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

  function fundoDoSeletor(css, seletor) {
    const esc = seletor.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const re = new RegExp(esc + '\\s*\\{([^}]*)\\}');
    const m = css.match(re);
    if (!m) return null;
    const bm = m[1].match(/background(?:-color)?:\s*([^;]+);/);
    return bm ? bm[1].trim() : null;
  }

  function corDoSeletor(css, seletor) {
    const esc = seletor.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const re = new RegExp(esc + '\\s*\\{([^}]*)\\}');
    const m = css.match(re);
    if (!m) return null;
    const cm = m[1].match(/(?:^|[\s;])color:\s*([^;]+);/);
    return cm ? cm[1].trim() : null;
  }

  function tokensEscuro() {
    const tokens = { ...lerTokens(ds, ':root') };
    const dsDark = ds.match(/\[data-theme="dark"\]\s*\{([\s\S]*?)\n\}/);
    if (dsDark) {
      for (const [, nome, valor] of dsDark[1].matchAll(/--([a-z0-9-]+):\s*([^;]+);/g)) {
        tokens[nome] = valor.trim();
      }
    }
    const darkSemantic = dark.match(/\[data-theme="dark"\]\s*\{([\s\S]*?)\n\}/);
    if (darkSemantic) {
      for (const [, nome, valor] of darkSemantic[1].matchAll(/--([a-z0-9-]+):\s*([^;]+);/g)) {
        tokens[nome] = valor.trim();
      }
    }
    return tokens;
  }

  test('tema claro: descrição, valor e KPI ≥ 4,5:1 sobre o fundo do cartão', () => {
    const tokens = lerTokens(ds, ':root');
    const bgDecl = fundoDoSeletor(extrato, '.ext-tx');
    expect(bgDecl).toBeTruthy();
    const bg = paraRgb(resolver(tokens, bgDecl, 0));
    expect(bg).toBeTruthy();

    const pares = [
      corDoSeletor(extrato, '.ext-tx-desc'),
      corDoSeletor(extrato, '.ext-tx-meta'),
      corDoSeletor(extrato, '.ext-tx-valor.receita'),
      corDoSeletor(extrato, '.ext-tx-valor.despesa'),
      corDoSeletor(extrato, '.kpi-value'),
    ];
    for (const fgDecl of pares) {
      expect(fgDecl).toBeTruthy();
      const fg = paraRgb(resolver(tokens, fgDecl, 0));
      expect(fg).toBeTruthy();
      expect(razao(fg, bg)).toBeGreaterThanOrEqual(AA);
    }
  });

  test('tema escuro: .ext-tx e .kpi-card têm fundo opaco escuro', () => {
    const bloco = dark.match(
      /\[data-theme="dark"\]\s*\.ext-tx,[\s\S]*?\.saldo-card\s*\{([^}]*)\}/
    );
    expect(bloco).toBeTruthy();
    const bgDecl = (bloco[1].match(/background(?:-color)?:\s*([^;]+);/) || [])[1];
    expect(bgDecl).toBeTruthy();
    expect(bgDecl).not.toMatch(/rgba?\(/i);
    expect(bgDecl).toMatch(/color-bg-dark-card/);
  });

  test('tema escuro: texto do extrato ≥ 4,5:1 sobre fundo opaco', () => {
    const tokens = tokensEscuro();
    const bloco = dark.match(
      /\[data-theme="dark"\]\s*\.ext-tx,[\s\S]*?\.saldo-card\s*\{([^}]*)\}/
    );
    expect(bloco).toBeTruthy();
    const bgDecl = (bloco[1].match(/background(?:-color)?:\s*([^;]+);/) || [])[1];
    expect(bgDecl).toBeTruthy();
    const bg = paraRgb(resolver(tokens, bgDecl, 0));
    expect(bg).toBeTruthy();

    const pares = [
      corDoSeletor(extrato, '.ext-tx-desc'),
      corDoSeletor(extrato, '.ext-tx-meta'),
      corDoSeletor(extrato, '.ext-tx-valor.receita'),
      corDoSeletor(extrato, '.ext-tx-valor.despesa'),
      corDoSeletor(extrato, '.kpi-value'),
      corDoSeletor(extrato, '.kpi-card.receita .kpi-value'),
      corDoSeletor(extrato, '.kpi-card.despesa .kpi-value'),
    ];
    for (const fgDecl of pares) {
      expect(fgDecl).toBeTruthy();
      const fg = paraRgb(resolver(tokens, fgDecl, 0));
      expect(fg).toBeTruthy();
      expect(razao(fg, bg)).toBeGreaterThanOrEqual(AA);
    }
  });
});

/**
 * P0.3 — registro anti-regressão: superfícies com texto devem escurecer no dark.
 * Documenta os elementos-chave de cada aba auditada (Resumo, Lançamentos, Extrato).
 */
describe('a11y — padrão sistêmico de contraste no tema escuro', () => {
  const dark = fs.readFileSync(path.join(root, 'css', 'themes', 'dark-mode.css'), 'utf8');

  const superficiesAuditadas = [
    { aba: 'resumo', seletor: '.card-saldo-principal', obrigatorio: false },
    { aba: 'resumo', seletor: '.resumo-item', obrigatorio: true },
    { aba: 'lancamentos', seletor: '.valor-hero', obrigatorio: true },
    { aba: 'extrato', seletor: '.saldo-card', obrigatorio: true },
    { aba: 'extrato', seletor: '.kpi-card', obrigatorio: true },
    { aba: 'extrato', seletor: '.ext-tx', obrigatorio: true },
  ];

  function temFundoOpacoEscuro(seletor) {
    const esc = seletor.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const re = new RegExp(
      '\\[data-theme="dark"\\][^{]*' + esc + '[^{]*\\{[^}]*background(?:-color)?:\\s*([^;]+);',
      'g'
    );
    const blocos = dark.match(re) || [];
    if (blocos.length === 0) return false;
    return blocos.some(function(bloco) {
      const bm = bloco.match(/background(?:-color)?:\s*([^;]+);/);
      if (!bm) return false;
      const val = bm[1].trim();
      return !/^rgba?\(/i.test(val) && /color-bg-dark-card|#0[a-f0-9]{5}|#1[0-9a-f]{5}/i.test(val);
    });
  }

  test('cada superfície auditada tem override opaco em dark-mode.css', () => {
    for (const item of superficiesAuditadas) {
      if (!item.obrigatorio) continue;
      expect(temFundoOpacoEscuro(item.seletor)).toBe(true);
    }
  });

  test('documentação: lista de superfícies-chave por aba', () => {
    const porAba = {};
    superficiesAuditadas.forEach(function(item) {
      if (!porAba[item.aba]) porAba[item.aba] = [];
      porAba[item.aba].push(item.seletor);
    });
    expect(porAba.resumo).toEqual(expect.arrayContaining(['.resumo-item']));
    expect(porAba.lancamentos).toEqual(expect.arrayContaining(['.valor-hero']));
    expect(porAba.extrato).toEqual(
      expect.arrayContaining(['.ext-tx', '.kpi-card', '.saldo-card'])
    );
  });
});
