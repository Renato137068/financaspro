/**
 * csp-connect-src.cjs — Origens permitidas em connect-src (CSP)
 * Usa APP_URL / PUBLIC_API_URL / SUPABASE_URL do ambiente no build.
 */
const fs = require('fs');
const path = require('path');

function supabaseOriginsFromConfig() {
  var origins = [];
  try {
    var cfgPath = path.join(__dirname, '..', 'js', 'core', 'config.js');
    var src = fs.readFileSync(cfgPath, 'utf8');
    var urlStr = '';
    var envM = src.match(/var _FP_ENV_URL\s*=\s*['"]([^'"]*)['"]/);
    if (envM && envM[1]) urlStr = envM[1];
    if (!urlStr) {
      var cloudM = src.match(/_FP_CLOUD_URL\s*=\s*[^\n]*['"](https?:\/\/[^'"]+)['"]/);
      if (cloudM) urlStr = cloudM[1];
    }
    if (!urlStr) return origins;
    var url = new URL(urlStr.trim());
    origins.push(url.origin);
    if (url.protocol === 'https:') {
      origins.push('wss://' + url.host);
    }
  } catch (_e) { /* config ausente ou URL inválida */ }
  return origins;
}

function isProdCsp(opts) {
  opts = opts || {};
  if (opts.prod === true) return true;
  if (String(process.env.FP_CSP_PROD || '') === '1') return true;
  return String(process.env.NODE_ENV || '').toLowerCase() === 'production';
}

function buildCspConnectSrc(opts) {
  var isProd = isProdCsp(opts);

  var origins = ["'self'"];
  if (!isProd) {
    origins.push('http://localhost:4000');
    origins.push('http://127.0.0.1:4000');
  }
  // jsdelivr: tesseract.js carregado sob demanda pelo OCR (js/ocr.js).
  origins.push('https://cdn.jsdelivr.net');
  origins.push('https://api.belvo.com');
  origins.push('https://sandbox.belvo.com');
  origins.push('https://widget.belvo.io');

  supabaseOriginsFromConfig().forEach(function(origin) {
    if (origins.indexOf(origin) === -1) origins.push(origin);
  });

  ['APP_URL', 'PUBLIC_API_URL', 'VITE_API_URL', 'SUPABASE_URL'].forEach(function(key) {
    var raw = (process.env[key] || '').trim();
    if (!raw) return;
    try {
      var origin = new URL(raw).origin;
      if (origins.indexOf(origin) === -1) origins.push(origin);
      if (origin.indexOf('https://') === 0) {
        var ws = 'wss://' + new URL(raw).host;
        if (origins.indexOf(ws) === -1) origins.push(ws);
      }
    } catch (_e) { /* ignore invalid URL */ }
  });

  return origins.join(' ');
}

function patchCspMeta(html, opts) {
  var connect = buildCspConnectSrc(opts);
  return html.replace(
    /connect-src[^;]+;/,
    'connect-src ' + connect + ';'
  );
}

module.exports = { buildCspConnectSrc, patchCspMeta, isProdCsp };
