/* eslint-disable no-unused-vars */
/**
 * @file pin.js — PIN security module
 * @module PIN
 * Tier 1. Depende de: config.js, dados.js, utils.js
 *
 * Funções globais expostas (chamadas via event handlers e bootstrap):
 *   PIN_SECURITY, hashPin, setupPinInputs,
 *   togglePinSeguranca, verificarPinAoAbrir, tentarDesbloquear
 *
 * Segurança — e os limites dela:
 * - PBKDF2-SHA256 310k iterations (OWASP 2023) → ~90ms derivar
 * - Salt único por usuário → rainbow tables inúteis
 * - Rate limit: 5 tentativas → backoff exponencial 30s/60s/120s/240s
 * - Comparação tempo-constante → defesa contra timing attacks
 * - PINs previsíveis recusados na criação (1234, 0000, 1111, sequências…)
 *
 * O que este módulo NÃO é: proteção dos dados. Um PIN de 4 dígitos tem 10 mil
 * combinações; com o aparelho em mãos e o hash em disco, força bruta offline
 * é questão de tempo (~15 min a 310k iterações). O rate limit vive no
 * localStorage, então também é contornável por quem tem o aparelho destravado.
 * Isto é uma TRANCA DE CONVENIÊNCIA contra quem pega o celular na mesa — e a
 * interface deve dizer exatamente isso. Proteção de dado de verdade é a
 * cifragem local (LOCAL_CRYPTO) e a senha da conta.
 */

/** PIN crypto + rate limit core */
var PIN_SECURITY = {
  /** @type {number} */
  ITERATIONS: 310000,
  /** Hashes antigos continuam válidos e são migrados no primeiro acerto. */
  ITERATIONS_LEGADO: 100000,
  /** @type {number} */
  MAX_TENTATIVAS: 5,
  /** @type {number} */
  BLOQUEIO_BASE_MS: 30000,
  /** @type {string} */
  ALGORITMO_ID: 'pbkdf2-sha256-310k',
  ALGORITMO_ID_LEGADO: 'pbkdf2-sha256-100k',
  LOCK_FLAG_KEY: 'financaspro_pin_locked',

  syncLockFlag: function(ativo) {
    try {
      if (ativo) localStorage.setItem(this.LOCK_FLAG_KEY, '1');
      else localStorage.removeItem(this.LOCK_FLAG_KEY);
    } catch (e) { /* noop */ }
  },

  /**
   * Buffer → hex string.
   * @param {ArrayBuffer|Uint8Array} buf
   * @returns {string}
   */
  bytesToHex: function(buf) {
    return Array.from(new Uint8Array(buf))
      .map(function(b) { return b.toString(16).padStart(2, '0'); }).join('');
  },

  /**
   * Hex string → Uint8Array.
   * @param {string} hex
   * @returns {Uint8Array}
   */
  hexToBytes: function(hex) {
    var bytes = new Uint8Array(hex.length / 2);
    for (var i = 0; i < hex.length; i += 2) bytes[i/2] = parseInt(hex.substr(i, 2), 16);
    return bytes;
  },

  /**
   * Gera salt criptográfico de 16 bytes (128 bits).
   * @returns {string} hex
   */
  gerarSalt: function() {
    var salt = new Uint8Array(16);
    crypto.getRandomValues(salt);
    return this.bytesToHex(salt.buffer);
  },

  /**
   * Deriva chave via PBKDF2-SHA256.
   * @param {string} pin
   * @param {string} saltHex
   * @returns {Promise<string>} hash hex (256 bits)
   */
  derivar: function(pin, saltHex, iteracoes) {
    var encoder = new TextEncoder();
    var saltBytes = this.hexToBytes(saltHex);
    var self = this;
    var n = iteracoes || this.ITERATIONS;
    return crypto.subtle.importKey(
      'raw', encoder.encode(pin), { name: 'PBKDF2' }, false, ['deriveBits']
    ).then(function(key) {
      return crypto.subtle.deriveBits(
        { name: 'PBKDF2', salt: saltBytes, iterations: n, hash: 'SHA-256' },
        key, 256
      );
    }).then(function(buffer) {
      return self.bytesToHex(buffer);
    });
  },

  /** Iterações do hash guardado — PINs criados antes da migração usam 100k. */
  iteracoesDe: function(algoritmoId) {
    return algoritmoId === this.ALGORITMO_ID_LEGADO
      ? this.ITERATIONS_LEGADO
      : this.ITERATIONS;
  },

  /** Hash antigo → precisa ser regravado depois de um acerto. */
  precisaMigrar: function(algoritmoId) {
    return algoritmoId !== this.ALGORITMO_ID;
  },

  /**
   * PINs que um ladrão de celular tenta primeiro.
   * A lista curta importa mais do que parece: as ~20 combinações abaixo
   * respondem por perto de um quarto dos PINs escolhidos por pessoas reais.
   * Com 5 tentativas antes do bloqueio, quem escolhe 1234 está entregando a
   * tranca — nenhuma quantidade de iterações do PBKDF2 conserta isso.
   */
  PINS_FRACOS: [
    '1234', '0000', '1111', '1212', '7777', '1004', '2000', '4444', '2222',
    '6969', '9999', '3333', '5555', '6666', '1122', '1313', '8888', '4321',
    '2001', '1010', '1230', '2580', '0852',
  ],

  /**
   * @param {string} pin
   * @returns {{fraco: boolean, motivo?: string}}
   */
  avaliarPin: function(pin) {
    var p = String(pin == null ? '' : pin);
    if (!/^\d{4}$/.test(p)) return { fraco: true, motivo: 'O PIN precisa ter 4 dígitos.' };
    if (/^(\d)\1{3}$/.test(p)) {
      return { fraco: true, motivo: 'Evite quatro dígitos iguais — é dos primeiros que se tenta.' };
    }
    if (this.PINS_FRACOS.indexOf(p) >= 0) {
      return { fraco: true, motivo: 'Esse é um dos PINs mais usados no mundo. Escolha outro.' };
    }
    // Sequências: 1234, 3456, 8765…
    var cresc = true, decresc = true;
    for (var i = 1; i < p.length; i++) {
      var d = p.charCodeAt(i) - p.charCodeAt(i - 1);
      if (d !== 1) cresc = false;
      if (d !== -1) decresc = false;
    }
    if (cresc || decresc) {
      return { fraco: true, motivo: 'Sequências como 1234 ou 8765 são fáceis demais de adivinhar.' };
    }
    // Padrão ABAB: 1212, 3535…
    if (p[0] === p[2] && p[1] === p[3]) {
      return { fraco: true, motivo: 'Padrões repetidos como 1212 são previsíveis. Escolha outro.' };
    }
    // Ano provável: 19xx / 20xx
    if (/^(19|20)\d{2}$/.test(p)) {
      return { fraco: true, motivo: 'Anos de nascimento estão entre os primeiros palpites.' };
    }
    return { fraco: false };
  },

  /**
   * Comparação tempo-constante (defesa contra timing attacks).
   * @param {string} a
   * @param {string} b
   * @returns {boolean}
   */
  comparar: function(a, b) {
    if (typeof a !== 'string' || typeof b !== 'string') return false;
    if (a.length !== b.length) return false;
    var diff = 0;
    for (var i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
    return diff === 0;
  },

  /**
   * @returns {number} segundos restantes de bloqueio (0 se não bloqueado)
   */
  estaBloqueado: function() {
    var config = DADOS.getConfig();
    var ate = config.pinBloqueadoAte || 0;
    if (ate > Date.now()) return Math.ceil((ate - Date.now()) / 1000);
    return 0;
  },

  /**
   * Registra falha de tentativa. Aplica backoff exponencial após MAX_TENTATIVAS.
   * @returns {number} timestamp de bloqueio (0 se ainda não)
   */
  registrarFalha: function() {
    var config = DADOS.getConfig();
    var tentativas = (config.pinTentativas || 0) + 1;
    var update = { pinTentativas: tentativas };
    if (tentativas >= this.MAX_TENTATIVAS) {
      var excesso = tentativas - this.MAX_TENTATIVAS;
      var espera = this.BLOQUEIO_BASE_MS * Math.pow(2, excesso);
      update.pinBloqueadoAte = Date.now() + espera;
    }
    DADOS.salvarConfig(update);
    return update.pinBloqueadoAte || 0;
  },

  resetarFalhas: function() {
    DADOS.salvarConfig({ pinTentativas: 0, pinBloqueadoAte: 0 });
  }
};

/**
 * Compatibilidade pública.
 * @param {string} pin
 * @param {string} saltHex
 * @returns {Promise<string>}
 */
function hashPin(pin, saltHex) {
  return PIN_SECURITY.derivar(pin, saltHex);
}

/**
 * Setup dos 4 inputs PIN com auto-foco, backspace volta, paste distribui.
 * @param {string} prefix — prefixo do id (`pin` ou `unlock`)
 * @param {(pin: string) => void} [onComplete] — chamado quando 4 dígitos preenchidos
 */
function setupPinInputs(prefix, onComplete) {
  var ids = [prefix + '-1', prefix + '-2', prefix + '-3', prefix + '-4'];
  var els = ids.map(function(id) { return document.getElementById(id); });
  if (els.some(function(e) { return !e; })) return;

  els.forEach(function(el, i) {
    el.addEventListener('input', function() {
      el.value = (el.value || '').replace(/\D/g, '').slice(0, 1);
      if (el.value && i < 3) els[i+1].focus();
      var pin = els.map(function(x) { return x.value; }).join('');
      if (pin.length === 4 && /^\d{4}$/.test(pin) && typeof onComplete === 'function') {
        onComplete(pin);
      }
    });
    el.addEventListener('keydown', function(ev) {
      if (ev.key === 'Backspace' && !el.value && i > 0) els[i-1].focus();
    });
    el.addEventListener('paste', function(ev) {
      ev.preventDefault();
      var raw = (ev.clipboardData || window.clipboardData).getData('text');
      var digits = (raw || '').replace(/\D/g, '').slice(0, 4);
      for (var k = 0; k < 4; k++) els[k].value = digits[k] || '';
      if (digits.length === 4) {
        els[3].focus();
        if (typeof onComplete === 'function') onComplete(digits);
      } else if (digits.length > 0) {
        els[Math.min(digits.length, 3)].focus();
      }
    });
  });
}

/**
 * Toggle do PIN nas Configurações. Reage ao checkbox `chk-pin`.
 */
function togglePinSeguranca() {
  var chk = document.getElementById('chk-pin');
  if (chk && chk.checked) {
    var html = '<div style="display:flex;flex-direction:column;gap:16px;text-align:center">' +
      '<p style="font-weight:700;font-size:17px">Criar PIN</p>' +
      '<p style="font-size:13px;color:var(--text-secondary)">PIN de 4 dígitos para ocultar saldos ao abrir. Não criptografa dados no aparelho.</p>' +
      '<div style="display:flex;gap:8px;justify-content:center">' +
      '<input type="password" id="pin-1" maxlength="1" inputmode="numeric" style="width:48px;height:56px;text-align:center;font-size:24px;font-weight:700;border:2px solid var(--border);border-radius:12px;background:var(--bg);color:var(--text-primary)">' +
      '<input type="password" id="pin-2" maxlength="1" inputmode="numeric" style="width:48px;height:56px;text-align:center;font-size:24px;font-weight:700;border:2px solid var(--border);border-radius:12px;background:var(--bg);color:var(--text-primary)">' +
      '<input type="password" id="pin-3" maxlength="1" inputmode="numeric" style="width:48px;height:56px;text-align:center;font-size:24px;font-weight:700;border:2px solid var(--border);border-radius:12px;background:var(--bg);color:var(--text-primary)">' +
      '<input type="password" id="pin-4" maxlength="1" inputmode="numeric" style="width:48px;height:56px;text-align:center;font-size:24px;font-weight:700;border:2px solid var(--border);border-radius:12px;background:var(--bg);color:var(--text-primary)">' +
      '</div></div>';
    fpAlert(html, { trustedHtml: true });
    setTimeout(function() {
      var overlay = document.querySelector('.modal-overlay');
      if (!overlay) return;
      var okBtn = overlay.querySelector('.modal-btn');
      if (okBtn) {
        okBtn.textContent = 'Ativar PIN';
        okBtn.onclick = function() {
          var pin = ['pin-1','pin-2','pin-3','pin-4']
            .map(function(id){ var el = document.getElementById(id); return el ? el.value : ''; }).join('');
          var avaliacao = PIN_SECURITY.avaliarPin(pin);
          if (avaliacao.fraco) {
            UTILS.mostrarToast(avaliacao.motivo, 'error');
            ['pin-1','pin-2','pin-3','pin-4'].forEach(function(id) {
              var el = document.getElementById(id);
              if (el) el.value = '';
            });
            var primeiro = document.getElementById('pin-1');
            if (primeiro) primeiro.focus();
            return;
          }
          var saltHex = PIN_SECURITY.gerarSalt();
          hashPin(pin, saltHex).then(function(hash) {
            DADOS.salvarConfig({
              pinAtivo: true,
              pinHash: hash,
              pinSalt: saltHex,
              pinAlgoritmo: PIN_SECURITY.ALGORITMO_ID,
              pinTentativas: 0,
              pinBloqueadoAte: 0
            });
            PIN_SECURITY.syncLockFlag(true);
            overlay.remove();
            if (typeof renderConfigTab === 'function') renderConfigTab();
            UTILS.mostrarToast('PIN ativado', 'success');
          });
        };
      }
      setupPinInputs('pin');
      var primeiro = document.getElementById('pin-1');
      if (primeiro) primeiro.focus();
    }, 100);
  } else {
    var chkRevert = document.getElementById('chk-pin');
    if (chkRevert) chkRevert.checked = true;
    confirmarDesativarPin();
  }
}

/**
 * Exige PIN atual antes de desativar a proteção.
 */
function confirmarDesativarPin() {
  var config = DADOS.getConfig();
  if (!config.pinAtivo || !config.pinHash || !config.pinSalt) {
    DADOS.salvarConfig({
      pinAtivo: false, pinHash: null, pinSalt: null,
      pinAlgoritmo: null, pinTentativas: 0, pinBloqueadoAte: 0
    });
    PIN_SECURITY.syncLockFlag(false);
    var chkOff = document.getElementById('chk-pin');
    if (chkOff) chkOff.checked = false;
    if (typeof renderConfigTab === 'function') renderConfigTab();
    UTILS.mostrarToast('PIN desativado', 'success');
    return;
  }

  var html = '<div style="display:flex;flex-direction:column;gap:16px;text-align:center">' +
    '<p style="font-weight:700;font-size:17px">Desativar PIN</p>' +
    '<p style="font-size:13px;color:var(--text-secondary)">Digite seu PIN atual para confirmar</p>' +
    '<div style="display:flex;gap:8px;justify-content:center">' +
    '<input type="password" id="pinoff-1" maxlength="1" inputmode="numeric" style="width:48px;height:56px;text-align:center;font-size:24px;font-weight:700;border:2px solid var(--border);border-radius:12px;background:var(--bg);color:var(--text-primary)">' +
    '<input type="password" id="pinoff-2" maxlength="1" inputmode="numeric" style="width:48px;height:56px;text-align:center;font-size:24px;font-weight:700;border:2px solid var(--border);border-radius:12px;background:var(--bg);color:var(--text-primary)">' +
    '<input type="password" id="pinoff-3" maxlength="1" inputmode="numeric" style="width:48px;height:56px;text-align:center;font-size:24px;font-weight:700;border:2px solid var(--border);border-radius:12px;background:var(--bg);color:var(--text-primary)">' +
    '<input type="password" id="pinoff-4" maxlength="1" inputmode="numeric" style="width:48px;height:56px;text-align:center;font-size:24px;font-weight:700;border:2px solid var(--border);border-radius:12px;background:var(--bg);color:var(--text-primary)">' +
    '</div></div>';
  fpAlert(html, { trustedHtml: true });
  setTimeout(function() {
    var overlay = document.querySelector('.modal-overlay');
    if (!overlay) return;
    var okBtn = overlay.querySelector('.modal-btn');
    var cancelHandler = function() {
      overlay.remove();
      var chk = document.getElementById('chk-pin');
      if (chk) chk.checked = true;
      if (typeof renderConfigTab === 'function') renderConfigTab();
    };
    overlay.addEventListener('click', function onBg(e) {
      if (e.target === overlay) {
        overlay.removeEventListener('click', onBg);
        cancelHandler();
      }
    });
    if (okBtn) {
      okBtn.textContent = 'Confirmar';
      okBtn.onclick = function() {
        var pin = ['pinoff-1','pinoff-2','pinoff-3','pinoff-4']
          .map(function(id) { var el = document.getElementById(id); return el ? el.value : ''; }).join('');
        if (!/^\d{4}$/.test(pin)) {
          UTILS.mostrarToast('PIN deve ter 4 dígitos', 'error');
          return;
        }
        PIN_SECURITY.derivar(pin, config.pinSalt, PIN_SECURITY.iteracoesDe(config.pinAlgoritmo))
          .then(function(hash) {
          if (!PIN_SECURITY.comparar(hash, config.pinHash)) {
            UTILS.mostrarToast('PIN incorreto', 'error');
            return;
          }
          DADOS.salvarConfig({
            pinAtivo: false, pinHash: null, pinSalt: null,
            pinAlgoritmo: null, pinTentativas: 0, pinBloqueadoAte: 0
          });
          PIN_SECURITY.syncLockFlag(false);
          overlay.remove();
          var chkDone = document.getElementById('chk-pin');
          if (chkDone) chkDone.checked = false;
          if (typeof renderConfigTab === 'function') renderConfigTab();
          UTILS.mostrarToast('PIN desativado', 'success');
        });
      };
    }
    setupPinInputs('pinoff');
    var primeiro = document.getElementById('pinoff-1');
    if (primeiro) primeiro.focus();
  }, 100);
}

/**
 * Renderiza lockscreen quando PIN ativo. Idempotente.
 * Liberada via tentarDesbloquear() ou se config inválido.
 */
function verificarPinAoAbrir() {
  var config = DADOS.getConfig();
  if (!config.pinAtivo || !config.pinHash) {
    document.documentElement.classList.remove('pin-locked');
    PIN_SECURITY.syncLockFlag(false);
    if (typeof window !== 'undefined' && window.__FP_PIN_EARLY_SECURE_HELD__ === 1
        && typeof FP_SECURE_SCREEN !== 'undefined' && FP_SECURE_SCREEN.release) {
      FP_SECURE_SCREEN.release();
      window.__FP_PIN_EARLY_SECURE_HELD__ = 0;
      window.__FP_PIN_EARLY_SECURE__ = 0;
    }
    return;
  }
  PIN_SECURITY.syncLockFlag(true);
  document.documentElement.classList.add('pin-locked');
  var html = '<div style="display:flex;flex-direction:column;gap:16px;text-align:center">' +
    '<p class="pin-lock-icon" aria-hidden="true"><i data-lucide="lock" aria-hidden="true"></i></p>' +
    '<p style="font-weight:700;font-size:17px">FinançasPro</p>' +
    '<p style="font-size:13px;color:var(--text-secondary)">Digite seu PIN para ver saldos neste aparelho</p>' +
    '<div style="display:flex;gap:8px;justify-content:center">' +
    '<input type="password" id="unlock-1" maxlength="1" inputmode="numeric" style="width:48px;height:56px;text-align:center;font-size:24px;font-weight:700;border:2px solid var(--border);border-radius:12px;background:var(--bg);color:var(--text-primary)">' +
    '<input type="password" id="unlock-2" maxlength="1" inputmode="numeric" style="width:48px;height:56px;text-align:center;font-size:24px;font-weight:700;border:2px solid var(--border);border-radius:12px;background:var(--bg);color:var(--text-primary)">' +
    '<input type="password" id="unlock-3" maxlength="1" inputmode="numeric" style="width:48px;height:56px;text-align:center;font-size:24px;font-weight:700;border:2px solid var(--border);border-radius:12px;background:var(--bg);color:var(--text-primary)">' +
    '<input type="password" id="unlock-4" maxlength="1" inputmode="numeric" style="width:48px;height:56px;text-align:center;font-size:24px;font-weight:700;border:2px solid var(--border);border-radius:12px;background:var(--bg);color:var(--text-primary)">' +
    '</div></div>';
  var lockScreen = document.createElement('div');
  lockScreen.className = 'pin-lock-screen';
  lockScreen.setAttribute('role', 'dialog');
  lockScreen.setAttribute('aria-modal', 'true');
  lockScreen.setAttribute('aria-label', 'Tela de bloqueio por PIN');
  lockScreen.innerHTML = '<div class="pin-lock-content">' + html +
    '<button class="btn-primario" id="unlock-submit-btn" style="margin-top:16px">Desbloquear</button></div>';
  document.body.appendChild(lockScreen);
  if (typeof FP_SECURE_SCREEN !== 'undefined' && FP_SECURE_SCREEN.retain) {
    /* Já retido pelo early hold do pin-guard — evita ref dupla. */
    if (typeof window !== 'undefined' && window.__FP_PIN_EARLY_SECURE_HELD__ === 1) {
      window.__FP_PIN_EARLY_SECURE_HELD__ = 0;
      window.__FP_PIN_EARLY_SECURE__ = 0;
    } else {
      FP_SECURE_SCREEN.retain();
    }
  }
  if (typeof FocusTrap !== 'undefined') {
    lockScreen._fpFocusTrap = new FocusTrap(lockScreen);
    lockScreen._fpFocusTrap.activate();
  }
  var unlockBtn = document.getElementById('unlock-submit-btn');
  if (unlockBtn) unlockBtn.addEventListener('click', tentarDesbloquear);
  setupPinInputs('unlock', function() { tentarDesbloquear(); });
  setTimeout(function(){ var el = document.getElementById('unlock-1'); if(el) el.focus(); }, 200);
}

/**
 * Tenta desbloquear com o PIN nos inputs `unlock-*`.
 * Aplica rate limit + migração de PIN legado.
 */
function tentarDesbloquear() {
  var config = DADOS.getConfig();

  var bloqueio = PIN_SECURITY.estaBloqueado();
  if (bloqueio > 0) {
    UTILS.mostrarToast('Aguarde ' + bloqueio + 's antes de tentar novamente', 'error');
    return;
  }

  /* Antes, QUALQUER algoritmo diferente do atual apagava o PIN do usuário —
     endurecer o hash teria deslogado todo mundo. Agora o formato legado é
     aceito e migrado no primeiro acerto (ver abaixo). Só um algoritmo
     desconhecido de verdade força a recriação. */
  var algoritmoConhecido = config.pinAlgoritmo === PIN_SECURITY.ALGORITMO_ID
    || config.pinAlgoritmo === PIN_SECURITY.ALGORITMO_ID_LEGADO;

  if (!config.pinSalt || !algoritmoConhecido) {
    UTILS.mostrarToast('Atualização de segurança: recrie seu PIN nas Configurações', 'warning');
    DADOS.salvarConfig({ pinAtivo: false, pinHash: null, pinSalt: null, pinAlgoritmo: null });
    PIN_SECURITY.syncLockFlag(false);
    var lockLeg = document.querySelector('.pin-lock-screen');
    if (lockLeg) {
      if (lockLeg._fpFocusTrap) lockLeg._fpFocusTrap.deactivate();
      lockLeg.remove();
    }
    document.documentElement.classList.remove('pin-locked');
    if (typeof FP_SECURE_SCREEN !== 'undefined' && FP_SECURE_SCREEN.release) {
      FP_SECURE_SCREEN.release();
    }
    return;
  }

  var pin = ['unlock-1','unlock-2','unlock-3','unlock-4']
    .map(function(id){ var el = document.getElementById(id); return el ? el.value : ''; }).join('');

  if (!/^\d{4}$/.test(pin)) {
    UTILS.mostrarToast('PIN deve ter 4 dígitos', 'error');
    return;
  }

  var iteracoesGuardadas = PIN_SECURITY.iteracoesDe(config.pinAlgoritmo);
  PIN_SECURITY.derivar(pin, config.pinSalt, iteracoesGuardadas).then(function(hash) {
    if (PIN_SECURITY.comparar(hash, config.pinHash)) {
      PIN_SECURITY.resetarFalhas();
      /* Acertou com hash antigo: regrava no formato forte agora, enquanto o
         PIN em claro ainda está na mão. Falha aqui não bloqueia a entrada. */
      if (PIN_SECURITY.precisaMigrar(config.pinAlgoritmo)) {
        PIN_SECURITY.derivar(pin, config.pinSalt, PIN_SECURITY.ITERATIONS)
          .then(function(novoHash) {
            DADOS.salvarConfig({
              pinHash: novoHash,
              pinAlgoritmo: PIN_SECURITY.ALGORITMO_ID,
            });
          }).catch(function() { /* tenta de novo no próximo desbloqueio */ });
      }
    var lock = document.querySelector('.pin-lock-screen');
    if (lock) {
      if (lock._fpFocusTrap) lock._fpFocusTrap.deactivate();
      lock.remove();
    }
      document.documentElement.classList.remove('pin-locked');
      if (typeof FP_SECURE_SCREEN !== 'undefined' && FP_SECURE_SCREEN.release) {
        FP_SECURE_SCREEN.release();
      }
      UTILS.mostrarToast('Que bom te ver.', 'success');
    } else {
      var bloqAte = PIN_SECURITY.registrarFalha();
      var cfg = DADOS.getConfig();
      var rest = Math.max(0, PIN_SECURITY.MAX_TENTATIVAS - (cfg.pinTentativas || 0));
      if (bloqAte > Date.now()) {
        var seg = Math.ceil((bloqAte - Date.now()) / 1000);
        UTILS.mostrarToast('Muitas tentativas. Bloqueado por ' + seg + 's', 'error');
      } else {
        UTILS.mostrarToast('PIN incorreto. ' + rest + ' tentativa(s) restante(s)', 'error');
      }
      ['unlock-1','unlock-2','unlock-3','unlock-4'].forEach(function(id){
        var el = document.getElementById(id); if (el) el.value = '';
      });
      var first = document.getElementById('unlock-1'); if (first) first.focus();
    }
  }).catch(function(e) {
    console.error('Erro ao verificar PIN:', e);
    UTILS.mostrarToast('Não foi possível confirmar seu PIN. Seus dados continuam guardados e intactos.', 'error');
  });
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { PIN_SECURITY: PIN_SECURITY, hashPin: hashPin };
}
