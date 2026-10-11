/**
 * API mimarisi korkulukları — platform geneli yapısal (statik) denetim (mimari-api, 2026-10-08
 * raporu Faz 0 / §6). Kapatılan açık sınıflarının GERİ DÖNMESİNİ engeller; kapsam bütün
 * app/api route'ları (alan bazlı güvenlik testleri __tests__/security altında ayrıca durur).
 *
 *  - B1: çıplak `getServerSession` (askı/oturum sürümü/güncel rol/token replay/admin kapısı atlanır).
 *  - B1/B2: tanınmayan kimlik yolu — her route ya `defineRoute` / `requireAuth` /
 *    `getOptionalSession` / ekip erişimi / zamanlanmış-iş sırrı / partner anahtarı / imza
 *    doğrulaması kullanır, ya 410 emekli uçtur, ya da AŞAĞIDAKİ gerekçeli public listededir.
 *  - B5: eski yanıt yardımcıları (`createApiRoute`, `jsonOk/jsonError`, `apiOk/apiError`) ve
 *    İngilizce genel hata metinleri ('Unauthorized', 'Internal server error') geri gelmesin.
 *  - B6: şemasız `request.json()` gövdesi.
 *  - B7: oran sınırsız yazma ucu (defineRoute `rateLimit` ya da `enforceRouteRateLimit` /
 *    `checkRateLimitDb` / alan-özel sınırlayıcı).
 *  - B12: 'use client' dosyasından Prisma'ya statik (tip dışı) import zinciri.
 * Yorumlar taranmaz (kod içi açıklamalar eski deseni anlatabilir).
 */
import fs from 'fs';
import path from 'path';

const ROOT = path.join(__dirname, '..', '..');
const API = path.join(ROOT, 'app', 'api');

function walk(dir: string, accept: (name: string) => boolean, out: string[] = []): string[] {
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (['node_modules', '.next', '.git', '.wf-tmp', '__tests__'].includes(entry.name)) continue;
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(p, accept, out);
    else if (accept(entry.name)) out.push(p);
  }
  return out;
}

/** Blok ve satır yorumlarını atar (URL'lerdeki `//` korunur: önünde `:` ya da tırnak olan dokunulmaz). */
function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/.*$/gm, '$1');
}

const rel = (file: string) => path.relative(ROOT, file).split(path.sep).join('/');

const routes = walk(API, (n) => n === 'route.ts').map((file) => ({
  file,
  rel: rel(file),
  code: stripComments(fs.readFileSync(file, 'utf8')),
}));

/**
 * Oturumsuz (public) olması BİLİNÇLİ uçlar ve gerekçesi. Yeni bir public uç eklenince buraya
 * gerekçesiyle eklenir; listede olmayan, kimlik yolu tanınmayan route testi düşürür.
 */
const PUBLIC_BY_DESIGN: Record<string, string> = {
  'app/api/auth/[...nextauth]/route.ts': 'NextAuth işleyicisi',
  'app/api/auth/forgot-password/route.ts': 'oturumsuz şifre sıfırlama isteği (e-posta/IP sınırlı)',
  'app/api/auth/magic-link/route.ts': 'oturumsuz sihirli bağlantı (e-posta/IP sınırlı)',
  'app/api/auth/register/route.ts': 'kayıt (IP sınırlı)',
  'app/api/auth/reset-password/route.ts': 'tek kullanımlık jetonla şifre sıfırlama',
  'app/api/auth/signup-intent/route.ts': 'kayıt öncesi hesap türü çerezi (DB yok)',
  'app/api/auth/verify-email/route.ts': 'tek kullanımlık jetonla e-posta doğrulama',
  'app/api/auth/verify-email/resend/route.ts': 'doğrulama e-postasını yeniden gönder (sınırlı)',
  'app/api/inngest/route.ts': 'Inngest serve (imzalı)',
  'app/api/public/auth-features/route.ts': 'giriş ekranı özellik bayrakları',
  'app/api/public/stats/route.ts': 'tanıtım sayfası toplu sayılar',
  'app/api/qr-codes/public/[code]/route.ts': 'QR tarama açılışı',
  'app/api/settings/background/route.ts': 'herkese aynı tema arka planı',
  'app/api/settings/seasonal-concept/route.ts': 'herkese aynı sezon teması',
  'app/api/settings/theme/route.ts': 'herkese aynı tema',
  'app/api/test-email/route.ts': 'geliştirici aracı: Bearer TEST_EMAIL_SECRET (yoksa 404)',
  'app/api/track/email-open/[token]/route.ts': 'e-posta açılma pikseli (imzalı jeton)',
  'app/api/webhooks/stripe/route.ts': 'Stripe imza doğrulaması',
};

const AUTH_PATTERNS: Array<[string, RegExp]> = [
  ['defineRoute', /\bdefineRoute\s*\(/],
  ['requireAuth', /\brequireAuth\s*\(/],
  ['getOptionalSession', /\bgetOptionalSession\s*\(/],
  ['team', /\brequireTeam\w*\s*\(/],
  ['cron', /\b(requireCronAuth|verifyCronBearer|authorizeInternalJobRequest|requireInternalCronOrAdmin)\s*\(/],
  ['partner', /\bauthenticatePartner\w*\s*\(|\bverifyPartner\w*\s*\(/],
  ['gone', /status:\s*410/],
  ['re-export', /^export\s*\{[^}]*\}\s*from\s*['"]/m],
];

describe('API mimarisi — kimlik tek yoldan (B1/B2)', () => {
  it('çıplak getServerSession yok (NextAuth işleyicisi hariç)', () => {
    const offenders = routes
      .filter((r) => !r.rel.includes('[...nextauth]'))
      .filter((r) => /\bgetServerSession\b/.test(r.code))
      .map((r) => r.rel);
    expect(offenders).toEqual([]);
  });

  it('her route tanınan bir kimlik yolu kullanır ya da gerekçeli public listededir', () => {
    const unknown = routes
      .filter((r) => !PUBLIC_BY_DESIGN[r.rel])
      .filter((r) => !AUTH_PATTERNS.some(([, re]) => re.test(r.code)))
      .map((r) => r.rel);
    expect(unknown).toEqual([]);
  });

  it('public listesi bayat değil (listelenen dosyalar mevcut)', () => {
    const missing = Object.keys(PUBLIC_BY_DESIGN).filter((p) => !fs.existsSync(path.join(ROOT, p)));
    expect(missing).toEqual([]);
  });
});

describe('API mimarisi — tek yanıt sözleşmesi (B5)', () => {
  it('eski yanıt yardımcıları kullanılmıyor', () => {
    const offenders = routes
      .filter((r) => /@\/lib\/api-route['"]|\b(createApiRoute|jsonOk|jsonError|apiOk|apiError)\s*\(/.test(r.code))
      .map((r) => r.rel);
    expect(offenders).toEqual([]);
    expect(fs.existsSync(path.join(ROOT, 'lib', 'api-route.ts'))).toBe(false);
  });

  it("İngilizce genel hata metni ('Unauthorized', 'Internal server error', 'Forbidden') yok", () => {
    const offenders = routes
      .filter((r) => /['"`](Unauthorized|Forbidden|Internal (S|s)erver (E|e)rror|Not found|Bad request)['"`]/.test(r.code))
      .map((r) => r.rel);
    expect(offenders).toEqual([]);
  });
});

describe('API mimarisi — girdi doğrulama (B6)', () => {
  it('JSON gövdesi okuyan her route şema/ayrıştırıcı ile doğrular', () => {
    const offenders = routes
      .filter((r) => /\b(request|req)\.json\(\)/.test(r.code))
      .filter((r) => !/safeParse|\.parse\(|parseJsonBody|\bparse[A-Z]\w*\(|schema:/.test(r.code))
      .map((r) => r.rel);
    expect(offenders).toEqual([]);
  });
});

describe('API mimarisi — oran sınırı (B7)', () => {
  const RATE_LIMITED =
    /rateLimit\s*:|enforceRouteRateLimit|checkRateLimitDb|checkAdminRateLimit|checkAuthEmailActionLimit|checkQraChatRateLimit|\bcheck\w*RateLimit\w*\s*\(/;
  /** Oran sınırı gerekmeyen yazma uçları (sır/imza ile korunan makine uçları, DB'siz). */
  const EXEMPT = [
    /^app\/api\/(cron|internal)\//,
    /^app\/api\/webhooks\//,
    /^app\/api\/inngest\//,
    /^app\/api\/auth\/\[\.\.\.nextauth\]\//,
    /^app\/api\/auth\/signup-intent\//, // yalnız çerez yazar
  ];

  /** Dosya-içi üst düzey fonksiyonlardan gövdesinde sınırlayıcı çağıranların adları. */
  function localLimiterHelpers(code: string): string[] {
    const names: string[] = [];
    const re = /^(?:async\s+)?function\s+(\w+)\s*\(|^const\s+(\w+)\s*=\s*(?:async\s*)?\(/gm;
    const heads: Array<{ name: string; idx: number }> = [];
    let m: RegExpExecArray | null;
    while ((m = re.exec(code))) heads.push({ name: m[1] || m[2], idx: m.index });
    for (let i = 0; i < heads.length; i++) {
      const body = code.slice(heads[i].idx, i + 1 < heads.length ? heads[i + 1].idx : code.length);
      const end = body.search(/^export\s/m);
      if (RATE_LIMITED.test(end > 0 ? body.slice(0, end) : body)) names.push(heads[i].name);
    }
    return names;
  }

  it('her yazma handlerı oran sınırlı (defineRoute rateLimit ya da açık sınırlayıcı)', () => {
    const offenders: string[] = [];
    for (const r of routes) {
      if (EXEMPT.some((re) => re.test(r.rel))) continue;
      const marks: Array<{ method: string; idx: number }> = [];
      const all = /export\s+(?:const|(?:async\s+)?function)\s+(GET|POST|PUT|PATCH|DELETE)\b/g;
      let m: RegExpExecArray | null;
      while ((m = all.exec(r.code))) marks.push({ method: m[1], idx: m.index });
      for (let i = 0; i < marks.length; i++) {
        if (marks[i].method === 'GET') continue;
        const block = r.code.slice(marks[i].idx, i + 1 < marks.length ? marks[i + 1].idx : r.code.length);
        if (/status:\s*410|=\s*gone\b|\bgone\s*\)/.test(block)) continue; // emekli uç
        // `export const PUT = write;` gibi takma ad: hedef tanım dosyanın kendisinde aranır.
        const alias = /^export\s+const\s+\w+\s*=\s*([A-Za-z_]\w*)\s*;/.exec(block);
        const scope = alias ? r.code : block;
        // Dosya-içi yardımcıya devreden handler (`await limited(request, …)`, `await searchRateLimit(…)`):
        // yardımcının gövdesi sınırlayıcı çağırıyorsa sayılır.
        const viaLocalHelper = localLimiterHelpers(r.code).some((name) => new RegExp(`\\b${name}\\s*\\(`).test(scope));
        if (!RATE_LIMITED.test(scope) && !viaLocalHelper) {
          offenders.push(`${marks[i].method} ${r.rel}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });
});

describe('API mimarisi — sunucu/istemci sınırı (B12)', () => {
  const exts = ['.ts', '.tsx', '.js', '.mjs', '/index.ts', '/index.tsx'];
  const files = ['app', 'components', 'lib', 'hooks'].flatMap((d) =>
    walk(path.join(ROOT, d), (n) => /\.(tsx?|mjs)$/.test(n))
  );
  const cache = new Map<string, string[]>();

  function resolve(from: string, spec: string): string | null {
    if (spec === '@prisma/client') return spec;
    let base: string;
    if (spec.startsWith('@/')) base = path.join(ROOT, spec.slice(2));
    else if (spec.startsWith('.')) base = path.join(path.dirname(from), spec);
    else return null;
    if (fs.existsSync(base) && fs.statSync(base).isFile()) return base;
    for (const e of exts) if (fs.existsSync(base + e)) return base + e;
    return null;
  }

  function deps(file: string): string[] {
    if (file === '@prisma/client') return [];
    const hit = cache.get(file);
    if (hit) return hit;
    const src = fs.readFileSync(file, 'utf8');
    const out: string[] = [];
    const re = /^\s*(import|export)\s+(type\s+)?([^;]*?\sfrom\s+)?['"]([^'"]+)['"]|import\(\s*['"]([^'"]+)['"]\s*\)/gm;
    let m: RegExpExecArray | null;
    while ((m = re.exec(src))) {
      if (m[2]) continue; // yalnız tip importu pakete girmez
      const r = resolve(file, m[4] || m[5]);
      if (r) out.push(r);
    }
    cache.set(file, out);
    return out;
  }

  const isClient = (f: string) =>
    /^\s*(\/\/[^\n]*\n|\/\*[\s\S]*?\*\/\s*)*['"]use client['"]/.test(fs.readFileSync(f, 'utf8'));
  const isPrisma = (d: string) => d === '@prisma/client' || /[\\/]lib[\\/]prisma\.ts$/.test(d);

  it("'use client' dosyalarından Prisma'ya değer importu zinciri yok", () => {
    const chains: string[] = [];
    for (const f of files.filter(isClient)) {
      const parent = new Map<string, string | null>([[f, null]]);
      const queue = [f];
      let hit: string | null = null;
      while (queue.length && !hit) {
        const cur = queue.shift() as string;
        for (const d of deps(cur)) {
          if (parent.has(d)) continue;
          parent.set(d, cur);
          if (isPrisma(d)) {
            hit = d;
            break;
          }
          queue.push(d);
        }
      }
      if (hit) {
        const chain: string[] = [];
        for (let c: string | null = hit; c; c = parent.get(c) ?? null) chain.unshift(c === '@prisma/client' ? c : rel(c));
        chains.push(chain.join(' -> '));
      }
    }
    expect(chains).toEqual([]);
  });
});
