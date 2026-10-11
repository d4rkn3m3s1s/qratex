/**
 * Gelen mail HTML'ini panelde GÜVENLE göstermek + yanıt başlıklarını doğru kurmak için saf
 * yardımcılar (DB/ağ yok → birim test edilebilir).
 *
 * Güvenlik modeli (denetim Bulgu 1 + 13):
 *  - Gövde `srcDoc` + `<meta>` CSP ile DEĞİL, ayrı bir uçtan (`/api/admin/inbox/[id]/body`)
 *    HTTP `Content-Security-Policy` BAŞLIĞIYLA sunulur. Başlık, işaretleme ile (ör. `<header>`
 *    regex kazası, `<head>`'den önce script) atlatılamaz.
 *  - `script-src` yalnız bizim yükseklik betiğimizin SHA-256 özetine izin verir; göndericinin
 *    inline betikleri ve `on*` öznitelikleri çalışmaz ('unsafe-inline' YOK). Böylece betikle
 *    çerçeve içi gezinme (location=...) de yoktur.
 *  - `<meta http-equiv>`, `<base>`, `<script>`, `<iframe|object|embed|form>` sunucuda ayıklanır
 *    (derinlemesine savunma; asıl koruma başlıktaki CSP + sandbox).
 *  - Linkler `<base target="_blank">` ile yeni sekmede açılır (sandbox `allow-popups-to-escape-sandbox`).
 *  - Uzak görseller VARSAYILAN KAPALI (`img-src data: cid:`); kullanıcı "göster" derse `https:` açılır.
 */
import { createHash } from 'crypto';

/** Çerçeve içi yükseklik bildirimi — tek izinli betik (özeti CSP'ye yazılır). */
export const FRAME_HEIGHT_SCRIPT =
  "(function(){function s(){try{var h=Math.max(document.documentElement.scrollHeight,document.body?document.body.scrollHeight:0);parent.postMessage({qxMailFrame:1,h:h},'*')}catch(e){}}window.addEventListener('load',s);if(window.ResizeObserver){new ResizeObserver(s).observe(document.documentElement)}setTimeout(s,60);setTimeout(s,600)})();";

export const FRAME_HEIGHT_SCRIPT_HASH = `sha256-${createHash('sha256').update(FRAME_HEIGHT_SCRIPT, 'utf8').digest('base64')}`;

/** Gövde uçunun HTTP CSP başlığı. */
export function mailFrameCsp(allowRemoteImages: boolean): string {
  return [
    "default-src 'none'",
    `img-src data: cid:${allowRemoteImages ? ' https:' : ''}`,
    "style-src 'unsafe-inline'",
    'font-src data:',
    `script-src '${FRAME_HEIGHT_SCRIPT_HASH}'`,
    "form-action 'none'",
    "frame-ancestors 'self'",
    "base-uri 'none'",
    // Doğrudan açılsa bile belge kum havuzunda kalsın.
    'sandbox allow-scripts allow-popups allow-popups-to-escape-sandbox',
  ].join('; ');
}

const STRIP_BLOCKS = /<(script|iframe|object|embed|form|frame|frameset|applet|noscript|template)\b[\s\S]*?<\/\1\s*>/gi;
const STRIP_SINGLE = /<\/?(script|iframe|object|embed|form|frame|frameset|applet|base|meta|link)\b[^>]*>/gi;
const EVENT_ATTR = /\s+on[a-z]+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi;
const JS_URL_ATTR = /\s+(href|src|action|formaction|xlink:href)\s*=\s*("\s*(?:javascript|vbscript|data:text\/html)[^"]*"|'\s*(?:javascript|vbscript|data:text\/html)[^']*'|(?:javascript|vbscript):[^\s>]*)/gi;

/** Gönderici HTML'inden çalıştırılabilir/gezinme yapan parçaları ayıklar (derinlemesine savunma). */
export function scrubMailHtml(html: string): string {
  return html
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(STRIP_BLOCKS, '')
    .replace(STRIP_SINGLE, '')
    .replace(EVENT_ATTR, '')
    .replace(JS_URL_ATTR, ' $1="#"');
}

/** Gövdede uzak görsel/arka plan var mı (bant göstermek için). */
export function hasRemoteImages(html: string | null | undefined): boolean {
  if (!html) return false;
  return /<img\b[^>]*\bsrc\s*=\s*["']?\s*(https?:)?\/\//i.test(html) || /url\(\s*["']?\s*https?:/i.test(html) || /\bbackground\s*=\s*["']?\s*https?:/i.test(html);
}

function escapeText(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/**
 * Çerçevede gösterilecek tam belge. Kendi `<head>`'imiz önce gelir; gönderici belgesindeki
 * `<html>/<head>/<body>` etiketleri ayrıştırıcı tarafından birleştirilir, `<base>`'imiz ilk sırada kalır.
 */
export function buildMailFrameDocument(input: { html: string | null; text: string | null }): string {
  const head =
    '<!DOCTYPE html><html lang="tr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">' +
    '<base target="_blank">' +
    '<style>html,body{margin:0;padding:0;background:#fff;color:#111827;font:14px/1.6 -apple-system,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;word-wrap:break-word;overflow-wrap:anywhere}' +
    'body{padding:16px}img{max-width:100%;height:auto}table{max-width:100%}pre{white-space:pre-wrap}a{color:#6d28d9}</style>' +
    `<script>${FRAME_HEIGHT_SCRIPT}</script></head><body>`;
  const content = input.html ? scrubMailHtml(input.html) : `<pre>${escapeText(input.text ?? '')}</pre>`;
  return `${head}${content}</body></html>`;
}

// ─────────────────────────── Yanıt başlıkları (RFC 5322) ───────────────────────────

/**
 * Yanıtın `References` başlığı: ebeveynin References'ı + ebeveynin Message-ID'si. 998 karakter
 * satır sınırını aşarsa KÖK (ilk id) korunur, ortadaki en eski halkalar düşürülür.
 */
export function buildReferences(parentReferences: string | null | undefined, parentMessageId: string | null | undefined): string | null {
  const ids = [...(parentReferences ?? '').trim().split(/\s+/), (parentMessageId ?? '').trim()].filter(Boolean);
  const unique: string[] = [];
  for (const id of ids) if (!unique.includes(id)) unique.push(id);
  if (unique.length === 0) return null;
  const MAX = 998 - 'References: '.length;
  while (unique.join(' ').length > MAX && unique.length > 2) unique.splice(1, 1);
  return unique.join(' ');
}

/** Konuşma kökü: References'ın ilki > In-Reply-To > kendi Message-ID'si (senkronla aynı kural). */
export function threadRootOf(references: string | null | undefined, inReplyTo: string | null | undefined, messageId: string | null | undefined): string | null {
  const first = (references ?? '').trim().split(/\s+/).filter(Boolean)[0];
  return first || (inReplyTo ?? '').trim() || (messageId ?? '').trim() || null;
}

/** Yanıta eklenecek alıntı (düz metin, "> " önekli). */
export function quoteOriginal(input: { fromName: string | null; fromEmail: string; sentAt: Date; text: string | null }): string {
  const when = new Intl.DateTimeFormat('tr-TR', { timeZone: 'Europe/Istanbul', dateStyle: 'long', timeStyle: 'short' }).format(input.sentAt);
  const who = input.fromName ? `${input.fromName} <${input.fromEmail}>` : input.fromEmail;
  const body = (input.text ?? '').trim().split('\n').slice(0, 80).map((l) => `> ${l}`).join('\n');
  return `${when} tarihinde ${who} şunu yazdı:\n${body}`;
}

/** Kişisel yanıt HTML'i — pazarlama şablonu DEĞİL, sade yazışma görünümü. */
export function renderPersonalReplyHtml(message: string, quoted: string | null): string {
  const para = (s: string) =>
    s
      .split(/\n{2,}/)
      .map((p) => `<p style="margin:0 0 12px;">${escapeText(p).replace(/\n/g, '<br>')}</p>`)
      .join('');
  const quote = quoted
    ? `<blockquote style="margin:16px 0 0;padding:0 0 0 12px;border-left:3px solid #d1d5db;color:#6b7280;">${escapeText(quoted).replace(/\n/g, '<br>')}</blockquote>`
    : '';
  return `<!DOCTYPE html><html lang="tr"><head><meta charset="utf-8"></head><body style="margin:0;padding:16px;font:15px/1.6 -apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#111827;">${para(message)}${quote}</body></html>`;
}

// ─────────────────────────── Ek sunumu ───────────────────────────

const INLINE_SAFE = new Set(['image/png', 'image/jpeg', 'image/jpg', 'image/gif', 'image/webp', 'application/pdf', 'video/mp4', 'video/webm', 'text/plain']);

/** Tarayıcıda ÖNİZLENEBİLİR (çalıştırılamaz) tür mü. SVG/HTML/XHTML her zaman indirme. */
export function attachmentDisposition(contentType: string, filename: string): { contentType: string; disposition: string } {
  const ct = (contentType || '').toLowerCase().split(';')[0].trim();
  const safeName = (filename || 'ek').replace(/[\r\n"\\]/g, '_').slice(0, 150);
  const ascii = safeName.replace(/[^\x20-\x7e]/g, '_');
  const encoded = encodeURIComponent(safeName);
  const nameParams = `filename="${ascii}"; filename*=UTF-8''${encoded}`;
  if (INLINE_SAFE.has(ct)) return { contentType: ct === 'text/plain' ? 'text/plain; charset=utf-8' : ct, disposition: `inline; ${nameParams}` };
  return { contentType: 'application/octet-stream', disposition: `attachment; ${nameParams}` };
}

/** Senkronda R2'ye yazarken kullanılacak disposition (aynı izin listesi). */
export function uploadDisposition(contentType: string, filename: string): string {
  return attachmentDisposition(contentType, filename).disposition;
}
