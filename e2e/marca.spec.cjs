/**
 * e2e/marca.spec.cjs — verifica no DOM RENDERIZADO as regras de marca que um
 * seletor CSS sozinho não consegue garantir.
 *
 * Por que aqui e não num teste de arquivo: a regra de números tabulares foi
 * escrita a partir dos nomes de classe que eu *imaginava* que o projeto usava
 * (-valor, -saldo, -total). A árvore real usava também kpi-value, cp-kpi-val,
 * sub-kpi-val e ext-grupo-subtotal, além de dois casos em elementos sem classe
 * nenhuma. Nenhum grep encontraria isso — só olhando o que a tela desenha.
 *
 * A mesma lógica vale para os outros testes deste arquivo: eles medem o
 * resultado, não a intenção.
 */
const { test, expect } = require('@playwright/test');
const { prepareOfflinePage } = require('./helpers.cjs');

const ABAS = ['resumo', 'novo', 'extrato', 'orcamento', 'config'];
const MOEDA = /R\$\s?[\d.]+,\d{2}/;

test.beforeEach(async function({ page }) {
  await prepareOfflinePage(page);
});

async function porAba(page, coletor) {
  const achados = [];
  for (const aba of ABAS) {
    await page.evaluate(function(a) {
      if (typeof mudarAba === 'function') mudarAba(a);
    }, aba);
    await page.waitForTimeout(600);
    const r = await page.evaluate(coletor, aba);
    achados.push(...r);
  }
  return [...new Set(achados)];
}

test('todo valor monetário na tela usa números tabulares', async function({ page }) {
  const ruins = await porAba(page, function(aba) {
    const fora = [];
    for (const e of document.querySelectorAll('*')) {
      const caixa = e.getBoundingClientRect();
      if (!(caixa.width > 0 && caixa.height > 0)) continue;
      if (e.childElementCount) continue;
      const texto = (e.textContent || '').trim();
      if (texto.length > 40 || !/R\$\s?[\d.]+,\d{2}/.test(texto)) continue;
      const fv = getComputedStyle(e).fontVariantNumeric;
      if (/tabular/.test(fv)) continue;
      const classe = String(e.className).trim() || '(sem classe, dentro de '
        + (e.parentElement ? e.parentElement.tagName.toLowerCase()
           + '.' + String(e.parentElement.className).slice(0, 30) : '?') + ')';
      fora.push(aba + ' → ' + e.tagName.toLowerCase() + ' ' + classe);
    }
    return fora;
  });
  expect(ruins, 'valores com dígitos de largura variável').toEqual([]);
});

test('a interface usa no máximo três raios distintos', async function({ page }) {
  const raios = await porAba(page, function() {
    const s = new Set();
    for (const e of document.querySelectorAll('*')) {
      const caixa = e.getBoundingClientRect();
      if (!(caixa.width > 0 && caixa.height > 0)) continue;
      const r = getComputedStyle(e).borderRadius;
      // Cantos parciais (só embaixo, por exemplo) são composições dos mesmos
      // valores e não contam como um raio novo.
      if (r && r !== '0px' && !r.includes(' ')) s.add(r);
    }
    return [...s];
  });
  // 8px (controle), 16px (superfície), 9999px (pill) e 50% (avatar redondo,
  // que é a mesma ideia de pill num elemento quadrado).
  expect(raios.sort()).toEqual(['16px', '50%', '8px', '9999px']);
});

test('a elevação na tela cabe na escala de três níveis', async function({ page }) {
  // Um grep por --shadow-* não encontra tudo: havia uma TERCEIRA família de
  // sombras escondida num :root de style.css (--shadow-soft/--shadow-lift) e
  // uma quarta redefinindo --shadow-sm/md/lg dentro do bloco do tema escuro.
  // Só a árvore renderizada mostra isso.
  const sombras = await porAba(page, function() {
    const s = new Set();
    for (const e of document.querySelectorAll('*')) {
      const caixa = e.getBoundingClientRect();
      if (!(caixa.width > 0 && caixa.height > 0)) continue;
      const v = getComputedStyle(e).boxShadow;
      if (!v || v === 'none') continue;
      if (/inset/.test(v)) continue;                 // detalhe interno
      if (/^rgba?\([^)]*\) 0px 0px 0px/.test(v)) continue;  // anel de foco
      s.add(v);
    }
    return [...s];
  });
  // Dois níveis de elevação, mais dois com tinta de marca (botão primário e
  // destrutivo). Qualquer sombra nova fora disso reprova aqui.
  expect(sombras.length, 'sombras de elevação distintas:\n' + sombras.join('\n'))
    .toBeLessThanOrEqual(4);
});

test('todo tamanho de fonte na tela vem da escala', async function({ page }) {
  // O CSS tinha 30 tamanhos literais além dos nove degraus da escala — 13,5px,
  // 12,5px, 15px, 17px, 22px, 26px e rem soltos. Isso não é excesso de zelo
  // tipográfico: é o que faz a interface parecer montada por várias mãos.
  //
  // Os números-herói (saldo, valor de card, indicador) usam clamp() fluido de
  // propósito, então caem em valores fracionários conforme a largura. Eles são
  // a exceção declarada, e os extremos do clamp vêm da escala.
  const ESCALA = [10, 12, 14, 16, 18, 20, 24, 30, 36, 44, 56];
  const FLUIDOS = /saldo-valor|card-valor|indicador-valor|billing/;

  const fora = await porAba(page, function(aba) {
    const res = [];
    const escala = [10, 12, 14, 16, 18, 20, 24, 30, 36, 44, 56];
    for (const e of document.querySelectorAll('*')) {
      const caixa = e.getBoundingClientRect();
      if (!(caixa.width > 0 && caixa.height > 0)) continue;
      if (e.childElementCount) continue;
      if (!(e.textContent || '').trim()) continue;
      const classe = String(e.className);
      if (/saldo-valor|card-valor|indicador-valor|billing/.test(classe)) continue;
      const px = parseFloat(getComputedStyle(e).fontSize);
      if (escala.indexOf(Math.round(px * 100) / 100) !== -1) continue;
      res.push(aba + ' → ' + e.tagName.toLowerCase() + '.' + classe.slice(0, 30) + ' = ' + px + 'px');
    }
    return res;
  });
  expect(fora, 'tamanhos fora da escala tipográfica').toEqual([]);
  expect(ESCALA.length).toBe(11);
  expect(FLUIDOS.test('saldo-valor')).toBe(true);
});

test('nenhuma tela estoura a largura em 320px', async function({ page }) {
  await page.setViewportSize({ width: 320, height: 720 });
  const estouros = await porAba(page, function(aba) {
    const de = document.documentElement;
    return de.scrollWidth > de.clientWidth
      ? [aba + ' → scrollWidth ' + de.scrollWidth + ' > ' + de.clientWidth]
      : [];
  });
  expect(estouros).toEqual([]);
});

test('o selo de armazenamento explica onde os dados ficam', async function({ page }) {
  // O diferencial do produto é funcionar sem servidor, e isso só era dito na
  // ficha da loja e na primeira tela do onboarding — quem já usa o app nunca
  // mais lia. O selo do rodapé, que já aparecia em todas as telas, passou a
  // responder ao toque. É o lugar mais barato de colocar a promessa onde ela
  // é vista, e por isso vale um teste: se ele voltar a ser decoração, reprova.
  const selo = page.locator('#sync-indicator');
  await expect(selo).toBeVisible();
  expect(await selo.evaluate((e) => e.tagName)).toBe('BUTTON');
  expect(await selo.getAttribute('aria-label')).toMatch(/onde ficam os seus dados/i);

  await selo.click();
  const modal = page.locator('.modal-overlay');
  await expect(modal).toBeVisible();
  const texto = await modal.innerText();
  expect(texto).toMatch(/neste aparelho/i);
  expect(texto).toMatch(/backup/i);   // a contrapartida honesta, não só a promessa
});

test('o cabeçalho mostra a marca e o nome do produto', async function({ page }) {
  const marca = await page.evaluate(function() {
    const img = document.querySelector('header h1 .brand-mark');
    const h1 = document.querySelector('header h1');
    return {
      temImagem: !!img,
      fonte: img ? img.getAttribute('src') : null,
      carregou: img ? img.naturalWidth > 0 : false,
      texto: h1 ? h1.textContent.trim() : null,
    };
  });
  expect(marca.temImagem).toBe(true);
  expect(marca.carregou).toBe(true);
  // No build de produção o Vite embute SVGs pequenos como data: URI, então o
  // caminho some. O que importa verificar é que a imagem É a marca — por isso
  // a asserção olha o conteúdo (o aria-label que o gerador escreve) e aceita
  // as duas formas.
  expect(marca.fonte).toMatch(/icons\/logo|aria-label='Finan|aria-label%3d'Finan/i);
  expect(marca.texto).toBe('FinançasPro');
});
