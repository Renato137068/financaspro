/**
 * sync-indicator.js — badge visível de estado de sincronização (#4 da auditoria).
 *
 * Mostra ao usuário se os dados estão salvos/sincronizados — a confiança é o
 * ativo nº 1 de um app financeiro. Lê o estado de APP_STORE.sync quando
 * disponível e cai para navigator.onLine quando a API está desativada
 * (modo 100% local). Defensivo: nunca quebra se o store não existir.
 *
 * Estados: salvo no servidor · salvando · sincronizando · pendente · falha · conflito · offline · local
 */
(function() {
  'use strict';

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

  function classificar(st) {
    if (!st.api) return { cls: 'local', label: 'Salvo neste dispositivo' };
    if (st.conflicts && st.conflicts.length) {
      return { cls: 'conflito', label: 'Conflito de sync — revise seus dados' };
    }
    if (!st.online) return { cls: 'offline', label: 'Offline — alterações pendentes' };
    if (st.lastError) {
      return { cls: 'falha', label: 'Falha ao sincronizar — tentaremos de novo' };
    }
    if (st.saving) return { cls: 'salvando', label: 'Salvando…' };
    if (st.flushing || st.pending) return { cls: 'sincronizando', label: 'Sincronizando…' };
    if (st.outboxCount > 0) {
      return { cls: 'pendente', label: st.outboxCount + ' alteração(ões) aguardando envio' };
    }
    var quando = textoRelativo(st.lastSyncAt);
    return { cls: 'ok', label: 'Salvo no servidor' + (quando ? ' · ' + quando : '') };
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
      el.innerHTML = '<span class="sync-dot" aria-hidden="true"></span><span class="sync-text"></span>';
      document.body.appendChild(el);
    }
    return el;
  }

  function render() {
    try {
      var node = garantirElemento();
      var st = lerStatus();
      var info = classificar(st);
      node.className = 'sync-indicator sync-' + info.cls;
      var txt = node.querySelector('.sync-text');
      if (txt) txt.textContent = info.label;
      node.setAttribute('title', info.label);
    } catch (e) { /* nunca quebra o app */ }
  }

  function iniciar() {
    render();
    // Atualiza por eventos de rede.
    if (typeof window !== 'undefined' && window.addEventListener) {
      window.addEventListener('online', render);
      window.addEventListener('offline', render);
    }
    // Reage a mudanças no store, se suportado.
    try {
      if (typeof APP_STORE !== 'undefined' && APP_STORE.subscribe) {
        APP_STORE.subscribe('sync', render);
      }
    } catch (e) { /* segue com polling */ }
    // Rede de segurança: revalida periodicamente (barato) — mas só com a aba
    // visível. Era o timer mais frequente do app (15s) rodando em segundo
    // plano para atualizar um ícone que ninguém estava olhando.
    UTILS.intervaloVisivel(render, 15000);
  }

  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', iniciar);
    } else {
      iniciar();
    }
  }
})();
