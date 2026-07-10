// backend/lib/field-crypto.js — criptografia opcional para segredos em repouso (TOTP)
import { createCipheriv, createDecipheriv, randomBytes, createHash } from 'crypto';
import CONFIG from '../config.js';

const ALGO = 'aes-256-gcm';

function deriveKey(secret) {
  return createHash('sha256').update(String(secret)).digest();
}

export function encryptField(plain) {
  if (!plain) return plain;
  const secret = CONFIG.crypto?.totpEncryptionKey;
  if (!secret) {
    // Fail-closed em produção: nunca gravar um segredo sensível em texto claro.
    if (CONFIG.isProd) {
      throw new Error('TOTP_ENCRYPTION_KEY ausente — criptografia de campo obrigatória em produção');
    }
    return plain;
  }

  const key = deriveKey(secret);
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGO, key, iv);
  const enc = Buffer.concat([cipher.update(String(plain), 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `enc:${iv.toString('hex')}:${tag.toString('hex')}:${enc.toString('hex')}`;
}

export function decryptField(value) {
  if (!value || typeof value !== 'string') return value;
  if (!value.startsWith('enc:')) return value;

  const secret = CONFIG.crypto?.totpEncryptionKey;
  if (!secret) return value;

  const parts = value.split(':');
  if (parts.length !== 4) return value;

  const iv = Buffer.from(parts[1], 'hex');
  const tag = Buffer.from(parts[2], 'hex');
  const data = Buffer.from(parts[3], 'hex');
  const key = deriveKey(secret);
  const decipher = createDecipheriv(ALGO, key, iv);
  decipher.setAuthTag(tag);
  const dec = Buffer.concat([decipher.update(data), decipher.final()]);
  return dec.toString('utf8');
}
