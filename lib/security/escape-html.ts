/**
 * HTML kaçışı ve güvenli URL — TEK KAYNAK (P0-35).
 *
 * Bayi adı, müşteri yorumu ve LLM çıktısı e-posta/HTML şablonlarına kaçışsız gömülüyordu:
 * Qratex markalı bir e-postada `<a href="https://evil">` oltalama bağlantısı üretilebiliyordu.
 * Kurallar:
 *  - Metin düğümü VE öznitelik değeri için `escapeHtml` (5 karakter: & < > " ').
 *  - E-posta METNİ için `escapeEmailText`: kaçış + e-posta istemcilerinin otomatik bağlantıya
 *    çevirdiği `evil.com` / `a@b.com` desenlerinin görünmez boşlukla kırılması.
 *  - `href` / `src` için önce `safeUrl` (yalnız http/https), sonra `escapeHtml`.
 *    Kısayol: `safeHref(url, fallback)`.
 */

const HTML_ESCAPES: Readonly<Record<string, string>> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

const HTML_ESCAPE_RE = /[&<>"']/g;

function toText(value: unknown): string {
  if (value == null) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'bigint') {
    return String(value);
  }
  return '';
}

/**
 * Metin ve öznitelik değeri için HTML kaçışı. `null`/`undefined`/nesne → ''.
 * (Nesneler bilerek '' olur: `[object Object]` şablona sızmasın.)
 */
export function escapeHtml(value: unknown): string {
  return toText(value).replace(HTML_ESCAPE_RE, (ch) => HTML_ESCAPES[ch] ?? ch);
}

/**
 * E-posta şablonları için kaçış (öznitelik ve metin). `escapeHtml` ile aynı güvenlik
 * garantisi + e-posta istemcilerinin bozduğu kontrol karakterlerinin temizlenmesi.
 * `lib/transactional-email.ts` içindeki eski `escapeEmailHtml` tek tırnağı kaçırmıyordu.
 */
export function escapeEmailHtml(value: unknown): string {
   
  return escapeHtml(toText(value).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, ''));
}

const ZWSP = '&#8203;';

/**
 * E-posta GÖVDE METNİ için: kaçış + otomatik bağlantı kırma (+ isteğe bağlı satır sonu).
 * Gmail/Outlook `qratex-destek.com` veya `odeme@evil.com` gibi düz metni tıklanabilir bağlantıya
 * çevirir; bayi adı ya da LLM çıktısı üzerinden oltalama bağlantısı sızmasın diye `.`, `@` ve
 * `://` sonrasına görünmez sıfır genişlikli boşluk eklenir. ÖZNİTELİK İÇİNDE KULLANMAYIN
 * (href bozulur) — öznitelik için `escapeEmailHtml` / `safeHref`.
 */
export function escapeEmailText(
  value: unknown,
  options: { breakAutolinks?: boolean; nl2br?: boolean; maxLength?: number } = {}
): string {
  const { breakAutolinks = true, nl2br = false, maxLength } = options;
  let text = toText(value);
  if (typeof maxLength === 'number' && maxLength >= 0 && text.length > maxLength) {
    text = `${text.slice(0, maxLength).trimEnd()}…`;
  }
  let out = escapeEmailHtml(text);
  if (breakAutolinks) {
    out = out
      .replace(/:\/\//g, `:${ZWSP}//`)
      .replace(/([A-Za-z0-9À-ɏ])\.(?=[A-Za-z0-9À-ɏ])/g, `$1.${ZWSP}`)
      .replace(/@/g, `@${ZWSP}`);
  }
  if (nl2br) out = out.replace(/\r\n|\r|\n/g, '<br>');
  return out;
}

export interface SafeUrlOptions {
  /** Göreli yolları (`/customer`) bu tabana göre çözer; verilmezse göreli URL reddedilir. */
  base?: string;
  /** `mailto:` bağlantılarına izin ver (varsayılan: hayır). */
  allowMailto?: boolean;
}

/**
 * Yalnız http/https URL kabul eder ve normalize edilmiş mutlak URL döndürür; aksi hâlde null.
 * Reddedilenler: `javascript:`/`data:`/`vbscript:`/`file:` vb., kontrol karakteri veya ters bölü
 * içeren girdiler, `https://qratex.com@evil.com` gibi kimlik bilgili URL'ler, boş/uzun girdi.
 */
export function safeUrl(raw: unknown, options: SafeUrlOptions = {}): string | null {
  if (typeof raw !== 'string') return null;
  const s = raw.trim();
  if (!s || s.length > 2048) return null;
   
  if (/[\u0000-\u001F\u007F\\]/.test(s)) return null;

  if (options.allowMailto && /^mailto:/i.test(s)) {
    const addr = s.slice('mailto:'.length).split('?')[0] ?? '';
    return /^[^\s@<>"']+@[^\s@<>"']+\.[^\s@<>"']+$/.test(decodeURIComponentSafe(addr)) ? s : null;
  }

  let url: URL;
  try {
    const hasScheme = /^[a-z][a-z0-9+.-]*:/i.test(s);
    if (!hasScheme && !options.base) return null;
    if (!hasScheme && s.startsWith('//')) return null;
    url = hasScheme ? new URL(s) : new URL(s, options.base);
  } catch {
    return null;
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;
  if (url.username || url.password) return null;
  if (!url.hostname) return null;
  return url.toString();
}

function decodeURIComponentSafe(s: string): string {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
}

/**
 * `href="..."` için tek adım: güvenli URL ya da yedek, öznitelik için kaçışlanmış.
 *   `<a href="${safeHref(cta.href, origin)}">`
 */
export function safeHref(raw: unknown, fallback = '#', options: SafeUrlOptions = {}): string {
  return escapeHtml(safeUrl(raw, options) ?? fallback);
}
