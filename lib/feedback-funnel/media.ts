/**
 * Geri bildirim fotoğrafları (rapor Bulgu 2 / envanter #20-23).
 *
 * Eski akış: FileReader → base64 data URL → JSON gövdesi → `Feedback.media`. 5 MB'lık dosya
 * ~6,7 MB gövde yapıyordu (Vercel sınırı 4,5 MB → 413), Postgres'e megabaytlarca base64
 * yazılıyordu ve `z.string().url()` `data:,x` gibi boş içeriği de kabul ediyordu.
 *
 * Yeni akış: istemci fotoğrafı küçültür (PhotoPicker, EXIF/GPS silinir) → her foto ayrı
 * multipart istekle `POST /api/public/feedback/[code]/media` → sunucu biçimi baytlardan
 * doğrular, sharp ile yeniden kodlar (meta veri atılır), R2'ye yazar ve HTTPS URL döner.
 * Gönderim yalnız KENDİ R2 alanımızdaki `feedback/` önekli URL'leri kabul eder.
 */
import { randomBytes } from 'crypto';
import { isR2Configured } from '@/lib/r2-storage';

/** Sunucuya kabul edilen tek dosya üst sınırı (istemci ~1,5 MB'a küçültür). */
export const MAX_UPLOAD_BYTES = 4 * 1024 * 1024;
/** Yeniden kodlamada uzun kenar. */
export const MAX_DIMENSION = 1600;
export const MEDIA_KEY_PREFIX = 'feedback/';

const KEY_RE = /^feedback\/[A-Za-z0-9_-]{1,64}\/\d{4}-\d{2}\/[A-Za-z0-9_-]{16,64}\.jpg$/;

function publicBase(): string | null {
  const v = process.env.R2_PUBLIC_URL?.trim();
  if (!v) return null;
  try {
    const u = new URL(v);
    if (u.protocol !== 'https:' && u.protocol !== 'http:') return null;
    return v.replace(/\/$/, '');
  } catch {
    return null;
  }
}

/** Fotoğraf eklemek bu ortamda mümkün mü (R2 + herkese açık URL). Değilse UI bölümü gizler. */
export function feedbackPhotosEnabled(): boolean {
  return isR2Configured() && publicBase() !== null;
}

/** R2 nesne anahtarı: `feedback/<qrId>/<yyyy-mm>/<rastgele>.jpg` (yıl-ay İstanbul saatine göre). */
export function newMediaKey(qrCodeId: string, now: Date = new Date()): string {
  const safeQr = qrCodeId.replace(/[^A-Za-z0-9_-]/g, '').slice(0, 64) || 'qr';
  const ym = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Istanbul', year: 'numeric', month: '2-digit' })
    .format(now)
    .slice(0, 7);
  return `${MEDIA_KEY_PREFIX}${safeQr}/${ym}/${randomBytes(18).toString('base64url')}.jpg`;
}

/**
 * Gönderilen medya URL'lerini süzer: yalnız kendi R2 alanımızdaki, bu QR'a ait, beklenen
 * biçimdeki anahtarlar. Diğerleri sessizce atılır (data:, harici URL, başka QR'ın fotoğrafı).
 */
export function acceptedMediaUrls(urls: readonly string[] | null | undefined, qrCodeId: string): string[] {
  if (!Array.isArray(urls) || urls.length === 0) return [];
  const base = publicBase();
  if (!base) return [];
  const safeQr = qrCodeId.replace(/[^A-Za-z0-9_-]/g, '').slice(0, 64);
  const out: string[] = [];
  for (const raw of urls) {
    if (typeof raw !== 'string' || !raw.startsWith(`${base}/`)) continue;
    const key = raw.slice(base.length + 1);
    if (!KEY_RE.test(key)) continue;
    if (!key.startsWith(`${MEDIA_KEY_PREFIX}${safeQr}/`)) continue;
    if (!out.includes(raw)) out.push(raw);
  }
  return out;
}

export type ProcessedPhoto = { buffer: Buffer; width: number; height: number };

/**
 * Baytlardan biçim doğrular (JPEG/PNG/WebP/HEIF) ve JPEG'e yeniden kodlar. EXIF yönü
 * uygulanır, tüm meta veri (konum dahil) atılır. Geçersizse `null`.
 */
export async function processFeedbackPhoto(input: Buffer): Promise<ProcessedPhoto | null> {
  if (input.length === 0 || input.length > MAX_UPLOAD_BYTES) return null;
  const { default: sharp } = await import('sharp');
  let meta: { format?: string; width?: number; height?: number };
  try {
    meta = await sharp(input, { limitInputPixels: 50_000_000 }).metadata();
  } catch {
    return null;
  }
  if (!meta.format || !['jpeg', 'png', 'webp', 'heif'].includes(meta.format)) return null;
  try {
    const { data, info } = await sharp(input, { limitInputPixels: 50_000_000 })
      .rotate()
      .resize({ width: MAX_DIMENSION, height: MAX_DIMENSION, fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality: 80, mozjpeg: true })
      .toBuffer({ resolveWithObject: true });
    return { buffer: data, width: info.width, height: info.height };
  } catch {
    return null;
  }
}
