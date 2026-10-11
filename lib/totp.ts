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

// ─── Saklama şifrelemesi (veri modeli B14) ──────────────────────────────────────
// `User.twoFactorSecret` düz metin saklanıyordu: bir DB dökümü/yedeği sızarsa saldırgan her
// hesabın 2FA kodunu üretebilirdi. Artık kurulumda AES-256-GCM ile mühürlenir (`enc:totp:v1:`).
// Anahtar: TOTP_SECRET_KEY, yoksa NEXTAUTH_SECRET/AUTH_SECRET'tan türetilir (webhook sırrıyla aynı
// desen). Hiçbiri yoksa (yerel geliştirme) düz saklanır. Eski düz metin kayıtlar aynen okunur;
// çözülemeyen kayıt doğrulamayı GEÇEMEZ (fail-closed; kullanıcı kurtarma koduyla girer).
const SEAL_PREFIX = 'enc:totp:v1:';

function sealKey(): Buffer | null {
  const base = process.env.TOTP_SECRET_KEY || process.env.NEXTAUTH_SECRET || process.env.AUTH_SECRET;
  if (!base) return null;
  return crypto.createHash('sha256').update(`totp-secret:v1:${base}`).digest();
}

/** Kurulumda DB'ye yazılacak değer (anahtar yoksa düz). */
export function sealTotpSecret(plain: string): string {
  const key = sealKey();
  if (!key) return plain;
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv('aes-256-gcm', key, iv);
  const ct = Buffer.concat([c.update(plain, 'utf8'), c.final()]);
  return SEAL_PREFIX + Buffer.concat([iv, c.getAuthTag(), ct]).toString('base64url');
}

/** DB değerinden düz sırrı çözer; eski düz kayıt aynen döner, çözülemeyen → null. */
export function openTotpSecret(stored: string | null | undefined): string | null {
  if (!stored) return null;
  if (!stored.startsWith(SEAL_PREFIX)) return stored;
  const key = sealKey();
  if (!key) return null;
  try {
    const raw = Buffer.from(stored.slice(SEAL_PREFIX.length), 'base64url');
    const d = crypto.createDecipheriv('aes-256-gcm', key, raw.subarray(0, 12));
    d.setAuthTag(raw.subarray(12, 28));
    return Buffer.concat([d.update(raw.subarray(28)), d.final()]).toString('utf8');
  } catch {
    return null;
  }
}

/** RFC 4648 Base32 çözümü (büyük/küçük harf, boşluk ve '=' dolgusu tolere edilir). */
export function base32Decode(input: string): Buffer {
  const clean = input.toUpperCase().replace(/[\s=]/g, '');
  let bits = 0;
  let value = 0;
  const out: number[] = [];
  for (const ch of clean) {
    const idx = BASE32_CHARS.indexOf(ch);
    if (idx === -1) continue;
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

function hotp(secret: string, counter: number): string {
  const buf = Buffer.alloc(8);
  buf.writeUInt32BE(0, 0);
  buf.writeUInt32BE(counter, 4);
  // RFC 6238/4226: anahtar Base32 ÇÖZÜLMÜŞ baytlardır. Yetkilendirici uygulamalar otpauth
  // URI'deki secret'ı Base32 çözer; ASCII baytlarıyla HMAC almak kodları hiç eşleştirmiyordu.
  const hmac = crypto.createHmac('sha1', base32Decode(secret));
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
  return verifyTOTPStep(secret, token) !== null;
}

/**
 * `verifyTOTP` ile aynı kural; eşleşen 30 sn'lik ZAMAN ADIMINI döndürür (yoksa null).
 * Tek kullanımlık doğrulama (aynı kodun pencere içinde ikinci kez kabul edilmemesi) için
 * çağıran bu adımı "kullanıldı" diye işaretler — bkz. lib/two-factor `verifyTwoFactorForLogin`.
 */
export function verifyTOTPStep(storedSecret: string, token: string): number | null {
  // Çağıranlar DB değerini olduğu gibi geçirir (mühürlü ya da eski düz metin).
  const secret = openTotpSecret(storedSecret);
  if (!secret || !token || !/^\d{6}$/.test(token)) return null;
  const base = Math.floor(Date.now() / 1000 / 30);
  let matched: number | null = null;
  for (let i = -1; i <= 1; i++) {
    const candidate = hotp(secret, base + i);
    // timingSafeEqual: aynı uzunlukta (her ikisi de 6 hane) → güvenli. Döngü erken bitmez.
    if (crypto.timingSafeEqual(Buffer.from(candidate), Buffer.from(token)) && matched === null) matched = base + i;
  }
  return matched;
}

/** otpauth:// URI — yetkilendirici uygulamada QR olarak okutulur. */
export function buildOtpauthUri(email: string, secret: string, issuer = 'QRATEX'): string {
  return `otpauth://totp/${issuer}:${encodeURIComponent(email)}?secret=${secret}&issuer=${issuer}&digits=6&period=30`;
}
