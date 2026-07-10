/* PIN guard — roda antes de qualquer paint para evitar leak visual.
   Carregado no <head> antes do <body>. */
(function() {
  if (location.protocol === 'http:' || location.protocol === 'https:') {
    if (!document.querySelector('link[rel="manifest"]')) {
      var manifest = document.createElement('link');
      manifest.rel = 'manifest';
      manifest.href = 'manifest.json';
      document.head.appendChild(manifest);
    }
  }

  try {
    var raw = localStorage.getItem('fp-config');
    if (!raw) return;
    var cfg = JSON.parse(raw);
    if (cfg && cfg.pinAtivo && cfg.pinHash) {
      document.documentElement.classList.add('pin-locked');
    }
  } catch (e) { /* config corrompido → não bloqueia */ }
})();
