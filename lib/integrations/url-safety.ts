/**
 * Giden webhook hedefi doğrulaması (SSRF derinlemesine savunma). Sunucu-yalnız.
 *
 *  - Üretimde yalnız `https:` (geliştirmede `WEBHOOK_ALLOW_HTTP=1` ile http).
 *  - Kullanıcı bilgisi (user:pass@) yasak.
 *  - Ana makine DNS ile çözülür; loopback, RFC1918, link-local (169.254/16 — bulut
 *    metadata), CGNAT, ULA, multicast ve ayrılmış aralıklar REDDEDİLİR.
 *  - Teslim anında yeniden çağrılır (DNS rebinding) ve fetch `redirect: 'manual'` kullanır.
 */
import { lookup } from 'dns/promises';
import { isIP } from 'net';

export type UrlCheck = { ok: true; url: URL } | { ok: false; reason: string };

function v4Parts(ip: string): number[] | null {
  const p = ip.split('.').map((x) => Number(x));
  return p.length === 4 && p.every((n) => Number.isInteger(n) && n >= 0 && n <= 255) ? p : null;
}

/** Herkese açık olmayan (özel/ayrılmış) bir IP mi? */
export function isNonPublicIp(ip: string): boolean {
  const clean = ip.replace(/^\[|\]$/g, '').toLowerCase();
  const mapped = clean.startsWith('::ffff:') ? clean.slice(7) : clean;
  const v4 = v4Parts(mapped);
  if (v4) {
    const [a, b] = v4;
    return (
      a === 0 ||
      a === 10 ||
      a === 127 ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 0) ||
      (a === 192 && b === 168) ||
      (a === 198 && (b === 18 || b === 19)) ||
      a >= 224
    );
  }
  if (isIP(clean) === 6) {
    return (
      clean === '::' ||
      clean === '::1' ||
      clean.startsWith('fc') ||
      clean.startsWith('fd') ||
      clean.startsWith('fe8') ||
      clean.startsWith('fe9') ||
      clean.startsWith('fea') ||
      clean.startsWith('feb') ||
      clean.startsWith('ff') ||
      clean.startsWith('64:ff9b:')
    );
  }
  return true; // tanınmayan biçim → güvenli tarafta kal
}

export function allowHttp(): boolean {
  return process.env.NODE_ENV !== 'production' && process.env.WEBHOOK_ALLOW_HTTP === '1';
}

/** Sözdizimi + şema + çıplak IP denetimi (DNS'siz, hızlı). */
export function checkUrlShape(raw: string): UrlCheck {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    return { ok: false, reason: 'Geçerli bir adres değil.' };
  }
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && allowHttp())) {
    return { ok: false, reason: 'Yalnız https:// adresleri kabul edilir (imzalı veri açık ağda gitmesin).' };
  }
  if (url.username || url.password) return { ok: false, reason: 'Adreste kullanıcı adı/parola olamaz.' };
  const host = url.hostname.replace(/^\[|\]$/g, '').toLowerCase();
  if (!host || host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local') || host.endsWith('.internal')) {
    return { ok: false, reason: 'Yerel/iç ağ adreslerine webhook gönderilemez.' };
  }
  if (isIP(host) && isNonPublicIp(host)) return { ok: false, reason: 'Özel veya ayrılmış bir IP adresine webhook gönderilemez.' };
  return { ok: true, url };
}

type Resolver = (host: string) => Promise<string[]>;
const defaultResolver: Resolver = async (host) => (await lookup(host, { all: true, verbatim: true })).map((r) => r.address);

/** Şekil + DNS çözümlemesi; çözülen adreslerden biri bile özel ise reddeder. */
export async function assertSafeWebhookUrl(raw: string, resolve: Resolver = defaultResolver): Promise<UrlCheck> {
  const shape = checkUrlShape(raw);
  if (!shape.ok) return shape;
  const host = shape.url.hostname.replace(/^\[|\]$/g, '');
  if (isIP(host)) return shape;
  let addrs: string[];
  try {
    addrs = await resolve(host);
  } catch {
    return { ok: false, reason: 'Alan adı çözümlenemedi (DNS).' };
  }
  if (addrs.length === 0) return { ok: false, reason: 'Alan adı çözümlenemedi (DNS).' };
  if (addrs.some(isNonPublicIp)) return { ok: false, reason: 'Alan adı özel/iç ağ adresine çözümleniyor.' };
  return shape;
}
