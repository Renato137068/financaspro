/**
 * insights-meta.test.js — insight proativo de meta fora do ritmo.
 *
 * INSIGHTS.analisar() emite um insight tipo 'meta-ritmo' quando existe meta com
 * prazo cuja projeção está 'atrasado' (ritmo abaixo do necessário) ou 'vencida'.
 * É grátis (acompanhamento da própria meta) e mostra o número acionável:
 * "aumente o aporte em R$ Z por mês".
 */
const { loadCoreModules, resetFixtures } = require('./load-sources');

loadCoreModules();

function pad(n) { return String(n).padStart(2, '0'); }
function isoLocal(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }

function lancarTx() {
  // analisar() retorna cedo se não há transações; uma basta para chegar às metas.
  global.DADOS.salvarTransacao({
    id: global.UTILS.gerarId(),
    tipo: 'despesa', valor: 50, data: isoLocal(new Date()),
    categoria: 'lazer', descricao: 'teste',
  });
  global.TRANSACOES._cache = null;
  global.TRANSACOES._cacheTimestamp = null;
}

function setCriadoEm(id, iso) {
  var cfg = global.DADOS.getConfig();
  var metas = (cfg.metas || []).map(function(m) {
    return m.id === id ? Object.assign({}, m, { criadoEm: iso }) : m;
  });
  global.DADOS.salvarConfig({ metas: metas });
}

beforeEach(function() {
  resetFixtures();
  if (global.ORCAMENTO && global.ORCAMENTO.init) global.ORCAMENTO.init();
  if (global.METAS && global.METAS.init) global.METAS.init();
});

describe('INSIGHTS — meta fora do ritmo', function() {
  test('meta atrasada emite insight com o aporte a aumentar e botão', function() {
    lancarTx();
    var hoje = new Date();
    var prazo = new Date(hoje.getFullYear(), hoje.getMonth() + 2, hoje.getDate());
    var meta = global.METAS.criar({ titulo: 'Viagem', valorAlvo: 12000, valorAtual: 1000, prazo: isoLocal(prazo) });
    // Criada há ~3 meses → ritmo demonstrado ~R$ 333/mês, muito abaixo do
    // necessário (~R$ 5.500/mês para 11.000 em ~2 meses) → 'atrasado'.
    var criada = new Date(hoje.getFullYear(), hoje.getMonth() - 3, hoje.getDate());
    setCriadoEm(meta.id, criada.toISOString());

    var mr = global.INSIGHTS.analisar().find(function(i) { return i.tipo === 'meta-ritmo'; });
    expect(mr).toBeTruthy();
    expect(mr.msg).toContain('Viagem');
    expect(mr.msg).toMatch(/aumente o aporte/i);
    expect(mr.acao).toBe('irParaMetas');
    expect(mr.botao).toBe('Ver meta');
    expect(mr.gravidade).toBe('media');
  });

  test('meta ANTIGA parada (ritmo 0, meses decorridos) é sinalizada', function() {
    lancarTx();
    var hoje = new Date();
    var prazo = new Date(hoje.getFullYear(), hoje.getMonth() + 2, hoje.getDate());
    var meta = global.METAS.criar({ titulo: 'Parada', valorAlvo: 10000, valorAtual: 0, prazo: isoLocal(prazo) });
    // Criada há ~3 meses, nada guardado → 'atrasado' legítimo (não 'sem-ritmo').
    var criada = new Date(hoje.getFullYear(), hoje.getMonth() - 3, hoje.getDate());
    setCriadoEm(meta.id, criada.toISOString());

    var mr = global.INSIGHTS.analisar().find(function(i) { return i.tipo === 'meta-ritmo'; });
    expect(mr).toBeTruthy();
    expect(mr.msg).toContain('Parada');
  });

  test('meta recém-criada (sem-ritmo) NÃO é sinalizada', function() {
    lancarTx();
    var hoje = new Date();
    var prazo = new Date(hoje.getFullYear(), hoje.getMonth() + 6, hoje.getDate());
    // Criada agora (criadoEm = hoje, o padrão de METAS.criar): 'sem-ritmo'.
    global.METAS.criar({ titulo: 'Nova', valorAlvo: 12000, valorAtual: 0, prazo: isoLocal(prazo) });

    var mr = global.INSIGHTS.analisar().find(function(i) { return i.tipo === 'meta-ritmo'; });
    expect(mr).toBeUndefined();
  });

  test('meta com prazo vencido emite insight de gravidade alta', function() {
    lancarTx();
    var hoje = new Date();
    var vencido = new Date(hoje.getFullYear(), hoje.getMonth() - 1, hoje.getDate());
    global.METAS.criar({ titulo: 'Reserva', valorAlvo: 5000, valorAtual: 500, prazo: isoLocal(vencido) });

    var mr = global.INSIGHTS.analisar().find(function(i) { return i.tipo === 'meta-ritmo'; });
    expect(mr).toBeTruthy();
    expect(mr.msg).toMatch(/prazo vencido/i);
    expect(mr.gravidade).toBe('alta');
  });

  test('meta no ritmo (sem prazo curto) não emite insight', function() {
    lancarTx();
    var hoje = new Date();
    var prazo = new Date(hoje.getFullYear() + 5, hoje.getMonth(), hoje.getDate());
    // Alvo pequeno, já quase batido, prazo distante → nunca 'atrasado'.
    global.METAS.criar({ titulo: 'Fundo', valorAlvo: 1000, valorAtual: 950, prazo: isoLocal(prazo) });

    var mr = global.INSIGHTS.analisar().find(function(i) { return i.tipo === 'meta-ritmo'; });
    expect(mr).toBeUndefined();
  });

  test('nome da meta é escapado (sem HTML injetado na mensagem)', function() {
    lancarTx();
    var hoje = new Date();
    var vencido = new Date(hoje.getFullYear(), hoje.getMonth() - 1, hoje.getDate());
    global.METAS.criar({ titulo: '<b>x</b>', valorAlvo: 5000, valorAtual: 100, prazo: isoLocal(vencido) });

    var mr = global.INSIGHTS.analisar().find(function(i) { return i.tipo === 'meta-ritmo'; });
    expect(mr).toBeTruthy();
    expect(mr.msg).not.toContain('<b>x</b>');
    expect(mr.msg).toContain('&lt;b&gt;');
  });
});
