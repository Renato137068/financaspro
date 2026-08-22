/**
 * cota-armazenamento.test.js — o que acontece quando acaba o espaço.
 *
 * Origem: a auditoria de dimensões ocultas simulou 60 mil lançamentos e mediu
 * 8,79 MB — contra um teto de localStorage de ~5 MB. O limite prático fica
 * perto de 35 mil lançamentos, e o app não dizia nada a respeito: a pessoa
 * batia no teto um dia, no meio de um cadastro.
 *
 * Investigando o caminho de gravação apareceu algo pior que a falta de aviso:
 * no modo criptografado o erro de cota era engolido por um `console.error`. A
 * gravação falhava, o cache em memória seguia com o valor novo, e o app
 * parecia funcionar até o próximo reload — quando o lançamento não estava mais
 * lá. Perder dado financeiro em silêncio é o pior desfecho possível.
 *
 * Limite honesto: o teto de 5 MB é uma constante, não uma medição. Nenhum
 * navegador expõe o limite real do localStorage.
 */
/**
 * Nota sobre o carregamento: o harness `load-sources` injeta um FIXTURE de
 * DADOS, não o módulo real — descobri isso quando este teste falhou com
 * "_storageSetRaw is not a function". `js/core/dados.js`, que é a camada de
 * persistência, não era carregado por teste nenhum.
 *
 * Aqui ele é carregado de verdade, em contexto próprio, com apenas as
 * dependências que a parte de armazenamento usa. As demais (API, BILLING,
 * APP_STORE, LOCAL_CRYPTO) já são acessadas sob `typeof x !== 'undefined'` no
 * módulo, então ficam ausentes de propósito: exercitar o caminho sem elas é o
 * cenário do primeiro carregamento do app.
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.join(__dirname, '..');

function carregarDadosReal() {
  const sandbox = {
    window: global.window,
    document: global.document,
    localStorage: global.localStorage,
    console: global.console,
    setTimeout: (...a) => global.setTimeout(...a),
    clearTimeout: (...a) => global.clearTimeout(...a),
    fetch: (...a) => global.fetch(...a),
    UTILS: { mostrarToast: () => {}, gerarId: () => 'id' },
  };
  sandbox.globalThis = sandbox;
  const ctx = vm.createContext(sandbox);

  for (const rel of ['js/core/config.js', 'js/core/dados.js']) {
    const file = path.join(root, rel);
    // filename ABSOLUTO: com caminho relativo o v8 não mapeia o código
    // executado de volta ao arquivo e o módulo aparece com 0% na cobertura.
    vm.runInContext(fs.readFileSync(file, 'utf8'), ctx, { filename: file });
  }
  return sandbox;
}

const sandbox = carregarDadosReal();
const D = () => sandbox.DADOS;

/** DOMException de cota como cada navegador a emite. */
function erroDeCota(variante) {
  const e = new Error('quota');
  if (variante === 'firefox') { e.name = 'NS_ERROR_DOM_QUOTA_REACHED'; e.code = 1014; }
  else if (variante === 'legado') { e.name = 'QuotaExceededError'; e.code = 22; }
  else { e.name = 'QuotaExceededError'; }
  return e;
}

let toasts;

beforeEach(() => {
  toasts = [];
  sandbox.UTILS.mostrarToast = (msg, tipo) => toasts.push({ msg, tipo });
  D()._avisouCota = false;
  localStorage.clear();
});

// ─── detecção do erro ────────────────────────────────────────────────────────
describe('_ehErroDeCota', () => {
  test.each([['padrão'], ['legado'], ['firefox']])(
    'reconhece a variante %s', (v) => {
      expect(D()._ehErroDeCota(erroDeCota(v))).toBe(true);
    },
  );

  test('não confunde erro comum com falta de espaço', () => {
    // Tratar um bug qualquer como "acabou o espaço" mandaria o usuário apagar
    // dados sem necessidade.
    expect(D()._ehErroDeCota(new TypeError('x is not a function'))).toBe(false);
    expect(D()._ehErroDeCota(null)).toBe(false);
    expect(D()._ehErroDeCota(undefined)).toBe(false);
  });
});

// ─── medição ─────────────────────────────────────────────────────────────────
describe('usoArmazenamento', () => {
  test('mede zero num armazenamento vazio', () => {
    expect(D().usoArmazenamento().bytes).toBe(0);
  });

  test('o uso cresce com o dado gravado', () => {
    const antes = D().usoArmazenamento().bytes;
    localStorage.setItem('teste', 'x'.repeat(1000));
    const depois = D().usoArmazenamento().bytes;

    expect(depois).toBeGreaterThan(antes);
  });

  test('conta 2 bytes por caractere (UTF-16)', () => {
    localStorage.setItem('k', 'v'.repeat(100));
    // 1 char de chave + 100 de valor = 101 × 2
    expect(D().usoArmazenamento().bytes).toBe(202);
  });

  test('o percentual é relativo ao teto declarado', () => {
    const uso = D().usoArmazenamento();
    expect(uso.limite).toBe(D().LIMITE_STORAGE_BYTES);
    expect(uso.percentual).toBe(Math.round((uso.bytes / uso.limite) * 100));
  });

  test('percentual nunca passa de 100', () => {
    const original = D().LIMITE_STORAGE_BYTES;
    D().LIMITE_STORAGE_BYTES = 10;
    localStorage.setItem('grande', 'x'.repeat(500));

    expect(D().usoArmazenamento().percentual).toBe(100);

    D().LIMITE_STORAGE_BYTES = original;
  });
});

// ─── aviso preventivo ────────────────────────────────────────────────────────
describe('verificarCota', () => {
  /** Força o uso a um percentual aproximado encolhendo o teto. */
  function encherAte(percentual) {
    localStorage.setItem('dados', 'x'.repeat(5000));
    const bytes = D().usoArmazenamento().bytes;
    D().LIMITE_STORAGE_BYTES = Math.round(bytes / (percentual / 100));
  }

  const tetoOriginal = 5 * 1024 * 1024;
  afterEach(() => { D().LIMITE_STORAGE_BYTES = tetoOriginal; });

  test('não avisa abaixo do limiar', () => {
    encherAte(50);
    D().verificarCota();
    expect(toasts).toEqual([]);
  });

  test('avisa ao passar de 80%', () => {
    encherAte(90);
    D().verificarCota();

    expect(toasts).toHaveLength(1);
    expect(toasts[0].tipo).toBe('warning');
  });

  test('o aviso diz o que fazer, não só que há um problema', () => {
    // "Armazenamento cheio" sem saída deixa a pessoa travada.
    encherAte(90);
    D().verificarCota();

    expect(toasts[0].msg).toMatch(/backup/i);
    expect(toasts[0].msg).toMatch(/apagar|antigos/i);
  });

  test('avisa uma vez por sessão, não a cada gravação', () => {
    // Repetido a cada escrita, o aviso vira ruído e a pessoa aprende a
    // ignorá-lo — justamente antes do dia em que ele importa.
    encherAte(90);
    D().verificarCota();
    D().verificarCota();
    D().verificarCota();

    expect(toasts).toHaveLength(1);
  });
});

// ─── relógio do aparelho ─────────────────────────────────────────────────────
describe('_conferirRelogio', () => {
  /** Resposta fetch com o cabeçalho Date desviado N horas do agora local. */
  function respostaComDesvio(horas) {
    const dataServidor = new Date(Date.now() - horas * 3600000).toUTCString();
    return { headers: { get: (h) => (h === 'Date' ? dataServidor : null) } };
  }

  beforeEach(() => { D()._avisouRelogio = false; D().desvioRelogioMs = null; });

  test('não reclama de um relógio certo', () => {
    D()._conferirRelogio(respostaComDesvio(0));
    expect(toasts).toEqual([]);
  });

  test('tolera desvio pequeno — latência de rede não é erro de relógio', () => {
    D()._conferirRelogio(respostaComDesvio(1));
    expect(toasts).toEqual([]);
  });

  test('avisa com o relógio horas adiantado', () => {
    // Toda data de lançamento nasce do relógio local: um aparelho com a data
    // errada gera um extrato inteiro deslocado, e os números continuam batendo.
    D()._conferirRelogio(respostaComDesvio(30));

    expect(toasts).toHaveLength(1);
    expect(toasts[0].msg).toMatch(/adiantado/);
    expect(toasts[0].tipo).toBe('warning');
  });

  test('avisa com o relógio horas atrasado', () => {
    D()._conferirRelogio(respostaComDesvio(-30));

    expect(toasts).toHaveLength(1);
    expect(toasts[0].msg).toMatch(/atrasado/);
  });

  test('a mensagem diz o efeito, não só o fato', () => {
    // "Seu relógio está errado" não explica por que isso importa aqui.
    D()._conferirRelogio(respostaComDesvio(30));
    expect(toasts[0].msg).toMatch(/mês certo|lançamentos/i);
  });

  test('registra o desvio medido para diagnóstico', () => {
    D()._conferirRelogio(respostaComDesvio(10));
    expect(Math.round(D().desvioRelogioMs / 3600000)).toBe(10);
  });

  test('avisa uma vez por sessão', () => {
    D()._conferirRelogio(respostaComDesvio(30));
    D()._conferirRelogio(respostaComDesvio(30));
    expect(toasts).toHaveLength(1);
  });

  test('resposta sem cabeçalho Date não gera aviso nem quebra', () => {
    expect(() => D()._conferirRelogio({ headers: { get: () => null } })).not.toThrow();
    expect(() => D()._conferirRelogio({})).not.toThrow();
    expect(() => D()._conferirRelogio(null)).not.toThrow();
    expect(toasts).toEqual([]);
  });

  test('cabeçalho Date ilegível é ignorado', () => {
    // Proxy mal configurado não pode virar um alarme falso sobre o relógio.
    D()._conferirRelogio({ headers: { get: () => 'não é uma data' } });
    expect(toasts).toEqual([]);
  });
});

// ─── gravação com o disco cheio ──────────────────────────────────────────────
describe('_storageSetRaw com cota esgotada', () => {
  let setItemOriginal;

  beforeEach(() => {
    setItemOriginal = localStorage.setItem.bind(localStorage);
  });

  afterEach(() => {
    localStorage.setItem = setItemOriginal;
  });

  test('avisa o usuário em vez de falhar em silêncio', () => {
    localStorage.setItem = () => { throw erroDeCota('padrão'); };

    D()._storageSetRaw('fp-transacoes', '[]');

    expect(toasts).toHaveLength(1);
    expect(toasts[0].tipo).toBe('error');
    expect(toasts[0].msg).toMatch(/backup/i);
  });

  test('devolve false quando não conseguiu gravar', () => {
    // O chamador precisa poder saber. Antes a função não devolvia nada.
    localStorage.setItem = () => { throw erroDeCota('padrão'); };

    expect(D()._storageSetRaw('fp-transacoes', '[]')).toBe(false);
  });

  test('devolve true quando gravou', () => {
    expect(D()._storageSetRaw('fp-transacoes', '[]')).toBe(true);
  });

  test('erro que NÃO é de cota continua propagando', () => {
    // Engolir tudo esconderia bug de verdade atrás de uma mensagem sobre
    // espaço em disco.
    localStorage.setItem = () => { throw new TypeError('storage quebrado'); };

    expect(() => D()._storageSetRaw('fp-transacoes', '[]')).toThrow(TypeError);
    expect(toasts).toEqual([]);
  });

  test('as três variantes de erro de cota são tratadas', () => {
    for (const v of ['padrão', 'legado', 'firefox']) {
      toasts = [];
      D()._avisouCota = false;
      localStorage.setItem = () => { throw erroDeCota(v); };

      expect(D()._storageSetRaw('fp-transacoes', '[]')).toBe(false);
      expect(toasts).toHaveLength(1);
    }
  });
});
