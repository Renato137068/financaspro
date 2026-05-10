/* PIN guard — roda antes de qualquer paint para evitar leak visual.
   Carregado no <head> antes do <body>. */
(function() {
  try {
    var raw = localStorage.getItem('fp-config');
    if (!raw) return;
    var cfg = JSON.parse(raw);
    if (cfg && cfg.pinAtivo && cfg.pinHash) {
      document.documentElement.classList.add('pin-locked');
    }
  } catch (e) { /* config corrompido → não bloqueia */ }
})();
