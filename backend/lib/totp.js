// backend/lib/totp.js — TOTP (Google Authenticator compatível)
import { authenticator } from 'otplib';
import QRCode from 'qrcode';

const ISSUER = 'FinançasPro';

authenticator.options = { window: 1 };

export function generateTotpSecret() {
  return authenticator.generateSecret();
}

export function buildOtpAuthUrl(email, secret) {
  return authenticator.keyuri(email, ISSUER, secret);
}

export async function qrDataUrl(otpauthUrl) {
  return QRCode.toDataURL(otpauthUrl, { margin: 1, width: 220 });
}

export function verifyTotpCode(secret, token) {
  if (!secret || !token) return false;
  const code = String(token).replace(/\s/g, '');
  if (!/^\d{6}$/.test(code)) return false;
  return authenticator.verify({ token: code, secret });
}
