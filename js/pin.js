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
 * Segurança:
 * - PBKDF2 100k iterations → ~30ms derivar (UX OK, brute-force ~5min/PIN)
 * - Salt único por usuário → rainbow tables inúteis
 * - Rate limit: 5 tentativas → backoff exponencial 30s/60s/120s/240s
 * - Comparação tempo-constante → defesa contra timing attacks
 */

/** PIN crypto + rate limit core */
var PIN_SECURITY = {
  /** @type {number} */
  ITERATIONS: 100000,
  /** @type {number} */
  MAX_TENTATIVAS: 5,
  /** @type {number} */
  BLOQUEIO_BASE_MS: 30000,
  /** @type {string} */
  ALGORITMO_ID: 'pbkdf2-sha256-100k',

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
  derivar: function(pin, saltHex) {
    var encoder = new TextEncoder();
    var saltBytes = this.hexToBytes(saltHex);
    var self = this;
    return crypto.subtle.importKey(
      'raw', encoder.encode(pin), { name: 'PBKDF2' }, false, ['deriveBits']
    ).then(function(key) {
      return crypto.subtle.deriveBits(
        { name: 'PBKDF2', salt: saltBytes, iterations: self.ITERATIONS, hash: 'SHA-256' },
        key, 256
      );
    }).then(function(buffer) {
      return self.bytesToHex(buffer);
    });
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
      '<p style="font-size:13px;color:var(--text-secondary)">Crie um PIN de 4 dígitos</p>' +
      '<div style="display:flex;gap:8px;justify-content:center">' +
      '<input type="password" id="pin-1" maxlength="1" inputmode="numeric" style="width:48px;height:56px;text-align:center;font-size:24px;font-weight:700;border:2px solid var(--border);border-radius:12px;background:var(--bg);color:var(--text-primary)">' +
      '<input type="password" id="pin-2" maxlength="1" inputmode="numeric" style="width:48px;height:56px;text-align:center;font-size:24px;font-weight:700;border:2px solid var(--border);border-radius:12px;background:var(--bg);color:var(--text-primary)">' +
      '<input type="password" id="pin-3" maxlength="1" inputmode="numeric" style="width:48px;height:56px;text-align:center;font-size:24px;font-weight:700;border:2px solid var(--border);border-radius:12px;background:var(--bg);color:var(--text-primary)">' +
      '<input type="password" id="pin-4" maxlength="1" inputmode="numeric" style="width:48px;height:56px;text-align:center;font-size:24px;font-weight:700;border:2px solid var(--border);border-radius:12px;background:var(--bg);color:var(--text-primary)">' +
      '</div></div>';
    fpAlert(html);
    setTimeout(function() {
      var overlay = document.querySelector('.modal-overlay');
      if (!overlay) return;
      var okBtn = overlay.querySelector('.modal-btn');
      if (okBtn) {
        okBtn.textContent = 'Ativar PIN';
        okBtn.onclick = function() {
          var pin = ['pin-1','pin-2','pin-3','pin-4']
            .map(function(id){ var el = document.getElementById(id); return el ? el.value : ''; }).join('');
          if (pin.length !== 4 || !/^\d{4}$/.test(pin)) {
            UTILS.mostrarToast('PIN deve ter 4 dígitos', 'error');
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
            overlay.remove();
            if (typeof renderConfigTab === 'function') renderConfigTab();
            UTILS.mostrarToast('PIN ativado!', 'success');
          });
        };
      }
      setupPinInputs('pin');
      var primeiro = document.getElementById('pin-1');
      if (primeiro) primeiro.focus();
    }, 100);
  } else {
    DADOS.salvarConfig({
      pinAtivo: false, pinHash: null, pinSalt: null,
      pinAlgoritmo: null, pinTentativas: 0, pinBloqueadoAte: 0
    });
    if (typeof renderConfigTab === 'function') renderConfigTab();
    UTILS.mostrarToast('PIN desativado', 'success');
  }
}

/**
 * Renderiza lockscreen quando PIN ativo. Idempotente.
 * Liberada via tentarDesbloquear() ou se config inválido.
 */
function verificarPinAoAbrir() {
  var config = DADOS.getConfig();
  if (!config.pinAtivo || !config.pinHash) {
    document.documentElement.classList.remove('pin-locked');
    return;
  }
  document.documentElement.classList.add('pin-locked');
  var html = '<div style="display:flex;flex-direction:column;gap:16px;text-align:center">' +
    '<p style="font-size:36px">🔒</p>' +
    '<p style="font-weight:700;font-size:17px">FinançasPro</p>' +
    '<p style="font-size:13px;color:var(--text-secondary)">Digite seu PIN</p>' +
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

  if (!config.pinSalt || config.pinAlgoritmo !== PIN_SECURITY.ALGORITMO_ID) {
    UTILS.mostrarToast('Atualização de segurança: recrie seu PIN nas Configurações', 'warning');
    DADOS.salvarConfig({ pinAtivo: false, pinHash: null, pinSalt: null, pinAlgoritmo: null });
    var lockLeg = document.querySelector('.pin-lock-screen');
    if (lockLeg) lockLeg.remove();
    document.documentElement.classList.remove('pin-locked');
    return;
  }

  var pin = ['unlock-1','unlock-2','unlock-3','unlock-4']
    .map(function(id){ var el = document.getElementById(id); return el ? el.value : ''; }).join('');

  if (!/^\d{4}$/.test(pin)) {
    UTILS.mostrarToast('PIN deve ter 4 dígitos', 'error');
    return;
  }

  hashPin(pin, config.pinSalt).then(function(hash) {
    if (PIN_SECURITY.comparar(hash, config.pinHash)) {
      PIN_SECURITY.resetarFalhas();
      var lock = document.querySelector('.pin-lock-screen');
      if (lock) lock.remove();
      document.documentElement.classList.remove('pin-locked');
      UTILS.mostrarToast('Bem-vindo de volta!', 'success');
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
    UTILS.mostrarToast('Erro de segurança. Tente novamente.', 'error');
  });
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { PIN_SECURITY: PIN_SECURITY, hashPin: hashPin };
}
