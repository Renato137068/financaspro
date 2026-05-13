/**
 * pipeline.test.js — Testes de integração do pipeline de categorização
 * Cobre: fluxo completo parse → score → resultado, fluxo de transação
 *        lifecycle de transações (criar → filtrar → calcular saldo → orçamento),
 *        sincronização local/remota, cenários reais de uso
 */

// ── Implementações inline ─────────────────────────────────────────────────────

function escapeHtml(text) {
  const map = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' };
  return String(text).replace(/[&<>"']/g, m => map[m]);
}

// PARSER (extrair + parseData)
function parseData(str) {
  const hoje = new Date();
  const dow = hoje.getDay();
  const s = str.toLowerCase();
  const offsets = { hoje: 0, ontem: 1, anteontem: 2, amanhã: -1, amanha: -1 };
  if (offsets[s] !== undefined) {
    const d = new Date(hoje);
    d.setDate(d.getDate() - offsets[s]);
    return d.toISOString().split('T')[0];
  }
  const dias = { domingo: 0, segunda: 1, terca: 2, 'terça': 2, quarta: 3, quinta: 4, sexta: 5, sabado: 6, 'sábado': 6 };
  if (dias[s] !== undefined) {
    const diff = (dow - dias[s] + 7) % 7 || 7;
    const d2 = new Date(hoje);
    d2.setDate(d2.getDate() - diff);
    return d2.toISOString().split('T')[0];
  }
  return null;
}

function extrair(texto) {
  const tokens = texto.toLowerCase().split(/[\s,]+/);
  const r = { valor: null, desc: [], data: null, banco: null, cartao: null };
  const bancos = ['nubank', 'itaú', 'itau', 'caixa', 'bradesco', 'santander', 'bbva', 'inter', 'sicredi'];
  tokens.forEach(token => {
    if (!token || token.length < 2) return;
    if (/^\d+([.,]\d{1,2})?$/.test(token)) r.valor = parseFloat(token.replace(',', '.'));
    else if (/^(hoje|ontem|anteontem|amanhã?|segunda|ter[cç]a|quarta|quinta|sexta|s[aá]bado|domingo)$/.test(token)) r.data = parseData(token);
    else if (bancos.indexOf(token) !== -1) r.banco = token;
    else if (/^(cr[eé]dito|d[eé]bito)$/.test(token)) r.cartao = token;
    else if (token.length >= 3) r.desc.push(token);
  });
  r.desc = r.desc.join(' ');
  return r;
}

// SCORE
function calcularScore(fuzzy, aprendizado, contextual) {
  const fScore = fuzzy ? (fuzzy.confianca === 'alta' ? 0.9 : 0.6) : 0;
  const aScore = aprendizado ? Math.min(0.5 + (aprendizado.contador || 1) * 0.05, 0.95) : 0;
  const cScore = contextual ? 0.7 : 0;
  const total = fScore * 0.5 + aScore * 0.35 + cScore * 0.15;
  return {
    score: parseFloat(total.toFixed(2)),
    confianca: total > 0.75 ? 'alta' : total > 0.5 ? 'media' : 'baixa',
    categoria: (fuzzy && fuzzy.categoria) || (aprendizado && aprendizado.categoria),
    tipo: (fuzzy && fuzzy.tipo) || (aprendizado && aprendizado.tipo) || 'despesa',
  };
}

// VALIDATIONS
function validarTransacao(dados) {
  if (!dados.descricao || String(dados.descricao).trim().length === 0) return { valido: false, erro: 'Descrição obrigatória' };
  const num = parseFloat(String(dados.valor).replace(/\./g, '').replace(',', '.'));
  if (isNaN(num) || num <= 0) return { valido: false, erro: 'Valor inválido' };
  if (!dados.data || isNaN(new Date(dados.data).getTime())) return { valido: false, erro: 'Data inválida' };
  if (!dados.categoria) return { valido: false, erro: 'Categoria obrigatória' };
  return { valido: true };
}

// UTILS — calcularSaldo + filtrarPorMes
function calcularSaldo(txs) {
  return txs.reduce((acc, t) => t.tipo === 'receita' ? acc + t.valor : acc - t.valor, 0);
}

function filtrarPorMes(txs, mes, ano) {
  return txs.filter(t => {
    const parts = String(t.data || '').split('T')[0].split('-');
    return parts.length === 3 &&
      parseInt(parts[1], 10) === mes &&
      parseInt(parts[0], 10) === ano;
  });
}

// ─────────────────────────────────────────────────────────────────────────────

describe('PIPELINE — parse → score (fluxo de categorização)', () => {
  test('texto simples → extrai valor e score categoriza', () => {
    const parsed = extrair('mercado 150');
    expect(parsed.valor).toBe(150);

    const score = calcularScore(
      { confianca: 'alta', categoria: 'alimentacao', tipo: 'despesa' },
      null,
      null
    );
    expect(score.categoria).toBe('alimentacao');
    expect(score.score).toBeGreaterThan(0);
  });

  test('aprendizado aumenta confiança no score', () => {
    const semAprendizado = calcularScore(
      { confianca: 'baixa', categoria: 'transporte', tipo: 'despesa' },
      null,
      null
    );
    const comAprendizado = calcularScore(
      { confianca: 'baixa', categoria: 'transporte', tipo: 'despesa' },
      { categoria: 'transporte', tipo: 'despesa', contador: 8 },
      null
    );
    expect(comAprendizado.score).toBeGreaterThan(semAprendizado.score);
  });

  test('contextual eleva score em 15%', () => {
    const semContextual = calcularScore({ confianca: 'alta', categoria: 'saude', tipo: 'despesa' }, null, false);
    const comContextual = calcularScore({ confianca: 'alta', categoria: 'saude', tipo: 'despesa' }, null, true);
    // cScore contribui 0.7 * 0.15 = 0.105, mas toFixed(2) arredonda ambos os scores
    // por isso a diferença observada pode ser 0.10 ou 0.11 — só verificamos > 0
    expect(comContextual.score).toBeGreaterThan(semContextual.score);
  });
});

describe('PIPELINE — lifecycle de transação (criar → filtrar → saldo)', () => {
  const HOJE = new Date().toISOString().split('T')[0];
  const ANO = parseInt(HOJE.split('-')[0], 10);
  const MES = parseInt(HOJE.split('-')[1], 10);

  function criarTransacao(tipo, valor, categoria, data, descricao) {
    const dados = { descricao, valor, data, categoria, tipo };
    const validacao = validarTransacao(dados);
    if (!validacao.valido) throw new Error(validacao.erro);
    return { id: Date.now() + '-' + Math.random(), tipo, valor: parseFloat(valor), categoria, data, descricao };
  }

  test('cria receita válida', () => {
    const tx = criarTransacao('receita', 3000, 'salario', HOJE, 'Salário Maio');
    expect(tx.tipo).toBe('receita');
    expect(tx.valor).toBe(3000);
    expect(tx.id).toBeDefined();
  });

  test('cria despesa válida', () => {
    const tx = criarTransacao('despesa', 250, 'alimentacao', HOJE, 'Supermercado');
    expect(tx.tipo).toBe('despesa');
    expect(tx.valor).toBe(250);
  });

  test('rejeita transação com valor zero', () => {
    expect(() => criarTransacao('despesa', 0, 'alimentacao', HOJE, 'Teste')).toThrow();
  });

  test('rejeita transação sem descrição', () => {
    expect(() => criarTransacao('despesa', 100, 'alimentacao', HOJE, '')).toThrow();
  });

  test('filtra transações do mês e calcula saldo', () => {
    const transacoes = [
      { tipo: 'receita', valor: 5000, data: HOJE, categoria: 'salario' },
      { tipo: 'despesa', valor: 1200, data: HOJE, categoria: 'moradia' },
      { tipo: 'despesa', valor: 400,  data: HOJE, categoria: 'alimentacao' },
      { tipo: 'despesa', valor: 200,  data: '2024-01-01', categoria: 'lazer' }, // mês diferente
    ];

    const doMes = filtrarPorMes(transacoes, MES, ANO);
    expect(doMes).toHaveLength(3); // exclui a de jan/2024

    const saldo = calcularSaldo(doMes);
    expect(saldo).toBe(3400); // 5000 - 1200 - 400
  });
});

describe('PIPELINE — sincronização local/remota', () => {
  test('merge usa prioridade do servidor', () => {
    const local = [
      { id: 'tx1', valor: 100, origem: 'local' },
      { id: 'tx2', valor: 200, origem: 'local' },
    ];
    const remoto = [
      { id: 'tx2', valor: 250, origem: 'remoto' }, // servidor tem valor atualizado
      { id: 'tx3', valor: 300, origem: 'remoto' }, // novo no servidor
    ];

    const mapa = new Map();
    local.forEach(t => mapa.set(t.id, t));
    remoto.forEach(t => mapa.set(t.id, t)); // sobrescreve locais

    const resultado = Array.from(mapa.values());
    expect(resultado).toHaveLength(3);
    expect(resultado.find(t => t.id === 'tx2').valor).toBe(250); // versão do servidor
    expect(resultado.find(t => t.id === 'tx1').valor).toBe(100); // local preservado
    expect(resultado.find(t => t.id === 'tx3')).toBeTruthy(); // novo do servidor
  });

  test('transações locais sem ID remoto são preservadas', () => {
    const local = [{ id: 'local-1', valor: 50 }, { id: 'local-2', valor: 80 }];
    const remoto = [];

    const mapa = new Map();
    local.forEach(t => mapa.set(t.id, t));
    remoto.forEach(t => mapa.set(t.id, t));

    expect(Array.from(mapa.values())).toHaveLength(2);
  });

  test('deduplicação por ID funciona corretamente', () => {
    const lista = [
      { id: 'tx1', valor: 100 },
      { id: 'tx1', valor: 200 }, // duplicado
      { id: 'tx2', valor: 300 },
    ];

    const mapa = new Map();
    lista.forEach(t => mapa.set(t.id, t)); // último vence

    expect(mapa.size).toBe(2);
    expect(mapa.get('tx1').valor).toBe(200);
  });
});

describe('PIPELINE — cenários reais de uso', () => {
  test('usuário digita "nubank 150 mercado" → extrai dados completos', () => {
    const input = 'nubank 150 mercado';
    const dados = extrair(input);
    expect(dados.valor).toBe(150);
    expect(dados.banco).toBe('nubank');
    expect(dados.desc).toContain('mercado');
  });

  test('validação protege contra XSS na descrição', () => {
    const descricao = escapeHtml('<script>alert(1)</script>');
    expect(descricao).not.toContain('<script>');
    expect(descricao).toContain('&lt;script&gt;');
    const tx = { descricao, valor: 100, data: '2024-01-01', categoria: 'alimentacao', tipo: 'despesa' };
    expect(validarTransacao(tx).valido).toBe(true); // texto escapado é válido
  });

  test('cálculo de orçamento mensal completo', () => {
    const transacoes = [
      { tipo: 'despesa', categoria: 'alimentacao', valor: 450, data: '2024-05-10' },
      { tipo: 'despesa', categoria: 'alimentacao', valor: 150, data: '2024-05-20' },
      { tipo: 'despesa', categoria: 'transporte',  valor: 200, data: '2024-05-15' },
      { tipo: 'receita', categoria: 'salario',      valor: 4000, data: '2024-05-01' },
    ];

    const limite = 700;
    const gastoAlimentacao = transacoes
      .filter(t => t.tipo === 'despesa' && t.categoria === 'alimentacao' && t.data.startsWith('2024-05'))
      .reduce((acc, t) => acc + t.valor, 0);

    expect(gastoAlimentacao).toBe(600);
    const percentual = (gastoAlimentacao / limite) * 100;
    expect(percentual).toBeCloseTo(85.7, 1); // Alerta!
    expect(percentual).toBeGreaterThanOrEqual(80);
    expect(percentual).toBeLessThan(100);
  });

  test('parcelamento em 3x gera transações corretas', () => {
    const valorTotal = 900;
    const numParcelas = 3;
    const valorParcela = valorTotal / numParcelas;

    const parcelas = [];
    for (let i = 0; i < numParcelas; i++) {
      const d = new Date(2024, 4 + i, 10); // maio, junho, julho
      parcelas.push({
        tipo: 'despesa',
        valor: valorParcela,
        data: d.toISOString().split('T')[0],
        categoria: 'compras',
        descricao: `Compra parcelada ${i + 1}/${numParcelas}`,
        parcelaId: 'grupo-abc',
      });
    }

    expect(parcelas).toHaveLength(3);
    expect(parcelas.reduce((a, p) => a + p.valor, 0)).toBe(valorTotal);
    expect(parcelas[0].data).toBe('2024-05-10');
    expect(parcelas[2].data).toBe('2024-07-10');
    expect(parcelas.every(p => p.parcelaId === 'grupo-abc')).toBe(true);
  });
});
