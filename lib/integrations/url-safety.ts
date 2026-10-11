/**
 * Giden webhook hedefi doğrulaması (SSRF derinlemesine savunma). Sunucu-yalnız.
 *
 *  - Yalnız `https:` (teslim yolu safeWebhookPost http'yi zaten reddeder).
 *  - Kullanıcı bilgisi (user:pass@) yasak.
 *  - Ana makine DNS ile çözülür; loopback, RFC1918, link-local (169.254/16 — bulut
 *    metadata), CGNAT, ULA, multicast ve ayrılmış aralıklar REDDEDİLİR.
 *  - Bu denetim kayıt/ön kontroldür; TESLİM lib/safe-webhook-post safeWebhookPost ile yapılır:
 *    bağlantı anında çözülen IP denetlenir (DNS rebinding TOCTOU yok), yönlendirme izlenmez.
 */
import { lookup } from 'dns/promises';
import { isIP } from 'net';
import { isPrivateIp } from '@/lib/safe-webhook-post';

export type UrlCheck = { ok: true; url: URL } | { ok: false; reason: string };

/**
 * Herkese açık olmayan (özel/ayrılmış) bir IP mi? Tek kaynak: lib/safe-webhook-post isPrivateIp
 * (IPv4-uyumlu/gömülü/hex eşlemeli IPv6, NAT64, 6to4 dahil).
 */
export function isNonPublicIp(ip: string): boolean {
  return isPrivateIp(ip.replace(/^\[|\]$/g, '').toLowerCase());
}

/** Sözdizimi + şema + çıplak IP denetimi (DNS'siz, hızlı). */
export function checkUrlShape(raw: string): UrlCheck {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    return { ok: false, reason: 'Geçerli bir adres değil.' };
  }
  if (url.protocol !== 'https:') {
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
