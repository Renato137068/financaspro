/**
 * setup-guide.test.js — progresso de configuração inicial (facilidade p/ iniciantes).
 */
const path = require('path');
const vm = require('vm');
const { rodarNoContexto } = require('./helpers/esm-como-script.cjs');
function load() {
  const ctx = vm.createContext({ Math, Array, Object, String });
  // filename absoluto: é a chave que o provider v8 usa para mapear o código
  // executado no vm de volta ao arquivo-fonte. Com nome relativo o teste passa
  // mas o módulo aparece com 0% de cobertura no relatório.
  const file = path.join(__dirname, '..', 'js', 'core', 'setup-guide.js');
  rodarNoContexto(ctx, file);
  return ctx.SETUP_GUIDE;
}
const SG = load();

describe('SETUP_GUIDE.diffProgresso', () => {
  const completo = { transacao: true, renda: true, orcamento: true, meta: true };

  test('primeira execução sem estado anterior conta o que já está feito', () => {
    const d = SG.diffProgresso(null, { transacao: true });
    expect(d.novos).toEqual(['transacao']);
    expect(d.completouAgora).toBe(false);
  });

  test('detecta apenas o passo que mudou', () => {
    const d = SG.diffProgresso({ transacao: true }, { transacao: true, renda: true });
    expect(d.novos).toEqual(['renda']);
  });

  test('sem mudança não gera nada — chamada repetida é inofensiva', () => {
    // O card é renderizado a cada atualização do dashboard; sem esta garantia
    // o funil encheria de eventos duplicados e a métrica não valeria nada.
    const d = SG.diffProgresso({ transacao: true }, { transacao: true });
    expect(d.novos).toEqual([]);
    expect(d.completouAgora).toBe(false);
  });

  test('vários passos de uma vez são todos registrados', () => {
    const d = SG.diffProgresso({}, { transacao: true, orcamento: true });
    expect(d.novos.sort()).toEqual(['orcamento', 'transacao']);
  });

  test('conclusão do funil é sinalizada uma única vez', () => {
    const primeiro = SG.diffProgresso({ transacao: true, renda: true, orcamento: true }, completo);
    expect(primeiro.completouAgora).toBe(true);

    const segundo = SG.diffProgresso(completo, completo);
    expect(segundo.completouAgora).toBe(false);
  });

  test('regressão de estado não gera evento negativo', () => {
    // Restaurar backup antigo pode "desfazer" um passo; não faz sentido emitir
    // nada nesse caso.
    const d = SG.diffProgresso(completo, { transacao: true });
    expect(d.novos).toEqual([]);
  });
});

describe('SETUP_GUIDE.registrarProgresso', () => {
  function espiao() {
    const eventos = [];
    return { eventos, fn: (nome, dados) => eventos.push({ nome, dados }) };
  }

  function memoria(inicial) {
    let guardado = inicial || null;
    return {
      ler: () => guardado,
      gravar: (e) => { guardado = e; },
      get atual() { return guardado; },
    };
  }

  test('emite um evento por passo concluído, com o progresso', () => {
    const { eventos, fn } = espiao();
    SG.registrarProgresso({ transacao: true, renda: true }, memoria({ transacao: true }), fn);

    expect(eventos).toHaveLength(1);
    expect(eventos[0].nome).toBe('onboarding_passo_concluido');
    expect(eventos[0].dados).toMatchObject({ passo: 'renda', concluidos: 2, total: 4 });
  });

  test('emite evento de conclusão ao fechar o funil', () => {
    const { eventos, fn } = espiao();
    SG.registrarProgresso(
      { transacao: true, renda: true, orcamento: true, meta: true },
      memoria({ transacao: true, renda: true, orcamento: true }),
      fn,
    );

    expect(eventos.map(e => e.nome)).toEqual(['onboarding_passo_concluido', 'onboarding_concluido']);
  });

  test('não emite nada quando nada mudou', () => {
    const { eventos, fn } = espiao();
    const mem = memoria({ transacao: true });
    SG.registrarProgresso({ transacao: true }, mem, fn);

    expect(eventos).toEqual([]);
  });

  test('persiste o estado para a próxima chamada', () => {
    const { fn } = espiao();
    const mem = memoria(null);

    SG.registrarProgresso({ transacao: true }, mem, fn);
    expect(mem.atual).toEqual({ transacao: true });
  });

  test('chamar duas vezes seguidas emite só na primeira', () => {
    const { eventos, fn } = espiao();
    const mem = memoria(null);

    SG.registrarProgresso({ transacao: true }, mem, fn);
    SG.registrarProgresso({ transacao: true }, mem, fn);

    expect(eventos).toHaveLength(1);
  });

  test('nenhum evento carrega valor financeiro', () => {
    // A instrumentação existe para medir o funil, não para observar a vida
    // financeira de ninguém.
    const { eventos, fn } = espiao();
    SG.registrarProgresso({ transacao: true, renda: true, orcamento: true, meta: true }, memoria({}), fn);

    const serializado = JSON.stringify(eventos);
    expect(serializado).not.toMatch(/valor|saldo|R\$/i);
    // "renda" aparece só como nome do passo, nunca como quantia.
    eventos.forEach((e) => {
      Object.keys(e.dados).forEach((k) => expect(['passo', 'concluidos', 'total']).toContain(k));
    });
  });

  test('falha ao ler o estado anterior não impede o registro', () => {
    const { eventos, fn } = espiao();
    const quebrado = { ler: () => { throw new Error('storage cheio'); }, gravar: () => {} };

    expect(() => SG.registrarProgresso({ transacao: true }, quebrado, fn)).not.toThrow();
    expect(eventos).toHaveLength(1);
  });

  test('falha ao gravar não propaga', () => {
    const { fn } = espiao();
    const quebrado = { ler: () => null, gravar: () => { throw new Error('quota'); } };

    expect(() => SG.registrarProgresso({ transacao: true }, quebrado, fn)).not.toThrow();
  });

  test('sem emissor configurado apenas persiste', () => {
    const mem = memoria(null);
    expect(() => SG.registrarProgresso({ transacao: true }, mem, null)).not.toThrow();
  });
});

describe('SETUP_GUIDE.computeProgress', () => {
  test('usuário novo: 0% e próximo = transação', () => {
    const p = SG.computeProgress({});
    expect(p.concluidos).toBe(0);
    expect(p.total).toBe(4);
    expect(p.percentual).toBe(0);
    expect(p.proximo.chave).toBe('transacao');
    expect(p.completo).toBe(false);
  });
  test('avança para o próximo passo não concluído', () => {
    const p = SG.computeProgress({ transacao: true, renda: true });
    expect(p.concluidos).toBe(2);
    expect(p.percentual).toBe(50);
    expect(p.proximo.chave).toBe('orcamento');
  });
  test('tudo feito => completo, sem próximo', () => {
    const p = SG.computeProgress({ transacao: true, renda: true, orcamento: true, meta: true });
    expect(p.completo).toBe(true);
    expect(p.percentual).toBe(100);
    expect(p.proximo).toBeNull();
  });
  test('respeita a ordem dos passos', () => {
    // só meta feita => próximo ainda é transacao (primeiro não concluído)
    expect(SG.computeProgress({ meta: true }).proximo.chave).toBe('transacao');
  });
});

describe('SETUP_GUIDE.mensagemProximoPasso', () => {
  test('retorna o próximo passo com contagem', () => {
    const m = SG.mensagemProximoPasso({ transacao: true });
    expect(m.chave).toBe('renda');
    expect(m.concluidos).toBe(1);
    expect(m.total).toBe(4);
    expect(m.texto).toMatch(/renda/i);
  });
  test('null quando tudo concluído', () => {
    expect(SG.mensagemProximoPasso({ transacao: true, renda: true, orcamento: true, meta: true })).toBeNull();
  });
});

describe('SETUP_GUIDE.buildCardHtml', () => {
  test('usuário novo: barra 0%, 0 de 4, próximo = transação', () => {
    const h = SG.buildCardHtml({});
    expect(h).toContain('Comece aqui');
    expect(h).toContain('0 de 4');
    expect(h).toContain('width:0%');
    expect(h).toContain('Adicione sua primeira transação');
    expect(h).toContain('Crie uma meta de economia');
    // "Próximo" deve estar no primeiro passo (transação)
    expect(h.indexOf('Próximo')).toBeGreaterThan(-1);
  });
  test('progresso parcial: 2 de 4 e barra 50%', () => {
    const h = SG.buildCardHtml({ transacao: true, renda: true });
    expect(h).toContain('2 de 4');
    expect(h).toContain('width:50%');
    expect(h).toContain('setup-step proximo');
  });
  test('setup completo => string vazia', () => {
    expect(SG.buildCardHtml({ transacao: true, renda: true, orcamento: true, meta: true })).toBe('');
  });
  test('marca passos feitos com classe feito', () => {
    const h = SG.buildCardHtml({ transacao: true });
    expect(h).toContain('setup-step feito');
  });
});

describe('SETUP_GUIDE.buildCardHtml — CTA acionável', () => {
  test('novo usuário: botão leva à aba Novo', () => {
    const h = SG.buildCardHtml({});
    expect(h).toContain('data-action="mudar-aba"');
    expect(h).toContain('data-aba="novo"');
    expect(h).toContain('setup-cta');
  });
  test('próximo = orçamento leva à aba orcamento', () => {
    const h = SG.buildCardHtml({ transacao: true, renda: true });
    expect(h).toContain('data-aba="orcamento"');
  });
  test('próximo = renda abre o Novo já em Receita', () => {
    const h = SG.buildCardHtml({ transacao: true });
    expect(h).toContain('data-action="mudar-aba" data-aba="novo" data-tipo="receita"');
    expect(h).toContain('Lançar receita');
  });

  test('depois do primeiro lançamento o próximo passo é a renda, não o perfil', () => {
    // Achado da auditoria de ativação (09/10/2026): o guia mandava
    // "Personalize seu perfil" logo depois do primeiro gasto.
    const p = SG.computeProgress({ transacao: true });
    expect(p.passos.map((x) => x.chave)).toEqual(['transacao', 'renda', 'orcamento', 'meta']);
    expect(p.proximo.chave).toBe('renda');
    expect(SG.buildCardHtml({ transacao: true })).not.toMatch(/perfil/i);
  });
  test('setup completo: sem card, sem CTA', () => {
    expect(SG.buildCardHtml({ transacao: true, renda: true, orcamento: true, meta: true })).toBe('');
  });
});
