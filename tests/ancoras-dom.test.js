/**
 * ancoras-dom.test.js — impede que uma funcionalidade volte a existir só no JS.
 *
 * A auditoria de 2026-08 encontrou 15 IDs que o JavaScript procurava e que não
 * existiam no index.html. O efeito é sempre o mesmo e sempre silencioso: o
 * módulo carrega, o `if (!el) return;` dispara e a funcionalidade simplesmente
 * não acontece. Nada quebra, nada aparece no console, nenhum teste falha.
 *
 * Foi assim que a entrada rápida (PARSER + PIPELINE + SCORE + APRENDIZADO) e o
 * OCR ficaram inacessíveis enquanto ~900 linhas continuavam sendo baixadas em
 * toda sessão.
 *
 * Este arquivo tem duas travas:
 *
 *   1. ÂNCORAS CRÍTICAS — lista explícita de IDs sem os quais uma feature
 *      inteira some. Falha o build.
 *   2. VARREDURA GERAL — compara todo getElementById() do js/ com o HTML e
 *      exige que cada ausência esteja declarada em OPCIONAIS, com motivo.
 *      Assim ninguém adiciona um órfão novo sem tomar a decisão conscientemente.
 */
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');

function temId(id) {
  return new RegExp('id\\s*=\\s*["\']' + id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '["\']').test(html);
}

// ─── 1. Âncoras críticas ─────────────────────────────────────────────────────
// Cada entrada é: [id, 'funcionalidade que deixa de existir sem ela']
const CRITICAS = [
  ['entrada-rapida-input', 'entrada rápida em linguagem natural'],
  ['btn-er-submit',        'botão de confirmar da entrada rápida'],
  ['er-feedback',          'retorno visual da entrada rápida'],
  ['form-transacao',       'formulário de lançamento'],
  ['novo-valor',           'campo de valor'],
  ['novo-data',            'campo de data'],
  ['novo-categoria',       'campo de categoria'],
  ['lista-transacoes',     'extrato'],
  ['metas-list',           'lista de metas'],
  ['btn-logout',           'sair da conta'],
  ['import-file',          'importação de backup'],
  ['chk-parcelado',        'parcelamento'],
  ['num-parcelas',         'quantidade de parcelas'],
  ['chk-recorrente',       'recorrência'],
  ['dashboard-alertas',    'alertas do dashboard'],
  ['insights-container',   'insights no dashboard'],
  ['kpi-disponivel',       'quanto sobra para gastar'],
  ['kpi-comprometido',     'quanto já tem dono'],
  ['contas-saldos-lista',  'saldo por conta'],
  ['cartoes-lista',        'cartões com limite e faturas'],
  ['cartao-fechamento',    'dia de fechamento — sem ele não há ciclo de fatura'],
  ['cartao-vencimento',    'dia de vencimento — sem ele não há ciclo de fatura'],
];

describe('âncoras críticas de DOM', () => {
  test.each(CRITICAS)('#%s existe no index.html (%s)', (id) => {
    expect(temId(id)).toBe(true);
  });
});

// ─── 2. Varredura geral ──────────────────────────────────────────────────────
//
// IDs que o JS procura mas que legitimamente podem não existir. Toda entrada
// precisa de motivo — se você chegou aqui adicionando um ID novo, a pergunta
// certa é "essa funcionalidade deveria estar acessível?", não "como faço o
// teste passar?".
const OPCIONAIS = {
  'import-area':   'área de arrastar-e-soltar; a importação real usa #import-file',
  'form-config':   'formulário legado de config; a aba atual usa outro fluxo',
  'form-orcamentos': 'formulário legado de orçamento; o atual é montado por JS',
  'contas-lista':  'UI de contas bancárias ainda não construída (Fase 3 — saldo por conta)',
  'smart-description-suggestions': 'sugestões de descrição não expostas na UI atual',
  'sugestao-badge': 'selo de confiança da sugestão não exposto na UI atual',
};

function arquivosJs(dir, acc) {
  acc = acc || [];
  for (const f of fs.readdirSync(dir)) {
    const p = path.join(dir, f);
    if (fs.statSync(p).isDirectory()) {
      if (f === 'vendor') continue;
      arquivosJs(p, acc);
    } else if (f.endsWith('.js')) {
      acc.push(p);
    }
  }
  return acc;
}

describe('varredura de getElementById em js/', () => {
  const arquivos = arquivosJs(path.join(root, 'js'));
  const todoJs = arquivos.map((f) => fs.readFileSync(f, 'utf8')).join('\n');

  const referencias = new Map();
  for (const f of arquivos) {
    const src = fs.readFileSync(f, 'utf8');
    for (const m of src.matchAll(/getElementById\(\s*['"]([^'"]+)['"]\s*\)/g)) {
      if (!referencias.has(m[1])) referencias.set(m[1], []);
      referencias.get(m[1]).push(path.relative(root, f));
    }
  }

  test('há referências para analisar (o próprio teste não pode virar no-op)', () => {
    expect(referencias.size).toBeGreaterThan(100);
  });

  test('todo ID ausente do HTML está declarado como opcional, com motivo', () => {
    const orfaos = [];

    for (const [id, arquivosQueUsam] of referencias) {
      if (temId(id)) continue;

      // Criado dinamicamente pelo próprio JS (modais, overlays) — não é órfão.
      const esc = id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const criadoNoJs = new RegExp(
        '\\.id\\s*=\\s*["\']' + esc + '["\']'
        + '|id="' + esc + '"'
        + '|id=\\\\"' + esc + '\\\\"',
      ).test(todoJs);
      if (criadoNoJs) continue;

      if (Object.prototype.hasOwnProperty.call(OPCIONAIS, id)) continue;

      orfaos.push(`#${id}  (usado em ${arquivosQueUsam.join(', ')})`);
    }

    expect(orfaos).toEqual([]);
  });

  test('a lista de opcionais não acumula entradas obsoletas', () => {
    // Se um ID opcional passou a existir no HTML, a entrada deve sair da lista —
    // senão a lista vira um depósito e perde o valor de documentar decisões.
    const jaExistem = Object.keys(OPCIONAIS).filter((id) => temId(id));
    expect(jaExistem).toEqual([]);
  });

  test('todo opcional tem motivo escrito', () => {
    Object.entries(OPCIONAIS).forEach(([_id, motivo]) => {
      expect(typeof motivo).toBe('string');
      expect(motivo.length).toBeGreaterThan(15);
    });
  });
});
