/**
 * Yetki matrisi (genel denetim 2026-10, guvenlik) — URL segmenti ile izinli rol kümesi tutarlı mı?
 * api-architecture.test.ts "kimlik yolu var mı"yı denetler; bu test "DOĞRU rol mü"yü denetler:
 *  - app/api/admin/**    → yalnız ADMIN (CUSTOMER/DEALER/STAFF/'public' rolü bildirilemez)
 *  - app/api/dealer/**   → CUSTOMER ve 'public' bildirilemez
 *  - app/api/customer/** → 'public' yalnız gerekçeli listede
 *  - app/api/staff/**    → CUSTOMER ve 'public' bildirilemez
 * Sahip/sahip-değil (IDOR) davranışı canlı örneklemeyle doğrulandı (docs/audit/2026-10-08/genel/guvenlik.md).
 */
import fs from 'fs';
import path from 'path';

const ROOT = path.join(__dirname, '..', '..');
const API = path.join(ROOT, 'app', 'api');

function walk(dir: string, out: string[] = []): string[] {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (e.name === 'route.ts') out.push(p);
  }
  return out;
}
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/.*$/gm, '$1');

const routes = walk(API).map((f) => {
  const rel = path.relative(ROOT, f).split(path.sep).join('/');
  const code = strip(fs.readFileSync(f, 'utf8'));
  const declared = [
    ...[...code.matchAll(/roles\s*:\s*(\[[^\]]*\]|'public'|[A-Z_]+)/g)].map((m) => m[1]),
    ...[...code.matchAll(/requireAuth\s*\(([^)]*)\)/g)].map((m) => m[1]),
  ].join(' ');
  return { rel, segment: rel.split('/')[2], declared };
});

const PUBLIC_CUSTOMER_OK: Record<string, string> = {
  'app/api/customer/innovation/ab/event/route.ts': 'A/B dönüşüm olayı (yalnız aktif deney, IP sınırlı)',
  'app/api/customer/innovation/ab/variant/route.ts': 'A/B varyant ataması (oturumsuz ziyaretçi)',
};

const FORBIDDEN: Record<string, RegExp> = {
  admin: /CUSTOMER|DEALER|STAFF|'public'/,
  dealer: /CUSTOMER|'public'/,
  staff: /CUSTOMER|'public'/,
};

describe('yetki matrisi — segment × rol', () => {
  it('route taraması boş değil', () => {
    expect(routes.length).toBeGreaterThan(500);
  });

  it.each(Object.keys(FORBIDDEN))('app/api/%s altında yabancı rol bildirilmez', (seg) => {
    const bad = routes.filter((r) => r.segment === seg && FORBIDDEN[seg].test(r.declared)).map((r) => `${r.rel}: ${r.declared}`);
    expect(bad).toEqual([]);
  });

  it("app/api/customer altında 'public' yalnız gerekçeli listede", () => {
    const bad = routes
      .filter((r) => r.segment === 'customer' && /'public'/.test(r.declared) && !PUBLIC_CUSTOMER_OK[r.rel])
      .map((r) => r.rel);
    expect(bad).toEqual([]);
  });

  it('gerekçeli public listesi bayat değil', () => {
    for (const rel of Object.keys(PUBLIC_CUSTOMER_OK)) expect(fs.existsSync(path.join(ROOT, rel))).toBe(true);
  });
});
