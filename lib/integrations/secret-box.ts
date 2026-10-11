/**
 * Webhook imza sırrı: sunucuda üretilir, bir kez gösterilir, DB'de AES-256-GCM ile şifreli
 * saklanır (`enc:v1:` öneki). Dispatcher imzalamak için çözer — hash'lenemez çünkü giden
 * gövdeyi imzalamak için düz değer gerekir. Eski düz metin kayıtlar aynen okunur (geriye uyum).
 *
 * Anahtar: WEBHOOK_SECRET_KEY, yoksa NEXTAUTH_SECRET/AUTH_SECRET'tan türetilir. Anahtar
 * değişirse çözme başarısız olur → teslim İMZASIZ GİTMEZ, "imza sırrı çözülemedi" hatasıyla
 * başarısız sayılır ve operatör sırrı döndürür.
 */
import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'crypto';

const PREFIX = 'enc:v1:';

function key(): Buffer {
  const base = process.env.WEBHOOK_SECRET_KEY || process.env.NEXTAUTH_SECRET || process.env.AUTH_SECRET || 'qratex-webhook-secret-dev';
  return createHash('sha256').update(`webhook-secret:v1:${base}`).digest();
}

export function generateWebhookSecret(): string {
  return `whsec_${randomBytes(32).toString('base64url')}`;
}

export function sealSecret(plain: string): string {
  const iv = randomBytes(12);
  const c = createCipheriv('aes-256-gcm', key(), iv);
  const ct = Buffer.concat([c.update(plain, 'utf8'), c.final()]);
  return PREFIX + Buffer.concat([iv, c.getAuthTag(), ct]).toString('base64url');
}

/** null → sır yok; `{ error }` → şifreli ama çözülemedi. */
export function openSecret(stored: string | null | undefined): string | null | { error: string } {
  if (!stored) return null;
  if (!stored.startsWith(PREFIX)) return stored; // eski düz metin
  try {
    const raw = Buffer.from(stored.slice(PREFIX.length), 'base64url');
    const d = createDecipheriv('aes-256-gcm', key(), raw.subarray(0, 12));
    d.setAuthTag(raw.subarray(12, 28));
    return Buffer.concat([d.update(raw.subarray(28)), d.final()]).toString('utf8');
  } catch {
    return { error: 'İmza sırrı çözülemedi; sırrı döndürün.' };
  }
}

export const secretHintOf = (plain: string) => plain.slice(-4);
