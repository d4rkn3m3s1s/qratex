/**
 * R2 nesnelerinin UYGULAMA ÜZERİNDEN sunulması (bucket'ın public erişimi kapatılabilsin diye).
 *
 * Eskiden her yükleme `R2_PUBLIC_URL/<key>` (r2.dev) biçiminde herkese açık, süresiz bir URL
 * olarak DB'ye yazılıyordu. Artık:
 *  - PUBLIC sınıf (site görselleri: `assets/`, `logos/`, `products/`) → `/api/files/public/<key>`
 *    (uzun önbellek + ETag, yalnız izinli önek ve görsel uzantıları).
 *  - PRIVATE sınıf (`tasks/`, `inbox/`, `feedback/`) → sahiplik/kapsam denetleyen proxy uçları.
 *
 * Geriye uyum: DB'de eski tam r2.dev URL'leri duruyor (migration yok). `storedKeyOf` her biçimi
 * (eski public URL, `/key`, çıplak key, iç public route URL'si) bucket key'ine çevirir;
 * `toServedUrl` bunu kullanıp istemciye verilecek iç URL'yi üretir.
 */

export const PUBLIC_FILE_ROUTE = '/api/files/public/';
export const PUBLIC_KEY_PREFIXES = ['assets/', 'logos/', 'products/'] as const;
export const PRIVATE_KEY_PREFIXES = ['tasks/', 'inbox/', 'feedback/'] as const;

const KNOWN_PREFIXES: readonly string[] = [...PUBLIC_KEY_PREFIXES, ...PRIVATE_KEY_PREFIXES];
const KEY_RE = /^[A-Za-z0-9][A-Za-z0-9._\-/]{0,511}$/;

/** Bucket key'i güvenli mi: göreli, `..`/boş segment yok, ters bölü/yüzde/kontrol karakteri yok. */
export function isSafeKey(key: unknown): key is string {
  if (typeof key !== 'string' || !KEY_RE.test(key)) return false;
  return key.split('/').every((seg) => seg.length > 0 && seg !== '.' && seg !== '..');
}

export function isPublicKey(key: string): boolean {
  return isSafeKey(key) && PUBLIC_KEY_PREFIXES.some((p) => key.startsWith(p));
}

export function isPrivateKey(key: string): boolean {
  return isSafeKey(key) && PRIVATE_KEY_PREFIXES.some((p) => key.startsWith(p));
}

/** Eski public taban (geri uyum ayrıştırması için; YENİ URL üretiminde kullanılmaz). */
export function legacyPublicBase(): string | null {
  const v = process.env.R2_PUBLIC_URL?.trim();
  return v ? v.replace(/\/+$/, '') : null;
}

function knownPrefix(key: string): boolean {
  return KNOWN_PREFIXES.some((p) => key.startsWith(p));
}

/**
 * Saklanan referanstan bucket key'i. Desteklenen biçimler:
 *  - eski public URL (`R2_PUBLIC_URL/<key>`)
 *  - iç public route (`/api/files/public/<key>`, segmentler URL-kodlu olabilir)
 *  - `/<key>` (R2_PUBLIC_URL yokken eski uploadToR2 dönüşü) — yalnız bilinen önekle
 *  - çıplak key (yeni yüklemeler) — yalnız bilinen önekle
 * Tanınmayan (harici URL, `/images/...` yerel yol, emoji) → null.
 */
export function storedKeyOf(ref: unknown): string | null {
  if (typeof ref !== 'string') return null;
  const s = ref.trim();
  if (!s) return null;
  let key: string | null = null;
  const base = legacyPublicBase();
  if (base && s.startsWith(`${base}/`)) {
    key = s.slice(base.length + 1).split(/[?#]/)[0];
  } else if (s.startsWith(PUBLIC_FILE_ROUTE)) {
    try {
      key = s
        .slice(PUBLIC_FILE_ROUTE.length)
        .split(/[?#]/)[0]
        .split('/')
        .map((seg) => decodeURIComponent(seg))
        .join('/');
    } catch {
      return null;
    }
  } else if (/^[a-z][a-z0-9+.-]*:/i.test(s) || s.startsWith('//')) {
    return null;
  } else if (s.startsWith('/')) {
    key = s.slice(1);
    if (!knownPrefix(key)) return null;
  } else {
    key = s;
    if (!knownPrefix(key)) return null;
  }
  return isSafeKey(key) ? key : null;
}

/** Public sınıf key'i için iç URL. */
export function publicFileUrl(key: string): string {
  return PUBLIC_FILE_ROUTE + key.split('/').map(encodeURIComponent).join('/');
}

export type ServedContext =
  | { kind: 'public' }
  | { kind: 'task'; taskId: string }
  | { kind: 'feedback'; feedbackId: string; index: number }
  | { kind: 'inbox'; messageId: string; index: number };

/**
 * Saklanan referansı (URL ya da key) istemciye verilecek iç URL'ye çevirir.
 *  - R2 dışı değerler (harici https, `/images/...` yerel dev yolu, data:) aynen döner.
 *  - Sınıf uyuşmazlığında (ör. public bağlamda `tasks/` key'i) null: özel dosya public uçtan sızmasın.
 */
export function toServedUrl(ref: string | null | undefined, ctx: ServedContext): string | null {
  if (typeof ref !== 'string' || !ref.trim()) return null;
  const key = storedKeyOf(ref);
  if (!key) {
    const base = legacyPublicBase();
    // Eski R2 URL'si ama ayrıştırılamadı (bozuk key) → bucket kapalıyken zaten açılmaz.
    if (base && ref.startsWith(`${base}/`)) return null;
    return ref;
  }
  const enc = encodeURIComponent;
  switch (ctx.kind) {
    case 'public':
      return isPublicKey(key) ? publicFileUrl(key) : null;
    case 'task':
      return key.startsWith('tasks/') ? `/api/admin/team/tasks/${enc(ctx.taskId)}/file?k=${enc(key)}` : null;
    case 'feedback':
      return key.startsWith('feedback/') ? `/api/files/feedback/${enc(ctx.feedbackId)}/${ctx.index}` : null;
    case 'inbox':
      return key.startsWith('inbox/') ? `/api/admin/inbox/${enc(ctx.messageId)}/attachments/${ctx.index}` : null;
  }
}

/**
 * Public alanlar (logo, ürün görseli, rozet/ödül ikonu…) için okuma dönüşümü: yalnız ESKİ
 * r2.dev URL'sini iç public route'a çevirir; diğer her değer (emoji, harici URL, zaten iç URL) aynen.
 * Prisma sonuç eklentisinde kullanılır (lib/prisma.ts).
 */
export function servePublicRef<T>(value: T): T {
  if (typeof value !== 'string') return value;
  const base = legacyPublicBase();
  if (!base || !value.startsWith(`${base}/`)) return value;
  const key = storedKeyOf(value);
  return (key && isPublicKey(key) ? publicFileUrl(key) : value) as T;
}

/** Feedback.media (Json) → istemciye verilecek URL listesi (index ham dizideki sıradır). */
export function servedFeedbackMedia(feedbackId: string, raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const out: string[] = [];
  raw.forEach((item, index) => {
    const ref = typeof item === 'string' ? item : item && typeof item === 'object' ? (item as { url?: unknown }).url : null;
    if (typeof ref !== 'string' || !ref) return;
    const key = storedKeyOf(ref);
    if (key) {
      if (key.startsWith('feedback/')) out.push(`/api/files/feedback/${encodeURIComponent(feedbackId)}/${index}`);
      return;
    }
    const base = legacyPublicBase();
    if (base && ref.startsWith(`${base}/`)) return;
    out.push(ref); // eski data:image / harici URL — R2 dışı, aynen
  });
  return out;
}

// ─────────────────────────── Sunum başlıkları ───────────────────────────

const PUBLIC_IMAGE_TYPES: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
  gif: 'image/gif',
  avif: 'image/avif',
  svg: 'image/svg+xml',
};

/** Public uçta sunulabilir görsel türü (uzantıdan; stored Content-Type'a güvenilmez). */
export function publicImageType(key: string): string | null {
  const ext = key.slice(key.lastIndexOf('.') + 1).toLowerCase();
  return PUBLIC_IMAGE_TYPES[ext] ?? null;
}

const INLINE_SAFE = new Set(['image/png', 'image/jpeg', 'image/gif', 'image/webp', 'image/avif', 'application/pdf', 'video/mp4', 'video/webm']);

/**
 * Güvenli Content-Type + Content-Disposition. Önizlenebilir (çalıştırılamaz) türler inline;
 * SVG/HTML/XHTML ve bilinmeyen her şey `attachment` (SVG türü korunur ki `<img>` içinde çalışsın).
 */
export function safeFileHeaders(contentType: string, filename: string): Record<string, string> {
  const ct = (contentType || '').toLowerCase().split(';')[0].trim();
  const safeName = (filename || 'dosya').replace(/[\r\n"\\/]/g, '_').slice(0, 150);
  const ascii = safeName.replace(/[^\x20-\x7e]/g, '_');
  const nameParams = `filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(safeName)}`;
  const base = {
    'X-Content-Type-Options': 'nosniff',
    'Content-Security-Policy': "default-src 'none'; img-src 'self' data:; media-src 'self'; style-src 'unsafe-inline'; sandbox",
  };
  if (INLINE_SAFE.has(ct)) return { ...base, 'Content-Type': ct, 'Content-Disposition': `inline; ${nameParams}` };
  if (ct === 'image/svg+xml') return { ...base, 'Content-Type': ct, 'Content-Disposition': `attachment; ${nameParams}` };
  return { ...base, 'Content-Type': 'application/octet-stream', 'Content-Disposition': `attachment; ${nameParams}` };
}
