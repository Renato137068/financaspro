/**
 * open-finance.js — Conexões bancárias (local + nuvem via API)
 */
var OPEN_FINANCE = {
  SANDBOX_PROVIDER: 'sandbox',
  BELVO_PROVIDER: 'belvo',
  _cloudConnections: null,
  _providers: null,

  isCloudActive: function() {
    return typeof DADOS !== 'undefined' && typeof DADOS._apiAtiva === 'function' && DADOS._apiAtiva();
  },

  getState: function() {
    var cfg = typeof DADOS !== 'undefined' ? DADOS.getConfig() : {};
    if (!cfg.openFinance) {
      cfg.openFinance = { connections: [], lastSync: null };
    }
    if (!Array.isArray(cfg.openFinance.connections)) {
      cfg.openFinance.connections = [];
    }
    return cfg.openFinance;
  },

  saveState: function(state) {
    if (typeof DADOS === 'undefined') return;
    var cfg = DADOS.getConfig();
    cfg.openFinance = state;
    DADOS.salvarConfig(cfg);
  },

  _mapApiConnection: function(row) {
    return {
      id: row.id,
      provider: row.provider,
      bankName: row.bankName,
      status: row.status || 'linked',
      linkedAt: row.linkedAt || row.createdAt,
      lastSync: row.lastSync || row.lastSyncAt || null,
    };
  },

  refreshFromApi: function() {
    var self = this;
    if (!this.isCloudActive()) {
      return Promise.resolve(this.listConnections());
    }
    return Promise.all([
      DADOS.openFinanceListApi(),
      DADOS.openFinanceProvidersApi().catch(function() { return { sandbox: true, belvo: false }; }),
    ]).then(function(results) {
      var rows = results[0];
      self._providers = results[1];
      self._cloudConnections = (rows || []).map(self._mapApiConnection);
      return self._cloudConnections;
    });
  },

  fetchProviders: function() {
    var self = this;
    if (this._providers) return Promise.resolve(this._providers);
    if (!this.isCloudActive()) {
      return Promise.resolve({ sandbox: true, belvo: false, default: this.SANDBOX_PROVIDER });
    }
    return DADOS.openFinanceProvidersApi().then(function(p) {
      self._providers = p;
      return p;
    });
  },

  isBelvoAvailable: function() {
    return !!(this._providers && this._providers.belvo);
  },

  connectBelvo: function() {
    var self = this;
    if (!this.isCloudActive()) {
      return Promise.reject(new Error('Conexão Belvo requer login na nuvem'));
    }
    return DADOS.openFinanceBelvoWidgetTokenApi().then(function(data) {
      if (!data || !data.widgetUrl) throw new Error('Token Belvo indisponível');
      var popup = window.open(
        data.widgetUrl,
        'belvo_connect',
        'width=480,height=720,scrollbars=yes,resizable=yes'
      );
      if (!popup) throw new Error('Permita pop-ups para conectar seu banco');
      self._belvoPopup = popup;
      return data;
    });
  },

  completeBelvoLink: function(linkId, bankName) {
    var self = this;
    if (!linkId) return Promise.reject(new Error('Link Belvo inválido'));
    if (!this.isCloudActive()) {
      return Promise.reject(new Error('Login na nuvem necessário'));
    }
    return DADOS.openFinanceBelvoCompleteApi(linkId, bankName).then(function(row) {
      if (!row) throw new Error('Falha ao salvar conexão Belvo');
      var conn = self._mapApiConnection(row);
      self._cloudConnections = (self._cloudConnections || []).concat([conn]);
      return conn;
    });
  },

  handleBelvoCallback: function(params) {
    var status = params.get('belvo');
    if (!status) return Promise.resolve(null);
    if (status === 'exit' || status === 'event') return Promise.resolve(null);
    if (status !== 'success') return Promise.resolve(null);

    var linkId = params.get('link') || params.get('link_id') || params.get('id');
    var bankName = params.get('institution') || params.get('institution_name') || 'Conta bancária';
    if (!linkId) return Promise.resolve(null);

    return this.completeBelvoLink(linkId, bankName);
  },

  listConnections: function() {
    if (this.isCloudActive() && this._cloudConnections) {
      return this._cloudConnections;
    }
    return this.getState().connections || [];
  },

  connectSandbox: function(bankLabel) {
    var self = this;
    bankLabel = (bankLabel || 'Banco Demo').trim() || 'Banco Demo';

    if (this.isCloudActive()) {
      return DADOS.openFinanceConnectApi(bankLabel).then(function(row) {
        if (!row) throw new Error('Falha ao conectar conta');
        var conn = self._mapApiConnection(row);
        self._cloudConnections = (self._cloudConnections || []).concat([conn]);
        return conn;
      });
    }

    var state = this.getState();
    var conn = {
      id: 'of-' + Date.now(),
      provider: this.SANDBOX_PROVIDER,
      bankName: bankLabel,
      status: 'linked',
      linkedAt: new Date().toISOString(),
      lastSync: null,
    };
    state.connections.push(conn);
    this.saveState(state);
    return Promise.resolve(conn);
  },

  disconnect: function(connectionId) {
    var self = this;
    if (this.isCloudActive()) {
      return DADOS.openFinanceDisconnectApi(connectionId).then(function() {
        self._cloudConnections = (self._cloudConnections || []).filter(function(c) {
          return c.id !== connectionId;
        });
      });
    }

    var state = this.getState();
    state.connections = (state.connections || []).filter(function(c) {
      return c.id !== connectionId;
    });
    this.saveState(state);
    return Promise.resolve();
  },

  importTransactions: function(items, connectionId) {
    var existing = typeof DADOS !== 'undefined' ? DADOS.getTransacoes() : [];
    var imported = 0;
    var skipped = 0;
    var self = this;

    (items || []).forEach(function(raw) {
      var norm = self.normalizeMockTransaction(raw, connectionId);
      if (self.findDuplicateExternalId(existing, norm.openFinanceId)) {
        skipped += 1;
        return;
      }
      if (typeof TRANSACOES === 'undefined' || !TRANSACOES.criar) return;

      var tx = TRANSACOES.criar(
        norm.tipo,
        norm.valor,
        norm.categoria,
        norm.data,
        norm.descricao,
        norm.banco
      );
      if (tx && norm.openFinanceId) {
        tx.openFinanceId = norm.openFinanceId;
        DADOS.salvarTransacao(tx);
      }
      imported += 1;
      existing.push(tx);
    });

    return { imported: imported, skipped: skipped };
  },

  syncConnection: function(connectionId) {
    var self = this;

    if (this.isCloudActive()) {
      return DADOS.openFinanceSyncApi(connectionId).then(function(result) {
        return DADOS.sincronizarComApi().then(function() {
          if (typeof RENDER !== 'undefined' && RENDER.renderizarTudo) {
            RENDER.renderizarTudo();
          }
          return self.refreshFromApi().then(function() {
            return result || { imported: 0, skipped: 0 };
          });
        });
      });
    }

    var state = this.getState();
    var conn = null;
    for (var i = 0; i < state.connections.length; i += 1) {
      if (state.connections[i].id === connectionId) {
        conn = state.connections[i];
        break;
      }
    }
    if (!conn) return Promise.reject(new Error('Conexão não encontrada'));

    var items = conn.provider === this.SANDBOX_PROVIDER
      ? this.generateSandboxTransactions(conn)
      : [];

    var result = this.importTransactions(items, connectionId);
    conn.lastSync = new Date().toISOString();
    state.lastSync = conn.lastSync;
    this.saveState(state);

    if (typeof RENDER !== 'undefined' && RENDER.renderizarTudo) {
      RENDER.renderizarTudo();
    }
    return Promise.resolve(result);
  },

  getStatusLabel: function() {
    var conns = this.listConnections().filter(function(c) {
      return c.status === 'linked';
    });
    if (!conns.length) return 'Nenhuma conta conectada';
    var n = conns.length;
    return n + ' conta' + (n !== 1 ? 's' : '') + ' conectada' + (n !== 1 ? 's' : '');
  },

  findDuplicateExternalId: function(transactions, externalId) {
    return (transactions || []).some(function(t) {
      return t.openFinanceId === externalId;
    });
  },

  normalizeMockTransaction: function(raw, connectionId) {
    return {
      tipo: raw.tipo,
      valor: raw.valor,
      categoria: raw.categoria,
      data: raw.data,
      descricao: raw.descricao,
      banco: raw.banco || '',
      openFinanceId: connectionId + ':' + raw.externalId,
    };
  },

  generateSandboxTransactions: function(connection) {
    var now = new Date();
    var y = now.getFullYear();
    var m = String(now.getMonth() + 1).padStart(2, '0');
    var bank = (connection && connection.bankName) || 'Banco Demo';
    return [
      {
        externalId: 'demo-1',
        tipo: 'despesa',
        valor: 42.5,
        categoria: 'alimentacao',
        data: y + '-' + m + '-14',
        descricao: 'Open Finance · Mercado',
        banco: bank,
      },
      {
        externalId: 'demo-2',
        tipo: 'despesa',
        valor: 19.9,
        categoria: 'transporte',
        data: y + '-' + m + '-16',
        descricao: 'Open Finance · Mobilidade',
        banco: bank,
      },
      {
        externalId: 'demo-3',
        tipo: 'receita',
        valor: 120,
        categoria: 'reembolsos',
        data: y + '-' + m + '-17',
        descricao: 'Open Finance · Estorno',
        banco: bank,
      },
    ];
  },
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    SANDBOX_PROVIDER: OPEN_FINANCE.SANDBOX_PROVIDER,
    findDuplicateExternalId: OPEN_FINANCE.findDuplicateExternalId.bind(OPEN_FINANCE),
    normalizeMockTransaction: OPEN_FINANCE.normalizeMockTransaction.bind(OPEN_FINANCE),
    generateSandboxTransactions: OPEN_FINANCE.generateSandboxTransactions.bind(OPEN_FINANCE),
    handleBelvoCallback: OPEN_FINANCE.handleBelvoCallback.bind(OPEN_FINANCE),
  };
}
