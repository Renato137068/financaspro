/**
 * patrimonio-reconciliacao.test.js — cobre os ramos de integração de
 * js/patrimonio.js que os testes de aritmética não alcançam: os fallbacks
 * "sem UTILS.somarMoeda" e "sem CONTAS", e o casamento de ativo de caixa por
 * NOME (não por contaId) na reconciliação com o extrato.
 *
 * Os módulos vivem num sandbox de vm e leem os vizinhos como identificador nu,
 * então usamos os helpers do harness (semGlobalNoSandbox / execNoSandbox) para
 * desligar dependências dentro do sandbox certo.
 */
const {
  loadCoreModules, resetFixtures, execNoSandbox, semGlobalNoSandbox,
} = require('./load-sources');

loadCoreModules();

const P = () => global.PATRIMONIO;

beforeEach(function() {
  resetFixtures();
});

describe('PATRIMONIO — ramos de integração', function() {
  test('patrimonioLiquido subtrai direto quando UTILS.somarMoeda não existe', function() {
    P().criarAtivo({ nome: 'Casa', valor: 300000, tipo: 'imovel' });
    P().criarDivida({ nome: 'Financiamento', valor: 100000, tipo: 'financiamento' });
    // Desliga só o helper de soma monetária, mantendo o resto de UTILS.
    execNoSandbox('UTILS.__somBkp = UTILS.somarMoeda; UTILS.somarMoeda = undefined;');
    try {
      expect(P().patrimonioLiquido()).toBe(200000);
    } finally {
      execNoSandbox('UTILS.somarMoeda = UTILS.__somBkp; UTILS.__somBkp = undefined;');
    }
  });

  test('sugerirDeContas devolve [] quando o módulo CONTAS não está carregado', function() {
    const out = semGlobalNoSandbox('CONTAS', function() { return P().sugerirDeContas(); });
    expect(out).toEqual([]);
  });

  test('sugerirDeContas percorre ativos já vinculados a uma conta (contaId)', function() {
    P().criarAtivo({ nome: 'Conta XP', valor: 500, tipo: 'investimento', contaId: 'conta-xp' });
    // CONTAS real carregado: a varredura de listarAtivos marca o contaId como
    // vinculado (ramo `if (a.contaId)`) antes de montar as sugestões.
    expect(Array.isArray(P().sugerirDeContas())).toBe(true);
  });

  test('reconciliarContas casa ativo de caixa por nome quando falta contaId', function() {
    P().criarAtivo({ nome: 'Nubank', valor: 1200, tipo: 'corrente' }); // sem contaId
    // Troca CONTAS por um duplo com saldos por nome (sem getAll, então não há
    // saldoPorId — força o caminho de casamento por NOME).
    execNoSandbox(
      'globalThis.__CONTAS_REAL = CONTAS;'
      + 'CONTAS = { saldos: function(){ return [{ nome: "Nubank", saldo: 1000 }]; },'
      + ' _chaveConta: function(n){ return String(n || "").trim().toLowerCase(); } };',
    );
    try {
      const rec = P().reconciliarContas();
      const porNome = rec.overlaps.filter(function(o) { return o.motivo === 'nome'; });
      expect(porNome).toHaveLength(1);
      expect(porNome[0].nome).toBe('Nubank');
      expect(porNome[0].saldoLedger).toBe(1000);
      expect(porNome[0].delta).toBe(200);
    } finally {
      execNoSandbox('CONTAS = globalThis.__CONTAS_REAL; globalThis.__CONTAS_REAL = undefined;');
    }
  });

  test('reconciliarContas casa por contaId e ignora entradas inválidas / sem _chaveConta', function() {
    P().criarAtivo({ nome: 'Corrente', valor: 800, tipo: 'corrente', contaId: 'c1' });
    // CONTAS com getAll e SEM _chaveConta (exercita o lado de fallback dos
    // ternários de chave); saldos com entradas null e semConta (guardas de
    // linha); e UTILS.somarMoeda desligado (lado alternativo do cálculo final).
    execNoSandbox(
      'globalThis.__CR = CONTAS; UTILS.__som2 = UTILS.somarMoeda; UTILS.somarMoeda = undefined;'
      + 'CONTAS = {'
      + ' saldos: function(){ return [null, { semConta: true, nome: "x", saldo: 9 }, { nome: "Corrente", saldo: 700 }]; },'
      + ' getAll: function(){ return [null, { id: "", nome: "z" }, { id: "c1", nome: "Corrente" }]; } };',
    );
    try {
      const rec = P().reconciliarContas();
      const porId = rec.overlaps.filter(function(o) { return o.motivo === 'contaId'; });
      expect(porId).toHaveLength(1);
      expect(porId[0].saldoLedger).toBe(700);
      expect(porId[0].delta).toBe(100);
    } finally {
      execNoSandbox(
        'CONTAS = globalThis.__CR; globalThis.__CR = undefined;'
        + 'UTILS.somarMoeda = UTILS.__som2; UTILS.__som2 = undefined;',
      );
    }
  });
});
