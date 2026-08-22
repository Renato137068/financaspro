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

  var cfg = null;
  try {
    var raw = localStorage.getItem('fp-config');
    if (raw) cfg = JSON.parse(raw);
  } catch (e) { /* config corrompido → segue com os padrões */ }

  if (cfg && cfg.pinAtivo && cfg.pinHash) {
    document.documentElement.classList.add('pin-locked');
  }

  // Tema resolvido ANTES do primeiro paint.
  //
  // Se ficasse só no CONFIG_USER.aplicarTema(), que roda depois do bundle, o
  // usuário de tema escuro veria um flash branco a cada abertura. Um <script>
  // inline seria o caminho usual, mas a CSP é `script-src 'self'` — sem
  // 'unsafe-inline' —, então este arquivo bloqueante é o lugar certo.
  //
  // A regra é a mesma do CONFIG_USER.temaEfetivo(): escolha explícita vence,
  // senão segue o sistema. As duas implementações precisam concordar; há teste
  // estático garantindo isso.
  try {
    var tema = cfg && (cfg.tema === 'dark' || cfg.tema === 'light') ? cfg.tema : null;
    if (!tema && window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
      tema = 'dark';
    }
    if (tema === 'dark') document.documentElement.setAttribute('data-theme', 'dark');
  } catch (e) { /* sem matchMedia → tema claro, que é o padrão */ }
})();
