/**
 * open-finance.js — Conexões bancárias (local + nuvem via API)
 *
 * ES Module (ADR 0005): chega sob demanda no chunk 'conta'
 * (js/esm/chunks/conta.js, via LAZY.load), que o publica em window.
 */

import { TRANSACOES } from './transacoes.js';
import { RENDER } from './render.js';
import { BILLING } from './billing.js';
import { DADOS } from './core/dados.js';
import { INIT_BILLING } from './modules/init-billing.js';

const OPEN_FINANCE = {
  SANDBOX_PROVIDER: 'sandbox',
  BELVO_PROVIDER: 'belvo',
  _cloudConnections: null,
  _providers: null,

  _requirePlan: function() {
    if (typeof BILLING !== 'undefined' && BILLING.canUse && !BILLING.canUse('openFinance')) {
      if (typeof INIT_BILLING !== 'undefined' && INIT_BILLING.abrirPaywall) {
        INIT_BILLING.abrirPaywall('Conecte seus bancos e deixe os lançamentos entrarem sozinhos — no Pro.');
      }
      return false;
    }
    return true;
  },

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
    var self = OPEN_FINANCE;
    if (!OPEN_FINANCE.isCloudActive()) {
      return Promise.resolve(OPEN_FINANCE.listConnections());
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
    var self = OPEN_FINANCE;
    if (OPEN_FINANCE._providers) return Promise.resolve(OPEN_FINANCE._providers);
    if (!OPEN_FINANCE.isCloudActive()) {
      return Promise.resolve({ sandbox: true, belvo: false, default: OPEN_FINANCE.SANDBOX_PROVIDER });
    }
    return DADOS.openFinanceProvidersApi().then(function(p) {
      self._providers = p;
      return p;
    });
  },

  isBelvoAvailable: function() {
    return !!(OPEN_FINANCE._providers && OPEN_FINANCE._providers.belvo);
  },

  connectBelvo: function() {
    var self = OPEN_FINANCE;
    if (!OPEN_FINANCE._requirePlan()) {
      return Promise.reject(new Error('Open Finance requer plano Pro'));
    }
    if (!OPEN_FINANCE.isCloudActive()) {
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
    var self = OPEN_FINANCE;
    if (!linkId) return Promise.reject(new Error('Link Belvo inválido'));
    if (!OPEN_FINANCE.isCloudActive()) {
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

    return OPEN_FINANCE.completeBelvoLink(linkId, bankName);
  },

  listConnections: function() {
    if (OPEN_FINANCE.isCloudActive() && OPEN_FINANCE._cloudConnections) {
      return OPEN_FINANCE._cloudConnections;
    }
    return OPEN_FINANCE.getState().connections || [];
  },

  connectSandbox: function(bankLabel) {
    var self = OPEN_FINANCE;
    if (!OPEN_FINANCE._requirePlan()) {
      return Promise.reject(new Error('Open Finance requer plano Pro'));
    }
    bankLabel = (bankLabel || 'Banco Demo').trim() || 'Banco Demo';

    if (OPEN_FINANCE.isCloudActive()) {
      return DADOS.openFinanceConnectApi(bankLabel).then(function(row) {
        if (!row) throw new Error('Falha ao conectar conta');
        var conn = self._mapApiConnection(row);
        self._cloudConnections = (self._cloudConnections || []).concat([conn]);
        return conn;
      });
    }

    var state = OPEN_FINANCE.getState();
    var conn = {
      id: 'of-' + Date.now(),
      provider: OPEN_FINANCE.SANDBOX_PROVIDER,
      bankName: bankLabel,
      status: 'linked',
      linkedAt: new Date().toISOString(),
      lastSync: null,
    };
    state.connections.push(conn);
    OPEN_FINANCE.saveState(state);
    return Promise.resolve(conn);
  },

  disconnect: function(connectionId) {
    var self = OPEN_FINANCE;
    if (OPEN_FINANCE.isCloudActive()) {
      return DADOS.openFinanceDisconnectApi(connectionId).then(function() {
        self._cloudConnections = (self._cloudConnections || []).filter(function(c) {
          return c.id !== connectionId;
        });
      });
    }

    var state = OPEN_FINANCE.getState();
    state.connections = (state.connections || []).filter(function(c) {
      return c.id !== connectionId;
    });
    OPEN_FINANCE.saveState(state);
    return Promise.resolve();
  },

  importTransactions: function(items, connectionId) {
    var existing = typeof DADOS !== 'undefined' ? DADOS.getTransacoes() : [];
    var imported = 0;
    var skipped = 0;
    var self = OPEN_FINANCE;

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
    var self = OPEN_FINANCE;

    if (OPEN_FINANCE.isCloudActive()) {
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

    var state = OPEN_FINANCE.getState();
    var conn = null;
    for (var i = 0; i < state.connections.length; i += 1) {
      if (state.connections[i].id === connectionId) {
        conn = state.connections[i];
        break;
      }
    }
    if (!conn) return Promise.reject(new Error('Conexão não encontrada'));

    var items = conn.provider === OPEN_FINANCE.SANDBOX_PROVIDER
      ? OPEN_FINANCE.generateSandboxTransactions(conn)
      : [];

    var result = OPEN_FINANCE.importTransactions(items, connectionId);
    conn.lastSync = new Date().toISOString();
    state.lastSync = conn.lastSync;
    OPEN_FINANCE.saveState(state);

    if (typeof RENDER !== 'undefined' && RENDER.renderizarTudo) {
      RENDER.renderizarTudo();
    }
    return Promise.resolve(result);
  },

  getStatusLabel: function() {
    var conns = OPEN_FINANCE.listConnections().filter(function(c) {
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

export { OPEN_FINANCE };
export default OPEN_FINANCE;
