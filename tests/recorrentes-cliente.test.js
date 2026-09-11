/**
 * recorrentes-cliente.test.js — o app precisa cumprir o que promete offline.
 *
 * O princípio declarado do projeto é "o app sempre funciona, auth é
 * complementar". A recorrência contradizia isso: era gravada no localStorage e
 * materializada APENAS pelo worker BullMQ do backend. Sem Redis, worker rodando
 * e usuário autenticado, quem cadastrava "Aluguel mensal" nunca via o
 * lançamento aparecer no mês seguinte. A configuração existia; o efeito, não.
 *
 * A parte perigosa de resolver isso é a DUPLICAÇÃO. Se cliente e worker gerarem
 * o mesmo lançamento, o usuário vê o aluguel cobrado duas vezes — e num app
 * financeiro isso é pior do que não gerar nada.
 *
 * Duas travas contra isso:
 *
 *   1. O cliente só materializa em MODO LOCAL. Havendo sessão na nuvem, o
 *      worker é o dono do processo e o cliente não encosta.
 *   2. Chave de idempotência `recorrenteId + competência (YYYY-MM)`. Rodar dez
 *      vezes no mesmo mês produz um lançamento, não dez.
 */
const { loadCoreModules, resetFixtures } = require('./load-sources');

beforeAll(() => { loadCoreModules(); });
beforeEach(() => {
  resetFixtures();
  DADOS._modoLocal = true; // fixture: sem sessão na nuvem
});

const HOJE = new Date(2026, 7, 10); // 10/08/2026

function recorrente(over) {
  return Object.assign({
    id: 'rec-1',
    tipo: 'despesa',
    valor: 1500,
    categoria: 'moradia',
    descricao: 'Aluguel',
    frequencia: 'mensal',
    dataInicio: '2026-06-05',
    ativo: true,
  }, over || {});
}

function comRecorrentes(lista) {
  DADOS.salvarConfig({ recorrentes: lista });
}

describe('RECORRENTES.processar — materialização', () => {
  test('gera o lançamento do mês corrente', () => {
    comRecorrentes([recorrente({ dataInicio: '2026-08-05' })]);

    const criadas = RECORRENTES.processar(HOJE);
    expect(criadas).toHaveLength(1);
    expect(criadas[0].valor).toBe(1500);
    expect(criadas[0].data).toBe('2026-08-05');
  });

  test('recupera os meses que passaram sem o app ser aberto', () => {
    // Quem ficou dois meses sem abrir precisa encontrar o histórico completo.
    comRecorrentes([recorrente({ dataInicio: '2026-06-05' })]);

    const criadas = RECORRENTES.processar(HOJE);
    expect(criadas.map((t) => t.data)).toEqual(['2026-06-05', '2026-07-05', '2026-08-05']);
  });

  test('não gera nada para meses futuros', () => {
    comRecorrentes([recorrente({ dataInicio: '2026-06-05' })]);
    RECORRENTES.processar(HOJE);

    const futuras = DADOS.getTransacoes().filter((t) => t.data > '2026-08-10');
    expect(futuras).toEqual([]);
  });

  test('recorrente que começa no futuro não gera nada agora', () => {
    comRecorrentes([recorrente({ dataInicio: '2026-12-05' })]);
    expect(RECORRENTES.processar(HOJE)).toEqual([]);
  });

  test('recorrente desativada é ignorada', () => {
    comRecorrentes([recorrente({ ativo: false })]);
    expect(RECORRENTES.processar(HOJE)).toEqual([]);
  });

  test('respeita a data final quando existe', () => {
    comRecorrentes([recorrente({ dataInicio: '2026-06-05', dataFim: '2026-07-31' })]);

    const criadas = RECORRENTES.processar(HOJE);
    expect(criadas.map((t) => t.data)).toEqual(['2026-06-05', '2026-07-05']);
  });

  test('dia 31 não transborda em meses curtos', () => {
    // Mesmo erro de calendário que já apareceu em parcelas e no worker: sem
    // clamp, 31/01 + 1 mês viraria 03/03 e fevereiro ficaria sem lançamento.
    comRecorrentes([recorrente({ dataInicio: '2026-01-31' })]);

    // Em 15/03 a ocorrência de março (dia 31) ainda não aconteceu.
    const criadas = RECORRENTES.processar(new Date(2026, 2, 15));
    expect(criadas.map((t) => t.data)).toEqual(['2026-01-31', '2026-02-28']);
  });

  test('a ocorrência do mês só é gerada quando a data chega', () => {
    comRecorrentes([recorrente({ dataInicio: '2026-01-31' })]);

    const criadas = RECORRENTES.processar(new Date(2026, 2, 31)); // 31/03
    expect(criadas.map((t) => t.data)).toContain('2026-03-31');
  });

  test('a transação carrega a origem para poder ser rastreada', () => {
    comRecorrentes([recorrente({ dataInicio: '2026-08-05' })]);

    const t = RECORRENTES.processar(HOJE)[0];
    expect(t.recorrenteId).toBe('rec-1');
    expect(t.competencia).toBe('2026-08');
    expect(t.recorrente).toBe(true);
  });

  test('receita recorrente também é gerada', () => {
    comRecorrentes([recorrente({ tipo: 'receita', categoria: 'salario', valor: 5000 })]);

    const criadas = RECORRENTES.processar(HOJE);
    expect(criadas.every((t) => t.tipo === 'receita')).toBe(true);
  });

  test('não cria histórico infinito na primeira execução', () => {
    // Uma recorrente cadastrada com início em 2020 não pode despejar 70
    // lançamentos de uma vez na cara do usuário.
    comRecorrentes([recorrente({ dataInicio: '2020-01-05' })]);

    expect(RECORRENTES.processar(HOJE).length).toBeLessThanOrEqual(12);
  });
});

describe('idempotência — o dinheiro não pode dobrar', () => {
  test('rodar duas vezes não duplica', () => {
    comRecorrentes([recorrente({ dataInicio: '2026-08-05' })]);

    RECORRENTES.processar(HOJE);
    const segunda = RECORRENTES.processar(HOJE);

    expect(segunda).toEqual([]);
    expect(DADOS.getTransacoes()).toHaveLength(1);
  });

  test('rodar dez vezes ainda produz um lançamento', () => {
    comRecorrentes([recorrente({ dataInicio: '2026-08-05' })]);
    for (let i = 0; i < 10; i++) RECORRENTES.processar(HOJE);

    expect(DADOS.getTransacoes()).toHaveLength(1);
  });

  test('o mês seguinte gera, o anterior não repete', () => {
    comRecorrentes([recorrente({ dataInicio: '2026-08-05' })]);
    RECORRENTES.processar(HOJE);

    const setembro = RECORRENTES.processar(new Date(2026, 8, 10));
    expect(setembro).toHaveLength(1);
    expect(setembro[0].competencia).toBe('2026-09');
    expect(DADOS.getTransacoes()).toHaveLength(2);
  });

  test('semanal gera uma ocorrência por semana', () => {
    comRecorrentes([recorrente({
      frequencia: 'semanal',
      dataInicio: '2026-08-01',
      valor: 50,
      descricao: 'Mercado',
    })]);

    const criadas = RECORRENTES.processar(HOJE);
    expect(criadas.map((t) => t.data)).toEqual([
      '2026-08-01', '2026-08-08',
    ]);
    expect(criadas.every((t) => t.competencia === t.data)).toBe(true);
  });

  test('quinzenal respeita intervalo de 14 dias', () => {
    comRecorrentes([recorrente({
      frequencia: 'quinzenal',
      dataInicio: '2026-07-20',
    })]);

    const criadas = RECORRENTES.processar(HOJE);
    expect(criadas.map((t) => t.data)).toEqual(['2026-07-20', '2026-08-03']);
  });

  test('anual gera no mesmo dia/mês cada ano', () => {
    comRecorrentes([recorrente({
      frequencia: 'anual',
      dataInicio: '2024-08-10',
      descricao: 'IPVA',
    })]);

    const criadas = RECORRENTES.processar(HOJE);
    expect(criadas.map((t) => t.data)).toEqual(['2024-08-10', '2025-08-10', '2026-08-10']);
    expect(criadas[0].competencia).toBe('2024-08-10');
  });

  test('duas recorrentes diferentes no mesmo mês não se anulam', () => {
    comRecorrentes([
      recorrente({ id: 'rec-1', descricao: 'Aluguel', dataInicio: '2026-08-05' }),
      recorrente({ id: 'rec-2', descricao: 'Internet', valor: 120, dataInicio: '2026-08-10' }),
    ]);

    expect(RECORRENTES.processar(HOJE)).toHaveLength(2);
  });

  test('um lançamento apagado pelo usuário não volta', () => {
    // Se a pessoa apagou o aluguel de agosto de propósito, o app não pode
    // recriá-lo na próxima abertura — seria desfazer uma decisão dela.
    comRecorrentes([recorrente({ dataInicio: '2026-08-05' })]);
    const t = RECORRENTES.processar(HOJE)[0];

    TRANSACOES.deletar(t.id);
    expect(RECORRENTES.processar(HOJE)).toEqual([]);
  });
});

describe('convivência com o worker do backend', () => {
  test('em modo nuvem o cliente não materializa nada', () => {
    // O worker é o dono do processo quando há sessão. Gerar aqui também
    // significaria o aluguel cobrado duas vezes depois do sync.
    DADOS._modoLocal = false;
    comRecorrentes([recorrente({ dataInicio: '2026-08-05' })]);

    expect(RECORRENTES.processar(HOJE)).toEqual([]);
    expect(DADOS.getTransacoes()).toEqual([]);
  });

  test('voltar para modo local retoma a materialização', () => {
    DADOS._modoLocal = false;
    comRecorrentes([recorrente({ dataInicio: '2026-08-05' })]);
    RECORRENTES.processar(HOJE);

    DADOS._modoLocal = true;
    expect(RECORRENTES.processar(HOJE)).toHaveLength(1);
  });
});

describe('robustez', () => {
  test('sem recorrentes não faz nada', () => {
    expect(RECORRENTES.processar(HOJE)).toEqual([]);
  });

  test('recorrente sem dataInicio é ignorada, não estoura', () => {
    comRecorrentes([recorrente({ dataInicio: null })]);
    expect(() => RECORRENTES.processar(HOJE)).not.toThrow();
    expect(RECORRENTES.processar(HOJE)).toEqual([]);
  });

  test('entrada corrompida na lista não derruba as demais', () => {
    comRecorrentes([null, { lixo: true }, recorrente({ dataInicio: '2026-08-05' })]);

    expect(RECORRENTES.processar(HOJE)).toHaveLength(1);
  });

  test('valor inválido não gera lançamento', () => {
    comRecorrentes([recorrente({ valor: 0, dataInicio: '2026-08-05' })]);
    expect(RECORRENTES.processar(HOJE)).toEqual([]);
  });

  test('frequências desconhecidas não são materializadas', () => {
    comRecorrentes([recorrente({ frequencia: 'diaria', dataInicio: '2026-08-01' })]);
    expect(RECORRENTES.processar(HOJE)).toEqual([]);
  });
});
