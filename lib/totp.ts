/**
 * RFC 6238 TOTP — yetkilendirici uygulama (Google Authenticator vb.) için.
 * Hem 2FA kurulum route'u hem login akışı (lib/auth) bu tek kaynağı kullanır.
 * Manuel HMAC-SHA1; harici bağımlılık yok.
 */
import crypto from 'crypto';

const BASE32_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

/** Yeni Base32 secret üretir (varsayılan 20 bayt = 160 bit). */
export function generateBase32Secret(length = 20): string {
  const bytes = crypto.randomBytes(length);
  return Array.from(bytes)
    .map((b) => BASE32_CHARS[b % 32])
    .join('');
}

function hotp(secret: string, counter: number): string {
  const buf = Buffer.alloc(8);
  buf.writeUInt32BE(0, 0);
  buf.writeUInt32BE(counter, 4);
  const hmac = crypto.createHmac('sha1', Buffer.from(secret, 'ascii'));
  hmac.update(buf);
  const hash = hmac.digest();
  const offset = hash[hash.length - 1] & 0x0f;
  const code =
    (((hash[offset] & 0x7f) << 24) | (hash[offset + 1] << 16) | (hash[offset + 2] << 8) | hash[offset + 3]) % 1000000;
  return code.toString().padStart(6, '0');
}

/** Verilen secret için şu anki TOTP kodunu üretir. */
export function generateTOTP(secret: string): string {
  const time = Math.floor(Date.now() / 1000 / 30);
  return hotp(secret, time);
}

/**
 * Kodu doğrular. Saat kaymasına tolerans için ±1 zaman penceresi (±30sn) denenir.
 * Sabit-zaman karşılaştırma (timing attack önlemi).
 */
export function verifyTOTP(secret: string, token: string): boolean {
  if (!secret || !token || !/^\d{6}$/.test(token)) return false;
  const base = Math.floor(Date.now() / 1000 / 30);
  for (let i = -1; i <= 1; i++) {
    const candidate = hotp(secret, base + i);
    // timingSafeEqual: aynı uzunlukta (her ikisi de 6 hane) → güvenli.
    if (crypto.timingSafeEqual(Buffer.from(candidate), Buffer.from(token))) return true;
  }
  return false;
}

/** otpauth:// URI — yetkilendirici uygulamada QR olarak okutulur. */
export function buildOtpauthUri(email: string, secret: string, issuer = 'QRATEX'): string {
  return `otpauth://totp/${issuer}:${encodeURIComponent(email)}?secret=${secret}&issuer=${issuer}&digits=6&period=30`;
}
