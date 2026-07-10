/**
 * contas-pagar.js — Contas a pagar com vencimento e recorrência
 */
const CONTAS_PAGAR = {
  init: function() {
    var config = DADOS.getConfig();
    if (!config.contasPagar) DADOS.salvarConfig({ contasPagar: [] });
  },

  listar: function() {
    return (DADOS.getConfig().contasPagar || []).slice();
  },

  listarPendentes: function() {
    return this.listar().filter(function(c) { return c.status === 'pendente'; });
  },

  obter: function(id) {
    return this.listar().filter(function(c) { return c.id === id; })[0] || null;
  },

  _salvarLista: function(lista) {
    DADOS.salvarConfig({ contasPagar: lista });
  },

  criar: function(dados) {
    var descricao = (dados.descricao || '').trim();
    var valor = parseFloat(dados.valor);
    var vencimento = dados.vencimento;
    if (!descricao) throw new Error('Informe a descrição');
    if (!valor || valor <= 0) throw new Error('Valor inválido');
    if (!vencimento) throw new Error('Informe o vencimento');

    var conta = {
      id: UTILS.gerarId(),
      descricao: descricao,
      valor: valor,
      vencimento: vencimento,
      categoria: dados.categoria || 'outro',
      recorrente: !!dados.recorrente,
      status: 'pendente',
      criadoEm: new Date().toISOString()
    };
    var lista = this.listar();
    lista.push(conta);
    this._salvarLista(lista);
    return conta;
  },

  excluir: function(id) {
    this._salvarLista(this.listar().filter(function(c) { return c.id !== id; }));
  },

  _addMes: function(dataStr) {
    var p = dataStr.split('-');
    var d = new Date(parseInt(p[0], 10), parseInt(p[1], 10) - 1, parseInt(p[2], 10));
    d.setMonth(d.getMonth() + 1);
    return [
      d.getFullYear(),
      String(d.getMonth() + 1).padStart(2, '0'),
      String(d.getDate()).padStart(2, '0')
    ].join('-');
  },

  marcarPago: function(id, registrarDespesa) {
    var conta = this.obter(id);
    if (!conta) throw new Error('Conta não encontrada');
    var lista = this.listar();
    var idx = -1;
    for (var i = 0; i < lista.length; i++) {
      if (lista[i].id === id) { idx = i; break; }
    }
    if (idx < 0) return null;

    if (registrarDespesa && typeof TRANSACOES !== 'undefined') {
      TRANSACOES.criar(
        CONFIG.TIPO_DESPESA,
        conta.valor,
        conta.categoria,
        new Date().toISOString().split('T')[0],
        conta.descricao + (conta.recorrente ? ' (conta)' : ''),
        '',
        ''
      );
    }

    if (conta.recorrente) {
      lista[idx] = Object.assign({}, conta, {
        status: 'pendente',
        vencimento: this._addMes(conta.vencimento),
        ultimoPagamento: new Date().toISOString()
      });
    } else {
      lista[idx] = Object.assign({}, conta, {
        status: 'pago',
        pagoEm: new Date().toISOString()
      });
    }
    this._salvarLista(lista);
    return lista[idx];
  },

  diasAteVencimento: function(vencimento) {
    var hoje = new Date();
    hoje.setHours(0, 0, 0, 0);
    var v = new Date(vencimento + 'T12:00:00');
    return Math.ceil((v - hoje) / 86400000);
  },

  situacao: function(conta) {
    if (conta.status === 'pago') return 'pago';
    var dias = this.diasAteVencimento(conta.vencimento);
    if (dias < 0) return 'vencida';
    if (dias === 0) return 'hoje';
    if (dias <= 3) return 'proxima';
    return 'ok';
  },

  listarNoMes: function(mes, ano) {
    var mm = String(mes).padStart(2, '0');
    var prefix = ano + '-' + mm;
    return this.listarPendentes().filter(function(c) {
      return c.vencimento.indexOf(prefix) === 0;
    });
  },

  resumo: function() {
    var pendentes = this.listarPendentes();
    var hoje = new Date();
    var mes = hoje.getMonth() + 1;
    var ano = hoje.getFullYear();
    var noMes = this.listarNoMes(mes, ano);
    var vencidas = pendentes.filter(function(c) { return CONTAS_PAGAR.situacao(c) === 'vencida'; });
    var totalMes = noMes.reduce(function(s, c) { return s + c.valor; }, 0);
    var totalVencidas = vencidas.reduce(function(s, c) { return s + c.valor; }, 0);
    return {
      pendentes: pendentes.length,
      vencidas: vencidas.length,
      totalMes: totalMes,
      totalVencidas: totalVencidas
    };
  },

  /** Notifica contas vencendo hoje ou vencidas (1x por dia) */
  notificarVencimentos: function() {
    if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return;
    var hoje = new Date().toISOString().split('T')[0];
    try {
      if (localStorage.getItem('fp-contas-notif-dia') === hoje) return;
    } catch (_e) { return; }

    var urgentes = this.listarPendentes().filter(function(c) {
      var s = CONTAS_PAGAR.situacao(c);
      return s === 'vencida' || s === 'hoje';
    });
    if (urgentes.length === 0) return;

    var body = urgentes.slice(0, 3).map(function(c) {
      return c.descricao + ' — ' + UTILS.formatarMoeda(c.valor);
    }).join('\n');
    if (urgentes.length > 3) body += '\n+' + (urgentes.length - 3) + ' outras';

    try {
      new Notification('Contas a pagar', {
        body: body,
        icon: 'icons/android/icon-192.png',
        tag: 'fp-contas-vencimento'
      });
      localStorage.setItem('fp-contas-notif-dia', hoje);
    } catch (_e) { /* ignore */ }
  }
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = CONTAS_PAGAR;
}
