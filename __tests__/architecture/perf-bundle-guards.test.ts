/**
 * Performans korkulukları (docs/audit/2026-10-08/sistem/performans.md — K1/K2/Y1/Y2/O7).
 *
 * Bu turda kapatılan paket/varlık şişkinliklerinin geri gelmesini CI'da yakalar:
 *  1. İstemci modülü iki dilin tam sözlüğünü (`@/i18n/request`, `messages/en.json`) statik
 *     içe aktaramaz — kök sağlayıcı üzerinden HER sayfanın ortak paketine girer (Y1).
 *  2. Ağır kütüphaneyi (recharts, three, leaflet, jszip, qrcode, canvas-confetti, html5-qrcode,
 *     tesseract) statik içe aktaran bir modül, başka bir istemci modülünden STATİK içe
 *     aktarılamaz; yalnız `dynamic()` / `lazyChart()` / `import()` ile (ya da sunucu tarafından)
 *     yüklenir (O7).
 *  3. `framer-motion`'dan tam `motion` bileşeni içe aktarılmaz; global `LazyMotion` ile `m` kullanılır.
 *  4. Arka plan varyantları tek tek tembel yüklenir (Y2): `dynamic-background` varyant modüllerini
 *     statik içe aktarmaz.
 *  5. `public/` görsel bütçesi: yeni ağır görsel eklenemez (K2); bilinçli istisnalar gerekçeli.
 */
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const SCAN_DIRS = ['app', 'components', 'lib', 'hooks', 'i18n'];
const EXTS = ['.ts', '.tsx', '.js', '.mjs'];

function walk(dir: string, out: string[] = []): string[] {
  if (!fs.existsSync(dir)) return out;
  for (const name of fs.readdirSync(dir)) {
    const p = path.join(dir, name);
    const st = fs.statSync(p);
    if (st.isDirectory()) {
      if (name === 'node_modules' || name.startsWith('.')) continue;
      walk(p, out);
    } else if (EXTS.includes(path.extname(name)) && !name.endsWith('.d.ts')) {
      out.push(p);
    }
  }
  return out;
}

const rel = (p: string) => path.relative(ROOT, p).replace(/\\/g, '/');
const FILES = SCAN_DIRS.flatMap((d) => walk(path.join(ROOT, d)));
const SRC = new Map(FILES.map((f) => [rel(f), fs.readFileSync(f, 'utf8')]));

const isClient = (src: string) => /^\s*(?:\/\/[^\n]*\n|\/\*[\s\S]*?\*\/\s*)*['"]use client['"]/.test(src);
/** Sunucuda kalan yollar: API uçları, *.server.ts, server/ klasörleri. */
const isServerPath = (file: string) =>
  file.startsWith('app/api/') || /\.server\.(ts|tsx)$/.test(file) || /\/server(\/|\.ts$)/.test(file);

/** Statik (tip olmayan) içe aktarma belirteçleri. `import type` ve `import()` hariç. */
function staticImports(src: string): string[] {
  const out: string[] = [];
  const re = /(?:^|\n)\s*(?:import|export)\s+(?!type\b)([^'";]*?\sfrom\s+)?['"]([^'"]+)['"]/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src))) {
    // `import { type A, type B } from` — yalnız tip belirteçleri: derlemede silinir.
    const braces = /^\s*\{([^}]*)\}\s*from\s+$/.exec(m[1] ?? '');
    const names = braces ? braces[1].split(',').map((x) => x.trim()).filter(Boolean) : [];
    if (names.length > 0 && names.every((x) => x.startsWith('type '))) continue;
    out.push(m[2]);
  }
  return out;
}

function resolveSpec(fromFile: string, spec: string): string | null {
  let base: string;
  if (spec.startsWith('@/')) base = spec.slice(2);
  else if (spec.startsWith('.')) base = path.posix.join(path.posix.dirname(fromFile), spec);
  else return null;
  for (const cand of [base, ...EXTS.map((e) => base + e), ...EXTS.map((e) => `${base}/index${e}`)]) {
    if (SRC.has(cand)) return cand;
  }
  return null;
}

const HEAVY = /^(recharts|three|leaflet|react-leaflet|jszip|qrcode|canvas-confetti|html5-qrcode|tesseract\.js)(\/|$)/;

describe('perf: paket korkulukları', () => {
  it('istemci modülü iki dilin tam sözlüğünü statik içe aktarmaz (Y1)', () => {
    const offenders: string[] = [];
    for (const [file, src] of SRC) {
      if (!isClient(src)) continue;
      for (const spec of staticImports(src)) {
        if (spec === '@/i18n/request' || /messages\/en\.json$/.test(spec)) offenders.push(`${file} → ${spec}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it('ağır kütüphane modülleri istemciden yalnız tembel yüklenir (O7)', () => {
    const heavyModules = new Set<string>();
    for (const [file, src] of SRC) {
      if (staticImports(src).some((s) => HEAVY.test(s))) heavyModules.add(file);
    }
    const offenders: string[] = [];
    for (const [file, src] of SRC) {
      if (isServerPath(file)) continue;
      // Ağır modülün kendi alt parçaları (ör. 3B sahne → GL yardımcıları) zaten aynı tembel parçada.
      if (heavyModules.has(file)) continue;
      for (const spec of staticImports(src)) {
        const target = resolveSpec(file, spec);
        if (target && heavyModules.has(target) && !isServerPath(target)) offenders.push(`${file} → ${target}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it("framer-motion'dan tam `motion` bileşeni içe aktarılmaz (LazyMotion + m)", () => {
    const offenders: string[] = [];
    const re = /import\s*\{([^}]*)\}\s*from\s*['"]framer-motion['"]/g;
    for (const [file, src] of SRC) {
      let m: RegExpExecArray | null;
      while ((m = re.exec(src))) {
        if (m[1].split(',').some((part) => part.trim() === 'motion' || part.trim().startsWith('motion '))) offenders.push(file);
      }
    }
    expect(offenders).toEqual([]);
  });

  it('arka plan varyantları tek tek tembel yüklenir (Y2)', () => {
    const src = SRC.get('components/ui/backgrounds/dynamic-background.tsx') ?? '';
    const variantStatic = staticImports(src).filter((s) => s.startsWith('./'));
    expect(variantStatic).toEqual([]);
  });
});

describe('perf: public/ görsel bütçesi (K2)', () => {
  const BUDGET_BYTES = 300 * 1024;
  /**
   * Bilinçli istisnalar. Rozet SVG'leri gerçek vektör kaynaktır (DB'de kimlik; büyük detay
   * görünümü); ızgara/liste her yerde `resolveBadgeThumb` ile 320 px WebP gösterir.
   * `logo/chatbot.png` eski yol için durur; arayüz `logo/chatbot-mascot.webp` kullanır.
   * Karşılama videosu yalnız ilk girişte, kullanıcı açınca oynar.
   */
  const ALLOW = [
    /^images\/badges\/[^/]+\.svg$/,
    /^images\/uploads\//,
    /^logo\/chatbot\.png$/,
    /^videos\/welcome-customer\.mp4$/,
  ];

  it('izin listesi dışındaki her public dosyası ≤ 300 KB', () => {
    const pub = path.join(ROOT, 'public');
    const offenders: string[] = [];
    const visit = (dir: string) => {
      for (const name of fs.readdirSync(dir)) {
        const p = path.join(dir, name);
        const st = fs.statSync(p);
        if (st.isDirectory()) visit(p);
        else {
          const r = path.relative(pub, p).replace(/\\/g, '/');
          if (st.size > BUDGET_BYTES && !ALLOW.some((re) => re.test(r))) offenders.push(`${r} (${Math.round(st.size / 1024)} KB)`);
        }
      }
    };
    visit(pub);
    expect(offenders).toEqual([]);
  });

  it('arayüz 1,6 MB\'lık sohbet maskotu PNG\'sini kullanmaz', () => {
    const offenders = [...SRC].filter(([, src]) => src.includes('/logo/chatbot.png')).map(([f]) => f);
    expect(offenders).toEqual([]);
  });
});
