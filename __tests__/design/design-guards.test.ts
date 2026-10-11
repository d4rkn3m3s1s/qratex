/**
 * QDL yapı korkulukları — tasarım raporundaki (docs/audit/2026-10-08/sistem/tasarim-sistemi.md)
 * kapanan bulguların geri gelmesini CI'da düşürür. Sayımlar `lib/design-system/drift-scan`
 * ile aynı birimlerdir; eşikler YALNIZ AŞAĞI çekilir (cırcır).
 */
/** @jest-environment node */
import fs from 'fs';
import path from 'path';
import { scanDrift } from '@/lib/design-system/drift-scan';

const ROOT = path.resolve(__dirname, '../..');

function listFiles(dir: string, out: string[] = []): string[] {
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const e of entries) {
    if (e.name === 'node_modules' || e.name.startsWith('.')) continue;
    const full = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (e.name === 'lab' && path.basename(dir) === 'app') continue; // izlenmeyen deneme dizini
      listFiles(full, out);
    } else if (/\.(tsx?|css)$/.test(e.name)) out.push(full);
  }
  return out;
}

const FILES = ['app', 'components', 'lib', 'hooks'].flatMap((d) => listFiles(path.join(ROOT, d)));
const rel = (f: string) => path.relative(ROOT, f).split(path.sep).join('/');
const SRC = FILES.map((f) => ({ file: rel(f), code: fs.readFileSync(f, 'utf8') }));
const stripComments = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/.*$/gm, '$1');

function offenders(re: RegExp, allow: readonly string[] = [], onlyTsx = true): string[] {
  return SRC.filter(({ file }) => (!onlyTsx || /\.tsx?$/.test(file)) && !allow.some((a) => file.startsWith(a)))
    .filter(({ code }) => re.test(stripComments(code)))
    .map(({ file }) => file);
}

describe('kaldırılan eski tasarım katmanları geri gelmez', () => {
  it('eski başlık/kahraman, panel yüzeyi, HyperText, rakip tema kancası içe aktarılmaz (Y6, O5, Y1)', () => {
    const re =
      /from ['"]@\/(components\/admin\/admin-premium-hero|components\/layout\/dashboard-page-hero|components\/dashboard\/page-header|components\/dashboard\/page-heading|components\/team\/team-board|components\/ui\/empty-state|lib\/panel-surface|lib\/panel-hero-gradients|components\/ui\/hyper-text|hooks\/use-theme-colors|components\/dashboard\/stats-card)['"]/;
    expect(offenders(re)).toEqual([]);
  });

  it('tema html/body üzerine satır içi değişken olarak yazılmaz (tek yazar: lib/design-system/theme-runtime)', () => {
    expect(offenders(/style\.setProperty\(\s*['"`]--(primary|background|card|foreground|ring)['"`]/)).toEqual([]);
  });

  it('framer-motion tam `motion` içe aktarılmaz (global LazyMotion için `m as Motion`) (O2)', () => {
    expect(offenders(/import\s*\{[^}]*\bmotion\b(?!\s*as)[^}]*\}\s*from\s*['"]framer-motion['"]/)).toEqual([]);
  });

  it('globals.css sınıf adına göre !important yaması içermez (O3 güvenlik ağı)', () => {
    const css = fs.readFileSync(path.join(ROOT, 'app/globals.css'), 'utf8');
    expect(css).not.toMatch(/\[class\*=/);
  });
});

describe('katman ve tipografi kuralları', () => {
  it('sayfa üstü katmanda keyfi z-[N≥10] yok — z-overlay/floating/modal/toast/popover/skip (D3)', () => {
    expect(offenders(/\bz-\[(?:[1-9]\d+)\]/)).toEqual([]);
    const tw = fs.readFileSync(path.join(ROOT, 'tailwind.config.ts'), 'utf8');
    expect(tw).not.toMatch(/safelist/);
  });

  it('yıkıcı işlem onayı native confirm() değil ConfirmAction (O3)', () => {
    // Tek istisna: kaydedilmemiş değişiklikte sayfadan ayrılma koruması (senkron yönlendirme kesmesi).
    const allow = ['components/admin/a-kesif-bagis/discovery/discovery-center.tsx'];
    expect(offenders(/(^|[^\w.])(window\.)?confirm\(\s*['"`]/m, allow)).toEqual([]);
  });
});

describe('uyum (drift) cırcırı', () => {
  const report = scanDrift(ROOT);

  it('panel sayfaları (admin/bayi/müşteri/personel) ham palet, sabit hex ve < 12px metinden arınmış kalır', () => {
    for (const a of report.areas.filter((x) => ['admin', 'dealer', 'customer', 'staff'].includes(x.area))) {
      expect([a.area, a.palette, a.hex, a.tinyText]).toEqual([a.area, 0, 0, 0]);
    }
  });

  it('ham palet ve < 12px metin toplamı eşiği aşmaz (yalnız aşağı çekilir)', () => {
    // 2026-10-11 ölçümü (yalnız components/ altında: oyun, kimlik çerçeveleri, asistan). Sabit hex
    // cırcıra dahil DEĞİL: oyun/canvas/3B sahneler ve e-posta/OG görselleri hex'i meşru kullanır.
    const MAX = { palette: 121, tinyText: 120 };
    expect(report.totals.palette).toBeLessThanOrEqual(MAX.palette);
    expect(report.totals.tinyText).toBeLessThanOrEqual(MAX.tinyText);
  });
});
