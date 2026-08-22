/**
 * setup-guide.test.js — progresso de configuração inicial (facilidade p/ iniciantes).
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');
function load() {
  const ctx = vm.createContext({ Math, Array, Object, String });
  // filename absoluto: é a chave que o provider v8 usa para mapear o código
  // executado no vm de volta ao arquivo-fonte. Com nome relativo o teste passa
  // mas o módulo aparece com 0% de cobertura no relatório.
  const file = path.join(__dirname, '..', 'js', 'core', 'setup-guide.js');
  const code = fs.readFileSync(file, 'utf8');
  vm.runInContext(code, ctx, { filename: file });
  return ctx.SETUP_GUIDE;
}
const SG = load();

describe('SETUP_GUIDE.diffProgresso', () => {
  const completo = { perfil: true, transacao: true, orcamento: true, meta: true };

  test('primeira execução sem estado anterior conta o que já está feito', () => {
    const d = SG.diffProgresso(null, { perfil: true });
    expect(d.novos).toEqual(['perfil']);
    expect(d.completouAgora).toBe(false);
  });

  test('detecta apenas o passo que mudou', () => {
    const d = SG.diffProgresso({ perfil: true }, { perfil: true, transacao: true });
    expect(d.novos).toEqual(['transacao']);
  });

  test('sem mudança não gera nada — chamada repetida é inofensiva', () => {
    // O card é renderizado a cada atualização do dashboard; sem esta garantia
    // o funil encheria de eventos duplicados e a métrica não valeria nada.
    const d = SG.diffProgresso({ perfil: true }, { perfil: true });
    expect(d.novos).toEqual([]);
    expect(d.completouAgora).toBe(false);
  });

  test('vários passos de uma vez são todos registrados', () => {
    const d = SG.diffProgresso({}, { perfil: true, orcamento: true });
    expect(d.novos.sort()).toEqual(['orcamento', 'perfil']);
  });

  test('conclusão do funil é sinalizada uma única vez', () => {
    const primeiro = SG.diffProgresso({ perfil: true, transacao: true, orcamento: true }, completo);
    expect(primeiro.completouAgora).toBe(true);

    const segundo = SG.diffProgresso(completo, completo);
    expect(segundo.completouAgora).toBe(false);
  });

  test('regressão de estado não gera evento negativo', () => {
    // Restaurar backup antigo pode "desfazer" um passo; não faz sentido emitir
    // nada nesse caso.
    const d = SG.diffProgresso(completo, { perfil: true });
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
    SG.registrarProgresso({ perfil: true, transacao: true }, memoria({ perfil: true }), fn);

    expect(eventos).toHaveLength(1);
    expect(eventos[0].nome).toBe('onboarding_passo_concluido');
    expect(eventos[0].dados).toMatchObject({ passo: 'transacao', concluidos: 2, total: 4 });
  });

  test('emite evento de conclusão ao fechar o funil', () => {
    const { eventos, fn } = espiao();
    SG.registrarProgresso(
      { perfil: true, transacao: true, orcamento: true, meta: true },
      memoria({ perfil: true, transacao: true, orcamento: true }),
      fn,
    );

    expect(eventos.map(e => e.nome)).toEqual(['onboarding_passo_concluido', 'onboarding_concluido']);
  });

  test('não emite nada quando nada mudou', () => {
    const { eventos, fn } = espiao();
    const mem = memoria({ perfil: true });
    SG.registrarProgresso({ perfil: true }, mem, fn);

    expect(eventos).toEqual([]);
  });

  test('persiste o estado para a próxima chamada', () => {
    const { fn } = espiao();
    const mem = memoria(null);

    SG.registrarProgresso({ perfil: true }, mem, fn);
    expect(mem.atual).toEqual({ perfil: true });
  });

  test('chamar duas vezes seguidas emite só na primeira', () => {
    const { eventos, fn } = espiao();
    const mem = memoria(null);

    SG.registrarProgresso({ perfil: true }, mem, fn);
    SG.registrarProgresso({ perfil: true }, mem, fn);

    expect(eventos).toHaveLength(1);
  });

  test('nenhum evento carrega valor financeiro', () => {
    // A instrumentação existe para medir o funil, não para observar a vida
    // financeira de ninguém.
    const { eventos, fn } = espiao();
    SG.registrarProgresso({ perfil: true, transacao: true, orcamento: true, meta: true }, memoria({}), fn);

    const serializado = JSON.stringify(eventos);
    expect(serializado).not.toMatch(/valor|saldo|renda|R\$/i);
  });

  test('falha ao ler o estado anterior não impede o registro', () => {
    const { eventos, fn } = espiao();
    const quebrado = { ler: () => { throw new Error('storage cheio'); }, gravar: () => {} };

    expect(() => SG.registrarProgresso({ perfil: true }, quebrado, fn)).not.toThrow();
    expect(eventos).toHaveLength(1);
  });

  test('falha ao gravar não propaga', () => {
    const { fn } = espiao();
    const quebrado = { ler: () => null, gravar: () => { throw new Error('quota'); } };

    expect(() => SG.registrarProgresso({ perfil: true }, quebrado, fn)).not.toThrow();
  });

  test('sem emissor configurado apenas persiste', () => {
    const mem = memoria(null);
    expect(() => SG.registrarProgresso({ perfil: true }, mem, null)).not.toThrow();
  });
});

describe('SETUP_GUIDE.computeProgress', () => {
  test('usuário novo: 0% e próximo = perfil', () => {
    const p = SG.computeProgress({});
    expect(p.concluidos).toBe(0);
    expect(p.total).toBe(4);
    expect(p.percentual).toBe(0);
    expect(p.proximo.chave).toBe('perfil');
    expect(p.completo).toBe(false);
  });
  test('avança para o próximo passo não concluído', () => {
    const p = SG.computeProgress({ perfil: true, transacao: true });
    expect(p.concluidos).toBe(2);
    expect(p.percentual).toBe(50);
    expect(p.proximo.chave).toBe('orcamento');
  });
  test('tudo feito => completo, sem próximo', () => {
    const p = SG.computeProgress({ perfil: true, transacao: true, orcamento: true, meta: true });
    expect(p.completo).toBe(true);
    expect(p.percentual).toBe(100);
    expect(p.proximo).toBeNull();
  });
  test('respeita a ordem dos passos', () => {
    // só meta feita => próximo ainda é perfil (primeiro não concluído)
    expect(SG.computeProgress({ meta: true }).proximo.chave).toBe('perfil');
  });
});

describe('SETUP_GUIDE.mensagemProximoPasso', () => {
  test('retorna o próximo passo com contagem', () => {
    const m = SG.mensagemProximoPasso({ perfil: true });
    expect(m.chave).toBe('transacao');
    expect(m.concluidos).toBe(1);
    expect(m.total).toBe(4);
    expect(m.texto).toMatch(/transação/i);
  });
  test('null quando tudo concluído', () => {
    expect(SG.mensagemProximoPasso({ perfil: true, transacao: true, orcamento: true, meta: true })).toBeNull();
  });
});

describe('SETUP_GUIDE.buildCardHtml', () => {
  test('usuário novo: barra 0%, 0 de 4, próximo = perfil', () => {
    const h = SG.buildCardHtml({});
    expect(h).toContain('Comece aqui');
    expect(h).toContain('0 de 4');
    expect(h).toContain('width:0%');
    expect(h).toContain('Personalize seu perfil');
    expect(h).toContain('Crie uma meta de economia');
    // "Próximo" deve estar no primeiro passo (perfil)
    expect(h.indexOf('Próximo')).toBeGreaterThan(-1);
  });
  test('progresso parcial: 2 de 4 e barra 50%', () => {
    const h = SG.buildCardHtml({ perfil: true, transacao: true });
    expect(h).toContain('2 de 4');
    expect(h).toContain('width:50%');
    expect(h).toContain('setup-step proximo');
  });
  test('setup completo => string vazia', () => {
    expect(SG.buildCardHtml({ perfil: true, transacao: true, orcamento: true, meta: true })).toBe('');
  });
  test('marca passos feitos com classe feito', () => {
    const h = SG.buildCardHtml({ perfil: true });
    expect(h).toContain('setup-step feito');
  });
});

describe('SETUP_GUIDE.buildCardHtml — CTA acionável', () => {
  test('novo usuário: botão leva ao perfil (config)', () => {
    const h = SG.buildCardHtml({});
    expect(h).toContain('data-action="mudar-aba"');
    expect(h).toContain('data-aba="config"');
    expect(h).toContain('setup-cta');
  });
  test('próximo = orçamento leva à aba orcamento', () => {
    const h = SG.buildCardHtml({ perfil: true, transacao: true });
    expect(h).toContain('data-aba="orcamento"');
  });
  test('próximo = transação leva à aba novo', () => {
    const h = SG.buildCardHtml({ perfil: true });
    expect(h).toContain('data-aba="novo"');
  });
  test('setup completo: sem card, sem CTA', () => {
    expect(SG.buildCardHtml({ perfil: true, transacao: true, orcamento: true, meta: true })).toBe('');
  });
});
