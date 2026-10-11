/**
 * Gelen mailin kimlik doğrulaması (güvenlik: sahte From / sahte bounce).
 *
 * `From:` başlığı göndericinin beyanıdır; ona güvenilerek otomatik durum değişikliği (stajyer
 * eşleştirme, bounce işaretleme) yapılmaz. Tek güvenilir kaynak, KENDİ alıcı sunucumuzun
 * (MX) iletinin EN ÜSTÜNE eklediği `Authentication-Results` başlığıdır (RFC 8601). Altındaki
 * her başlık gönderici tarafından uydurulabilir; bu yüzden yalnız en üstteki başlık okunur ve
 * authserv-id'si `MAIL_AUTHSERV_ID` (ör. `mx.google.com`) ile birebir eşleşmelidir.
 *
 * Env yoksa fail-closed: hiçbir mail doğrulanmış sayılmaz (gösterilir, ama otomatik iş yapılmaz).
 *
 * Ayrıştırma doğrusaldır: yalnız başlık bloğu (en çok 64 KB) satır satır okunur, regex'lerde
 * iç içe niceleyici yoktur.
 */

export const AUTH_HEADER_SCAN_BYTES = 64 * 1024;

export type MailAuthResult = {
  verified: boolean;
  /** Neden doğrulanmadı / nasıl doğrulandı (log/teşhis için). */
  reason: string;
};

/** Ham kaynağın başlık bloğunu satırlara (katlanmış satırlar birleştirilmiş) ayırır. */
export function headerLines(source: Buffer | string, maxBytes = AUTH_HEADER_SCAN_BYTES): string[] {
  const text = (typeof source === 'string' ? source.slice(0, maxBytes) : source.subarray(0, maxBytes).toString('latin1'));
  const out: string[] = [];
  for (const raw of text.split('\n')) {
    const line = raw.endsWith('\r') ? raw.slice(0, -1) : raw;
    if (line === '') break; // başlık bloğu bitti
    if ((line[0] === ' ' || line[0] === '\t') && out.length) out[out.length - 1] += ' ' + line.trim();
    else out.push(line);
  }
  return out;
}

function domainOf(addr: string): string {
  const at = addr.lastIndexOf('@');
  return at >= 0 ? addr.slice(at + 1).trim().toLowerCase().replace(/>$/, '') : '';
}

function mailFromDomain(v: string | undefined): string {
  if (!v) return '';
  return v.includes('@') ? domainOf(v) : v.toLowerCase();
}

/** Gevşek hizalama (RFC 7489): biri diğerinin kendisi ya da alt alanı. */
function aligned(a: string, b: string): boolean {
  if (!a || !b) return false;
  return a === b || a.endsWith('.' + b) || b.endsWith('.' + a);
}

/** `method=result` çiftleri ve özellikleri (ör. header.d). Sınırlı niceleyiciler. */
function parseResults(value: string): Array<{ method: string; result: string; props: Record<string, string> }> {
  const out: Array<{ method: string; result: string; props: Record<string, string> }> = [];
  for (const part of value.split(';').slice(1, 50)) {
    const tokens = part.trim().split(/\s{1,10}/).slice(0, 30);
    const head = /^([a-z0-9-]{1,32})=([a-z]{1,16})$/i.exec(tokens[0] ?? '');
    if (!head) continue;
    const props: Record<string, string> = {};
    for (const t of tokens.slice(1)) {
      const kv = /^([a-z0-9.-]{1,40})=([^\s;]{1,255})$/i.exec(t);
      if (kv) props[kv[1].toLowerCase()] = kv[2].toLowerCase().replace(/^@/, '');
    }
    out.push({ method: head[1].toLowerCase(), result: head[2].toLowerCase(), props });
  }
  return out;
}

/**
 * En üstteki Authentication-Results bizim MX'imizden mi ve From alan adı için dmarc=pass ya da
 * hizalı dkim=pass / spf=pass mı?
 */
export function verifyMailAuth(
  source: Buffer | string | null | undefined,
  fromEmail: string,
  authservId: string | undefined = process.env.MAIL_AUTHSERV_ID
): MailAuthResult {
  const expected = (authservId ?? '').trim().toLowerCase();
  if (!expected) return { verified: false, reason: 'MAIL_AUTHSERV_ID tanımlı değil' };
  if (!source) return { verified: false, reason: 'ham kaynak yok' };
  const fromDomain = domainOf(fromEmail);
  if (!fromDomain) return { verified: false, reason: 'From alan adı yok' };

  const top = headerLines(source).find((l) => /^authentication-results:/i.test(l));
  if (!top) return { verified: false, reason: 'Authentication-Results yok' };
  const value = top.slice(top.indexOf(':') + 1).trim();
  const servId = value.split(';')[0].trim().split(/\s/)[0].toLowerCase();
  if (servId !== expected) return { verified: false, reason: `yabancı authserv-id: ${servId.slice(0, 64)}` };

  for (const r of parseResults(value)) {
    if (r.result !== 'pass') continue;
    if (r.method === 'dmarc') {
      const hf = r.props['header.from'];
      if (!hf || aligned(hf, fromDomain)) return { verified: true, reason: 'dmarc=pass' };
    }
    if (r.method === 'dkim' && aligned(r.props['header.d'] ?? domainOf(r.props['header.i'] ?? ''), fromDomain)) {
      return { verified: true, reason: 'dkim=pass (hizalı)' };
    }
    if (r.method === 'spf' && aligned(mailFromDomain(r.props['smtp.mailfrom']), fromDomain)) {
      return { verified: true, reason: 'spf=pass (hizalı)' };
    }
  }
  return { verified: false, reason: 'hizalı SPF/DKIM/DMARC pass yok' };
}

/** DSN mi? (multipart/report; report-type=delivery-status) — yalnız en üst Content-Type. */
export function isDeliveryStatusReport(source: Buffer | string | null | undefined): boolean {
  if (!source) return false;
  const ct = headerLines(source).find((l) => /^content-type:/i.test(l)) ?? '';
  return /multipart\/report/i.test(ct) && /report-type\s{0,5}=\s{0,5}"?delivery-status/i.test(ct);
}
