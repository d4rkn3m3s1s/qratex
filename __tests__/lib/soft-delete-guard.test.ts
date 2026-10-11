/**
 * Veri modeli B5 — soft-delete bekçisi (kaynak tarama, DB YOK).
 *
 * `Feedback.deletedAt` ve `ConsumptionReview.deletedAt` yöneticinin moderasyonla kaldırdığı
 * (toksik/sahte) yorumları işaretler. Prisma'da varsayılan filtre yok; filtre her sorguda elle
 * yazılmak zorunda. Denetimde ~45 okuma yolu filtresizdi: silinen yorum müşteri istatistiğine,
 * liderlik tablosuna, rozet/görev sayaçlarına, personel puanına, keşif sıralamasına, partner
 * özetine ve AI bağlamına girmeye devam ediyordu (aynı bayi iki ekranda iki ortalama).
 *
 * Kural (yeni kodu da kapsar):
 *  1. `.feedback.*` / `.consumptionReview.*` okuma çağrısında `where` NESNE OLARAK yazılmışsa
 *     (değişken/yardımcı değil) `deletedAt` içermeli; bilinçli istisna `soft-delete:` gerekçe
 *     yorumu taşır (KVKK dışa aktarım, kötüye kullanım bekleme süresi, silme önizlemesi …).
 *  2. İlişki sayımı `_count: { select: { feedbacks: true } }` yasak →
 *     `feedbacks: { where: { deletedAt: null } }`.
 *  3. Ham SQL şablonu "Feedback"/"ConsumptionReview" okuyorsa `deletedAt` içermeli (ya da
 *     aşağıdaki gerekçeli dosya istisnası).
 */
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(__dirname, '..', '..');
const DIRS = ['app', 'lib', 'components'];

function walk(dir: string, out: string[]): void {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (e.name === 'node_modules' || e.name === '__tests__') continue;
      walk(p, out);
    } else if (/\.(ts|tsx)$/.test(e.name) && !/\.test\./.test(e.name)) {
      out.push(p);
    }
  }
}

const FILES: Array<{ rel: string; src: string }> = (() => {
  const out: string[] = [];
  for (const d of DIRS) walk(path.join(ROOT, d), out);
  return out.map((abs) => ({ rel: path.relative(ROOT, abs).split(path.sep).join('/'), src: fs.readFileSync(abs, 'utf8') }));
})();

function lineOf(src: string, index: number): number {
  return src.slice(0, index).split('\n').length;
}

/** `(` sonrasından eşleşen `)`'ye kadar argüman metni. */
function callArg(src: string, start: number): string {
  let i = start;
  let depth = 1;
  while (i < src.length && depth > 0) {
    const c = src[i];
    if (c === '(') depth++;
    else if (c === ')') depth--;
    i++;
  }
  return src.slice(start, i - 1);
}

describe('soft-delete bekçisi (Feedback / ConsumptionReview)', () => {
  it('nesne olarak yazılmış where içeren her okuma deletedAt filtresi ya da gerekçe taşır', () => {
    const re = /\.(feedback|consumptionReview)\.(findMany|findFirst|findFirstOrThrow|count|aggregate|groupBy)\(/g;
    const offenders: string[] = [];
    for (const { rel, src } of FILES) {
      re.lastIndex = 0;
      let m: RegExpExecArray | null;
      while ((m = re.exec(src))) {
        const arg = callArg(src, m.index + m[0].length);
        if (/deletedAt|soft-delete:/.test(arg)) continue;
        const where = /where\s*:\s*([\s\S])/.exec(arg);
        // `where` bir değişken/yardımcıysa (`{ where }`, fbBase(), liveWhere(), qrWhere …) filtre orada kurulur.
        if (!where && /\bwhere\b/.test(arg)) continue;
        if (where && where[1] !== '{') continue;
        // Yayılımlı/AND'li nesneler genelde yardımcıdan gelen tabanı taşır; onları da geç.
        if (where && /\.\.\.|AND\s*:/.test(arg)) continue;
        offenders.push(`${rel}:${lineOf(src, m.index)} ${arg.replace(/\s+/g, ' ').slice(0, 100)}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it('ilişki sayımı silinmiş yorumları saymaz (_count feedbacks: true yok)', () => {
    const offenders: string[] = [];
    for (const { rel, src } of FILES) {
      const re = /_count\s*:\s*\{\s*select\s*:\s*\{[^}]*\bfeedbacks\s*:\s*true/g;
      let m: RegExpExecArray | null;
      while ((m = re.exec(src))) offenders.push(`${rel}:${lineOf(src, m.index)}`);
    }
    expect(offenders).toEqual([]);
  });

  it('ham SQL "Feedback"/"ConsumptionReview" okumaları deletedAt ile süzülür', () => {
    /** Gerekçeli dosya istisnaları. */
    const ALLOW: Record<string, string> = {
      // Pencere yardımcısı IN_WINDOW `f."deletedAt" IS NULL` içerir (`${win}` ile enjekte).
      'lib/admin-ai-ops/server.ts': 'IN_WINDOW yardımcısı',
      // AI KULLANIM sayacı: silinmiş yorum da analiz edildi ve kota tüketti → dahil olmalı.
      'app/api/dealer/ai-settings/route.ts': 'AI kullanım sayacı',
      // "İlk içgörü anı" tarihsel bir olaydır; yorumun sonradan kaldırılması anı değiştirmez.
      'lib/install-to-value.ts': 'ilk içgörü anı',
    };
    const offenders: string[] = [];
    for (const { rel, src } of FILES) {
      if (ALLOW[rel] || !/"(Feedback|ConsumptionReview)"/.test(src)) continue;
      for (let i = 0; i < src.length; i++) {
        if (src[i] !== '`') continue;
        let j = i + 1;
        let depth = 0;
        while (j < src.length) {
          if (src[j] === '\\') { j += 2; continue; }
          if (depth === 0 && src[j] === '`') break;
          if (src[j] === '$' && src[j + 1] === '{') { depth++; j += 2; continue; }
          if (depth > 0 && src[j] === '}') depth--;
          j++;
        }
        const tpl = src.slice(i, j + 1);
        if (/(FROM|JOIN)\s+"(Feedback|ConsumptionReview)"/.test(tpl) && !/deletedAt/.test(tpl)) {
          offenders.push(`${rel}:${lineOf(src, i)}`);
        }
        i = j;
      }
    }
    expect(offenders).toEqual([]);
  });
});
