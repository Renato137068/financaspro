/**
 * sync-indicator.js — badge de estado de persistência/sincronização.
 *
 * Local: discreto no topo (não cobre nav/cards). Transient (salvando/sync):
 * toast curto. Falha/pendente: badge com dismiss. "Salvo neste dispositivo"
 * pode ser dispensado (sessionStorage) e reaparece só em mudança de estado.
 */
(function() {
  'use strict';

  var DISMISS_KEY = 'fp-sync-indicator-dismissed';
  var _lastCls = '';
  var _toastTimer = null;
  var _autoHideTimer = null;

  function apiAtiva() {
    try { return typeof DADOS !== 'undefined' && DADOS._apiAtiva && DADOS._apiAtiva(); }
    catch (e) { return false; }
  }

  function lerStatus() {
    var online = (typeof navigator !== 'undefined') ? navigator.onLine !== false : true;
    var pending = false, saving = false, flushing = false, lastSyncAt = null;
    var outboxCount = 0, conflicts = [], lastError = null;
    try {
      if (typeof APP_STORE !== 'undefined' && APP_STORE.get) {
        var s = APP_STORE.get('sync') || {};
        if (typeof s.online === 'boolean') online = s.online;
        pending = !!s.pending;
        saving = !!s.saving;
        flushing = !!s.flushing;
        lastSyncAt = s.lastSyncAt || null;
        outboxCount = s.outboxCount || 0;
        conflicts = s.conflicts || [];
        lastError = s.lastError || null;
      }
    } catch (e) { /* usa fallback */ }
    return {
      online: online, pending: pending, saving: saving, flushing: flushing,
      lastSyncAt: lastSyncAt, outboxCount: outboxCount, conflicts: conflicts,
      lastError: lastError, api: apiAtiva(),
    };
  }

  function textoRelativo(ts) {
    if (!ts) return '';
    var diff = Date.now() - new Date(ts).getTime();
    if (isNaN(diff)) return '';
    var min = Math.floor(diff / 60000);
    if (min < 1) return 'agora mesmo';
    if (min < 60) return 'há ' + min + ' min';
    var h = Math.floor(min / 60);
    if (h < 24) return 'há ' + h + 'h';
    return 'há ' + Math.floor(h / 24) + 'd';
  }

  var EXPLICACAO = {
    local: {
      titulo: 'Onde ficam os seus dados',
      corpo: 'Tudo o que você lança fica guardado neste aparelho. O app não pede '
        + 'cadastro, não conecta ao seu banco e não envia nada para servidor nenhum.'
        + '<br><br>Isso tem duas consequências: ninguém além de você vê seus lançamentos, '
        + 'e <b>trocar de aparelho ou apagar o app leva os dados junto</b>. '
        + 'Exporte um backup de vez em quando, em Perfil › Dados.',
    },
    nuvem: {
      titulo: 'Onde ficam os seus dados',
      corpo: 'Seus lançamentos ficam neste aparelho e também em cópia no servidor, '
        + 'para você abrir a mesma conta em mais de um lugar.'
        + '<br><br>Você pode exportar tudo ou apagar a conta inteira quando quiser, '
        + 'em Perfil › Dados.',
    },
  };

  function explicar(cls) {
    var info = (cls === 'local') ? EXPLICACAO.local : EXPLICACAO.nuvem;
    if (typeof fpAlert !== 'function') return;
    fpAlert(
      '<p aria-hidden="true" style="font-weight:700;margin:0 0 10px;text-align:left">'
      + info.titulo + '</p>'
      + '<p style="margin:0;text-align:left">' + info.corpo + '</p>',
      { trustedHtml: true, title: info.titulo }
    );
  }

  function classificar(st) {
    if (!st.api) return { cls: 'local', label: 'Salvo neste dispositivo', persistente: true };
    if (st.conflicts && st.conflicts.length) {
      return { cls: 'conflito', label: 'Conflito de sync — revise seus dados', persistente: true };
    }
    if (!st.online) return { cls: 'offline', label: 'Offline — alterações pendentes', persistente: true };
    if (st.lastError) {
      return { cls: 'falha', label: 'Falha ao sincronizar — tentaremos de novo', persistente: true };
    }
    if (st.saving) return { cls: 'salvando', label: 'Salvando…', toast: true };
    if (st.flushing || st.pending) return { cls: 'sincronizando', label: 'Sincronizando…', toast: true };
    if (st.outboxCount > 0) {
      return { cls: 'pendente', label: st.outboxCount + ' alteração(ões) aguardando envio', persistente: true };
    }
    var quando = textoRelativo(st.lastSyncAt);
    return { cls: 'ok', label: 'Salvo no servidor' + (quando ? ' · ' + quando : ''), toast: true, ephemeral: true };
  }

  function foiDispensado(cls) {
    try {
      return sessionStorage.getItem(DISMISS_KEY) === cls;
    } catch (e) { return false; }
  }

  function marcarDispensado(cls) {
    try { sessionStorage.setItem(DISMISS_KEY, cls); } catch (e) { /* noop */ }
  }

  function limparDispensaSeMudou(cls) {
    try {
      var prev = sessionStorage.getItem(DISMISS_KEY);
      if (prev && prev !== cls) sessionStorage.removeItem(DISMISS_KEY);
    } catch (e) { /* noop */ }
  }

  var el = null;
  function garantirElemento() {
    if (el && document.body.contains(el)) return el;
    el = document.getElementById('sync-indicator');
    if (!el) {
      el = document.createElement('div');
      el.id = 'sync-indicator';
      el.className = 'sync-indicator';
      el.setAttribute('role', 'status');
      el.setAttribute('aria-live', 'polite');
      el.innerHTML =
        '<button type="button" class="sync-indicator-main" id="sync-indicator-main">' +
          '<span class="sync-dot" aria-hidden="true"></span>' +
          '<span class="sync-text"></span>' +
        '</button>' +
        '<button type="button" class="sync-indicator-dismiss" id="sync-indicator-dismiss" aria-label="Dispensar aviso">×</button>';
      document.body.appendChild(el);

      el.querySelector('#sync-indicator-main').addEventListener('click', function() {
        explicar(el.getAttribute('data-estado') || 'local');
      });
      el.querySelector('#sync-indicator-dismiss').addEventListener('click', function(e) {
        e.stopPropagation();
        var cls = el.getAttribute('data-estado') || 'local';
        marcarDispensado(cls);
        el.hidden = true;
        el.classList.add('sync-indicator--hidden');
        if (typeof ariaLive !== 'undefined' && ariaLive.announce) {
          ariaLive.announce('Aviso de persistência dispensado');
        }
      });
    }
    return el;
  }

  function mostrarToastCurto(label) {
    if (typeof UTILS !== 'undefined' && UTILS.mostrarToast) {
      UTILS.mostrarToast(label, 'info');
      return;
    }
    // Fallback mínimo se toast não existir
    var node = garantirElemento();
    node.hidden = false;
    node.classList.remove('sync-indicator--hidden');
    node.classList.add('sync-indicator--toast');
    var txt = node.querySelector('.sync-text');
    if (txt) txt.textContent = label;
    clearTimeout(_toastTimer);
    _toastTimer = setTimeout(function() {
      node.classList.remove('sync-indicator--toast');
      node.hidden = true;
    }, 2800);
  }

  function render() {
    try {
      var node = garantirElemento();
      var st = lerStatus();
      var info = classificar(st);
      limparDispensaSeMudou(info.cls);

      node.className = 'sync-indicator sync-' + info.cls;
      node.setAttribute('data-estado', info.cls);
      var txt = node.querySelector('.sync-text');
      if (txt) txt.textContent = info.label;
      var main = node.querySelector('#sync-indicator-main');
      if (main) {
        main.setAttribute('title', info.label + ' — toque para entender');
        main.setAttribute('aria-label', info.label + '. Toque para saber onde ficam os seus dados.');
      }

      // Toast efêmero para salvando/ok — não ocupa a tela o tempo todo
      if (info.toast && info.cls !== _lastCls) {
        if (info.ephemeral || info.cls === 'salvando' || info.cls === 'sincronizando') {
          mostrarToastCurto(info.label);
          _lastCls = info.cls;
          if (info.ephemeral) {
            node.hidden = true;
            node.classList.add('sync-indicator--hidden');
            return;
          }
        }
      }
      _lastCls = info.cls;

      if (foiDispensado(info.cls) && info.persistente && info.cls === 'local') {
        node.hidden = true;
        node.classList.add('sync-indicator--hidden');
        return;
      }

      // Estados que precisam atenção ficam no topo; local fica discreto e dispensável
      node.hidden = false;
      node.classList.remove('sync-indicator--hidden', 'sync-indicator--toast');
      clearTimeout(_autoHideTimer);
      if (info.cls === 'local' || info.cls === 'ok') {
        node.classList.add('sync-indicator--subtle');
        // "Salvo neste dispositivo"/"Salvo no servidor" são reassurance: aparecem
        // e somem sozinhos. Antes ficavam fixos no topo-direito encavalando o
        // cabeçalho e o conteúdo. Estados que pedem atenção (falha/offline/
        // pendente) continuam persistentes.
        _autoHideTimer = setTimeout(function() {
          node.hidden = true;
          node.classList.add('sync-indicator--hidden');
        }, 4500);
      } else {
        node.classList.remove('sync-indicator--subtle');
      }
    } catch (e) { /* nunca quebra o app */ }
  }

  function iniciar() {
    render();
    if (typeof window !== 'undefined' && window.addEventListener) {
      window.addEventListener('online', render);
      window.addEventListener('offline', render);
    }
    try {
      if (typeof APP_STORE !== 'undefined' && APP_STORE.subscribe) {
        APP_STORE.subscribe('sync', render);
      }
    } catch (e) { /* segue com polling */ }
    if (typeof UTILS !== 'undefined' && UTILS.intervaloVisivel) {
      UTILS.intervaloVisivel(render, 15000);
    }
  }

  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', iniciar);
    } else {
      iniciar();
    }
  }
})();
