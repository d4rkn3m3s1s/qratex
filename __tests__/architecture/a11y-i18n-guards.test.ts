/**
 * Mobil · erişilebilirlik · i18n korkulukları (docs/audit/2026-10-08/sistem/mobil-erisilebilirlik-i18n.md).
 *
 * Dalgalarda kapatılan bulguların geri gelmesini CI'da yakalar:
 *  - B1: kabuk/primitive ve müşterinin ilk temas yüzeylerinde JSX'e gömülü Türkçe metin yok
 *        (görünür metin, aria-label/title/placeholder/alt, toast). Çeviri modül sözlüğünden
 *        (`{ tr, en }` / copy.ts) ya da katalogdan gelir — sözlük satırları serbest.
 *  - B7: framer'ın yalnız-OS `useReducedMotion`'ı kullanılmaz (tek politika: lib/motion).
 *  - B8: hover ile AÇILAN kontrol yok (dokunmatikte görünmez; Tailwind hoverOnlyWhenSupported açık).
 *  - B10: PWA manifesti yön kilitlemez, rol yönlendiricisinden açılır.
 *  - B11: bu yüzeylerde sabit 'tr-TR' sayı/tarih biçimi yok (useFormatters / getFormatters).
 *  - B2: segment layout'ları sunucu dil sınırından geçer; dilin tek yazarı sağlayıcı.
 */
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.join(__dirname, '..', '..');
const TR = /[çğışöüÇĞİŞÖÜ]/;

/** Türkçe metnin JSX'e gömülemeyeceği yüzeyler (kabuk + primitive + müşteri giriş yüzeyleri). */
const FROZEN_SCOPE = [
  'components/ui',
  'components/ds',
  'components/layout',
  'components/dashboard',
  'components/moments',
  'components/chat',
  'components/onboarding',
  'components/customer/welcome-video-modal.tsx',
  'components/customer/customer-birthday-bonus-host.tsx',
  'components/customer/m-ayarlar',
  'components/customer/m-tara',
  'components/customer/m-cuzdan-kart',
  'components/customer/m-cuzdan-oduller',
  'components/customer/m-cuzdan-hareketler',
  'components/customer/m-oyna-merkez',
  'components/customer/p-qr-geri-bildirim',
  'app/(funnel)',
  'app/(auth)',
  'app/c',
  'app/customer',
  'app/not-found.tsx',
];

/**
 * Bilinçli istisnalar (gerekçeli): oyunların içerik metni Türkçe (Türkçe kelime oyunu, Türkçe bilgi
 * yarışması, Türkçe sahte yorum havuzu) — oyun kabuğu dahil ayrı i18n turu; rapor 'Uygulama sonrası
 * durum' KALDI maddesi.
 */
const EXCLUDE = [/^app[\\/]customer[\\/]games[\\/]/];

function walk(rel: string, out: string[] = []): string[] {
  const abs = path.join(ROOT, rel);
  if (!fs.existsSync(abs)) return out;
  const st = fs.statSync(abs);
  if (st.isFile()) {
    if (/\.tsx$/.test(rel)) out.push(rel);
    return out;
  }
  for (const e of fs.readdirSync(abs, { withFileTypes: true })) {
    if (e.name === 'node_modules' || e.name.startsWith('.')) continue;
    walk(path.join(rel, e.name), out);
  }
  return out;
}

function read(rel: string): string {
  return fs.readFileSync(path.join(ROOT, rel), 'utf8');
}

/** Yorumları (blok, satır, JSX yorumu) boşlukla değiştirir; satır numaraları korunur. */
function stripComments(src: string): string {
  return src
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, (m) => m.replace(/[^\n]/g, ' '))
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
    .replace(/(^|[^:'"`\\])\/\/[^\n]*/g, (m, p1: string) => p1 + ' '.repeat(m.length - p1.length));
}

type Hit = { file: string; line: number; text: string };

/** JSX'e gömülü Türkçe: öznitelik değeri, metin düğümü, toast argümanı. */
export function findJsxTurkish(file: string, src: string): Hit[] {
  const hits: Hit[] = [];
  const lines = stripComments(src).split('\n');
  const ATTR = /\b(aria-label|aria-description|title|placeholder|alt|label|description)="([^"]*)"/g;
  const TEXT = />([^<>{}]*)</g;
  const TOAST = /\btoast(?:\.\w+)?\(\s*(['"`])((?:(?!\1).)*)\1/g;
  lines.forEach((line, i) => {
    if (!TR.test(line)) return;
    for (const m of line.matchAll(ATTR)) if (TR.test(m[2])) hits.push({ file, line: i + 1, text: m[0] });
    for (const m of line.matchAll(TOAST)) if (TR.test(m[2])) hits.push({ file, line: i + 1, text: m[0] });
    for (const m of line.matchAll(TEXT)) if (TR.test(m[1]) && !/[=;]/.test(m[1])) hits.push({ file, line: i + 1, text: m[0] });
    // Çok satırlı JSX metni: satırın tamamı düz metin (etiket/ifade/dize/sözdizimi yok).
    const t = line.trim();
    if (TR.test(t) && /^[A-Za-zÇĞİÖŞÜçğıöşü0-9][^<>{}=;:'"`()[\]]*$/.test(t) && !/^(import|export|const|let|return|type|interface)\b/.test(t)) {
      hits.push({ file, line: i + 1, text: t });
    }
  });
  return hits;
}

describe('a11y/i18n korkulukları', () => {
  const files = FROZEN_SCOPE.flatMap((p) => walk(p)).filter((f) => !EXCLUDE.some((re) => re.test(f)));

  it('kapsam dosyaları bulunuyor', () => {
    expect(files.length).toBeGreaterThan(80);
  });

  it('B1: kabuk ve müşteri giriş yüzeylerinde JSX içine gömülü Türkçe metin yok', () => {
    const hits = files.flatMap((f) => findJsxTurkish(f, read(f)));
    if (hits.length) {
      throw new Error(
        `Sabit Türkçe metin (modül sözlüğüne { tr, en } ya da katalog anahtarına taşıyın):\n` +
          hits.map((h) => `  ${h.file}:${h.line}  ${h.text}`).join('\n'),
      );
    }
  });

  it('B1: dedektör gerçek ihlali yakalar, sözlük satırını yakalamaz', () => {
    expect(findJsxTurkish('x.tsx', '<Button aria-label="Kapat ve çık" />')).toHaveLength(1);
    expect(findJsxTurkish('x.tsx', '<p>Hoş geldin</p>')).toHaveLength(1);
    expect(findJsxTurkish('x.tsx', "toast.error('Bağlantı kurulamadı');")).toHaveLength(1);
    expect(findJsxTurkish('x.tsx', '        Seviye atladın!')).toHaveLength(1);
    expect(findJsxTurkish('x.tsx', "  tr: { close: 'Kapat', title: 'Hoş geldin' },")).toHaveLength(0);
    expect(findJsxTurkish('x.tsx', "  // Türkçe yorum serbest")).toHaveLength(0);
    expect(findJsxTurkish('x.tsx', '<p>{copy.title}</p>')).toHaveLength(0);
  });

  it('B11: kapsam yüzeylerinde sabit tr-TR sayı/tarih biçimi yok (useFormatters)', () => {
    const offenders = files.filter((f) => {
      const src = stripComments(read(f));
      return /toLocaleString\(\s*['"]tr-TR['"]|NumberFormat\(\s*['"]tr-TR['"]|DateTimeFormat\(\s*['"]tr-TR['"]|toLocaleString\(\s*\)/.test(src);
    });
    expect(offenders).toEqual([]);
  });

  it("B7: framer'ın yalnız-OS useReducedMotion'ı kullanılmaz (lib/motion tek politika)", () => {
    const all = ['app', 'components', 'lib'].flatMap((p) => walk(p));
    const offenders = all.filter((f) => /import\s*\{[^}]*\buseReducedMotion\b[^}]*\}\s*from\s*'framer-motion'/.test(read(f)));
    expect(offenders).toEqual([]);
  });

  it('B8: hover ile açılan kontrol yok (dokunmatik/klavye eşi olmadan opacity-0 → group-hover)', () => {
    const all = ['app', 'components'].flatMap((p) => walk(p));
    const offenders: string[] = [];
    for (const f of all) {
      const src = read(f);
      for (const m of src.matchAll(/(["'`])([^"'`]*\bopacity-0\b[^"'`]*\bgroup-hover:opacity-100\b[^"'`]*)\1/g)) {
        const cls = m[2];
        if (!/focus-within|focus-visible|focus:|hover:hover|pointer:fine/.test(cls)) offenders.push(`${f}: ${cls}`);
      }
    }
    expect(offenders).toEqual([]);
    expect(read('tailwind.config.ts')).toMatch(/hoverOnlyWhenSupported:\s*true/);
  });

  it('B3: form kontrollerinin sınırı ≥ 3:1 token (border-strong; eski --border/80 açıkta ≈1,5:1, koyu white/25 ≈2:1)', () => {
    for (const f of ['components/ui/input.tsx', 'components/ui/textarea.tsx', 'components/ui/select.tsx']) {
      const src = read(f);
      expect(`${f}: ${/\bborder-strong\b/.test(src)}`).toBe(`${f}: true`);
      expect(`${f}: ${/dark:border-white\/25/.test(src)}`).toBe(`${f}: false`);
    }
  });

  it('B10: PWA manifesti yön kilitlemez ve rol yönlendiricisinden açılır', () => {
    const manifest = JSON.parse(read('public/manifest.json')) as Record<string, unknown>;
    expect(manifest.orientation === undefined || manifest.orientation === 'any').toBe(true);
    expect(String(manifest.start_url)).toMatch(/^\/app(\?|$)/);
    // Kurulu uygulamaların kimliği korunur (id değişirse tarayıcı ayrı uygulama sayar).
    expect(manifest.id).toBe('/');
    expect(fs.existsSync(path.join(ROOT, 'app', 'app', 'route.ts'))).toBe(true);
  });

  it('B2: panel/genel/giriş/huni layout’ları sunucu dil sınırından geçer', () => {
    for (const layout of [
      'app/customer/layout.tsx',
      'app/dealer/layout.tsx',
      'app/admin/layout.tsx',
      'app/staff/layout.tsx',
      'app/(public)/layout.tsx',
      'app/(auth)/auth/layout.tsx',
      'app/(paylasim)/layout.tsx',
      'app/(funnel)/layout.tsx',
      'app/c/layout.tsx',
    ]) {
      expect(`${layout}: ${/<ServerLocaleBoundary>/.test(read(layout))}`).toBe(`${layout}: true`);
    }
    // Kök layout statik kalır (çerez okumaz) ama ilk boyamadan önce <html lang>'i çerezden düzeltir.
    const root = read('app/layout.tsx');
    expect(root).toMatch(/LOCALE_LANG_INIT_SNIPPET/);
    expect(root).not.toMatch(/getServerLocale\(/);
  });

  it('B2: dil kalıcılığı tek yazarda — dil seçiciler profili kendileri PATCH etmez', () => {
    const switcher = stripComments(read('components/layout/language-switcher.tsx'));
    expect(switcher).not.toMatch(/\/api\/user\/profile/);
    expect(read('lib/app-locale.tsx')).toMatch(/\/api\/user\/profile/);
  });
});
