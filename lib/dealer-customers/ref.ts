/**
 * Müşteri referansı (`?id=` derin linki, satır anahtarı) — ham kullanıcı kimliği istemciye
 * HİÇ gitmez (P0-11: başka uçlarda kimlikle IDOR denemesi) ama sunucu geri çözebilir.
 *
 * AES-256-GCM, işletme kimliği AAD olarak bağlı: A işletmesinin ürettiği referans B
 * işletmesinin oturumunda çözülemez (çapraz kiracı derin link → 404). IV, (bayi, müşteri)
 * çiftinden HMAC ile deterministik türetilir: aynı müşteri her listede aynı referansı alır
 * (React anahtarı, paylaşılabilir link) — bu yalnız eşitliği açığa çıkarır, kimliği değil.
 */
import { createCipheriv, createDecipheriv, createHash, createHmac } from 'crypto';

const PREFIX = 'c_';
const IV_LEN = 12;
const TAG_LEN = 16;
const MAX_REF_LEN = 200;

let cachedKey: { secret: string; key: Buffer } | null = null;

function secretValue(): string {
  return process.env.NEXTAUTH_SECRET || process.env.AUTH_SECRET || 'qratex-dealer-customer-ref-dev';
}

function key(): Buffer {
  const secret = secretValue();
  if (!cachedKey || cachedKey.secret !== secret) {
    cachedKey = { secret, key: createHash('sha256').update(`dealer-customer-ref:v1:${secret}`).digest() };
  }
  return cachedKey.key;
}

function b64url(buf: Buffer): string {
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromB64url(s: string): Buffer | null {
  if (!/^[A-Za-z0-9_-]+$/.test(s)) return null;
  const pad = s.length % 4 === 0 ? '' : '='.repeat(4 - (s.length % 4));
  try {
    return Buffer.from(s.replace(/-/g, '+').replace(/_/g, '/') + pad, 'base64');
  } catch {
    return null;
  }
}

export function encodeCustomerRef(dealerId: string, customerId: string): string {
  const k = key();
  const iv = createHmac('sha256', k).update(`${dealerId}:${customerId}`).digest().subarray(0, IV_LEN);
  const cipher = createCipheriv('aes-256-gcm', k, iv);
  cipher.setAAD(Buffer.from(dealerId, 'utf8'));
  const ct = Buffer.concat([cipher.update(customerId, 'utf8'), cipher.final()]);
  return PREFIX + b64url(Buffer.concat([iv, cipher.getAuthTag(), ct]));
}

/** Geçersiz, kurcalanmış ya da başka işletmeye ait referansta `null`. */
export function decodeCustomerRef(dealerId: string, ref: unknown): string | null {
  if (typeof ref !== 'string' || !ref.startsWith(PREFIX) || ref.length > MAX_REF_LEN) return null;
  const raw = fromB64url(ref.slice(PREFIX.length));
  if (!raw || raw.length <= IV_LEN + TAG_LEN) return null;
  try {
    const decipher = createDecipheriv('aes-256-gcm', key(), raw.subarray(0, IV_LEN));
    decipher.setAAD(Buffer.from(dealerId, 'utf8'));
    decipher.setAuthTag(raw.subarray(IV_LEN, IV_LEN + TAG_LEN));
    const id = Buffer.concat([decipher.update(raw.subarray(IV_LEN + TAG_LEN)), decipher.final()]).toString('utf8');
    return /^[A-Za-z0-9_-]{1,191}$/.test(id) ? id : null;
  } catch {
    return null;
  }
}
