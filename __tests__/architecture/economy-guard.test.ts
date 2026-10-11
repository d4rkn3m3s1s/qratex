/**
 * Ekonomi korkulukları — oyunlaştırma-ekonomi raporu §5.2 / Faz 1.3 ("doğrudan
 * `user.update({ points })` lint ile yasak"). Kapatılan açık sınıflarının GERİ DÖNMESİNİ engeller.
 *
 * Bulgu kökleri: K1 (bayi pasif puanı ham `points: { increment }` ile defter ve fraud
 * görünürlüğü dışında basılıyordu), D1 (admin manuel puanı ham artış, tx'siz), Y4 (puanın
 * kalıcı kaydı yoktu). Bugün HER bakiye değişimi `lib/economy` (mintPoints / adjustPointsByAdmin)
 * ve `lib/points-wallet` (creditPointsAndXp / debitPoints) üzerinden geçer: kilit, tek-kez
 * anahtarı, kategori tavanı, gölge ban kapısı, `PointsLedger` satırı ve `points_credited`.
 *
 * Kurallar (yorumlar taranmaz):
 *  1. `points` / `xp` alanına Prisma atomik işlemi (`{ increment | decrement | multiply | divide }`)
 *     yalnız lib/points-wallet.ts'te.
 *  2. Ham SQL ile bakiye/XP yazımı (`SET "points"`, `"points" = "points" + …`) hiçbir yerde.
 *  3. `creditPointsAndXp` (defter yazmayan düşük seviye primitif) yalnız lib/economy/mint.ts'ten
 *     çağrılır — yeni kod `mintPoints` kullanır (tavan, tek-kez, defter, fraud kapısı).
 *  4. `PointsLedger`'a satır ekleme/silme yalnız lib/economy ve lib/points-wallet'tan; durum
 *     güncellemesi (`reversed` işareti) gerekçeli istisna listesiyle.
 */
import fs from 'fs';
import path from 'path';

const ROOT = path.join(__dirname, '..', '..');
const SCAN_DIRS = ['app', 'lib', 'components', 'hooks', 'scripts'].map((d) => path.join(ROOT, d));

function walk(dir: string, out: string[] = []): string[] {
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (['node_modules', '.next', '.git', '.wf-tmp', '__tests__', 'generated-prisma-client'].includes(entry.name)) continue;
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(p, out);
    else if (/\.(ts|tsx|js|mjs|cjs)$/.test(entry.name)) out.push(p);
  }
  return out;
}

function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/.*$/gm, '$1');
}

const rel = (file: string) => path.relative(ROOT, file).split(path.sep).join('/');

const files = SCAN_DIRS.flatMap((d) => walk(d)).map((file) => ({
  rel: rel(file),
  code: stripComments(fs.readFileSync(file, 'utf8')),
}));

function offenders(re: RegExp, allow: ReadonlySet<string>): string[] {
  return files.filter((f) => !allow.has(f.rel) && re.test(f.code)).map((f) => f.rel);
}

describe('ekonomi korkulukları', () => {
  it('taranan dosya kümesi boş değil (yol kayması testi sessizce geçirmesin)', () => {
    expect(files.some((f) => f.rel === 'lib/economy/mint.ts')).toBe(true);
    expect(files.some((f) => f.rel === 'lib/points-wallet.ts')).toBe(true);
  });

  it('points/xp atomik artış-azalış yalnız lib/points-wallet.ts içinde', () => {
    const re = /\b(points|xp)\s*:\s*\{\s*(increment|decrement|multiply|divide)\s*:/;
    expect(offenders(re, new Set(['lib/points-wallet.ts']))).toEqual([]);
  });

  it('ham SQL ile bakiye/XP yazımı yok', () => {
    const re = /SET\s+"(points|xp)"\s*=|"(points|xp)"\s*=\s*"(points|xp)"\s*[+-]/i;
    expect(offenders(re, new Set())).toEqual([]);
  });

  it('creditPointsAndXp yalnız mintPoints içinden çağrılır', () => {
    const re = /\bcreditPointsAndXp\s*\(/;
    expect(offenders(re, new Set(['lib/economy/mint.ts', 'lib/points-wallet.ts']))).toEqual([]);
  });

  it('PointsLedger satırı yalnız ekonomi çekirdeğinden eklenir/silinir', () => {
    const re = /\.pointsLedger\.(create|createMany|upsert|delete|deleteMany)\s*\(/;
    expect(offenders(re, new Set(['lib/economy/mint.ts', 'lib/points-wallet.ts']))).toEqual([]);
  });

  it('PointsLedger durum güncellemesi yalnız gerekçeli istisnalarda', () => {
    // Kasa geri alma: ters kaydı (`reversal`) yazdıktan sonra asıl satırı `reversed` işaretler.
    const STATUS_ONLY = new Set(['lib/dealer/kasa/server.ts']);
    const re = /\.pointsLedger\.(update|updateMany)\s*\(/;
    expect(offenders(re, STATUS_ONLY)).toEqual([]);
  });
});
