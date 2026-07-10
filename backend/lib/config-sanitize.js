// backend/lib/config-sanitize.js — remove campos sensíveis locais do sync de config
const BLOCKED_KEYS = new Set([
  'pinHash',
  'pinSalt',
  'pinAlgoritmo',
  'pinTentativas',
  'pinBloqueadoAte',
  'pinAtivo',
  '_migracaoPinV2',
]);

export function sanitizeUserConfig(data) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return {};
  const out = {};
  for (const [key, value] of Object.entries(data)) {
    if (BLOCKED_KEYS.has(key)) continue;
    out[key] = value;
  }
  return out;
}
