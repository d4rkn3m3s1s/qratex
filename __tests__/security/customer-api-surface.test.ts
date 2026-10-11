/**
 * Müşteri tarafı API yüzeyi — yapı (statik) denetimi (guvenlik-musteri-api, 2026-10-08 raporu).
 *
 * Kapsam: app/api/{customer,gamification,feedbacks,public,surveys}/** route dosyaları.
 * Raporun kapattığı açık sınıflarının GERİ DÖNMESİNİ engeller:
 *  - O3: çıplak `getServerSession` (askı/oturum sürümü/güncel rol/token replay atlanıyordu).
 *  - K2: rol listesiz `requireAuth()` (bilinmeyen/yeni rol varsayılan olarak geçiyordu).
 *  - O2: oran sınırsız uç (e-posta bombalama, kazıma, ekonomi spam'i).
 *  - D1: şemasız `req.json()` gövdesi.
 *  - Y3: `?userId=` ile başkasının profili (yalnız `resolveSubjectUserId` ile: me / ADMIN).
 *  - K1: hak-ediş kontrolsüz rozet basan `POST /api/gamification/progress` geri gelmesin.
 * Yorumlar taranmaz (kod içi açıklamalar eski deseni anlatabilir).
 */
import fs from 'fs';
import path from 'path';

const ROOT = path.join(__dirname, '..', '..');
/**
 * Müşteri ad alanları + müşterinin doğrudan çağırdığı paylaşılan uçlar (genel liderlik, VIP,
 * doğum günü, davet, cüzdan kartları, fiziksel kart, ses duvarı, rıza, kampanya push açılışı).
 * Yeni bir müşteri yüzeyi eklenince buraya da eklenir.
 */
const SCOPES = [
  'customer',
  'gamification',
  'feedbacks',
  'public',
  'surveys',
  'leaderboard',
  'vip',
  'birthday',
  'referral',
  'wallet',
  'cards',
  'wall',
  'consent',
  'campaigns',
].map((d) => path.join(ROOT, 'app', 'api', d));

function walk(dir: string, out: string[] = []): string[] {
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(p, out);
    else if (entry.name === 'route.ts') out.push(p);
  }
  return out;
}

/** Blok ve satır yorumlarını atar (URL'lerdeki `//` korunur: önünde `:` olan dokunulmaz). */
function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/.*$/gm, '$1');
}

const files = SCOPES.flatMap((d) => walk(d)).map((file) => ({
  file,
  rel: path.relative(ROOT, file).split(path.sep).join('/'),
  code: stripComments(fs.readFileSync(file, 'utf8')),
}));

const HANDLER_RE = /export\s+(?:async\s+function|const)\s+(GET|POST|PUT|PATCH|DELETE)\b/g;
const RATE_LIMIT_RE =
  /rateLimit\s*:|enforceRouteRateLimit\(|checkRateLimitDb\(|checkPublicActionRateLimit\(|checkAdminRateLimit\(/;

/** Her dışa aktarılan işleyicinin kaynak dilimi (bir sonraki dışa aktarıma kadar). */
function handlerSegments(code: string): Array<{ method: string; segment: string }> {
  const marks: Array<{ index: number; method: string }> = [];
  for (const m of code.matchAll(HANDLER_RE)) marks.push({ index: m.index ?? 0, method: m[1] });
  return marks.map((m, i) => ({
    method: m.method,
    segment: code.slice(m.index, i + 1 < marks.length ? marks[i + 1].index : code.length),
  }));
}

describe('müşteri API yüzeyi (yapı denetimi)', () => {
  it('kapsam boş değil (yol değişirse test sessizce geçmesin)', () => {
    expect(files.length).toBeGreaterThan(100);
  });

  it('çıplak getServerSession yok (requireAuth / getOptionalSession / defineRoute)', () => {
    const offenders = files.filter((f) => /\bgetServerSession\b/.test(f.code)).map((f) => f.rel);
    expect(offenders).toEqual([]);
  });

  it('rol listesiz requireAuth() yok (varsayılan reddet)', () => {
    const offenders = files.filter((f) => /\brequireAuth\(\s*\)/.test(f.code)).map((f) => f.rel);
    expect(offenders).toEqual([]);
  });

  it('her işleyicide oran sınırı var (defineRoute rateLimit ya da paylaşılan sayaç)', () => {
    const offenders: string[] = [];
    for (const f of files) {
      for (const h of handlerSegments(f.code)) {
        if (!RATE_LIMIT_RE.test(h.segment)) offenders.push(`${f.rel} ${h.method}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it('JSON gövde okuyan her dosya şemayla doğrular (zod)', () => {
    const offenders = files
      .filter((f) => /\.json\(\)/.test(f.code))
      .filter((f) => !/safeParse\(|\.parse\(|\bschema\s*:|ZodError/.test(f.code))
      .map((f) => f.rel);
    expect(offenders).toEqual([]);
  });

  it('?userId= yalnız resolveSubjectUserId ile (me / ADMIN), başkasının profili okunamaz', () => {
    const offenders = files
      .filter((f) => /get\(\s*['"]userId['"]\s*\)/.test(f.code))
      .filter((f) => !/resolveSubjectUserId\(/.test(f.code))
      .map((f) => f.rel);
    expect(offenders).toEqual([]);
  });

  it('gamification/progress yalnız okuma (hak-ediş kontrolsüz rozet+puan basan POST geri gelmesin)', () => {
    const progress = files.find((f) => f.rel === 'app/api/gamification/progress/route.ts');
    expect(progress).toBeDefined();
    expect(handlerSegments(progress!.code).map((h) => h.method)).toEqual(['GET']);
  });

  it('kimliksiz ("public") defineRoute yalnız public/ ve bilinçli açık uçlarda', () => {
    const ALLOWED_PUBLIC = new Set([
      'app/api/customer/innovation/ab/event/route.ts',
      'app/api/customer/innovation/ab/variant/route.ts',
      'app/api/surveys/[id]/fill/route.ts',
      // QR'lı fiziksel kartı bulan kişinin sahibine haber vermesi (oturumsuz, IP tavanlı).
      'app/api/cards/[token]/found/route.ts',
      // Ses duvarı paylaşım bağlantısı (token'lı, yalnız yayımlanmış yorumlar).
      'app/api/wall/[token]/route.ts',
      // Çerez/KVKK rıza kaydı (oturum öncesi de verilir).
      'app/api/consent/route.ts',
      // Kampanya push bildirimi açılış izi + yönlendirme.
      'app/api/campaigns/[id]/open/route.ts',
    ]);
    const offenders = files
      .filter((f) => /roles\s*:\s*['"]public['"]/.test(f.code))
      .filter((f) => !f.rel.startsWith('app/api/public/') && !ALLOWED_PUBLIC.has(f.rel))
      .map((f) => f.rel);
    expect(offenders).toEqual([]);
  });
});
