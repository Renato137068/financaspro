/**
 * insights-ritmo.test.js — alerta proativo de "ritmo de gastos acima".
 *
 * INSIGHTS.analisar() emite um insight tipo 'ritmo' quando o gasto acumulado do
 * mês até hoje supera em >= 20% o mesmo ponto do mês passado. Como analisar()
 * usa `new Date()` internamente, os dados são montados para o mês corrente/
 * anterior reais e a asserção respeita a regra do dia >= 5.
 */
const { loadCoreModules, resetFixtures } = require('./load-sources');

loadCoreModules();

function pad(n) { return String(n).padStart(2, '0'); }

const now = new Date();
const y = now.getFullYear();
const m = now.getMonth() + 1;
const dia = now.getDate();
let prevM = m - 1, prevY = y;
if (prevM < 1) { prevM = 12; prevY -= 1; }

function lancar(valor, data) {
  global.DADOS.salvarTransacao({
    id: global.UTILS.gerarId(),
    tipo: 'despesa', valor: valor, data: data,
    categoria: 'lazer', descricao: 'teste',
  });
  global.TRANSACOES._cache = null;
  global.TRANSACOES._cacheTimestamp = null;
}

beforeEach(function() {
  resetFixtures();
  // resetFixtures zera ORCAMENTO._cache; em produção o app chama init() no boot.
  // analisar() lê orçamentos, então reinicializa o cache aqui.
  if (global.ORCAMENTO && global.ORCAMENTO.init) global.ORCAMENTO.init();
});

describe('INSIGHTS — alerta de ritmo de gastos', function() {
  test('emite insight tipo "ritmo" quando o mês está acima do mesmo ponto anterior', function() {
    // Dia 02 de cada mês (sempre <= hoje quando hoje >= 5): mês corrente 50%
    // acima do anterior no mesmo ponto.
    lancar(1500, y + '-' + pad(m) + '-02');
    lancar(1000, prevY + '-' + pad(prevM) + '-02');

    const lista = global.INSIGHTS.analisar();
    const ritmo = lista.find(function(i) { return i.tipo === 'ritmo'; });

    if (dia >= 5) {
      expect(ritmo).toBeTruthy();
      expect(ritmo.msg).toContain('50%');
      expect(ritmo.gravidade).toBe('alta'); // 50% → alta
    } else {
      // Nos primeiros dias do mês o alerta fica em silêncio (regra dia >= 5).
      expect(ritmo).toBeUndefined();
    }
  });

  test('não emite quando o ritmo está dentro do normal (< 20%)', function() {
    lancar(1050, y + '-' + pad(m) + '-02');   // só 5% acima
    lancar(1000, prevY + '-' + pad(prevM) + '-02');

    const ritmo = global.INSIGHTS.analisar().find(function(i) { return i.tipo === 'ritmo'; });
    expect(ritmo).toBeUndefined();
  });
});

describe('INSIGHTS — descrição não sofre escape duplo nas mensagens', function() {
  function lancarDesc(descricao, data) {
    global.DADOS.salvarTransacao({
      id: global.UTILS.gerarId(),
      tipo: 'despesa', valor: 90, data: data,
      categoria: 'compras', descricao: descricao,
    });
    global.TRANSACOES._cache = null;
    global.TRANSACOES._cacheTimestamp = null;
  }

  test('insight de recorrência exibe "C&A", não "C&amp;A" (decodifica o guardado)', function() {
    // Descrição guardada escapada (como o app grava): "C&amp;A". Três meses
    // seguidos para virar padrão recorrente.
    lancarDesc('C&amp;A', '2026-01-10');
    lancarDesc('C&amp;A', '2026-02-10');
    lancarDesc('C&amp;A', '2026-03-10');

    const rec = global.INSIGHTS.analisar().find(function(i) { return i.tipo === 'recorrencia'; });
    expect(rec).toBeTruthy();
    // A detecção normaliza para minúsculas; a mensagem passa por escapeHtml,
    // então "c&a" vira "c&amp;a" (UMA camada), nunca "c&amp;amp;a".
    expect(rec.msg).toContain('c&amp;a');
    expect(rec.msg).not.toContain('c&amp;amp;a');
    // O parâmetro que preenche o campo vem decodificado (sem corromper ao salvar).
    expect(rec.parametros.descricao).toBe('c&a');
  });
});
