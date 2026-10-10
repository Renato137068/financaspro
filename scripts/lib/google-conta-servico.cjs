/**
 * google-conta-servico.cjs — chave da conta de serviço da Play e token OAuth.
 *
 * Usado por play-ficha.cjs (ficha da loja) e vitals-relatorio.cjs (Android
 * vitals). A chave vem de PLAY_SERVICE_ACCOUNT_JSON e nunca é impressa.
 */
const { createSign } = require('crypto');

function contaDeServico() {
  let s = process.env.PLAY_SERVICE_ACCOUNT_JSON || '';
  if (!s.trim()) throw new Error('PLAY_SERVICE_ACCOUNT_JSON ausente');
  if (s.charCodeAt(0) === 0xfeff) s = s.slice(1);
  let j = JSON.parse(s.trim());
  if (typeof j === 'string') j = JSON.parse(j);
  if (typeof j.private_key === 'string' && j.private_key.includes('\\n')) j.private_key = j.private_key.replace(/\\n/g, '\n');
  return j;
}

const b64url = (b) => Buffer.from(b).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

async function token(sa, escopo) {
  const agora = Math.floor(Date.now() / 1000);
  const aud = sa.token_uri || 'https://oauth2.googleapis.com/token';
  const corpo = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' })) + '.' + b64url(JSON.stringify({
    iss: sa.client_email, scope: escopo, aud, iat: agora, exp: agora + 3600,
  }));
  const jwt = corpo + '.' + b64url(createSign('RSA-SHA256').update(corpo).sign(sa.private_key));
  const res = await fetch(aud, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: jwt }),
  });
  const j = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error('OAuth ' + res.status + ': ' + (j.error_description || j.error || ''));
  return j.access_token;
}

module.exports = { contaDeServico, token };
