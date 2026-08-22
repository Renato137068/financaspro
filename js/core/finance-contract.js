/**
 * finance-contract.js — contrato PT (localStorage) ↔ EN (API).
 * Única fonte de conversão no cliente; dados.js e sync-engine delegam aqui.
 */
var FINANCE_CONTRACT = {
  UUID_RE: /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,

  isUuid: function(v) {
    return typeof v === 'string' && this.UUID_RE.test(v);
  },

  /** Resolve nome, id legado ou UUID para UUID de conta. */
  resolveAccountId: function(ref, contas) {
    if (ref == null || ref === '') return null;
    var s = String(ref).trim();
    if (this.isUuid(s)) return s;
    var lista = Array.isArray(contas) ? contas : [];
    for (var i = 0; i < lista.length; i++) {
      var c = lista[i];
      if (!c) continue;
      if (c.id === s) return this.isUuid(c.id) ? c.id : null;
      if (c.nome && c.nome.toLowerCase() === s.toLowerCase()) {
        return this.isUuid(c.id) ? c.id : null;
      }
    }
    return null;
  },

  /** Rótulo legível para exibição local a partir de UUID. */
  accountLabel: function(ref, contas) {
    if (!ref) return '';
    if (!this.isUuid(String(ref))) return String(ref);
    var lista = Array.isArray(contas) ? contas : [];
    for (var i = 0; i < lista.length; i++) {
      if (lista[i] && lista[i].id === ref) return lista[i].nome || ref;
    }
    return String(ref);
  },

  _parseAmount: function(v) {
    if (typeof v === 'number') return v;
    return parseFloat(String(v).replace(',', '.')) || 0;
  },

  _toIsoDate: function(data) {
    if (!data) return new Date().toISOString();
    var s = String(data);
    return s.length === 10 ? s + 'T00:00:00.000Z' : s;
  },

  ACCOUNT_TYPE_PT_TO_EN: {
    corrente: 'checking', poupanca: 'savings', credito: 'credit',
    cartao: 'credit', investimento: 'investment',
  },

  ACCOUNT_TYPE_EN_TO_PT: {
    checking: 'corrente', savings: 'poupanca', credit: 'credito', investment: 'investimento',
  },

  FREQ_PT_TO_EN: {
    diario: 'daily', diaria: 'daily', daily: 'daily',
    semanal: 'weekly', weekly: 'weekly',
    mensal: 'monthly', monthly: 'monthly',
    anual: 'yearly', yearly: 'yearly',
  },

  FREQ_EN_TO_PT: {
    daily: 'diario', weekly: 'semanal', monthly: 'mensal', yearly: 'anual',
  },

  txPtToEn: function(tx, contas) {
    if (!tx || typeof tx !== 'object') return tx;
    var contasRef = contas || (typeof DADOS !== 'undefined' && DADOS.getContas ? DADOS.getContas() : []);
    var accountId = this.resolveAccountId(tx.banco, contasRef);
    var targetAccountId = this.resolveAccountId(tx.contaDestinoId || tx.contaDestino, contasRef);
    return {
      type: tx.tipo,
      amount: this._parseAmount(tx.valor),
      description: tx.descricao || 'Sem descrição',
      category: tx.categoria || 'outro',
      subcategory: tx.subcategoria || undefined,
      date: this._toIsoDate(tx.data),
      accountId: accountId,
      targetAccountId: targetAccountId,
      tags: Array.isArray(tx.tags) ? tx.tags : [],
      notes: tx.notas || undefined,
      recurring: !!tx.recorrente,
    };
  },

  txEnToPt: function(tx, contas) {
    if (!tx || typeof tx !== 'object') return tx;
    var contasRef = contas || (typeof DADOS !== 'undefined' && DADOS.getContas ? DADOS.getContas() : []);
    var banco = tx.accountId || '';
    var contaDestinoId = tx.targetAccountId || null;
    return {
      id: tx.id,
      tipo: tx.type,
      valor: tx.amount != null ? Number(tx.amount) : 0,
      categoria: tx.category || '',
      subcategoria: tx.subcategory || '',
      data: tx.date ? String(tx.date).substring(0, 10) : '',
      descricao: tx.description || '',
      banco: this.accountLabel(banco, contasRef) || banco,
      contaDestinoId: contaDestinoId,
      contaDestino: contaDestinoId ? this.accountLabel(contaDestinoId, contasRef) : '',
      cartao: '',
      notas: tx.notes || '',
      tags: tx.tags || [],
      recorrente: !!tx.recurring,
      dataCriacao: tx.createdAt || tx.date || new Date().toISOString(),
      updatedAt: tx.updatedAt || tx.createdAt || new Date().toISOString(),
      deletedAt: tx.deletedAt || null,
      _apiId: tx.id,
    };
  },

  contaPtToEn: function(conta) {
    if (!conta || typeof conta !== 'object') return conta;
    var tipo = conta.tipo || 'corrente';
    var typeEn = this.ACCOUNT_TYPE_PT_TO_EN[tipo] || (this.ACCOUNT_TYPE_EN_TO_PT[tipo] ? tipo : 'checking');
    return {
      name: conta.nome || conta.name || 'Conta',
      type: typeEn,
      balance: conta.saldo != null ? Number(conta.saldo) : (conta.balance != null ? Number(conta.balance) : 0),
      currency: conta.moeda || conta.currency || 'BRL',
      institution: conta.banco || conta.institution || null,
    };
  },

  contaEnToPt: function(ac) {
    if (!ac || typeof ac !== 'object') return ac;
    var tipoEn = ac.type || 'checking';
    return {
      id: ac.id,
      nome: ac.name || '',
      tipo: this.ACCOUNT_TYPE_EN_TO_PT[tipoEn] || tipoEn,
      saldo: ac.balance != null ? Number(ac.balance) : 0,
      moeda: ac.currency || 'BRL',
      banco: ac.institution || '',
      ativo: ac.active !== false,
      dataCriacao: ac.createdAt || new Date().toISOString(),
      _apiId: ac.id,
    };
  },

  recorrentePtToEn: function(rec) {
    if (!rec || typeof rec !== 'object') return rec;
    var freqRaw = (rec.frequencia || rec.frequency || 'mensal').toLowerCase();
    var freqEn = this.FREQ_PT_TO_EN[freqRaw] || 'monthly';
    var inicio = rec.dataInicio || rec.inicio || rec.startDate;
    var fim = rec.dataFim || rec.fim || rec.endDate;
    var proximo = rec.proximoVencimento || rec.proxima || rec.nextDue || inicio;
    return {
      type: rec.tipo || rec.type || 'despesa',
      amount: this._parseAmount(rec.valor != null ? rec.valor : rec.amount),
      description: rec.descricao || rec.description || 'Recorrente',
      category: rec.categoria || rec.category || 'outro',
      frequency: freqEn,
      startDate: this._toIsoDate(inicio),
      endDate: fim ? this._toIsoDate(fim) : null,
      nextDue: this._toIsoDate(proximo),
      active: rec.ativo !== false && rec.active !== false,
    };
  },

  recorrenteEnToPt: function(rec) {
    if (!rec || typeof rec !== 'object') return rec;
    var freqPt = this.FREQ_EN_TO_PT[rec.frequency] || rec.frequency || 'mensal';
    return {
      id: rec.id,
      tipo: rec.type,
      valor: rec.amount != null ? Number(rec.amount) : 0,
      descricao: rec.description || '',
      categoria: rec.category || '',
      frequencia: freqPt,
      dataInicio: rec.startDate ? String(rec.startDate).substring(0, 10) : '',
      dataFim: rec.endDate ? String(rec.endDate).substring(0, 10) : null,
      proximoVencimento: rec.nextDue ? String(rec.nextDue).substring(0, 10) : '',
      ativo: rec.active !== false,
      dataCriacao: rec.createdAt || new Date().toISOString(),
      _apiId: rec.id,
    };
  },
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = FINANCE_CONTRACT;
}
