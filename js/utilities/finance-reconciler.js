/**
 * finance-reconciler.js — diagnóstico esperado × persistido (modo teste).
 *
 * Uso:
 *   FINANCE_RECONCILER.reconcile({ expected: [...], label: 'carga-anual' })
 *   window.__FP_DIAG.reconcile()
 */
var FINANCE_RECONCILER = (function() {
  function centavos(v) {
    var n = Number(v);
    return Number.isFinite(n) ? Math.round(n * 100) : 0;
  }

  function obterPersistidas() {
    if (typeof TRANSACOES !== 'undefined' && TRANSACOES.obter) {
      return TRANSACOES.obter({}) || [];
    }
    if (typeof DADOS !== 'undefined' && DADOS.getTransacoes) {
      return DADOS.getTransacoes() || [];
    }
    return [];
  }

  function snapshotFila() {
    if (typeof PERSIST_QUEUE !== 'undefined' && PERSIST_QUEUE.getSnapshot) {
      return PERSIST_QUEUE.getSnapshot();
    }
    return { pending: 0, saving: 0, failed: 0, saved: 0, items: [] };
  }

  function detectarDuplicidades(lista) {
    var byId = {};
    var byClientKey = {};
    var dups = [];
    (lista || []).forEach(function(t) {
      if (!t) return;
      if (t.id) {
        byId[t.id] = (byId[t.id] || 0) + 1;
        if (byId[t.id] === 2) dups.push({ tipo: 'id', key: t.id });
      }
      if (t.clientKey) {
        byClientKey[t.clientKey] = (byClientKey[t.clientKey] || 0) + 1;
        if (byClientKey[t.clientKey] === 2) dups.push({ tipo: 'clientKey', key: t.clientKey });
      }
    });
    return dups;
  }

  function totais(lista) {
    var rec = 0;
    var des = 0;
    (lista || []).forEach(function(t) {
      if (!t || t.deletedAt) return;
      if (t.tipo === 'receita') rec += centavos(t.valor);
      else if (t.tipo === 'despesa') des += centavos(t.valor);
    });
    return {
      receitas: rec / 100,
      despesas: des / 100,
      saldo: (rec - des) / 100,
      count: (lista || []).filter(function(t) { return t && !t.deletedAt; }).length
    };
  }

  function totaisPorMes(lista) {
    var map = {};
    (lista || []).forEach(function(t) {
      if (!t || !t.data || t.deletedAt) return;
      var key = String(t.data).slice(0, 7);
      if (!map[key]) map[key] = { receitas: 0, despesas: 0, count: 0 };
      map[key].count++;
      if (t.tipo === 'receita') map[key].receitas += centavos(t.valor);
      else if (t.tipo === 'despesa') map[key].despesas += centavos(t.valor);
    });
    Object.keys(map).forEach(function(k) {
      map[k].receitas /= 100;
      map[k].despesas /= 100;
      map[k].saldo = map[k].receitas - map[k].despesas;
    });
    return map;
  }

  /**
   * @param {object} [opts]
   * @param {Array}  [opts.expected] — lista esperada {tipo,valor,data,descricao?,clientKey?}
   * @param {number} [opts.expectedCount]
   * @returns {object} relatório de reconciliação
   */
  function reconcile(opts) {
    opts = opts || {};
    var persistidas = obterPersistidas();
    var fila = snapshotFila();
    var expectedList = Array.isArray(opts.expected) ? opts.expected : null;
    var expectedCount = opts.expectedCount != null
      ? opts.expectedCount
      : (expectedList ? expectedList.length : null);

    var totP = totais(persistidas);
    var totE = expectedList ? totais(expectedList) : null;
    var dups = detectarDuplicidades(persistidas);

    var missing = [];
    var extra = [];
    if (expectedList) {
      var used = {};
      expectedList.forEach(function(exp, idx) {
        var found = persistidas.find(function(t, i) {
          if (used[i]) return false;
          if (exp.clientKey && t.clientKey === exp.clientKey) return true;
          if (exp.descricao && t.descricao === exp.descricao &&
              Number(t.valor) === Number(exp.valor) &&
              t.data === exp.data && t.tipo === exp.tipo) return true;
          return false;
        });
        if (found) {
          used[persistidas.indexOf(found)] = true;
        } else {
          missing.push({ index: idx, expected: exp });
        }
      });
      persistidas.forEach(function(t, i) {
        if (!used[i] && t && !t.deletedAt) {
          // seed e2e-1 etc. podem existir — só marca se tem clientKey de fila
          if (t.clientKey || (t.descricao && String(t.descricao).indexOf('AnnualE2E') === 0)) {
            extra.push(t);
          }
        }
      });
    }

    var report = {
      ok: true,
      label: opts.label || 'reconcile',
      ts: new Date().toISOString(),
      expectedCount: expectedCount,
      persistedCount: totP.count,
      pending: fila.pending + fila.saving,
      failed: fila.failed,
      duplicates: dups,
      totalsPersisted: totP,
      totalsExpected: totE,
      byMonthPersisted: totaisPorMes(persistidas),
      byMonthExpected: expectedList ? totaisPorMes(expectedList) : null,
      missing: missing,
      extra: extra,
      deltaCount: expectedCount != null ? (totP.count - expectedCount) : null,
      deltaSaldo: totE ? Number((totP.saldo - totE.saldo).toFixed(2)) : null
    };

    if (expectedCount != null && totP.count !== expectedCount) report.ok = false;
    if (dups.length) report.ok = false;
    if (fila.failed > 0 || fila.pending > 0 || fila.saving > 0) report.ok = false;
    if (missing.length) report.ok = false;
    if (totE && Math.abs(report.deltaSaldo) > 0.009) report.ok = false;

    return report;
  }

  return {
    reconcile: reconcile,
    totais: totais,
    totaisPorMes: totaisPorMes,
    detectarDuplicidades: detectarDuplicidades
  };
})();

if (typeof window !== 'undefined') {
  window.__FP_DIAG = window.__FP_DIAG || {};
  window.__FP_DIAG.reconcile = function(opts) {
    return FINANCE_RECONCILER.reconcile(opts);
  };
  window.__FP_DIAG.persistSnapshot = function() {
    return typeof PERSIST_QUEUE !== 'undefined' ? PERSIST_QUEUE.getSnapshot() : null;
  };
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = FINANCE_RECONCILER;
}
