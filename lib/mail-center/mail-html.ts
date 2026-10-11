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
 *  - Gövde sunucuda AYRIŞTIRICI TABANLI ALLOWLIST ile sıfırdan yeniden üretilir (`scrubMailHtml`;
 *    derinlemesine savunma, asıl koruma başlıktaki CSP + sandbox).
 *  - Linkler `target="_blank"` + `rel="noopener noreferrer"` ile yeni sekmede açılır.
 *  - Uzak görseller VARSAYILAN KAPALI (`img-src data: cid:`); kullanıcı "göster" derse `https:` açılır.
 */
import { createHash } from 'crypto';
import { Parser } from 'htmlparser2';

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

// ─────────────────────────── Ayrıştırıcı tabanlı allowlist temizleyici ───────────────────────────
//
// Girdi htmlparser2 ile tokenize edilir ve çıktı SIFIRDAN yeniden üretilir: girdi metni asla
// doğrudan geçmez; metin ve öznitelik değerleri (ayrıştırıcının entity çözdüğü hâlleriyle) her
// zaman kaçışlanarak yazılır. Yalnız izinli etiket/öznitelik/CSS bildirimi çıktıya girer; bu
// yüzden iç içe/bozuk yazım, büyük-küçük harf, tırnaksız öznitelik ya da entity ile gizleme
// tehlikeli bir yapıyı "geri kuramaz". Yorumlar, CDATA ve işlem talimatları tamamen atılır.

const ALLOWED_TAGS = new Set([
  'a', 'abbr', 'b', 'blockquote', 'br', 'caption', 'center', 'code', 'col', 'colgroup', 'dd', 'div', 'dl', 'dt', 'em', 'font',
  'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'hr', 'i', 'img', 'li', 'ol', 'p', 'pre', 's', 'small', 'span', 'strong', 'sub', 'sup',
  'table', 'tbody', 'td', 'tfoot', 'th', 'thead', 'tr', 'u', 'ul',
]);
const VOID_TAGS = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'param', 'source', 'track', 'wbr', 'keygen']);
/** İçeriği (metni dahil) TAMAMEN atılan etiketler. */
const DROP_CONTENT_TAGS = new Set([
  'script', 'style', 'iframe', 'object', 'embed', 'svg', 'math', 'template', 'noscript', 'title', 'textarea', 'select',
  'head', 'applet', 'frameset', 'frame', 'noembed', 'noframes', 'xmp', 'plaintext', 'option', 'button', 'portal',
]);

type AttrRule = (value: string) => string | null;

const NUM_OR_PCT = /^\d{1,4}(?:\.\d+)?(?:%|px)?$/i;
const COLOR = /^#?[a-z0-9]{1,20}$/i;
const ALIGN = /^(left|right|center|justify)$/i;
const VALIGN = /^(top|middle|bottom|baseline)$/i;

const re =
  (r: RegExp): AttrRule =>
  (v) =>
    r.test(v.trim()) ? v.trim() : null;
const plain: AttrRule = (v) => v.slice(0, 500);

/** Kontrol karakterleri + boşluklar (tarayıcıların şema ayrıştırırken yok saydıkları dahil). */
// eslint-disable-next-line no-control-regex
const URL_NOISE = /[\u0000-\u0020\u007f-\u00a0\u1680\u180e\u2000-\u200f\u2028\u2029\u202f\u205f\u3000\ufeff]/g;

/** href: yalnız http/https/mailto (protokol-göreli, göreli ve diğer her şey atılır). Çözülmüş değer üzerinde. */
function sanitizeHref(value: string): string | null {
  const v = value.replace(URL_NOISE, '');
  return /^(?:https?:\/\/[^/\\]|mailto:)/i.test(v) ? v : null;
}

/** img src: uzak görsel politikası CSP'de (`img-src data: cid:` + istenirse `https:`); burada yalnız güvenli şemalar. */
function sanitizeImgSrc(value: string): string | null {
  const v = value.replace(URL_NOISE, '');
  if (/^cid:[^\s"'<>]+$/i.test(v)) return v;
  if (/^https:\/\/[^/\\]/i.test(v)) return v;
  if (/^data:image\/(?:png|jpe?g|gif|webp);base64,[a-z0-9+/=]+$/i.test(v)) return v;
  return null;
}

const CSS_PROPS = new Set([
  'color', 'background-color', 'background', 'font', 'font-family', 'font-size', 'font-style', 'font-weight', 'font-variant',
  'text-align', 'text-decoration', 'text-transform', 'text-indent', 'letter-spacing', 'word-spacing', 'line-height',
  'white-space', 'word-break', 'word-wrap', 'overflow-wrap', 'vertical-align', 'direction', 'display',
  'margin', 'margin-top', 'margin-right', 'margin-bottom', 'margin-left',
  'padding', 'padding-top', 'padding-right', 'padding-bottom', 'padding-left',
  'border', 'border-top', 'border-right', 'border-bottom', 'border-left', 'border-color', 'border-style', 'border-width',
  'border-radius', 'border-collapse', 'border-spacing',
  'border-top-color', 'border-right-color', 'border-bottom-color', 'border-left-color',
  'border-top-style', 'border-right-style', 'border-bottom-style', 'border-left-style',
  'border-top-width', 'border-right-width', 'border-bottom-width', 'border-left-width',
  'width', 'height', 'max-width', 'min-width', 'max-height', 'min-height', 'list-style-type', 'table-layout',
]);
const CSS_FUNCS = new Set(['rgb', 'rgba', 'hsl', 'hsla']);

/** style: yalnız izinli özellik + güvenli değer içeren bildirimler kalır; geri kalanı atılır. */
export function sanitizeStyle(style: string): string | null {
  const out: string[] = [];
  for (const decl of style.split(';')) {
    const idx = decl.indexOf(':');
    if (idx < 0) continue;
    const prop = decl.slice(0, idx).trim().toLowerCase();
    const value = decl.slice(idx + 1).trim();
    if (!CSS_PROPS.has(prop) || !value || value.length > 300) continue;
    // CSS kaçışları (\75rl), yorumlar, açı/küme parantezleri ve tehlikeli anahtar kelimeler → bildirim atılır.
    if (/[\\<>{}@`]|\/\*|url|expression|import|behavior|binding|javascript|vbscript|image-set|-moz-|-webkit-/i.test(value)) continue;
    let funcsOk = true;
    for (const m of value.matchAll(/([a-z-]*)\s*\(/gi)) if (!CSS_FUNCS.has(m[1].toLowerCase())) funcsOk = false;
    if (!funcsOk) continue;
    out.push(`${prop}:${value}`);
  }
  return out.length ? out.join(';') : null;
}

const GLOBAL_ATTRS: Record<string, AttrRule> = {
  style: sanitizeStyle,
  title: plain,
  dir: re(/^(ltr|rtl|auto)$/i),
  lang: re(/^[a-z]{1,8}(?:-[a-z0-9]{1,8})*$/i),
  align: re(ALIGN),
};
const CELL_ATTRS: Record<string, AttrRule> = {
  colspan: re(/^\d{1,3}$/),
  rowspan: re(/^\d{1,3}$/),
  align: re(ALIGN),
  valign: re(VALIGN),
  bgcolor: re(COLOR),
  border: re(NUM_OR_PCT),
  cellpadding: re(NUM_OR_PCT),
  cellspacing: re(NUM_OR_PCT),
  width: re(NUM_OR_PCT),
  height: re(NUM_OR_PCT),
};
const COL_ATTRS: Record<string, AttrRule> = { span: re(/^\d{1,3}$/), width: re(NUM_OR_PCT), align: re(ALIGN), valign: re(VALIGN) };
const TAG_ATTRS: Record<string, Record<string, AttrRule>> = {
  a: { href: sanitizeHref },
  img: { src: sanitizeImgSrc, alt: plain, width: re(NUM_OR_PCT), height: re(NUM_OR_PCT) },
  table: CELL_ATTRS,
  tbody: CELL_ATTRS,
  thead: CELL_ATTRS,
  tfoot: CELL_ATTRS,
  tr: CELL_ATTRS,
  td: CELL_ATTRS,
  th: CELL_ATTRS,
  col: COL_ATTRS,
  colgroup: COL_ATTRS,
  font: { color: re(COLOR), size: re(/^[+-]?\d$/), face: re(/^[\w ,'-]{1,100}$/) },
  ol: { start: re(/^\d{1,5}$/), type: re(/^[1aAiI]$/) },
};

function escapeAttr(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/**
 * Gönderici HTML'ini ayrıştırıcı tabanlı allowlist ile temizler (derinlemesine savunma; asıl
 * koruma HTTP CSP + sandbox). Her `<a>`'ya sunucu `rel="noopener noreferrer" target="_blank"` ekler.
 */
export function scrubMailHtml(html: string): string {
  let out = '';
  const open: string[] = [];
  let dropDepth = 0;

  const parser = new Parser(
    {
      onopentag(name, attribs) {
        const tag = name.toLowerCase();
        if (dropDepth > 0 || DROP_CONTENT_TAGS.has(tag)) {
          if (!VOID_TAGS.has(tag)) dropDepth++;
          return;
        }
        if (!ALLOWED_TAGS.has(tag)) return;
        const rules = TAG_ATTRS[tag] ?? {};
        let attrs = '';
        const seen = new Set<string>();
        for (const [rawName, rawValue] of Object.entries(attribs)) {
          const an = rawName.toLowerCase();
          if (seen.has(an)) continue;
          const rule = rules[an] ?? GLOBAL_ATTRS[an];
          if (!rule) continue;
          const v = rule(rawValue);
          if (v === null) continue;
          seen.add(an);
          attrs += ` ${an}="${escapeAttr(v)}"`;
        }
        if (tag === 'img' && !seen.has('src')) return;
        if (tag === 'a') attrs += ' rel="noopener noreferrer" target="_blank"';
        out += `<${tag}${attrs}>`;
        if (!VOID_TAGS.has(tag)) open.push(tag);
      },
      ontext(text) {
        if (dropDepth === 0) out += escapeText(text);
      },
      onclosetag(name) {
        const tag = name.toLowerCase();
        if (VOID_TAGS.has(tag)) return;
        if (dropDepth > 0) {
          dropDepth--;
          return;
        }
        const i = open.lastIndexOf(tag);
        if (i < 0) return;
        while (open.length > i) out += `</${open.pop()}>`;
      },
    },
    { decodeEntities: true, lowerCaseTags: true, lowerCaseAttributeNames: true, recognizeSelfClosing: false, recognizeCDATA: false }
  );
  parser.write(html);
  parser.end();
  while (open.length) out += `</${open.pop()}>`;
  return out;
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
