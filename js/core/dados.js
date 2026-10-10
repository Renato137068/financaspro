/**
 * @file dados.js — Data persistence layer
 * @module DADOS
 *
 * O que o DADOS sabe da nuvem (pontos de encaixe que o Supabase sobrescreve,
 * sessão e a mesclagem do pull) mora em js/core/dados-nuvem.js e é copiado
 * para cá no fim do arquivo. A API Express saiu (ADR 0007).
 *
 * ES Module (ADR 0005): os scripts clássicos o recebem como global por
 * js/esm/ponte.js. Quase todo o domínio importa o DADOS, e o DADOS importa de
 * volta quem ele avisa (TRANSACOES, RENDER…): ciclos de import, válidos porque
 * nenhum dos lados usa o outro ao carregar, só dentro de funções. A exceção
 * é o DADOS_NUVEM, lido ao carregar: só este arquivo o importa, então ele
 * sempre termina antes do Object.assign lá embaixo.
 */

import { DADOS_NUVEM } from './dados-nuvem.js';
import { CONFIG } from './config.js';
import { UTILS } from './utils.js';
import { LOCAL_CRYPTO } from '../utilities/local-crypto.js';
import { IDB_KV } from './idb-kv.js';
import { SYNC_MERGE } from './sync-merge.js';
import { SESSION_LOG } from './session-log.js';
import { PERSIST_QUEUE } from './persist-queue.js';
import { APP_STORE } from './store.js';
import { ACTIONS } from '../services/actions.js';
import { TRANSACOES } from '../transacoes.js';
import { ORCAMENTO } from '../orcamento.js';
import { CONTAS } from '../contas.js';
import { RENDER } from '../render.js';
import { INIT_MODALS } from '../modules/init-modals.js';

/**
 * @typedef {Object} Transacao
 * @property {string} id
 * @property {'receita'|'despesa'} tipo
 * @property {number} valor
 * @property {string} categoria
 * @property {string} data — YYYY-MM-DD
 * @property {string} [descricao]
 * @property {string} [banco]
 * @property {string} [cartao]
 * @property {string} [dataCriacao]
 */

/**
 * @typedef {Object} ConfigUser
 * @property {string} nome
 * @property {'BRL'|'USD'|'EUR'} moeda
 * @property {'light'|'dark'} tema
 * @property {number} [renda]
 * @property {Object} [orcamentos]
 * @property {Object} [regra503020]
 * @property {boolean} [pinAtivo]
 * @property {string} [pinHash]
 * @property {string} [pinSalt]
 * @property {string} [pinAlgoritmo]
 * @property {number} [pinTentativas]
 * @property {number} [pinBloqueadoAte]
 * @property {string} [ultimoExportoDados]
 * @property {number} [_schemaVer]
 */

const DADOS = {
  _initialized: false,
  _storageDebounceTimer: null,
  /** Versão atual do schema. Incrementar quando estrutura quebrar compat. */
  SCHEMA_VERSION: 2,

  /** Cache em memória para leitura síncrona com crypto at-rest */
  _plainCache: {},

  /**
   * Cadeia serial de escritas no disco. Sem isso, cifragem at-rest assíncrona
   * permite last-writer-wins invertido: um encrypt antigo sobrescreve o novo
   * e o lançamento some no reload (achado P0 da auditoria anual).
   */
  _diskWriteChain: Promise.resolve(),

  /** Aviso de cota é uma vez por sessão — repetido, vira ruído ignorável. */
  _avisouCota: false,
  _avisouSyncMultiAba: false,
  _modalConflitoAberto: false,
  _storageSyncBound: false,
  _transacoesBackend: null,
  _transacoesCache: null,
  _idbWriteChain: Promise.resolve(),
  _falhaGravacaoIdb: null,
  _avisouFalhaGravacao: false,
  _initPromise: null,
  _ignorarStorageSync: false,
  TX_BACKEND_KEY: 'fp-tx-backend',
  TX_SYNC_PING_KEY: 'fp-tx-sync-ping',
  TX_IDB_SENTINEL: '{"_idb":1}',
  LIMIAR_MIGRAR_TX_COUNT: 2500,
  LIMIAR_MIGRAR_TX_BYTES: 3 * 1024 * 1024,

  _storageGetRaw: function(key) {
    if (typeof LOCAL_CRYPTO !== 'undefined' && LOCAL_CRYPTO.isEnabled()) {
      if (Object.prototype.hasOwnProperty.call(DADOS._plainCache, key)) {
        return DADOS._plainCache[key];
      }
      var raw = localStorage.getItem(key);
      if (!raw) return null;
      // Detecta qualquer versão de cifra (enc1/enc2). Antes checava só 'enc1:',
      // mas encrypt() gera 'enc2:' — com a cifragem ligada, valores enc2 não
      // eram decifrados na leitura (dados apareceriam corrompidos).
      if (LOCAL_CRYPTO.isEncrypted(raw)) {
        LOCAL_CRYPTO.unwrapStorageValue(key, raw).then(function(plain) {
          DADOS._plainCache[key] = plain;
          if (typeof APP_STORE !== 'undefined' && typeof ACTIONS !== 'undefined') {
            APP_STORE.dispatch(ACTIONS.SYNC_CONCLUIR);
          }
        });
        return null;
      }
      DADOS._plainCache[key] = raw;
      return raw;
    }
    return localStorage.getItem(key);
  },

  /** Teto prático do localStorage. Não é consultável: 5 MB é o valor que os
   *  navegadores convergiram e o mais conservador entre eles. */
  LIMITE_STORAGE_BYTES: 5 * 1024 * 1024,

  /** Acima disto o usuário é avisado — ainda com espaço para agir. */
  _LIMIAR_AVISO: 0.8,

  /**
   * Um DOMException de cota, ou outra coisa?
   *
   * O nome muda por navegador e versão; o código 22 é o legado e o 1014 é o
   * do Firefox. Errar essa detecção significa tratar um bug qualquer como
   * "acabou o espaço" e mandar o usuário apagar dados sem necessidade.
   */
  _ehErroDeCota: function(e) {
    if (!e) return false;
    return e.name === 'QuotaExceededError'
      || e.name === 'NS_ERROR_DOM_QUOTA_REACHED'
      || e.code === 22
      || e.code === 1014;
  },

  /**
   * Quantos bytes o app ocupa no localStorage, e quão perto do teto está.
   *
   * A auditoria de dimensões ocultas mediu 60 mil lançamentos em 8,79 MB — bem
   * acima do teto de 5 MB. O limite prático fica perto de 35 mil lançamentos, e
   * até agora o app não dizia nada a respeito: o usuário simplesmente batia no
   * teto um dia, no meio de um cadastro.
   */
  usoArmazenamento: function() {
    var bytes = 0;
    try {
      for (var i = 0; i < localStorage.length; i++) {
        var k = localStorage.key(i);
        var v = localStorage.getItem(k) || '';
        // UTF-16: o navegador contabiliza 2 bytes por unidade de código.
        bytes += (k.length + v.length) * 2;
      }
    } catch (e) {
      return { bytes: 0, limite: DADOS.LIMITE_STORAGE_BYTES, percentual: 0, disponivel: false };
    }
    return {
      bytes: bytes,
      limite: DADOS.LIMITE_STORAGE_BYTES,
      percentual: Math.min(100, Math.round((bytes / DADOS.LIMITE_STORAGE_BYTES) * 100)),
      disponivel: true,
    };
  },

  /**
   * Avisa uma vez por sessão quando o armazenamento passa do limiar.
   *
   * Uma vez por sessão porque o aviso precisa ser levado a sério: repetido a
   * cada gravação vira ruído e a pessoa aprende a ignorá-lo — justamente antes
   * do dia em que ele importa.
   */
  verificarCota: function() {
    var uso = DADOS.usoArmazenamento();
    if (!uso.disponivel || DADOS._avisouCota) return uso;
    if (uso.percentual < DADOS._LIMIAR_AVISO * 100) return uso;

    DADOS._avisouCota = true;
    var msgCota = 'Armazenamento em ' + uso.percentual + '%. Exporte um backup e '
      + 'considere apagar lançamentos antigos.';
    if (typeof UTILS !== 'undefined' && UTILS.mostrarToast) {
      UTILS.mostrarToast(msgCota, 'warning');
    }
    if (typeof UTILS !== 'undefined' && UTILS.mostrarBanner) {
      UTILS.mostrarBanner({
        id: 'fp-banner-cota',
        tipo: 'warning',
        mensagem: msgCota,
        acao: 'Exportar backup',
        fecharAoAcao: false,
        onAcao: function() {
          // Busca tarde, por window: o CONFIG_USER é UI (importa navegação e
          // formulário), e a camada de dados não arrasta a UI pelo import.
          var configUser = typeof window !== 'undefined' ? window.CONFIG_USER : null;
          if (configUser && configUser.exportarDados) {
            configUser.exportarDados();
          } else if (typeof exportarDados === 'function') {
            exportarDados();
          }
        },
      });
    }
    return uso;
  },

  /**
   * Grava no localStorage. Devolve true se gravou de forma síncrona no
   * caminho claro. Com cifragem at-rest, atualiza o cache imediato e enfileira
   * a escrita no disco (serial) — use DADOS.aguardarDisco() antes de anunciar
   * sucesso. Perder dado financeiro em silêncio é o pior desfecho possível.
   */
  /**
   * Enfileira uma escrita de disco. Sempre serial — nunca paralelo.
   * @returns {Promise}
   */
  _enqueueDiskWrite: function(job) {
    DADOS._diskWriteChain = DADOS._diskWriteChain.then(job, job);
    return DADOS._diskWriteChain;
  },

  /**
   * Espera todas as escritas pendentes no disco (cifração incluída).
   * Use antes de anunciar "Salvo" ou de confiar num reload.
   * @returns {Promise<boolean>}
   */
  aguardarDisco: function() {
    var chain = DADOS._diskWriteChain || Promise.resolve();
    var disco = chain.then(function() { return true; }, function() { return false; });
    // Backend 'idb' (quem tem muitos lançamentos): a gravação vai pela fila do
    // IndexedDB, que esta função ignorava — o "Salvo" saía antes do disco.
    var idb = (DADOS._idbWriteChain || Promise.resolve()).then(function(ok) {
      return ok !== false && !DADOS._falhaGravacaoIdb;
    }, function() { return false; });
    return Promise.all([disco, idb]).then(function(r) { return r[0] && r[1]; });
  },

  _storageSetRaw: function(key, value) {

    function avisarCotaEsgotada() {
      if (typeof UTILS !== 'undefined' && UTILS.mostrarToast) {
        UTILS.mostrarToast(
          'Sem espaço para salvar. Exporte um backup e apague lançamentos '
          + 'antigos para continuar.',
          'error',
        );
      }
    }

    if (typeof LOCAL_CRYPTO !== 'undefined' && LOCAL_CRYPTO.isEnabled()) {
      DADOS._plainCache[key] = value;
      // Captura `value` neste tick; a cadeia serial evita overwrite invertido.
      var snapshot = value;
      DADOS._enqueueDiskWrite(function() {
        return LOCAL_CRYPTO.wrapStorageValue(key, snapshot).then(function(stored) {
          try {
            localStorage.setItem(key, stored);
            DADOS.verificarCota();
            return true;
          } catch (e) {
            if (DADOS._ehErroDeCota(e)) {
              avisarCotaEsgotada();
            }
            console.error('Erro ao persistir storage criptografado:', e);
            throw e;
          }
        });
      });
      return true;
    }

    try {
      localStorage.setItem(key, value);
      DADOS.verificarCota();
      return true;
    } catch (e) {
      if (DADOS._ehErroDeCota(e)) {
        avisarCotaEsgotada();
        return false;
      }
      throw e;
    }
  },

  // Chaves elegíveis à cifragem (prefixo 'fp-'). aprendizado/rascunho ficam de fora.
  _CRYPTO_KEYS: function() {
    return [CONFIG.STORAGE_TRANSACOES, CONFIG.STORAGE_CONFIG, CONFIG.STORAGE_CONTAS];
  },

  /**
   * Liga/desliga a cifragem at-rest MIGRANDO os dados existentes com segurança:
   * lê cada chave 'fp-' no formato atual (decifrando as que estão cifradas ANTES
   * de virar o flag), alterna o flag e regrava no novo formato. Sem esta migração,
   * desligar deixaria valores 'enc2:' ilegíveis (o leitor só decifra com o flag on).
   * @param {boolean} enable
   * @returns {Promise<boolean>} estado efetivo de LOCAL_CRYPTO.isEnabled() após migrar
   */
  aplicarCriptografia: function(enable) {
    if (typeof LOCAL_CRYPTO === 'undefined') return Promise.resolve(false);
    var keys = DADOS._CRYPTO_KEYS();

    // 1. Lê em texto puro no estado ATUAL (decrypt exige o flag ainda ligado).
    var reads = keys.map(function(key) {
      var raw = localStorage.getItem(key);
      if (!raw) return Promise.resolve({ key: key, plain: null });
      if (LOCAL_CRYPTO.isEncrypted(raw)) {
        return LOCAL_CRYPTO.decrypt(raw).then(function(plain) { return { key: key, plain: plain }; });
      }
      return Promise.resolve({ key: key, plain: raw });
    });

    // Blob de lançamentos no IndexedDB (backend 'idb'): mesma migração. A
    // leitura espera as gravações pendentes e só serve para confirmar que o
    // blob decifra no estado ATUAL do flag — se não decifrar, a migração
    // aborta como nas chaves do localStorage.
    var usaIdb = DADOS._transacoesBackend === 'idb' && typeof IDB_KV !== 'undefined';
    if (usaIdb) {
      reads.push(DADOS._idbWriteChain.then(function() {
        return DADOS._idbLerTransacoes();
      }).then(function(plain) {
        return { key: CONFIG.STORAGE_TRANSACOES, plain: plain, idb: true };
      }));
    }

    return Promise.all(reads).then(function(items) {
      // Aborta se algo não decifrou (evita gravar cifrado como se fosse puro).
      for (var i = 0; i < items.length; i++) {
        if (items[i].plain != null && LOCAL_CRYPTO.isEncrypted(items[i].plain)) {
          throw new Error('Falha ao decifrar dados existentes — migração abortada');
        }
      }

      // Anexos: ao DESLIGAR, decifrar enquanto o flag ainda está ligado.
      var anexosAntes = (!enable && typeof ANEXOS !== 'undefined' && ANEXOS.migrarCriptografia)
        ? ANEXOS.migrarCriptografia(false)
        : Promise.resolve();

      return anexosAntes.then(function() {
        LOCAL_CRYPTO.setEnabled(enable);
        DADOS._plainCache = {};

        var writes = items.map(function(it) {
          if (it.plain == null) return Promise.resolve();
          if (it.idb) {
            // Regrava pela cadeia serial a partir do cache em memória — no
            // backend 'idb' ele é a fonte de verdade e já inclui qualquer
            // lançamento salvo enquanto a leitura acima acontecia.
            var lista = Array.isArray(DADOS._transacoesCache) ? DADOS._transacoesCache : [];
            return DADOS._enfileirarGravacaoIdb(JSON.stringify(lista)).then(function(ok) {
              if (!ok) throw new Error('Falha ao regravar lançamentos — migração incompleta');
            });
          }
          if (enable) {
            return LOCAL_CRYPTO.encrypt(it.plain).then(function(enc) { localStorage.setItem(it.key, enc); });
          }
          localStorage.setItem(it.key, it.plain);
          return Promise.resolve();
        });
        return Promise.all(writes);
      }).then(function() {
        // Anexos: ao LIGAR, cifrar com o flag já ativo.
        if (enable && typeof ANEXOS !== 'undefined' && ANEXOS.migrarCriptografia) {
          return ANEXOS.migrarCriptografia(true);
        }
      });
    }).then(function() {
      return LOCAL_CRYPTO.isEnabled();
    });
  },

  _storageRemoveRaw: function(key) {
    delete DADOS._plainCache[key];
    localStorage.removeItem(key);
  },

  /** Supabase Auth + Postgres (RLS) ativos no cliente. */
  _supabaseAtivo: function() {
    var url = (CONFIG.SUPABASE_URL || '').trim();
    var key = (CONFIG.SUPABASE_ANON_KEY || '').trim();
    if (!url || !key) return false;
    return typeof SUPA_AUTH !== 'undefined' && SUPA_AUTH.isActive && SUPA_AUTH.isActive();
  },

  /** Nuvem (login, sync, cobrança) = Supabase. A API Express saiu (ADR 0007). */
  _nuvemAtiva: function() {
    return DADOS._supabaseAtivo();
  },

  init: function() {
    if (DADOS._initialized) return Promise.resolve();
    if (DADOS._initPromise) return DADOS._initPromise;
    DADOS._initPromise = DADOS._prepararStorageTransacoes().then(function() {
      DADOS._limparSessaoExpressLegada();
      if (DADOS._transacoesBackend !== 'idb' && !DADOS._storageGetRaw(CONFIG.STORAGE_TRANSACOES)) {
        DADOS._storageSetRaw(CONFIG.STORAGE_TRANSACOES, JSON.stringify([]));
      }
      if (!DADOS._storageGetRaw(CONFIG.STORAGE_CONFIG)) {
        var defaults = Object.assign({}, CONFIG.DEFAULT_CONFIG, { _schemaVer: DADOS.SCHEMA_VERSION });
        DADOS._storageSetRaw(CONFIG.STORAGE_CONFIG, JSON.stringify(defaults));
      } else {
        DADOS._migrarSchema();
      }
      if (typeof APP_STORE !== 'undefined') APP_STORE.hydrateFromDados();
      DADOS.setupStorageSync();
      if (typeof SESSION_LOG !== 'undefined') {
        SESSION_LOG.registrar('init_dados', { backend: DADOS._transacoesBackend || 'localStorage' });
      }
      DADOS.sincronizarComApi();
      DADOS._sincronizarAoVoltarRede();
      DADOS._sincronizarAoVoltarAoApp();
      DADOS._initialized = true;
    });
    return DADOS._initPromise;
  },

  /**
   * Sem rede, os envios falham em silêncio e só o pull seguinte os repete
   * (_pendentesParaNuvem). O pull só rodava ao abrir o app ou entrar na conta;
   * agora roda também quando a conexão volta, com o app aberto.
   */
  _sincronizarAoVoltarRede: function() {
    if (DADOS._ouvindoRede || typeof window === 'undefined' || !window.addEventListener) return;
    DADOS._ouvindoRede = true;
    window.addEventListener('online', function() {
      if (!DADOS._nuvemAtiva()) return;
      try { DADOS.sincronizarComApi(); } catch (e) { /* o pull já registra a própria falha */ }
    });
  },

  /** Tempo mínimo no segundo plano para o retorno puxar a nuvem de novo. */
  _SYNC_RETORNO_MS: 5 * 60 * 1000,

  /**
   * No celular o app quase nunca é fechado: fica dias no segundo plano e volta
   * sem passar pelo boot, então o pull da abertura não roda e o que foi feito
   * em outro aparelho não aparece (auditoria de integridade, 09/10). Ao voltar
   * depois de alguns minutos fora, puxa de novo. Trocas rápidas de app não
   * disparam nada; o pull já ignora uma chamada com outro em andamento.
   */
  _sincronizarAoVoltarAoApp: function() {
    if (DADOS._ouvindoRetorno || typeof document === 'undefined' || !document.addEventListener) return;
    DADOS._ouvindoRetorno = true;
    var saiuEm = null;
    document.addEventListener('visibilitychange', function() {
      if (document.visibilityState === 'hidden') { saiuEm = Date.now(); return; }
      var fora = saiuEm === null ? 0 : Date.now() - saiuEm;
      saiuEm = null;
      if (fora < DADOS._SYNC_RETORNO_MS || !DADOS._nuvemAtiva()) return;
      try { DADOS.sincronizarComApi(); } catch (e) { /* o pull já registra a própria falha */ }
    });
  },

  _mostrarBannerMultiAba: function(mensagem) {
    if (DADOS._modalConflitoAberto) return;
    if (DADOS._avisouSyncMultiAba || typeof UTILS === 'undefined' || !UTILS.mostrarBanner) return;
    DADOS._avisouSyncMultiAba = true;
    UTILS.mostrarBanner({
      id: 'fp-banner-multiaba',
      tipo: 'info',
      mensagem: mensagem || 'Outra aba alterou seus dados. A tela foi atualizada.',
      acao: 'Recarregar',
      fecharAoAcao: false,
      onAcao: function() { window.location.reload(); },
    });
  },

  _aplicarCacheTransacoes: function(lista) {
    DADOS._transacoesCache = Array.isArray(lista) ? lista : [];
    if (typeof TRANSACOES !== 'undefined') TRANSACOES.init();
    if (typeof ORCAMENTO !== 'undefined') ORCAMENTO.init();
    if (typeof CONTAS !== 'undefined') CONTAS.init();
    if (typeof RENDER !== 'undefined') RENDER.init();
  },

  _persistirTransacoesLista: function(lista) {
    DADOS._ignorarStorageSync = true;
    if (DADOS._transacoesBackend === 'idb') {
      DADOS._transacoesCache = lista;
      var json = JSON.stringify(lista);
      DADOS._enfileirarGravacaoIdb(json);
    } else {
      DADOS._storageSetRaw(CONFIG.STORAGE_TRANSACOES, JSON.stringify(lista));
    }
    setTimeout(function() { DADOS._ignorarStorageSync = false; }, 0);
  },

  _mostrarModalConflitos: function(conflitos, onResolve) {
    if (!conflitos || !conflitos.length || typeof document === 'undefined') {
      if (onResolve) onResolve({});
      return;
    }
    if (typeof INIT_MODALS !== 'undefined' && INIT_MODALS.fpConfirm) {
      DADOS._modalConflitoAberto = true;
      var html = 'Outra aba alterou <strong>' + conflitos.length + '</strong> lançamento(s) que você também modificou.<br><br><ul style="text-align:left;margin:0;padding-left:1.2em">';
      conflitos.forEach(function(c) {
        var titulo = (c.local && c.local.descricao) ? c.local.descricao : 'Lançamento';
        var locVal = (typeof UTILS !== 'undefined' && UTILS.formatarMoeda)
          ? UTILS.formatarMoeda(c.local.valor) : String(c.local.valor);
        var remVal = (typeof UTILS !== 'undefined' && UTILS.formatarMoeda)
          ? UTILS.formatarMoeda(c.remote.valor) : String(c.remote.valor);
        html += '<li><strong>' + UTILS.escapeHtml(titulo) + '</strong><br>';
        html += 'Esta aba: ' + UTILS.escapeHtml(locVal) + ' · Outra aba: ' + UTILS.escapeHtml(remVal) + '</li>';
      });
      html += '</ul><br>Qual versão manter?';
      INIT_MODALS.fpConfirm(html, function() {
        var res = {};
        conflitos.forEach(function(c) { res[c.id] = 'local'; });
        DADOS._modalConflitoAberto = false;
        onResolve(res);
      }, function() {
        var res = {};
        conflitos.forEach(function(c) { res[c.id] = 'remote'; });
        DADOS._modalConflitoAberto = false;
        onResolve(res);
      }, { okLabel: 'Manter desta aba', cancelLabel: 'Usar outra aba', danger: false, trustedHtml: true });
      return;
    }
    var res = {};
    conflitos.forEach(function(c) { res[c.id] = 'remote'; });
    onResolve(res);
  },

  _mesclarTransacoesComConflitos: function(locais, remotas, pending) {
    var conflitos = (typeof SYNC_MERGE !== 'undefined' && SYNC_MERGE.detectarConflitos)
      ? SYNC_MERGE.detectarConflitos(locais, pending, remotas) : [];
    if (!conflitos.length) {
      var merged = (typeof SYNC_MERGE !== 'undefined')
        ? SYNC_MERGE.mergeDelta(locais, pending, remotas)
        : remotas;
      if (typeof SESSION_LOG !== 'undefined') {
        SESSION_LOG.registrar('merge_multiaba', { conflitos: 0, total: merged.length });
      }
      return Promise.resolve({ lista: merged, conflitos: 0 });
    }
    if (typeof SESSION_LOG !== 'undefined') {
      SESSION_LOG.registrar('conflito_multiaba', { qtd: conflitos.length });
    }
    return new Promise(function(resolve) {
      DADOS._mostrarModalConflitos(conflitos, function(resolucoes) {
        var resultado = (typeof SYNC_MERGE !== 'undefined' && SYNC_MERGE.aplicarResolucoes)
          ? SYNC_MERGE.aplicarResolucoes(locais, pending, remotas, resolucoes)
          : remotas;
        if (typeof SESSION_LOG !== 'undefined') {
          SESSION_LOG.registrar('conflito_resolvido', { qtd: conflitos.length });
        }
        resolve({ lista: resultado, conflitos: conflitos.length });
      });
    });
  },

  _pendingTxIds: function() {
    if (typeof PERSIST_QUEUE === 'undefined' || !PERSIST_QUEUE.getSnapshot) return [];
    var snap = PERSIST_QUEUE.getSnapshot();
    return (snap.items || []).filter(function(it) {
      return it && (it.status === 'pending' || it.status === 'saving');
    }).map(function(it) { return it.txId; }).filter(Boolean);
  },

  _parseTransacoesJson: function(data) {
    if (!data || data === DADOS.TX_IDB_SENTINEL) return [];
    var parsed = JSON.parse(data);
    return Array.isArray(parsed) ? parsed : [];
  },

  /**
   * Grava o blob de lançamentos no IndexedDB pela MESMA regra do localStorage:
   * cifrado quando "cifrar dados" está ligado. Antes o blob ia em texto puro
   * para o IDB — justo o maior volume de dados, o de quem tem mais de 2.500
   * lançamentos, ficava fora da proteção que a opção promete.
   * Sempre chamado dentro de _idbWriteChain (a cifra é assíncrona; a cadeia
   * serial impede que um encrypt antigo sobrescreva um novo).
   */
  _idbGravarTransacoes: function(json) {
    var key = CONFIG.STORAGE_TRANSACOES;
    if (typeof LOCAL_CRYPTO !== 'undefined' && LOCAL_CRYPTO.isEnabled()) {
      return LOCAL_CRYPTO.wrapStorageValue(key, json).then(function(stored) {
        return IDB_KV.set(key, stored);
      });
    }
    return IDB_KV.set(key, json);
  },

  /**
   * Põe uma gravação do blob de lançamentos na fila serial do IndexedDB.
   *
   * A fila nunca fica rejeitada: antes, uma única falha (cifra que rejeitou,
   * conexão fechada) deixava `_idbWriteChain` rejeitada e TODAS as gravações
   * seguintes eram puladas em silêncio até o app ser reaberto, com a tela
   * mostrando os lançamentos como salvos. Agora cada job roda mesmo que o
   * anterior tenha falhado, e uma recusa do banco (set() === false) vira
   * aviso ao usuário e falha em aguardarDisco().
   *
   * @param {string} json
   * @param {Function} [depois] roda só se a gravação foi confirmada
   * @returns {Promise<boolean>} true se o banco confirmou esta gravação
   */
  _enfileirarGravacaoIdb: function(json, depois) {
    function job() {
      return DADOS._idbGravarTransacoes(json).then(function(ok) {
        if (ok === false) {
          var motivo = (typeof IDB_KV !== 'undefined' && IDB_KV.ultimoErro) || null;
          var err = new Error('O aparelho recusou a gravação dos lançamentos'
            + (motivo && motivo.name ? ' (' + motivo.name + ')' : ''));
          err.causa = motivo;
          throw err;
        }
        DADOS._falhaGravacaoIdb = null;
        if (depois) depois();
        return true;
      });
    }
    DADOS._idbWriteChain = DADOS._idbWriteChain.then(job, job).catch(function(e) {
      DADOS._falhaGravacaoIdb = e;
      DADOS._avisarFalhaGravacao(e);
      return false;
    });
    return DADOS._idbWriteChain;
  },

  /** Falha ao gravar no aparelho: avisa uma vez por sessão e registra. */
  _avisarFalhaGravacao: function(e) {
    console.error('Erro ao gravar lançamentos no aparelho:', e && e.message);
    if (typeof OBS !== 'undefined' && OBS.captureError) {
      try { OBS.captureError(e, { contexto: 'DADOS.idb' }); } catch (e2) { /* noop */ }
    }
    if (DADOS._avisouFalhaGravacao) return;
    DADOS._avisouFalhaGravacao = true;
    if (typeof UTILS !== 'undefined' && UTILS.mostrarToast) {
      var cota = e && e.causa && DADOS._ehErroDeCota(e.causa);
      UTILS.mostrarToast(cota
        ? 'Sem espaço para salvar. Exporte um backup e libere espaço no aparelho.'
        : 'Não consegui salvar no aparelho. Exporte um backup e reabra o app.', 'error');
    }
  },

  /** Lê o blob de lançamentos do IndexedDB, decifrando se estiver cifrado. */
  _idbLerTransacoes: function() {
    var key = CONFIG.STORAGE_TRANSACOES;
    return IDB_KV.get(key).then(function(data) {
      if (data && typeof LOCAL_CRYPTO !== 'undefined' && LOCAL_CRYPTO.isEncrypted(data)) {
        return LOCAL_CRYPTO.unwrapStorageValue(key, data);
      }
      return data;
    });
  },

  /**
   * Blob do IDB que não decifrou nem parseou: guarda uma cópia intacta antes
   * que a próxima gravação o substitua. O decrypt devolve o texto cifrado
   * quando falha — sem esta cópia, o primeiro lançamento novo gravaria uma
   * lista vazia por cima de dados que talvez só estejam com a chave errada.
   */
  _preservarBlobIlegivel: function(data) {
    if (!data || typeof IDB_KV === 'undefined') return Promise.resolve(false);
    var backupKey = CONFIG.STORAGE_TRANSACOES + '-ilegivel';
    return IDB_KV.get(backupKey).then(function(existente) {
      if (existente) return false;
      return IDB_KV.set(backupKey, data);
    });
  },

  _deveMigrarTransacoesParaIdb: function(data, lista) {
    if (typeof IDB_KV === 'undefined' || !IDB_KV.isReady || !IDB_KV.isReady()) return false;
    if (!Array.isArray(lista)) return false;
    if (lista.length >= DADOS.LIMIAR_MIGRAR_TX_COUNT) return true;
    if (data && data.length * 2 >= DADOS.LIMIAR_MIGRAR_TX_BYTES) return true;
    var uso = DADOS.usoArmazenamento();
    return uso.disponivel && uso.percentual >= DADOS._LIMIAR_AVISO * 100;
  },

  _ativarBackendIdbTransacoes: function(lista) {
    DADOS._transacoesBackend = 'idb';
    DADOS._transacoesCache = Array.isArray(lista) ? lista : [];
    var json = JSON.stringify(DADOS._transacoesCache);
    // O localStorage só passa a apontar para o IndexedDB DEPOIS que o banco
    // confirma a gravação. Antes o marcador ia primeiro: se a gravação falhasse
    // (cota, banco fechado), o blob antigo já tinha sido trocado pelo marcador
    // e todos os lançamentos sumiam no próximo boot.
    return DADOS._enfileirarGravacaoIdb(json, function() {
      try {
        localStorage.setItem(DADOS.TX_BACKEND_KEY, 'idb');
        localStorage.setItem(CONFIG.STORAGE_TRANSACOES, DADOS.TX_IDB_SENTINEL);
      } catch (e) { /* noop */ }
      DADOS._pingTransacoesSync();
    });
  },

  _prepararStorageTransacoes: function() {
    if (typeof IDB_KV === 'undefined') {
      DADOS._transacoesBackend = 'localStorage';
      return Promise.resolve();
    }
    return IDB_KV.init().then(function() {
      var backend = null;
      try { backend = localStorage.getItem(DADOS.TX_BACKEND_KEY); } catch (e) { backend = null; }
      if (backend === 'idb' && IDB_KV.isReady()) {
        DADOS._transacoesBackend = 'idb';
        return DADOS._idbLerTransacoes().then(function(data) {
          try {
            DADOS._transacoesCache = data ? DADOS._parseTransacoesJson(data) : [];
          } catch (e) {
            DADOS._transacoesCache = [];
            DADOS._registrarFalhaLeitura(CONFIG.STORAGE_TRANSACOES, e);
            return DADOS._preservarBlobIlegivel(data);
          }
        });
      }
      DADOS._transacoesBackend = 'localStorage';
      var raw = DADOS._storageGetRaw(CONFIG.STORAGE_TRANSACOES);
      if (!raw) return;
      try {
        var lista = DADOS._parseTransacoesJson(raw);
        if (DADOS._deveMigrarTransacoesParaIdb(raw, lista)) {
          return DADOS._ativarBackendIdbTransacoes(lista);
        }
      } catch (e) {
        console.warn('Migração IDB ignorada:', e);
      }
    });
  },

  _pingTransacoesSync: function() {
    try {
      DADOS._ignorarStorageSync = true;
      localStorage.setItem(DADOS.TX_SYNC_PING_KEY, String(Date.now()));
    } catch (e) { /* noop */ }
    finally {
      setTimeout(function() { DADOS._ignorarStorageSync = false; }, 0);
    }
  },

  _hidratarTransacoesIdb: function() {
    if (DADOS._transacoesBackend !== 'idb' || typeof IDB_KV === 'undefined') {
      return Promise.resolve(false);
    }
    var antes = (DADOS._transacoesCache || []).slice();
    var pending = DADOS._pendingTxIds();
    return DADOS._idbLerTransacoes().then(function(data) {
      var novas;
      try {
        novas = data ? DADOS._parseTransacoesJson(data) : [];
      } catch (e) {
        novas = [];
      }
      return DADOS._mesclarTransacoesComConflitos(antes, novas, pending).then(function(result) {
        var merged = result.lista;
        DADOS._aplicarCacheTransacoes(merged);
        if (JSON.stringify(merged) !== JSON.stringify(novas)) {
          DADOS._persistirTransacoesLista(merged);
        }
        return result.conflitos > 0;
      });
    });
  },

  _mesclarTransacoesRemotas: function(remoteJson) {
    if (!remoteJson || remoteJson === DADOS.TX_IDB_SENTINEL) return;
    var form = typeof document !== 'undefined' ? document.getElementById('form-transacao') : null;
    if (form && form.dataset && form.dataset.editId) {
      DADOS._mostrarBannerMultiAba(
        'Outra aba alterou dados enquanto você edita um lançamento. Recarregue antes de salvar.'
      );
      return;
    }
    try {
      var remotas = DADOS._parseTransacoesJson(remoteJson);
      if (!remotas.length && remoteJson !== '[]') return;
      var locais = DADOS._transacoesBackend === 'idb'
        ? (DADOS._transacoesCache || []).slice()
        : DADOS._parseTransacoesJson(DADOS._storageGetRaw(CONFIG.STORAGE_TRANSACOES));
      var pending = DADOS._pendingTxIds();
      DADOS._mesclarTransacoesComConflitos(locais, remotas, pending).then(function(result) {
        DADOS._persistirTransacoesLista(result.lista);
        DADOS._aplicarCacheTransacoes(result.lista);
      }).catch(function(e) {
        console.warn('Merge multi-aba falhou:', e);
      });
    } catch (e) {
      console.warn('Merge multi-aba falhou:', e);
    }
  },

  _mostrarDicaMultiAba: function() {
    try {
      if (sessionStorage.getItem('_avisoMultiAbaDoc')) return;
      sessionStorage.setItem('_avisoMultiAbaDoc', '1');
    } catch (e) {
      return;
    }
    if (typeof UTILS === 'undefined' || !UTILS.mostrarBanner) return;
    UTILS.mostrarBanner({
      id: 'fp-banner-multiaba-doc',
      tipo: 'info',
      mensagem: 'Dica: evite editar em duas abas ao mesmo tempo. A última gravação prevalece — o app avisa quando outra aba altera seus dados.',
    });
  },

  _migrarSchema: function() {
    try {
      var cfg = DADOS.getConfig();
      var atual = cfg._schemaVer || 1;
      if (atual >= DADOS.SCHEMA_VERSION) return;

      // v1 → v2: PIN antigo (sem salt PBKDF2) → forçar reset por segurança
      if (atual < 2) {
        if (cfg.pinAtivo && (!cfg.pinSalt || cfg.pinAlgoritmo !== 'pbkdf2-sha256-100k')) {
          DADOS.salvarConfig({
            pinAtivo: false, pinHash: null, pinSalt: null,
            pinAlgoritmo: null, pinTentativas: 0, pinBloqueadoAte: 0,
            _migracaoPinV2: true // flag para UI avisar usuário
          });
        }
      }

      DADOS.salvarConfig({ _schemaVer: DADOS.SCHEMA_VERSION });
    } catch (e) {
      console.warn('Migração de schema falhou:', e);
    }
  },

  /**
   * Retorna todas transações persistidas. Falha silenciosamente em JSON inválido.
   * @returns {Transacao[]}
   */
  /**
   * Marcado quando uma leitura do storage falhou nesta sessão.
   *
   * Existe porque `[]` é ambíguo de um jeito perigoso: pode significar "não há
   * lançamentos" ou "não consegui ler os lançamentos". Para o usuário, a tela é
   * idêntica — ele abre o app e vê zero — e a diferença é enorme: no segundo
   * caso os dados ainda estão no disco e um backup pode salvá-los, mas a
   * primeira gravação seguinte sobrescreve o conteúdo corrompido e a perda vira
   * definitiva.
   */
  _falhaLeitura: null,

  /** Houve falha de leitura nesta sessão? */
  leituraFalhou: function() {
    return !!DADOS._falhaLeitura;
  },

  /** Detalhe da falha, para a UI explicar o que aconteceu. */
  detalheFalhaLeitura: function() {
    return DADOS._falhaLeitura;
  },

  /**
   * Registra a falha e avisa — uma vez por sessão, para não virar ruído.
   *
   * O aviso é deliberadamente instrutivo em vez de técnico: a ação que salva
   * os dados do usuário é exportar um backup ANTES de continuar mexendo.
   */
  _registrarFalhaLeitura: function(chave, erro) {
    if (DADOS._falhaLeitura) return;
    DADOS._falhaLeitura = { chave: chave, mensagem: erro && erro.message, em: new Date().toISOString() };

    if (typeof OBS !== 'undefined' && OBS.captureError) {
      OBS.captureError(erro, { contexto: 'DADOS.leitura', chave: chave });
    }
    if (typeof UTILS !== 'undefined' && UTILS.mostrarToast) {
      UTILS.mostrarToast(
        'Não foi possível ler seus dados salvos. Eles podem estar íntegros — '
        + 'exporte um backup antes de registrar qualquer lançamento novo.',
        'error',
      );
    }
  },

  getTransacoesRaw: function() {
    if (DADOS._transacoesBackend === 'idb') {
      return Array.isArray(DADOS._transacoesCache) ? DADOS._transacoesCache : [];
    }
    try {
      var data = DADOS._storageGetRaw(CONFIG.STORAGE_TRANSACOES);
      if (!data) return [];
      var parsed = DADOS._parseTransacoesJson(data);
      if (!Array.isArray(parsed)) {
        DADOS._registrarFalhaLeitura(CONFIG.STORAGE_TRANSACOES,
          new Error('conteúdo não é uma lista'));
        return [];
      }
      return parsed;
    } catch (e) {
      DADOS._registrarFalhaLeitura(CONFIG.STORAGE_TRANSACOES, e);
      return [];
    }
  },

  _storageSetTransacoes: function(transacoes) {
    var json = JSON.stringify(transacoes);
    if (DADOS._transacoesBackend === 'idb' && typeof IDB_KV !== 'undefined') {
      DADOS._transacoesCache = transacoes;
      DADOS._enfileirarGravacaoIdb(json, DADOS._pingTransacoesSync);
      return;
    }
    var check = UTILS.verificarStorageDisponivel(transacoes, CONFIG.STORAGE_TRANSACOES);
    if (!check.disponivel) {
      if (typeof IDB_KV !== 'undefined' && DADOS._deveMigrarTransacoesParaIdb(json, transacoes)) {
        DADOS._ativarBackendIdbTransacoes(transacoes);
        return;
      }
      console.error('Storage indisponível:', check.erro);
      throw new Error(check.erro);
    }
    try {
      DADOS._ignorarStorageSync = true;
      DADOS._storageSetRaw(CONFIG.STORAGE_TRANSACOES, json);
    } finally {
      setTimeout(function() { DADOS._ignorarStorageSync = false; }, 0);
    }
  },

  getTransacoes: function() {
    return DADOS.getTransacoesRaw().filter(function(t) {
      return !t.deletedAt;
    });
  },

  /**
   * Insere ou atualiza transação. Throw se quota cheia.
   * @param {Transacao} transacao
   * @returns {Transacao}
   * @throws {Error} se localStorage cheio
   */
  salvarTransacao: function(transacao) {
    var transacoes = DADOS.getTransacoesRaw();

    // Idempotência local: mesmo clientKey → mesma transação (anti-duplicata).
    if (transacao.clientKey) {
      var byKey = transacoes.findIndex(function(t) {
        return t && t.clientKey === transacao.clientKey && !t.deletedAt;
      });
      if (byKey >= 0) {
        var kept = transacoes[byKey];
        // Atualiza campos mutáveis mantendo o id original.
        transacao.id = kept.id;
        transacao.dataCriacao = kept.dataCriacao || transacao.dataCriacao;
      }
    }

    transacao.id = transacao.id || UTILS.gerarId();
    transacao.dataCriacao = transacao.dataCriacao || new Date().toISOString();
    transacao.updatedAt = new Date().toISOString();
    transacao.deletedAt = null;
    var index = transacoes.findIndex(function(t) { return t.id === transacao.id; });
    if (index >= 0) {
      transacoes[index] = transacao;
    } else {
      transacoes.push(transacao);
    }
    DADOS._storageSetTransacoes(transacoes);
    var actionType = (typeof ACTIONS !== 'undefined')
      ? (index >= 0 ? ACTIONS.TRANSACAO_EDITAR : ACTIONS.TRANSACAO_CRIAR)
      : null;
    if (typeof APP_STORE !== 'undefined' && actionType) {
      APP_STORE.dispatch(actionType, transacao);
    }
    DADOS._pushTransacaoApi(transacao, index >= 0 ? 'PATCH' : 'POST').catch(function(err) {
      if (typeof APP_STORE !== 'undefined' && typeof ACTIONS !== 'undefined') {
        APP_STORE.dispatch(ACTIONS.SYNC_FALHAR, {
          erro: (err && err.message) || 'push-tx',
        });
      }
    });
    return transacao;
  },

  deletarTransacao: function(id) {
    var transacoes = DADOS.getTransacoesRaw();
    var index = transacoes.findIndex(function(t) { return t.id === id && !t.deletedAt; });
    if (index >= 0) {
      if (DADOS._nuvemAtiva()) {
        // Com a nuvem, a exclusão vira marca (tombstone) até a nuvem confirmar.
        // Tirar da lista na hora fazia o lançamento VOLTAR: se o aviso de
        // exclusão não chegasse (sem rede), o próximo pull trazia a cópia da
        // nuvem como "nova". Com a marca, o merge por data mantém a exclusão e
        // o pull reenvia o aviso (DADOS._reenviarPendentesNuvem).
        var agora = new Date().toISOString();
        transacoes[index] = Object.assign({}, transacoes[index], { deletedAt: agora, updatedAt: agora });
      } else {
        transacoes.splice(index, 1);
      }
      DADOS._storageSetTransacoes(transacoes);
      DADOS._deleteTransacaoApi(id).catch(function(err) {
        if (typeof APP_STORE !== 'undefined' && typeof ACTIONS !== 'undefined') {
          APP_STORE.dispatch(ACTIONS.SYNC_FALHAR, {
            erro: (err && err.message) || 'delete-tx',
          });
        }
      });
      if (typeof APP_STORE !== 'undefined' && typeof ACTIONS !== 'undefined') {
        APP_STORE.dispatch(ACTIONS.TRANSACAO_DELETAR, id);
      }
      return true;
    }
    return false;
  },

  /**
   * Retorna config merge com defaults.
   * @returns {ConfigUser}
   */
  getConfig: function() {
    try {
      var data = DADOS._storageGetRaw(CONFIG.STORAGE_CONFIG);
      if (!data) return Object.assign({}, CONFIG.DEFAULT_CONFIG);
      var parsed = JSON.parse(data);
      return Object.assign({}, CONFIG.DEFAULT_CONFIG, parsed);
    } catch (e) {
      DADOS._registrarFalhaLeitura(CONFIG.STORAGE_CONFIG, e);
      return Object.assign({}, CONFIG.DEFAULT_CONFIG);
    }
  },

  /**
   * Merge config parcial e persiste. Não substitui — só atualiza chaves passadas.
   * @param {Partial<ConfigUser>} config
   * @returns {ConfigUser} config completo após merge
   */
  salvarConfig: function(config, opts) {
    opts = opts || {};
    var atual = DADOS.getConfig();
    var merged = Object.assign({}, atual, config);
    DADOS._storageSetRaw(CONFIG.STORAGE_CONFIG, JSON.stringify(merged));
    if (typeof APP_STORE !== 'undefined' && typeof ACTIONS !== 'undefined') {
      APP_STORE.dispatch(ACTIONS.CONFIG_SALVAR, merged);
    }
    if (!opts.skipPush) DADOS._pushConfigApi(merged);
    return merged;
  },

  /**
   * O que "Apagar todos os dados" deixa no aparelho. Só o que não é dado
   * financeiro e cuja perda faria outra coisa que a pessoa não pediu: a sessão
   * de login e a biometria presa a ela (sair da conta é outra ação) e as chaves
   * da cifragem local (sem elas, uma frase-senha deixaria de abrir o que for
   * gravado depois).
   */
  CHAVES_PRESERVADAS_AO_LIMPAR: [
    'fp-supabase-auth',
    'fp-biometric-enabled',
    'financaspro_crypto_enabled',
    'financaspro_ckey_salt',
    'financaspro_ckey_dev',
    'fp-dev-sw'
  ],

  /** Bancos IndexedDB do app: lançamentos (kv) e comprovantes. */
  BANCOS_IDB: ['financaspro-kv', 'financaspro-anexos'],

  /**
   * Apaga tudo o que o app guardou neste aparelho, menos as chaves acima.
   * Antes só saíam lançamentos e configuração, e ficavam contas, comprovantes
   * e o histórico do aprendizado (palavras das descrições e valor médio por
   * categoria) enquanto a tela dizia "Não sobrou nada neste aparelho".
   * Por isso a limpeza é por exclusão: uma chave nova que alguém criar amanhã
   * já sai sem precisar lembrar de incluí-la aqui.
   */
  limparTodos: function() {
    DADOS._transacoesCache = [];
    DADOS._transacoesBackend = 'localStorage';
    DADOS._plainCache = {};
    try {
      var preservar = DADOS.CHAVES_PRESERVADAS_AO_LIMPAR;
      var apagar = [];
      for (var i = 0; i < localStorage.length; i++) {
        var chave = localStorage.key(i);
        if (chave && preservar.indexOf(chave) === -1) apagar.push(chave);
      }
      apagar.forEach(function(k) { localStorage.removeItem(k); });
    } catch (e) { /* sem localStorage (modo privado): não há o que apagar */ }
    try { sessionStorage.clear(); } catch (e) { /* noop */ }
    DADOS._apagarBancosIdb();
    DADOS._initialized = false;
    DADOS._initPromise = null;
    return DADOS.init();
  },

  /**
   * Fecha as conexões abertas e apaga os bancos IndexedDB. Uma conexão aberta
   * deixaria o deleteDatabase bloqueado até o reload que vem logo depois.
   */
  _apagarBancosIdb: function() {
    if (typeof indexedDB === 'undefined') return;
    var conexoes = [
      typeof IDB_KV !== 'undefined' ? IDB_KV : null,
      typeof window !== 'undefined' ? window.ANEXOS : null
    ];
    conexoes.forEach(function(mod) {
      if (mod && mod._db) {
        try { mod._db.close(); } catch (e) { /* noop */ }
        mod._db = null;
      }
    });
    DADOS.BANCOS_IDB.forEach(function(nome) {
      try { indexedDB.deleteDatabase(nome); } catch (e) { /* noop */ }
    });
  },

  getRecorrentes: function() {
    try {
      var config = DADOS.getConfig();
      return Array.isArray(config.recorrentes) ? config.recorrentes : [];
    } catch (e) {
      return [];
    }
  },

  /** Recorrências vivem no config: sobem para a nuvem junto com ele. */
  salvarRecorrente: function(recData) {
    var config = DADOS.getConfig();
    if (!Array.isArray(config.recorrentes)) config.recorrentes = [];
    recData.id = recData.id || UTILS.gerarId();
    recData.dataCriacao = recData.dataCriacao || new Date().toISOString();
    recData.updatedAt = new Date().toISOString();
    config.recorrentes.push(recData);
    DADOS.salvarConfig(config);
    return recData;
  },

  /**
   * Snapshot cru do armazenamento. NÃO é o formato de backup — não carrega
   * anexos e o importador (INIT_CONFIG.importarDados) não lê este shape.
   * Para backup do usuário use INIT_CONFIG.exportarDados.
   */
  exportarDados: function() {
    return {
      transacoes: DADOS.getTransacoes(),
      contas: DADOS.getContas(),
      config: DADOS.getConfig(),
      dataExportacao: new Date().toISOString()
    };
  },

  // Sync entre abas: atualiza quando outra aba muda o localStorage.
  // Debounce de 300ms evita múltiplos re-inits em rajadas de escrita.
  setupStorageSync: function() {
    if (DADOS._storageSyncBound) return;
    DADOS._storageSyncBound = true;
    window.addEventListener('storage', function(e) {
      if (!e.key || DADOS._ignorarStorageSync) return;

      if (e.key === DADOS.TX_SYNC_PING_KEY) {
        clearTimeout(DADOS._storageDebounceTimer);
        DADOS._storageDebounceTimer = setTimeout(function() {
          DADOS._hidratarTransacoesIdb().then(function(teveConflito) {
            if (!teveConflito) DADOS._mostrarBannerMultiAba();
          });
        }, 300);
        return;
      }

      if (e.key !== CONFIG.STORAGE_TRANSACOES
        && e.key !== CONFIG.STORAGE_CONFIG
        && e.key !== CONFIG.STORAGE_CONTAS) return;

      clearTimeout(DADOS._storageDebounceTimer);
      DADOS._storageDebounceTimer = setTimeout(function() {
        if (e.key === CONFIG.STORAGE_TRANSACOES && e.newValue) {
          DADOS._mesclarTransacoesRemotas(e.newValue);
        }
        if (typeof APP_STORE !== 'undefined' && typeof ACTIONS !== 'undefined') {
          APP_STORE.dispatch(ACTIONS.SYNC_CONCLUIR);
        } else {
          if (typeof TRANSACOES !== 'undefined') TRANSACOES.init();
          if (typeof ORCAMENTO !== 'undefined') ORCAMENTO.init();
          if (typeof CONTAS !== 'undefined') CONTAS.init();
          if (typeof RENDER !== 'undefined') RENDER.init();
        }
        DADOS._mostrarBannerMultiAba();
      }, 300);
    });
  },

  salvarAprendizado: function(hist) {
    DADOS._storageSetRaw(CONFIG.STORAGE_APRENDIZADO, JSON.stringify(hist));
  },

  obterAprendizado: function() {
    try {
      var data = DADOS._storageGetRaw(CONFIG.STORAGE_APRENDIZADO);
      return data ? JSON.parse(data) : {};
    } catch (e) {
      return {};
    }
  },

  getContas: function() {
    return DADOS.getContasRaw().filter(function(c) {
      return c && c.ativo !== false && !c.deletedAt;
    });
  },

  getContasRaw: function() {
    try {
      var data = DADOS._storageGetRaw(CONFIG.STORAGE_CONTAS);
      if (!data) return [];
      var parsed = JSON.parse(data);
      return Array.isArray(parsed) ? parsed : [];
    } catch (e) {
      DADOS._registrarFalhaLeitura(CONFIG.STORAGE_CONTAS, e);
      return [];
    }
  },

  /**
   * Grava a conta no aparelho. Para a nuvem, conta nova sobe na reconciliação
   * do próximo pull do Supabase (SUPA_SYNC._reconcileUp), como antes da saída
   * da API Express; salvarContas manda a última da lista na hora.
   */
  upsertConta: function(conta) {
    if (!conta.id) {
      conta.id = UTILS.gerarId();
    }
    conta.updatedAt = new Date().toISOString();
    conta.ativo = conta.ativo !== false;
    var lista = DADOS.getContasRaw();
    var idx = -1;
    for (var i = 0; i < lista.length; i++) {
      if (lista[i].id === conta.id) { idx = i; break; }
    }
    if (idx >= 0) lista[idx] = Object.assign({}, lista[idx], conta);
    else lista.push(conta);
    DADOS._storageSetRaw(CONFIG.STORAGE_CONTAS, JSON.stringify(lista));
    // Edição de conta que já existe sobe na hora. Antes só conta NOVA subia
    // (na reconciliação); renomear ou corrigir o saldo ficava só neste
    // aparelho, e os outros mostravam o valor antigo para sempre.
    if (idx >= 0) DADOS._pushContasApi(lista[idx]);
    if (typeof APP_STORE !== 'undefined' && typeof ACTIONS !== 'undefined') {
      APP_STORE.dispatch(ACTIONS.CONTAS_SALVAR, lista);
    }
    return conta;
  },

  deletarConta: function(id) {
    var lista = DADOS.getContasRaw();
    var alvo = null;
    for (var i = 0; i < lista.length; i++) {
      if (lista[i].id === id) { alvo = lista[i]; break; }
    }
    if (!alvo) return false;
    var restante;
    if (DADOS._nuvemAtiva()) {
      // Com a nuvem, a conta é desativada (ativo:false) e o aviso sobe. Antes
      // ela só saía do aparelho, a nuvem nunca sabia, e o próximo pull a trazia
      // de volta (getContas já esconde as inativas).
      var desativada = Object.assign({}, alvo, { ativo: false, updatedAt: new Date().toISOString() });
      restante = lista.map(function(c) { return c.id === id ? desativada : c; });
      DADOS._storageSetRaw(CONFIG.STORAGE_CONTAS, JSON.stringify(restante));
      DADOS._pushContasApi(desativada);
      restante = restante.filter(function(c) { return c.ativo !== false; });
    } else {
      restante = lista.filter(function(c) { return c.id !== id; });
      DADOS._storageSetRaw(CONFIG.STORAGE_CONTAS, JSON.stringify(restante));
    }
    if (typeof APP_STORE !== 'undefined' && typeof ACTIONS !== 'undefined') {
      APP_STORE.dispatch(ACTIONS.CONTAS_SALVAR, restante);
    }
    return true;
  },

  /** Orçamentos vivem no config: sobem para a nuvem junto com ele. */
  upsertOrcamento: function(categoria, limite, periodo) {
    periodo = periodo || 'mensal';
    var config = DADOS.getConfig();
    if (!config.orcamentos) config.orcamentos = {};
    var entry = config.orcamentos[categoria] || {};
    if (!entry.id) {
      entry.id = UTILS.gerarId();
    }
    entry.limite = Number(limite);
    entry.definidoEm = entry.definidoEm || new Date().toISOString();
    entry.updatedAt = new Date().toISOString();
    entry.periodo = periodo;
    config.orcamentos[categoria] = entry;
    DADOS.salvarConfig(config);
    return entry;
  },

  deletarOrcamento: function(categoria) {
    var config = DADOS.getConfig();
    if (!config.orcamentos || !config.orcamentos[categoria]) return false;
    delete config.orcamentos[categoria];
    DADOS.salvarConfig(config);
    // A tabela de orçamentos da nuvem também guarda o limite; sem desativá-lo
    // lá, o próximo pull devolvia o orçamento apagado.
    DADOS._deleteOrcamentoApi(categoria);
    return true;
  },

  salvarContas: function(contas) {
    var lista = Array.isArray(contas) ? contas : [];
    DADOS._storageSetRaw(CONFIG.STORAGE_CONTAS, JSON.stringify(lista));
    if (typeof APP_STORE !== 'undefined' && typeof ACTIONS !== 'undefined') {
      APP_STORE.dispatch(ACTIONS.CONTAS_SALVAR, lista);
    }
    if (lista.length > 0) {
      DADOS._pushContasApi(lista[lista.length - 1]);
    }
    return lista;
  }
};

Object.assign(DADOS, DADOS_NUVEM);

export { DADOS };
export default DADOS;
