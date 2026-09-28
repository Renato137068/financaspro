/**
 * contas-pagar-notificacao.test.js — o aviso do sistema de contas vencendo.
 *
 * notificarVencimentos roda no boot: com permissão de notificação, avisa uma
 * vez por dia das contas pendentes que vencem hoje ou já venceram. Era o único
 * trecho de contas-pagar.js sem teste.
 */
const { carregarScript, viaGlobal } = require('./helpers/carregar-script.cjs');

const HOJE = '2026-09-27';
const conta = (id, vencimento, extra) => Object.assign(
  { id, descricao: 'Conta ' + id, valor: 100, vencimento, status: 'pendente' }, extra || {},
);

let avisos;
let CONTAS_PAGAR;

function montar(contas, permissao) {
  avisos = [];
  global.Notification = function(titulo, opts) { avisos.push({ titulo, corpo: opts.body, tag: opts.tag }); };
  global.Notification.permission = permissao || 'granted';
  global.DADOS = { getConfig: () => ({ contasPagar: contas }), salvarConfig() {} };
  global.UTILS = {
    dataLocalIso: () => HOJE,
    formatarMoeda: (v) => 'R$ ' + v.toFixed(2).replace('.', ','),
    diasAte: (d) => Math.round((new Date(d + 'T00:00:00') - new Date(HOJE + 'T00:00:00')) / 86400000),
  };
  localStorage.clear();
  CONTAS_PAGAR = carregarScript('js/contas-pagar.js', viaGlobal('UTILS'));
  global.CONTAS_PAGAR = CONTAS_PAGAR;
}

afterEach(() => {
  delete global.Notification;
  delete global.CONTAS_PAGAR;
});

describe('CONTAS_PAGAR.notificarVencimentos', () => {
  test('avisa das contas vencidas e de hoje, não das futuras nem das pagas', () => {
    montar([
      conta('a', '2026-09-25'),
      conta('b', HOJE),
      conta('c', '2026-09-30'),
      conta('d', '2026-09-20', { status: 'pago' }),
    ]);
    CONTAS_PAGAR.notificarVencimentos();

    expect(avisos).toHaveLength(1);
    expect(avisos[0].titulo).toBe('Contas a pagar');
    expect(avisos[0].corpo).toBe('Conta a — R$ 100,00\nConta b — R$ 100,00');
    expect(avisos[0].tag).toBe('fp-contas-vencimento');
  });

  test('só uma vez por dia', () => {
    montar([conta('a', HOJE)]);
    CONTAS_PAGAR.notificarVencimentos();
    CONTAS_PAGAR.notificarVencimentos();
    expect(avisos).toHaveLength(1);
    expect(localStorage.getItem('fp-contas-notif-dia')).toBe(HOJE);
  });

  test('mais de três urgentes: lista três e resume o resto', () => {
    montar(['1', '2', '3', '4', '5'].map((id) => conta(id, '2026-09-26')));
    CONTAS_PAGAR.notificarVencimentos();
    expect(avisos[0].corpo.split('\n')).toEqual([
      'Conta 1 — R$ 100,00', 'Conta 2 — R$ 100,00', 'Conta 3 — R$ 100,00', '+2 outras',
    ]);
  });

  test('sem permissão ou sem nada urgente: silêncio', () => {
    montar([conta('a', HOJE)], 'default');
    CONTAS_PAGAR.notificarVencimentos();
    expect(avisos).toHaveLength(0);

    montar([conta('a', '2026-10-15')]);
    CONTAS_PAGAR.notificarVencimentos();
    expect(avisos).toHaveLength(0);
    expect(localStorage.getItem('fp-contas-notif-dia')).toBeNull();
  });
});
