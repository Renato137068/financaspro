/**
 * tokens-de-cor-por-funcao.test.js — impede que um tom fixo de tema claro
 * seja usado como cor de TEXTO.
 *
 * Origem: ao aplicar a paleta Sobra, o valor do cartão de receitas ficou com
 * `color: var(--color-success-dark)`. Esse token é um verde escuro pensado
 * para fundo claro; no tema escuro ele caiu para 2,2:1 contra o card (o axe
 * reprovou no e2e). O par certo é o alias `--color-success-text`, que aponta
 * para o tom escuro no tema claro e para o tom claro no tema escuro.
 *
 * O check-contrast.cjs sozinho não pegava porque só media os aliases — ele
 * media a coisa certa, e o CSS usava outra. Este teste fecha o buraco no
 * outro lado: garante que nenhuma regra de texto escape do alias.
 */
const fs = require('fs');
const path = require('path');

const raiz = path.join(__dirname, '..');

function arquivosCss(dir) {
  const saida = [];
  for (const nome of fs.readdirSync(dir)) {
    const p = path.join(dir, nome);
    if (fs.statSync(p).isDirectory()) saida.push(...arquivosCss(p));
    else if (nome.endsWith('.css')) saida.push(p);
  }
  return saida;
}

function ocorrencias(regex) {
  const saida = [];
  for (const arquivo of arquivosCss(path.join(raiz, 'css'))) {
    const fonte = fs.readFileSync(arquivo, 'utf8');
    let m;
    const re = new RegExp(regex.source, 'g');
    while ((m = re.exec(fonte)) !== null) {
      saida.push(`${path.relative(raiz, arquivo)}:${fonte.slice(0, m.index).split('\n').length} → ${m[0].trim()}`);
    }
  }
  return saida;
}

describe('tokens de cor usados pela função certa', function() {
  test('nenhuma regra usa um tom -dark como cor de texto', function() {
    expect(ocorrencias(/(^|[;{\s])color:\s*var\(--color-(success|danger|warning|info)-dark\)/m)).toEqual([]);
  });

  test('nenhuma regra usa um tom vivo de preenchimento como cor de texto', function() {
    // --color-success e irmãos existem para PREENCHER (barra, ponto de
    // legenda, fundo de toast). Como texto eles reprovam AA.
    // A borda de acento pode usar o tom vivo — ali ele preenche, não escreve.
    // Por isso o padrão exige a propriedade `color` exata, não `border-color`.
    expect(ocorrencias(/(^|[;{\s])color:\s*var\(--color-(success|danger|warning|info)\)\s*[;}]/m)).toEqual([]);
  });

  test('nenhuma regra do tema escuro usa um neutro remapeado como texto', function() {
    // No bloco [data-theme="dark"], --color-gray-100 e --color-gray-200 são
    // remapeados para tons de BORDA (#2c3833, #3c4541). Usá-los como cor de
    // texto deixa a frase quase invisível — o axe mediu 1,34:1 no título de
    // estado vazio. O token certo é --color-text-primary, que troca sozinho.
    expect(ocorrencias(/(^|[;{\s])color:\s*var\(--color-gray-(100|200)\)/m)
      .filter((linha) => /dark-mode\.css/.test(linha) || /design-system/.test(linha)))
      .toEqual([]);
  });

  test('a escala de elevação tem exatamente três níveis', function() {
    const ds = fs.readFileSync(path.join(raiz, 'css', 'design-system.css'), 'utf8');
    const niveis = ds.match(/--elevacao-\d:/g) || [];
    expect(new Set(niveis).size).toBe(3);
  });

  test('a escala de raio tem exatamente três valores', function() {
    const ds = fs.readFileSync(path.join(raiz, 'css', 'design-system.css'), 'utf8');
    for (const token of ['--radius-controle', '--radius-superficie', '--radius-pill']) {
      expect(ds).toContain(token);
    }
    // todo apelido cai num dos três
    const apelidos = ds.match(/--radius-(sm|md|lg|xl|2xl|full):\s*([^;]+);/g) || [];
    expect(apelidos.length).toBe(6);
    for (const linha of apelidos) {
      expect(linha).toMatch(/var\(--radius-(controle|superficie|pill)\)/);
    }
  });

  test('sobrou no máximo um gradiente de marca fora dos casos funcionais', function() {
    // O produto tinha 103 gradientes. A regra é: um só de marca (a superfície
    // do saldo) mais os brilhos de esqueleto, onde o gradiente É a animação.
    const comGradiente = ocorrencias(/(linear|radial)-gradient\(/)
      .filter((linha) => !/skeleton\.css|extrato\.css/.test(linha));
    expect(comGradiente.length).toBeLessThanOrEqual(1);
  });
});
