/**
 * cobertura-fase1-4.test.js — fecha os caminhos que as fases 1 a 4 abriram.
 *
 * A regra do projeto (documentada em jest.frontend.config.cjs) é explícita:
 * nunca baixar um piso de cobertura para o CI passar. As fases anteriores
 * adicionaram código e deixaram quatro pisos abaixo do registrado — este
 * arquivo paga essa dívida em vez de mexer no número.
 *
 * Duas naturezas de buraco:
 *
 * 1. CÓDIGO NOVO SEM TESTE. `METAS.mensagemProjecao` foi escrita e nunca
 *    exercitada — a função que gera a frase que o usuário lê na tela.
 *
 * 2. CAMINHO DE FALLBACK DESCOBERTO POR EFEITO COLATERAL. O harness passou a
 *    carregar `transactionService.js`, e `TRANSACOES` delega a ele quando
 *    existe. Isso tornou os testes mais fiéis à produção — e, de quebra,
 *    deixou de exercitar o fallback interno. O fallback continua existindo e
 *    roda de verdade em qualquer contexto onde o service não carregue, então
 *    precisa de teste próprio, comparado ao caminho principal.
 */
const { loadCoreModules, resetFixtures, semGlobalNoSandbox } = require('./load-sources');

beforeAll(() => { loadCoreModules(); });
beforeEach(() => { resetFixtures(); });

// ─────────────────────────────────────────────────────────────────────────────
// 1. METAS.mensagemProjecao — a frase que aparece no card
// ─────────────────────────────────────────────────────────────────────────────

const HOJE = new Date(2026, 7, 10);

function meta(over) {
  return Object.assign({
    id: 'm1',
    titulo: 'Reserva',
    valorAlvo: 12000,
    valorAtual: 0,
    prazo: null,
    criadoEm: new Date(2026, 1, 10).toISOString(),
    concluida: false,
  }, over || {});
}

describe('METAS.mensagemProjecao', () => {
  test('meta concluída é celebrada, não cobrada', () => {
    const m = METAS.mensagemProjecao(meta({ valorAtual: 12000, prazo: '2027-08-10' }), HOJE);
    expect(m).toMatch(/alcançada/i);
  });

  test('prazo vencido diz quanto ainda falta', () => {
    const m = METAS.mensagemProjecao(meta({ valorAtual: 5000, prazo: '2026-06-10' }), HOJE);
    expect(m).toMatch(/vencido/i);
    expect(m).toMatch(/7\.000|7000/);
  });

  test('atrasado traz o valor do ajuste, não só o diagnóstico', () => {
    // "Você está atrasado" sem o quanto é ansiedade sem saída.
    const m = METAS.mensagemProjecao(meta({ valorAtual: 3000, prazo: '2027-02-10' }), HOJE);
    expect(m).toMatch(/aumente o aporte/i);
    expect(m).toMatch(/R\$/);
  });

  test('adiantado tranquiliza', () => {
    const m = METAS.mensagemProjecao(meta({ valorAtual: 9000, prazo: '2027-02-10' }), HOJE);
    expect(m).toMatch(/adiantado/i);
  });

  test('no ritmo informa o aporte mensal', () => {
    const m = METAS.mensagemProjecao(meta({ valorAtual: 6000, prazo: '2027-02-10' }), HOJE);
    expect(m).toMatch(/ritmo certo/i);
    expect(m).toMatch(/R\$/);
  });

  test('sem prazo mas com ritmo, projeta a conclusão', () => {
    const m = METAS.mensagemProjecao(meta({ valorAtual: 6000 }), HOJE);
    expect(m).toMatch(/conclui em/i);
  });

  test('sem prazo e sem ritmo não inventa frase', () => {
    const m = METAS.mensagemProjecao(
      meta({ criadoEm: HOJE.toISOString(), valorAtual: 0 }), HOJE,
    );
    expect(m).toBe('');
  });

  test('meta nula não derruba a função', () => {
    expect(() => METAS.mensagemProjecao(null, HOJE)).not.toThrow();
  });
});

describe('METAS — bordas dos helpers', () => {
  test('_agora ignora valor inválido e usa a data real', () => {
    // Verifica comportamento, não classe: `instanceof Date` não atravessa o
    // realm do vm — foi exatamente esse detalhe que fez a função descartar em
    // silêncio a data injetada nos primeiros testes de projeção.
    const ehData = (v) => !!v && typeof v.getTime === 'function' && !isNaN(v.getTime());
    expect(ehData(METAS._agora(null))).toBe(true);
    expect(ehData(METAS._agora('2026-08-10'))).toBe(true);
    expect(ehData(METAS._agora(new Date('data-invalida')))).toBe(true);
    // E respeita uma data válida vinda de fora do realm.
    expect(METAS._agora(new Date(2026, 0, 5)).getDate()).toBe(5);
  });

  test('calcularProgresso com prazo inválido devolve null, não NaN', () => {
    const p = METAS.calcularProgresso(meta({ prazo: 'nao-e-data' }), HOJE);
    expect(p.diasRestantes).toBeNull();
  });

  test('listar(true) devolve só as ativas', () => {
    DADOS.salvarConfig({ metas: [
      { id: 'a', titulo: 'A', valorAlvo: 100, valorAtual: 100, concluida: true },
      { id: 'b', titulo: 'B', valorAlvo: 100, valorAtual: 10, concluida: false },
    ] });
    expect(METAS.listar(true).map((m) => m.id)).toEqual(['b']);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. TRANSACOES — o caminho de fallback precisa concordar com o principal
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Roda `fn` com TRANSACTION_SERVICE ausente, restaurando depois.
 *
 * O fallback não é código morto: ele roda sempre que o service não estiver
 * carregado. Se as duas implementações divergirem, o usuário vê números
 * diferentes dependendo de qual arquivo carregou — o pior tipo de bug, porque
 * não é reproduzível.
 */
function semService(fn) {
  // Precisa desligar o global DENTRO do sandbox do vm: os módulos leem
  // `TRANSACTION_SERVICE` como identificador nu, resolvido lá — mexer em
  // `global.TRANSACTION_SERVICE` daqui não teria efeito nenhum sobre eles.
  return semGlobalNoSandbox('TRANSACTION_SERVICE', fn);
}

function semear() {
  TRANSACOES.criar('receita', 5000, 'salario', '2026-08-01', 'Salário', 'Nubank', '');
  TRANSACOES.criar('despesa', 800, 'alimentacao', '2026-08-02', 'Mercado', 'Nubank', '');
  TRANSACOES.criar('despesa', 200, 'transporte', '2026-08-03', 'Uber', 'Nubank', '');
}

describe('TRANSACOES — fallback sem TRANSACTION_SERVICE', () => {
  test('criar produz uma transação válida', () => {
    semService(() => {
      const t = TRANSACOES.criar('despesa', 50, 'alimentacao', '2026-08-05', 'Café', '', '');
      expect(t.id).toBeTruthy();
      expect(t.valor).toBe(50);
      expect(t.tipo).toBe('despesa');
    });
  });

  test('criar rejeita transação inválida também no fallback', () => {
    semService(() => {
      expect(() => TRANSACOES.criar('despesa', -5, 'alimentacao', '2026-08-05', 'x', '', ''))
        .toThrow();
    });
  });

  test('o resumo do mês bate com o do service', () => {
    semear();
    const comService = TRANSACOES.obterResumoMes(8, 2026);
    const semServ = semService(() => {
      TRANSACOES.invalidateCache();
      return TRANSACOES.obterResumoMes(8, 2026);
    });

    expect(semServ.receitas).toBe(comService.receitas);
    expect(semServ.despesas).toBe(comService.despesas);
    expect(semServ.saldo).toBe(comService.saldo);
  });

  test('o fallback também ignora transferência nas despesas', () => {
    semear();
    TRANSACOES.criarTransferencia({
      valor: 1000, data: '2026-08-04', origem: 'Nubank', destino: 'Poupança',
    });

    const r = semService(() => {
      TRANSACOES.invalidateCache();
      return TRANSACOES.obterResumoMes(8, 2026);
    });

    expect(r.despesas).toBe(1000); // 800 + 200, sem os 1.000 transferidos
  });

  test('o resumo por categoria bate com o do service', () => {
    semear();
    const comService = TRANSACOES.obterResumoPorCategoria(8, 2026);
    const semServ = semService(() => {
      TRANSACOES.invalidateCache();
      return TRANSACOES.obterResumoPorCategoria(8, 2026);
    });

    expect(semServ.alimentacao.despesa).toBe(comService.alimentacao.despesa);
    expect(semServ.salario.receita).toBe(comService.salario.receita);
  });

  test('os filtros do fallback batem com os do service', () => {
    semear();
    const comService = TRANSACOES.obter({ mes: 8, ano: 2026, tipo: 'despesa' });
    const semServ = semService(() => {
      TRANSACOES.invalidateCache();
      return TRANSACOES.obter({ mes: 8, ano: 2026, tipo: 'despesa' });
    });

    expect(semServ.map((t) => t.id).sort()).toEqual(comService.map((t) => t.id).sort());
  });

  test('a ordenação ascendente funciona no fallback', () => {
    semear();
    const asc = semService(() => {
      TRANSACOES.invalidateCache();
      return TRANSACOES.obter({ ordenarPor: 'data-asc' });
    });
    expect(asc[0].data <= asc[asc.length - 1].data).toBe(true);
  });

  test('o filtro por categoria funciona no fallback', () => {
    semear();
    const r = semService(() => {
      TRANSACOES.invalidateCache();
      return TRANSACOES.obter({ categoria: 'alimentacao' });
    });
    expect(r.every((t) => t.categoria === 'alimentacao')).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. PARSER._paraNumero — as bordas do formato brasileiro
// ─────────────────────────────────────────────────────────────────────────────

describe('PARSER._paraNumero', () => {
  test('rejeita o que não é número', () => {
    expect(PARSER._paraNumero('uber')).toBeNull();
    expect(PARSER._paraNumero('')).toBeNull();
    expect(PARSER._paraNumero('12abc')).toBeNull();
    expect(PARSER._paraNumero('--')).toBeNull();
  });

  test('aceita R$ com e sem espaço, maiúsculo ou minúsculo', () => {
    expect(PARSER._paraNumero('R$32,90')).toBe(32.9);
    expect(PARSER._paraNumero('r$ 32,90')).toBe(32.9);
  });

  test('milhar com mais de um grupo', () => {
    expect(PARSER._paraNumero('1.234.567')).toBe(1234567);
  });

  test('milhar com decimal', () => {
    expect(PARSER._paraNumero('1.234.567,89')).toBeCloseTo(1234567.89, 2);
  });

  test('ponto decimal simples continua valendo', () => {
    expect(PARSER._paraNumero('32.9')).toBe(32.9);
  });

  test('inteiro puro', () => {
    expect(PARSER._paraNumero('50')).toBe(50);
  });
});

describe('PARSER.extrair — bordas', () => {
  test('entrada vazia ou nula não derruba', () => {
    expect(() => PARSER.extrair('')).not.toThrow();
    expect(() => PARSER.extrair(null)).not.toThrow();
    expect(PARSER.extrair(null).valor).toBeNull();
  });

  test('pontuação de fim de frase não vira parte do token', () => {
    expect(PARSER.extrair('uber 32,90!').valor).toBe(32.9);
    expect(PARSER.extrair('mercado 50.').valor).toBe(50);
  });

  test('token de uma letra é ignorado', () => {
    const r = PARSER.extrair('a uber 30');
    expect(r.desc).toBe('uber');
  });

  test('cartão é reconhecido', () => {
    expect(PARSER.extrair('uber 30 credito').cartao).toBe('credito');
    expect(PARSER.extrair('uber 30 débito').cartao).toBe('débito');
  });

  test('_iso funciona sem UTILS disponível', () => {
    // parser.js é carregado em contexto de teste onde UTILS pode não existir;
    // a cópia local do formatador precisa dar o mesmo resultado.
    const d = new Date(2026, 0, 5);
    expect(PARSER._iso(d)).toBe('2026-01-05');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 4. UTILS — bordas dos helpers novos
// ─────────────────────────────────────────────────────────────────────────────

describe('UTILS.addMesesClamp — bordas', () => {
  test('aceita objeto Date', () => {
    expect(UTILS.addMesesClamp(new Date(2026, 0, 31), 1)).toBe('2026-02-28');
  });

  test('Date inválida devolve null', () => {
    expect(UTILS.addMesesClamp(new Date('xx'), 1)).toBeNull();
  });

  test('mês ou dia fora da faixa devolve null em vez de "consertar"', () => {
    // 2026-13-01 e 2026-02-32 não existem; deixar o Date normalizar
    // silenciosamente esconderia dado corrompido.
    expect(UTILS.addMesesClamp('2026-13-01', 1)).toBeNull();
    expect(UTILS.addMesesClamp('2026-02-32', 1)).toBeNull();
  });

  test('deslocamento não numérico é tratado como zero', () => {
    expect(UTILS.addMesesClamp('2026-03-15', 'abc')).toBe('2026-03-15');
  });

  test('recuo de vários anos', () => {
    expect(UTILS.addMesesClamp('2026-03-31', -25)).toBe('2024-02-29');
  });
});

describe('UTILS.dataLocalIso — bordas', () => {
  test('aceita Date explícita', () => {
    expect(UTILS.dataLocalIso(new Date(2026, 11, 25))).toBe('2026-12-25');
  });

  test('Date inválida cai para agora, sem devolver NaN', () => {
    expect(UTILS.dataLocalIso(new Date('xx'))).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  test('sem argumento devolve hoje', () => {
    expect(UTILS.dataLocalIso()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

describe('UTILS.dividirEmParcelas — bordas', () => {
  test('valor negativo mantém o sinal e fecha a soma', () => {
    const p = UTILS.dividirEmParcelas(-100, 3);
    expect(UTILS.somarMoeda(p)).toBe(-100);
    expect(p.every((v) => v <= 0)).toBe(true);
  });

  test('valor zero devolve parcelas zeradas, não vazio', () => {
    expect(UTILS.dividirEmParcelas(0, 3)).toEqual([0, 0, 0]);
  });

  test('aceita valor em string no formato brasileiro', () => {
    expect(UTILS.somarMoeda(UTILS.dividirEmParcelas('1.234,56', 3))).toBeCloseTo(1234.56, 2);
  });

  test('n como string numérica funciona', () => {
    expect(UTILS.dividirEmParcelas(100, '4')).toHaveLength(4);
  });
});

describe('UTILS.nomeDeConta — bordas', () => {
  test('objeto com nome não-string', () => {
    expect(UTILS.nomeDeConta({ nome: 123 })).toBe('');
  });

  test('array não é conta', () => {
    expect(UTILS.nomeDeConta([])).toBe('');
  });
});

describe('UTILS.intervaloVisivel — degradação sem document', () => {
  test('sem document cai para setInterval comum e ainda dá para parar', () => {
    // WebView antiga ou contexto sem DOM: pior para bateria, nunca quebrado.
    // O caminho existe justamente para não falhar — precisa ser exercitado.
    jest.useFakeTimers();
    try {
      const chamadas = { n: 0 };
      const ctrl = semGlobalNoSandbox('document', () => (
        UTILS.intervaloVisivel(() => { chamadas.n++; }, 1000)
      ));

      jest.advanceTimersByTime(3000);
      expect(chamadas.n).toBeGreaterThan(0);

      ctrl.parar();
      const depoisDeParar = chamadas.n;
      jest.advanceTimersByTime(5000);
      expect(chamadas.n).toBe(depoisDeParar);
    } finally {
      jest.useRealTimers();
    }
  });

  test('argumentos inválidos devolvem um controlador inerte', () => {
    expect(() => UTILS.intervaloVisivel(null, 1000).parar()).not.toThrow();
    expect(() => UTILS.intervaloVisivel(() => {}, 0).parar()).not.toThrow();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 5. PARSER sem os vizinhos — os fallbacks defensivos precisam funcionar
// ─────────────────────────────────────────────────────────────────────────────

describe('PARSER — degradação sem DADOS ou UTILS', () => {
  test('sem DADOS, ainda extrai valor e descrição', () => {
    const r = semGlobalNoSandbox('DADOS', () => PARSER.extrair('uber 32,90'));
    expect(r.valor).toBe(32.9);
    expect(r.desc).toBe('uber');
  });

  test('sem UTILS, a normalização de banco usa a cópia local', () => {
    // O fallback existe porque parser.js roda em contextos onde UTILS pode não
    // ter carregado. Se ele estiver quebrado, a falha só aparece nesse cenário.
    const r = semGlobalNoSandbox('UTILS', () => PARSER.extrair('mercado 50 nubank'));
    expect(r.banco).toBe('nubank');
    expect(r.valor).toBe(50);
  });

  test('sem UTILS, _iso ainda formata a data local', () => {
    const iso = semGlobalNoSandbox('UTILS', () => PARSER._iso(new Date(2026, 0, 5)));
    expect(iso).toBe('2026-01-05');
  });

  test('sem UTILS, parseData continua devolvendo YYYY-MM-DD', () => {
    const d = semGlobalNoSandbox('UTILS', () => PARSER.parseData('hoje'));
    expect(d).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  test('token que vira vazio após limpar pontuação é descartado', () => {
    const r = PARSER.extrair('uber 30 ...');
    expect(r.valor).toBe(30);
    expect(r.desc).toBe('uber');
  });
});
