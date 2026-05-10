/* Service Worker registration + update prompt
   Mostra banner quando nova versão está disponível, user decide quando recarregar. */
(function() {
  if (!('serviceWorker' in navigator)) return;

  var isHttp = location.protocol === 'http:' || location.protocol === 'https:';
  if (!isHttp) return;

  var isLocalhost = location.hostname === 'localhost' || location.hostname === '127.0.0.1';

  // Dev: desregistra SW para reload previsível
  if (isLocalhost) {
    navigator.serviceWorker.getRegistrations()
      .then(function(regs) {
        return Promise.all(regs.map(function(reg) { return reg.unregister(); }));
      })
      .then(function() {
        if ('caches' in window) {
          return caches.keys().then(function(keys) {
            return Promise.all(keys.map(function(key) { return caches.delete(key); }));
          });
        }
      })
      .catch(function() {});
    return;
  }

  function mostrarUpdatePrompt(novoSW) {
    if (document.getElementById('sw-update-banner')) return;
    var banner = document.createElement('div');
    banner.id = 'sw-update-banner';
    banner.setAttribute('role', 'status');
    banner.setAttribute('aria-live', 'polite');
    banner.style.cssText = 'position:fixed;bottom:88px;left:50%;transform:translateX(-50%);' +
      'background:#00723F;color:white;padding:12px 16px;border-radius:12px;' +
      'box-shadow:0 8px 24px rgba(0,0,0,0.2);z-index:10000;display:flex;gap:10px;' +
      'align-items:center;font-size:14px;font-weight:500;max-width:90%;';
    banner.textContent = '✨ Nova versão disponível ';

    var btn = document.createElement('button');
    btn.textContent = 'Atualizar';
    btn.style.cssText = 'background:white;color:#00723F;border:none;padding:6px 14px;' +
      'border-radius:8px;font-weight:700;cursor:pointer;font-size:13px;';
    btn.addEventListener('click', function() {
      if (novoSW) novoSW.postMessage('SKIP_WAITING');
    });
    banner.appendChild(btn);

    var dismiss = document.createElement('button');
    dismiss.textContent = '✕';
    dismiss.setAttribute('aria-label', 'Dispensar');
    dismiss.style.cssText = 'background:transparent;color:white;border:none;cursor:pointer;' +
      'font-size:18px;padding:0 4px;opacity:0.7;';
    dismiss.addEventListener('click', function() { banner.remove(); });
    banner.appendChild(dismiss);

    document.body.appendChild(banner);
  }

  navigator.serviceWorker.register('sw.js', { updateViaCache: 'none' })
    .then(function(reg) {
      // Detecta SW novo aguardando ativação
      if (reg.waiting && navigator.serviceWorker.controller) {
        mostrarUpdatePrompt(reg.waiting);
      }
      // Watch installation de novos SW
      reg.addEventListener('updatefound', function() {
        var novo = reg.installing;
        if (!novo) return;
        novo.addEventListener('statechange', function() {
          if (novo.state === 'installed' && navigator.serviceWorker.controller) {
            mostrarUpdatePrompt(novo);
          }
        });
      });
    })
    .catch(function() {});

  // Quando SW novo assume controle, recarrega para pegar assets atualizados
  var refreshing = false;
  navigator.serviceWorker.addEventListener('controllerchange', function() {
    if (refreshing) return;
    refreshing = true;
    window.location.reload();
  });
})();
