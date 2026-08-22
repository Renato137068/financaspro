/**
 * bancos-formato.test.js — `config.bancos` tem duas formas no mesmo app.
 *
 * O formato legado é uma lista de strings (`['Nubank', 'Itaú']`); o formato
 * atual, gravado por INIT_CONFIG.adicionarBanco, é uma lista de objetos
 * (`[{ nome: 'Nubank', tipo: 'Conta Corrente' }]`). Quem instalou o app antes
 * da mudança tem o primeiro; quem cadastrou um banco depois tem o segundo. Uma
 * mesma instalação pode ter os dois misturados.
 *
 * `init-form.js` já tratava as duas formas. `parser.js` não: fazia
 * `b.toLowerCase()` direto e estourava "b.toLowerCase is not a function" — o
 * que derrubava a entrada rápida inteira para qualquer usuário que tivesse
 * cadastrado um banco pela tela de configurações.
 *
 * O bug era invisível enquanto a entrada rápida estava fora do HTML. Ao
 * restaurá-la, ele passou a ser alcançável.
 */
const { loadCoreModules } = require('./load-sources');

beforeAll(() => { loadCoreModules(); });

function comBancos(bancos, fn) {
  const original = DADOS.getConfig;
  DADOS.getConfig = () => ({ bancos });
  try { return fn(); } finally { DADOS.getConfig = original; }
}

describe('UTILS.nomeDeConta', () => {
  test('aceita string', () => {
    expect(UTILS.nomeDeConta('Nubank')).toBe('Nubank');
  });

  test('aceita objeto com nome', () => {
    expect(UTILS.nomeDeConta({ nome: 'Nubank', tipo: 'Conta Corrente' })).toBe('Nubank');
  });

  test('valores inúteis viram string vazia, nunca "undefined"', () => {
    expect(UTILS.nomeDeConta(null)).toBe('');
    expect(UTILS.nomeDeConta(undefined)).toBe('');
    expect(UTILS.nomeDeConta({})).toBe('');
    expect(UTILS.nomeDeConta(42)).toBe('');
  });

  test('remove espaços das pontas', () => {
    expect(UTILS.nomeDeConta('  Itaú  ')).toBe('Itaú');
    expect(UTILS.nomeDeConta({ nome: '  Itaú  ' })).toBe('Itaú');
  });
});

describe('PARSER com bancos cadastrados', () => {
  test('não estoura com bancos no formato objeto', () => {
    comBancos([{ nome: 'Meu Banco', tipo: 'Conta Corrente' }], () => {
      expect(() => PARSER.extrair('uber 32,90')).not.toThrow();
    });
  });

  test('reconhece banco cadastrado no formato objeto', () => {
    comBancos([{ nome: 'Neon', tipo: 'Conta Digital' }], () => {
      expect(PARSER.extrair('mercado 50 neon').banco).toBe('neon');
    });
  });

  test('reconhece banco cadastrado no formato string legado', () => {
    comBancos(['Neon'], () => {
      expect(PARSER.extrair('mercado 50 neon').banco).toBe('neon');
    });
  });

  test('aguenta os dois formatos misturados na mesma instalação', () => {
    comBancos(['Neon', { nome: 'C6', tipo: 'Conta Digital' }], () => {
      expect(PARSER.extrair('mercado 50 neon').banco).toBe('neon');
      expect(PARSER.extrair('mercado 50 c6').banco).toBe('c6');
    });
  });

  test('entrada corrompida na lista não derruba o parser', () => {
    comBancos([null, {}, 42, { nome: 'Inter' }], () => {
      expect(() => PARSER.extrair('uber 32,90')).not.toThrow();
      expect(PARSER.extrair('uber 32,90 inter').banco).toBe('inter');
    });
  });

  test('o valor continua correto mesmo com banco na frase', () => {
    comBancos([{ nome: 'Nubank' }], () => {
      const r = PARSER.extrair('ifood 45,90 nubank');
      expect(r.valor).toBe(45.9);
      expect(r.banco).toBe('nubank');
    });
  });
});
