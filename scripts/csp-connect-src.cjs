/**
 * csp-connect-src.cjs — Origens permitidas em connect-src (CSP)
 * O app só fala com a própria origem e com o Supabase (ADR 0007: a API
 * Express e o Open Finance saíram). Usa APP_URL / SUPABASE_URL do ambiente no
 * build, além da URL do Supabase gravada em js/core/config.js.
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

function buildCspConnectSrc() {
  var origins = ["'self'"];

  supabaseOriginsFromConfig().forEach(function(origin) {
    if (origins.indexOf(origin) === -1) origins.push(origin);
  });

  ['APP_URL', 'SUPABASE_URL'].forEach(function(key) {
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

function patchCspMeta(html) {
  var connect = buildCspConnectSrc();
  return html.replace(
    /connect-src[^;]+;/,
    'connect-src ' + connect + ';'
  );
}

module.exports = { buildCspConnectSrc, patchCspMeta };
