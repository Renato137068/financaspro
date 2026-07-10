/**
 * csp-connect-src.cjs — Origens permitidas em connect-src (CSP)
 * Usa APP_URL / PUBLIC_API_URL do ambiente no build.
 */
function buildCspConnectSrc() {
  // Produção nunca deve liberar origens de desenvolvimento (localhost).
  var isProd = String(process.env.NODE_ENV || '').toLowerCase() === 'production';

  var origins = ["'self'"];
  if (!isProd) {
    origins.push('http://localhost:4000');
    origins.push('http://127.0.0.1:4000');
  }
  origins.push('https://cdn.jsdelivr.net');
  origins.push('https://cdnjs.cloudflare.com');
  origins.push('https://api.belvo.com');
  origins.push('https://sandbox.belvo.com');
  origins.push('https://widget.belvo.io');

  ['APP_URL', 'PUBLIC_API_URL', 'VITE_API_URL'].forEach(function(key) {
    var raw = (process.env[key] || '').trim();
    if (!raw) return;
    try {
      var origin = new URL(raw).origin;
      if (origins.indexOf(origin) === -1) origins.push(origin);
    } catch (_e) { /* ignore invalid URL */ }
  });

  return origins.join(' ');
}

function patchCspMeta(html) {
  var connect = buildCspConnectSrc();
  return html.replace(
    /connect-src[^;]+;/,
    'connect-src ' + connect + ';'
  );
}

module.exports = { buildCspConnectSrc, patchCspMeta };
