import { request } from 'node:https';
import { lookup as dnsLookup, type LookupAddress } from 'node:dns';
import { isIP } from 'node:net';
import { isPublicHttpsUrl } from '@/components/admin/a-segmentler/domain';

/**
 * SSRF-güvenli giden webhook POST'u (yalnız sunucu).
 * - Yalnız https, kimlik bilgisi yok, bariz iç host adları ret (isPublicHttpsUrl).
 * - DNS çözümü bağlantı anında yapılır ve çözülen HER adres özel/loopback/link-local/
 *   metadata aralığındaysa bağlantı reddedilir → DNS rebinding TOCTOU yok (bağlanılan IP = denetlenen IP).
 * - Yönlendirme takip edilmez (node:https takip etmez; 3xx olduğu gibi döner).
 * - Zaman aşımı + yanıt boyut sınırı.
 */

export function isPrivateIp(ip: string): boolean {
  const fam = isIP(ip);
  if (fam === 4) {
    const p = ip.split('.').map(Number);
    const [a, b] = p;
    return (
      a === 0 || a === 10 || a === 127 ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 192 && b === 0 && p[2] === 0) ||
      (a === 198 && (b === 18 || b === 19)) ||
      a >= 224
    );
  }
  if (fam === 6) {
    const h = ip.toLowerCase();
    if (h === '::' || h === '::1') return true;
    const mapped = h.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
    if (mapped) return isPrivateIp(mapped[1]);
    if (h.startsWith('::ffff:')) return true;
    const first = parseInt(h.split(':')[0] || '0', 16);
    if ((first & 0xfe00) === 0xfc00) return true; // fc00::/7
    if ((first & 0xffc0) === 0xfe80) return true; // fe80::/10
    if ((first & 0xff00) === 0xff00) return true; // multicast
    if (h.startsWith('64:ff9b:') || h.startsWith('2002:')) return true; // NAT64/6to4 gömülü v4
    return false;
  }
  return true; // tanınmayan → güvensiz say
}

type LookupCb = (err: NodeJS.ErrnoException | null, address: string | LookupAddress[], family?: number) => void;

export function safeLookup(hostname: string, options: { all?: boolean } & Record<string, unknown>, cb: LookupCb): void {
  dnsLookup(hostname, { ...options, all: true }, (err, addrs) => {
    if (err) return cb(err, '');
    const list = addrs as LookupAddress[];
    if (!list.length || list.some((a) => isPrivateIp(a.address))) {
      const e: NodeJS.ErrnoException = new Error(`SSRF: ${hostname} özel/iç adrese çözülüyor`);
      e.code = 'ESSRF';
      return cb(e, '');
    }
    if (options.all) return cb(null, list);
    cb(null, list[0].address, list[0].family);
  });
}

export type SafePostResult = { ok: boolean; status: number; body: string };

export function safeWebhookPost(
  rawUrl: string,
  body: string,
  headers: Record<string, string>,
  opts: { timeoutMs?: number; maxBytes?: number } = {},
): Promise<SafePostResult> {
  const timeoutMs = opts.timeoutMs ?? 10_000;
  const maxBytes = opts.maxBytes ?? 64 * 1024;
  if (!isPublicHttpsUrl(rawUrl)) return Promise.reject(new Error('SSRF: izin verilmeyen webhook URL'));
  const u = new URL(rawUrl);
  const host = u.hostname.replace(/^\[|\]$/g, '');
  if (isIP(host) && isPrivateIp(host)) return Promise.reject(new Error('SSRF: özel IP'));

  return new Promise((resolve, reject) => {
    const req = request(
      {
        protocol: 'https:',
        hostname: host,
        port: u.port || 443,
        path: `${u.pathname}${u.search}`,
        method: 'POST',
        headers: { ...headers, 'Content-Length': Buffer.byteLength(body).toString() },
        lookup: safeLookup as never,
        timeout: timeoutMs,
      },
      (res) => {
        const chunks: Buffer[] = [];
        let size = 0;
        res.on('data', (c: Buffer) => {
          size += c.length;
          if (size > maxBytes) {
            res.destroy();
            return;
          }
          chunks.push(c);
        });
        const done = () => {
          const status = res.statusCode ?? 0;
          resolve({ ok: status >= 200 && status < 300, status, body: Buffer.concat(chunks).toString('utf8') });
        };
        res.on('end', done);
        res.on('close', done);
        res.on('error', done);
      },
    );
    req.setTimeout(timeoutMs, () => req.destroy(new Error('webhook zaman aşımı')));
    req.on('error', reject);
    req.end(body);
  });
}
