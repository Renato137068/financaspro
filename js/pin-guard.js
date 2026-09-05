/* PIN guard — roda antes de qualquer paint para evitar leak visual.
   Carregado no <head> antes do <body>.

   Flags planos (fora de fp-config) porque a cifragem at-rest deixa fp-config
   ilegível neste momento (LOCAL_CRYPTO ainda não carregou):
     financaspro_pin_locked = '1'
     financaspro_tema = 'dark'|'light'

   FLAG_SECURE: marca __FP_PIN_EARLY_SECURE__; fp-secure-screen.js faz retain
   assim que carrega (pin.js libera no desbloqueio).
*/
(function() {
  var PIN_FLAG = 'financaspro_pin_locked';
  var TEMA_FLAG = 'financaspro_tema';

  if (location.protocol === 'http:' || location.protocol === 'https:') {
    if (!document.querySelector('link[rel="manifest"]')) {
      var manifest = document.createElement('link');
      manifest.rel = 'manifest';
      manifest.href = 'manifest.json';
      document.head.appendChild(manifest);
    }
  }

  var cfg = null;
  try {
    var raw = localStorage.getItem('fp-config');
    if (raw && raw.indexOf('enc1:') !== 0 && raw.indexOf('enc2:') !== 0
        && raw.indexOf('enc3:') !== 0) {
      cfg = JSON.parse(raw);
    }
  } catch (e) { /* config cifrado/corrompido → usa flags planos */ }

  var pinOn = false;
  try {
    pinOn = localStorage.getItem(PIN_FLAG) === '1'
      || !!(cfg && cfg.pinAtivo && cfg.pinHash);
  } catch (e2) {
    pinOn = !!(cfg && cfg.pinAtivo && cfg.pinHash);
  }
  if (pinOn) {
    document.documentElement.classList.add('pin-locked');
    try { window.__FP_PIN_EARLY_SECURE__ = 1; } catch (ePin) { /* noop */ }
  }

  try {
    var tema = null;
    try { tema = localStorage.getItem(TEMA_FLAG); } catch (e3) { /* noop */ }
    if (tema !== 'dark' && tema !== 'light') {
      tema = cfg && (cfg.tema === 'dark' || cfg.tema === 'light') ? cfg.tema : null;
    }
    if (!tema && window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
      tema = 'dark';
    }
    if (tema === 'dark') document.documentElement.setAttribute('data-theme', 'dark');
  } catch (e4) { /* sem matchMedia → tema claro */ }
})();
