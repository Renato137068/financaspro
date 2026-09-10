/**
 * erros-silenciosos.test.js — o app não pode saber que algo deu errado e
 * guardar isso para si.
 *
 * É o mesmo tema que atravessou todo o trabalho de auditoria: as âncoras de DOM
 * que faltavam, as recorrentes que não recorriam, as features fora do bundle.
 * Em todos os casos o código "funcionava" — só não fazia nada, e ninguém era
 * avisado.
 *
 * Restavam dois focos:
 *
 * 1. VINTE `catch` VAZIOS. Engolir a exceção sem nem registrar significa que,
 *    quando algo quebra na casa do usuário, não há rastro nenhum para
 *    investigar depois.
 *
 * 2. LEITURA DE DADOS QUE FALHA EM SILÊNCIO. `getTransacoes()` devolvia `[]`
 *    quando o JSON do localStorage estava corrompido. O efeito na tela é
 *    devastador e ambíguo: o usuário abre o app e vê ZERO lançamentos. Ele não
 *    tem como saber se os dados sumiram ou se apenas não foram lidos — e a
 *    diferença é enorme, porque no segundo caso os dados ainda estão lá e um
 *    backup pode salvá-los. Pior: qualquer gravação seguinte sobrescreve o
 *    conteúdo corrompido e aí a perda vira definitiva.
 */
const { loadCoreModules, resetFixtures, execNoSandbox } = require('./load-sources');

beforeAll(() => { loadCoreModules(); });
beforeEach(() => { resetFixtures(); });

describe('UTILS.tentar', () => {
  test('devolve o valor quando dá certo', () => {
    const r = UTILS.tentar('teste', () => 42);
    expect(r.ok).toBe(true);
    expect(r.valor).toBe(42);
    expect(r.erro).toBeNull();
  });

  test('não propaga a exceção', () => {
    expect(() => UTILS.tentar('teste', () => { throw new Error('boom'); })).not.toThrow();
  });

  test('sinaliza a falha em vez de fingir sucesso', () => {
    const r = UTILS.tentar('teste', () => { throw new Error('boom'); });
    expect(r.ok).toBe(false);
    expect(r.erro.message).toBe('boom');
  });

  test('devolve o valor padrão combinado quando falha', () => {
    const r = UTILS.tentar('teste', () => { throw new Error('x'); }, { padrao: [] });
    expect(r.valor).toEqual([]);
  });

  test('registra o erro no OBS com o contexto', () => {
    // OBS é lido como identificador nu dentro do sandbox do vm; injetar em
    // `global` não alcançaria o módulo. Mesma armadilha de realm que já
    // apareceu com Date e com TRANSACTION_SERVICE.
    execNoSandbox('var __capturados = []; '
      + 'var OBS = { captureError: function(e, ctx) { __capturados.push(ctx); } };');

    UTILS.tentar('salvarTransacao', () => { throw new Error('boom'); });

    const capturados = execNoSandbox('__capturados');
    // O contexto é o que transforma um erro anônimo em algo investigável.
    expect(capturados).toHaveLength(1);
    expect(capturados[0].contexto).toBe('salvarTransacao');

    execNoSandbox('OBS = undefined;');
  });

  test('sem OBS disponível, não estoura', () => {
    const original = global.OBS;
    global.OBS = undefined;
    try {
      expect(() => UTILS.tentar('teste', () => { throw new Error('x'); })).not.toThrow();
    } finally {
      global.OBS = original;
    }
  });

  test('avisa o usuário quando pedido', () => {
    const toasts = [];
    const original = UTILS.mostrarToast;
    UTILS.mostrarToast = (msg, tipo) => toasts.push({ msg, tipo });

    try {
      UTILS.tentar('teste', () => { throw new Error('x'); }, {
        avisar: 'Não foi possível concluir',
      });
    } finally {
      UTILS.mostrarToast = original;
    }

    expect(toasts).toHaveLength(1);
    expect(toasts[0].msg).toBe('Não foi possível concluir');
    expect(toasts[0].tipo).toBe('error');
  });

  test('não avisa quando não foi pedido — nem todo erro é assunto do usuário', () => {
    const toasts = [];
    const original = UTILS.mostrarToast;
    UTILS.mostrarToast = (msg) => toasts.push(msg);

    try {
      UTILS.tentar('cosmetico', () => { throw new Error('x'); });
    } finally {
      UTILS.mostrarToast = original;
    }

    expect(toasts).toEqual([]);
  });

  test('a mensagem ao usuário nunca é a mensagem técnica do erro', () => {
    // "Cannot read properties of undefined" não ajuda ninguém e ainda expõe
    // detalhe interno.
    const toasts = [];
    const original = UTILS.mostrarToast;
    UTILS.mostrarToast = (msg) => toasts.push(msg);

    try {
      UTILS.tentar('teste', () => { throw new Error('TypeError interno feio'); }, {
        avisar: 'Não foi possível salvar',
      });
    } finally {
      UTILS.mostrarToast = original;
    }

    expect(toasts[0]).not.toContain('TypeError');
  });

  test('função ausente não quebra a chamada', () => {
    expect(() => UTILS.tentar('teste', null)).not.toThrow();
    expect(UTILS.tentar('teste', null).ok).toBe(false);
  });
});

describe('leitura de dados corrompidos não pode parecer "sem dados"', () => {
  // A distinção importa: `[]` porque não há nada é normal; `[]` porque a
  // leitura falhou é uma emergência que o usuário precisa conhecer ANTES de
  // continuar usando o app e sobrescrever o que sobrou.
  //
  // Verificação estática: o DADOS do harness é um stub em memória, então não
  // há como corromper o localStorage dele. O que importa travar é que o
  // dados.js REAL não volte a engolir a falha num console.error.
  const fs = require('fs');
  const path = require('path');
  const dados = fs.readFileSync(
    path.join(__dirname, '..', 'js', 'core', 'dados.js'), 'utf8',
  );

  test('existe uma forma de saber que a leitura falhou', () => {
    expect(dados).toContain('leituraFalhou');
    expect(dados).toContain('_registrarFalhaLeitura');
  });

  test('hydrate IDB de transações também registra falha de parse', () => {
    expect(dados).toMatch(
      /IDB_KV\.get\(CONFIG\.STORAGE_TRANSACOES\)[\s\S]{0,400}_registrarFalhaLeitura\(CONFIG\.STORAGE_TRANSACOES/,
    );
  });

  test('a falha avisa o usuário — e sugere backup antes de gravar', () => {
    const bloco = dados.slice(dados.indexOf('_registrarFalhaLeitura: function'));
    expect(bloco).toContain('mostrarToast');
    expect(bloco).toMatch(/backup/i);
  });

  test('nenhuma das leituras volta a usar console.error como único tratamento', () => {
    expect(dados).not.toContain("console.error('Erro ao carregar transacoes:'");
    expect(dados).not.toContain("console.error('Erro ao carregar config:'");
    expect(dados).not.toContain("console.error('Erro ao carregar contas:'");
  });
});

describe('guarda contra novos catch vazios', () => {
  const fs = require('fs');
  const path = require('path');
  const root = path.join(__dirname, '..');

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

  test('nenhum catch engole a exceção sem deixar rastro', () => {
    // Um `catch (e) {}` é a forma mais barata de fazer um bug desaparecer da
    // vista sem desaparecer do app. Se o erro é mesmo irrelevante, dizer isso
    // num comentário custa uma linha — e a próxima pessoa saberá que foi
    // decisão, não descuido.
    const vazios = [];

    for (const f of arquivosJs(path.join(root, 'js'))) {
      const src = fs.readFileSync(f, 'utf8');
      const linhas = src.split('\n');

      linhas.forEach((linha, i) => {
        if (!/catch\s*\([a-zA-Z_$]*\)\s*\{\s*\}/.test(linha)) return;
        vazios.push(path.relative(root, f) + ':' + (i + 1));
      });
    }

    expect(vazios).toEqual([]);
  });

  test('a varredura encontra arquivos (o teste não pode virar no-op)', () => {
    expect(arquivosJs(path.join(root, 'js')).length).toBeGreaterThan(50);
  });
});
