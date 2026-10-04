/**
 * store-persistencia-falhas.test.js — o estado de UI salvo no aparelho quando
 * algo dá errado: disco cheio, estado velho demais ou conteúdo corrompido. Em
 * todos os casos o app segue com o estado padrão e só registra um aviso.
 */
const { carregarScript } = require('./helpers/carregar-script.cjs');

const SETE_DIAS = 7 * 24 * 60 * 60 * 1000;
let avisos;
let warnOriginal;

beforeEach(() => {
  localStorage.clear();
  avisos = [];
  warnOriginal = console.warn;
  console.warn = (...args) => { avisos.push(args.map(String).join(' ')); };
});
afterEach(() => { console.warn = warnOriginal; });

function novoStore() {
  const { APP_STORE } = carregarScript('js/core/store.js');
  return APP_STORE;
}

describe('APP_STORE — persistência da UI com falhas', () => {
  test('exporta APP_STORE e APP_STATE para quem carrega como módulo', () => {
    const mod = carregarScript('js/core/store.js');
    expect(typeof mod.APP_STORE.dispatch).toBe('function');
    expect(mod.APP_STATE).toBeDefined();
  });

  test('estado salvo há mais de 7 dias é ignorado com aviso', () => {
    localStorage.setItem('fp-store-v2', JSON.stringify({
      ui: { abaAtiva: 'extrato' }, timestamp: Date.now() - SETE_DIAS - 1000,
    }));
    const store = novoStore();
    store._carregarUIPersistido();
    expect(avisos.join('\n')).toMatch(/expirado/);
  });

  test('conteúdo corrompido não derruba o carregamento', () => {
    localStorage.setItem('fp-store-v2', '{não é json');
    const store = novoStore();
    expect(() => store._carregarUIPersistido()).not.toThrow();
    expect(avisos.join('\n')).toMatch(/Erro ao carregar estado/);
  });

  test('falha ao gravar (disco cheio) vira aviso, não exceção', () => {
    const store = novoStore();
    const setItemOriginal = localStorage.setItem;
    localStorage.setItem = () => { throw new Error('QuotaExceededError'); };
    try {
      expect(() => store._persistirUI()).not.toThrow();
    } finally {
      localStorage.setItem = setItemOriginal;
    }
    expect(avisos.join('\n')).toMatch(/Erro ao persistir/);
  });
});
