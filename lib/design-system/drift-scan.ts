/**
 * Tasarım uyum (drift) taraması — saf + Node fs (yalnız Jest üreticisi çağırır; çalışma
 * zamanında DOSYA OKUNMAZ, sayfa `lib/data/design-drift.json` anlık görüntüsünü içe aktarır).
 *
 * Yeniden üretmek için:
 *   UPDATE_DESIGN_DRIFT=1 npx jest __tests__/admin/a-tasarim-sistemi/drift.test.ts
 *
 * Ölçülen ihlaller (QDL v2 "Yap / Yapma" kuralları):
 *  - hex: sınıf/stil içinde sabit `#rrggbb` (token yerine)
 *  - palette: ham Tailwind palet sınıfı (`text-red-500`, `bg-violet-600` … rol token'ı yerine)
 *  - tinyText: bilgi metni < 12px (`text-[9px]`, `text-[10px]`, `text-[11px]`)
 * Kaba bir sezgiseldir: 3B shader renkleri, e-posta şablonları gibi meşru istisnalar dosyaya
 * `design-drift-ignore` yorumu eklenerek dışarıda bırakılır.
 */
import fs from 'fs';
import path from 'path';

export type DriftCounts = { hex: number; palette: number; tinyText: number };
export type DriftArea = 'admin' | 'dealer' | 'customer' | 'staff' | 'public' | 'components';

export type DriftReport = {
  generatedAt: string;
  totals: DriftCounts & { files: number; clean: number };
  areas: Array<DriftCounts & { area: DriftArea; files: number; clean: number }>;
  top: Array<DriftCounts & { file: string; total: number }>;
};

const PALETTE =
  'red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose';
const PALETTE_RE = new RegExp(
  `(?:^|[\\s"'\`:])(?:[a-z-]+:)*(?:text|bg|border|from|via|to|ring|fill|stroke|outline|decoration|divide|shadow)-(?:${PALETTE})-(?:50|100|200|300|400|500|600|700|800|900|950)(?:\\/\\d+)?(?=[\\s"'\`]|$)`,
  'gm'
);
const HEX_RE = /['"`(\s:]#(?:[0-9a-fA-F]{6}|[0-9a-fA-F]{3})(?![0-9a-zA-Z])/g;
const TINY_RE = /text-\[(?:8|9|10|11)px\]/g;

/** Yorum satırlarını atar (// … ve /* … *\/ blokları kaba biçimde). */
function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
}

export function countDrift(src: string): DriftCounts {
  const code = stripComments(src);
  return {
    hex: (code.match(HEX_RE) ?? []).length,
    palette: (code.match(PALETTE_RE) ?? []).length,
    tinyText: (code.match(TINY_RE) ?? []).length,
  };
}

export function areaOf(rel: string): DriftArea {
  const p = rel.replace(/\\/g, '/');
  if (p.startsWith('app/admin/')) return 'admin';
  if (p.startsWith('app/dealer/')) return 'dealer';
  if (p.startsWith('app/customer/')) return 'customer';
  if (p.startsWith('app/staff/')) return 'staff';
  if (p.startsWith('components/')) return 'components';
  return 'public';
}

function walk(dir: string, out: string[]) {
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const e of entries) {
    if (e.name === 'node_modules' || e.name.startsWith('.')) continue;
    const full = path.join(dir, e.name);
    if (e.isDirectory()) walk(full, out);
    else if (e.name.endsWith('.tsx')) out.push(full);
  }
}

export function scanDrift(root: string, now: Date = new Date()): DriftReport {
  const files: string[] = [];
  walk(path.join(root, 'app'), files);
  walk(path.join(root, 'components'), files);
  const areas = new Map<DriftArea, DriftCounts & { files: number; clean: number }>();
  const perFile: Array<DriftCounts & { file: string; total: number }> = [];
  for (const full of files) {
    const rel = path.relative(root, full).replace(/\\/g, '/');
    const src = fs.readFileSync(full, 'utf8');
    if (src.includes('design-drift-ignore')) continue;
    const c = countDrift(src);
    const total = c.hex + c.palette + c.tinyText;
    const area = areaOf(rel);
    const a = areas.get(area) ?? { hex: 0, palette: 0, tinyText: 0, files: 0, clean: 0 };
    a.files += 1;
    a.clean += total === 0 ? 1 : 0;
    a.hex += c.hex;
    a.palette += c.palette;
    a.tinyText += c.tinyText;
    areas.set(area, a);
    if (total > 0) perFile.push({ file: rel, ...c, total });
  }
  const order: DriftArea[] = ['admin', 'dealer', 'customer', 'staff', 'public', 'components'];
  const areaList = order.filter((k) => areas.has(k)).map((k) => ({ area: k, ...areas.get(k)! }));
  const totals = areaList.reduce(
    (acc, a) => ({
      files: acc.files + a.files,
      clean: acc.clean + a.clean,
      hex: acc.hex + a.hex,
      palette: acc.palette + a.palette,
      tinyText: acc.tinyText + a.tinyText,
    }),
    { files: 0, clean: 0, hex: 0, palette: 0, tinyText: 0 }
  );
  perFile.sort((a, b) => b.total - a.total || a.file.localeCompare(b.file));
  return { generatedAt: now.toISOString(), totals, areas: areaList, top: perFile.slice(0, 25) };
}
