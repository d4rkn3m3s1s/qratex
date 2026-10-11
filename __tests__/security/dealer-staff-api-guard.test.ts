/**
 * Yapı testi — bayi / personel API yüzeyinin kalıcı güvenceleri (guvenlik-bayi-api Faz 3, D1/O5/Y4).
 *
 * Kaynak kodu okur (çalıştırmaz); yeni eklenen bir uç aşağıdaki kurallardan birini çiğnerse
 * test kırılır:
 *  1. `app/api/**` altında `next-auth`'tan `getServerSession` İÇE AKTARILMAZ (token replay,
 *     `sessionVersion`, askı ve güncel DB rolü denetimlerini atlıyordu) — `requireAuth` /
 *     `getOptionalSession` / `defineRoute` kullanılır.
 *  2. Bayi/personel uçları kimliği açık rol listesiyle doğrular: `defineRoute` (roles zorunlu) ya da
 *     `requireAuth([...])`; rol listesiz `requireAuth()` yok. Davet kabulü (oturum isteğe bağlı) ve
 *     410 emekli uçlar istisnadır.
 *  3. Her yazma ucu (POST/PATCH/PUT/DELETE) oran sınırlıdır (defineRoute `rateLimit` ya da
 *     `enforceRouteRateLimit` / `checkRateLimitDb`).
 *  4. Toplu CSV dışa aktarımları personele açık değildir (yalnız DEALER/ADMIN).
 */
import { readdirSync, readFileSync, statSync } from 'fs';
import { join, relative, sep } from 'path';

const ROOT = join(__dirname, '..', '..');

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (name === 'route.ts') out.push(full);
  }
  return out;
}

const rel = (f: string) => relative(ROOT, f).split(sep).join('/');
const read = (f: string) => readFileSync(f, 'utf8');

const SCOPED_DIRS = ['app/api/dealer', 'app/api/staff', 'app/api/qr-codes', 'app/api/happy-hour'];
const scopedRoutes = SCOPED_DIRS.flatMap((d) => walk(join(ROOT, d)));

/** Herkese açık / oturumu isteğe bağlı uçlar (kendi oran sınırları ve gerekçeleriyle). */
const AUTH_EXEMPT = new Set([
  'app/api/qr-codes/public/[code]/route.ts', // müşteri tarama çözümü (public, kendi limiti)
  'app/api/dealer/staff/invitations/accept/route.ts', // davetli henüz hesapsız olabilir (getOptionalSession)
]);

const isGoneStub = (src: string) => /status:\s*410/.test(src) && !/prisma\./.test(src);

describe('bayi/personel API yapı güvenceleri', () => {
  it('kapsamda en az birkaç düzine uç bulunur (yanlış yol koruması)', () => {
    expect(scopedRoutes.length).toBeGreaterThan(80);
  });

  it("app/api altında next-auth getServerSession içe aktarılmaz", () => {
    const offenders = walk(join(ROOT, 'app/api')).filter((f) =>
      /import\s*\{[^}]*\bgetServerSession\b[^}]*\}\s*from\s*['"]next-auth(?:\/next)?['"]/.test(read(f))
    );
    expect(offenders.map(rel)).toEqual([]);
  });

  it('her uç açık rol listesiyle kimlik doğrular (rol listesiz requireAuth yok)', () => {
    const offenders: string[] = [];
    for (const f of scopedRoutes) {
      const r = rel(f);
      const src = read(f);
      if (AUTH_EXEMPT.has(r) || isGoneStub(src)) continue;
      if (/requireAuth\(\s*\)/.test(src)) {
        offenders.push(`${r}: rol listesiz requireAuth()`);
        continue;
      }
      const usesDefine = /defineRoute\(/.test(src);
      const usesRoleList = /requireAuth\(\s*\[\s*'(ADMIN|DEALER|STAFF)'/.test(src);
      if (!usesDefine && !usesRoleList) offenders.push(`${r}: kimlik doğrulaması yok`);
      if (usesDefine) {
        for (const m of src.matchAll(/defineRoute\(\s*\{([\s\S]*?)\n\s*\},\s*\n?\s*async/g)) {
          if (!/roles:\s*\[/.test(m[1])) offenders.push(`${r}: defineRoute rol listesi açık değil`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  it('her yazma ucu oran sınırlıdır', () => {
    const offenders: string[] = [];
    for (const f of scopedRoutes) {
      const r = rel(f);
      const src = read(f);
      if (isGoneStub(src)) continue;
      // defineRoute yazma uçları: tanım bloğunda rateLimit.
      for (const m of src.matchAll(/export const (POST|PATCH|PUT|DELETE)\s*=\s*defineRoute\(\s*\{([\s\S]*?)\n\s*\},/g)) {
        if (!/rateLimit:/.test(m[2])) offenders.push(`${r} ${m[1]}: defineRoute rateLimit yok`);
      }
      // Eski tarz uçlar: dosyada yazma ihracı varsa bir oran sınırı çağrısı olmalı.
      const legacyMutation = /export async function (POST|PATCH|PUT|DELETE)\b/.test(src);
      if (legacyMutation && !/enforceRouteRateLimit\(|checkRateLimitDb\(|checkAiRateLimit\(|guardAiCall\(/.test(src)) {
        offenders.push(`${r}: eski tarz yazma ucunda oran sınırı yok`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it('her uç (OKUMA dahil) handler başına oran sınırlıdır', () => {
    // Okuma uçları da kazıma / DB yükü tavanı ister (defineRoute `rateLimit` ya da handler
    // gövdesinde açık çağrı). Davet kabulü kendi `limited()` yardımcısını kullanır.
    const LIMIT_CALL =
      /enforceRouteRateLimit\(|checkRateLimitDb\(|checkScanRateLimit\(|checkAiRateLimit\(|guardAiCall\(|await limited\(/;
    const offenders: string[] = [];
    for (const f of scopedRoutes) {
      const r = rel(f);
      const src = read(f);
      if (isGoneStub(src)) continue;
      for (const m of src.matchAll(/export const (GET|POST|PATCH|PUT|DELETE)\s*=\s*defineRoute\(\s*\{([\s\S]*?)\n\s*\},/g)) {
        if (!/rateLimit:/.test(m[2])) offenders.push(`${r} ${m[1]}: defineRoute rateLimit yok`);
      }
      const heads = [...src.matchAll(/export async function (GET|POST|PATCH|PUT|DELETE)\b/g)];
      heads.forEach((h, i) => {
        const body = src.slice(h.index ?? 0, i + 1 < heads.length ? heads[i + 1].index : src.length);
        if (!LIMIT_CALL.test(body)) offenders.push(`${r} ${h[1]}: handler oran sınırsız`);
      });
    }
    expect(offenders).toEqual([]);
  });

  it('toplu CSV dışa aktarımları personele açık değildir', () => {
    const offenders: string[] = [];
    for (const f of scopedRoutes) {
      const src = read(f);
      if (!/text\/csv/.test(src)) continue;
      if (/roles:\s*\[[^\]]*'STAFF'/.test(src) || /requireAuth\(\s*\[[^\]]*'STAFF'/.test(src)) offenders.push(rel(f));
    }
    expect(offenders).toEqual([]);
  });
});
