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
  test('existe skip link apontando para o conteúdo principal', () => {
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
      expect(nav.slice(i, i + 220)).toMatch(/comCarregamento/);
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
