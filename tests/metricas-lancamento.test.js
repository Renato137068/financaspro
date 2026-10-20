/**
 * metricas-lancamento.test.js — linha de base do tempo de lançamento.
 *
 * Três garantias: a medição só conta tentativas de verdade (começa, conclui,
 * ignora as abandonadas por horas), o resumo bate com os dados gravados, e
 * nada que identifique o lançamento é guardado.
 */
const { carregarScript } = require('./helpers/carregar-script.cjs');

function novo() {
  localStorage.clear();
  return carregarScript('js/core/metricas-lancamento.js');
}

describe('METRICAS_LANCAMENTO — linha de base', () => {
  beforeEach(() => localStorage.clear());

  test('uma tentativa concluída conta tempo e toques', () => {
    const M = novo();
    M.iniciar(1000);
    M.interagir(); M.interagir(); M.interagir();
    expect(M.concluir(1000 + 12000)).toBe(true);
    const r = M.resumo();
    expect(r.iniciados).toBe(1);
    expect(r.concluidos).toBe(1);
    expect(r.taxaConclusaoPct).toBe(100);
    expect(r.medianaTempoMs).toBe(12000);
    expect(r.medianaInteracoes).toBe(3);
  });

  test('concluir sem tentativa não grava nada', () => {
    const M = novo();
    expect(M.concluir(5000)).toBe(false);
    expect(M.resumo().concluidos).toBe(0);
  });

  test('não reinicia uma tentativa recente em andamento', () => {
    const M = novo();
    M.iniciar(1000);
    M.iniciar(3000);
    M.concluir(4000);
    expect(M.resumo().medianaTempoMs).toBe(3000);
    expect(M.resumo().iniciados).toBe(1);
  });

  test('uma tentativa abandonada por mais de 30 minutos é substituída, não medida', () => {
    const M = novo();
    M.iniciar(0);
    const trintaUmMin = 31 * 60 * 1000;
    M.iniciar(trintaUmMin);
    M.concluir(trintaUmMin + 4000);
    expect(M.resumo().medianaTempoMs).toBe(4000);
    expect(M.resumo().iniciados).toBe(2);
  });

  test('concluir após mais de 30 minutos descarta a medida', () => {
    const M = novo();
    M.iniciar(0);
    expect(M.concluir(31 * 60 * 1000)).toBe(false);
    expect(M.resumo().concluidos).toBe(0);
  });

  test('taxa de conclusão reflete abandonos', () => {
    const M = novo();
    M.iniciar(0); M.concluir(1000);
    M.cancelar();
    M.iniciar(5000); M.cancelar();
    M.iniciar(9000); M.concluir(10000);
    M.iniciar(20000); M.cancelar();
    expect(M.resumo().iniciados).toBe(4);
    expect(M.resumo().concluidos).toBe(2);
    expect(M.resumo().taxaConclusaoPct).toBe(50);
  });

  test('mediana com quantidade par de amostras', () => {
    const M = novo();
    [1000, 3000].forEach((d) => { M.iniciar(0); M.concluir(d); });
    expect(M.resumo().medianaTempoMs).toBe(2000);
  });

  test('sem amostras, as medianas são nulas', () => {
    const M = novo();
    expect(M.resumo()).toMatchObject({ medianaTempoMs: null, medianaInteracoes: null, taxaConclusaoPct: null });
  });

  test('guarda no máximo 200 amostras', () => {
    const M = novo();
    for (let i = 0; i < 250; i++) { M.iniciar(0); M.concluir(1000); }
    expect(M.resumo().amostras).toBe(200);
    expect(M.resumo().concluidos).toBe(250);
  });

  test('não grava valor, descrição, categoria nem data', () => {
    const M = novo();
    M.iniciar(0); M.interagir(); M.concluir(2000);
    const bruto = localStorage.getItem('fp_metricas_lancamento');
    expect(bruto).not.toMatch(/valor|descri|categoria|data|Aluguel|1500/i);
    expect(JSON.parse(bruto)).toEqual({ iniciados: 1, concluidos: 1, duracoesMs: [2000], interacoes: [1] });
  });

  test('armazenamento indisponível não derruba o app', () => {
    const M = novo();
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = function() { throw new Error('quota'); };
    try {
      expect(() => { M.iniciar(0); M.concluir(1000); }).not.toThrow();
    } finally {
      Storage.prototype.setItem = original;
    }
  });

  test('limpar zera o histórico', () => {
    const M = novo();
    M.iniciar(0); M.concluir(1000);
    M.limpar();
    expect(M.resumo().iniciados).toBe(0);
  });
});
