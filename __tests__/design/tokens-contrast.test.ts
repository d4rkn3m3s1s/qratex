/**
 * QDL token kontrast sözleşmesi — app/globals.css'teki gerçek değerler üzerinden.
 * Her tema kombinasyonu: açık/koyu × normal / renk körü / yüksek kontrast.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { extractVarsForSelector, layerVars, resolveVar, type VarMap } from '@/lib/design/css-tokens';
import { contrastRatio } from '@/lib/design/contrast';
import { contrastContract } from '@/lib/design/tokens';

const css = readFileSync(path.join(__dirname, '..', '..', 'app', 'globals.css'), 'utf8');

const root = extractVarsForSelector(css, ':root');
const dark = extractVarsForSelector(css, '.dark:not(body)');
const cb = extractVarsForSelector(css, 'html:root.colorblind');
const cbDark = extractVarsForSelector(css, 'html:root.colorblind.dark');
const hc = extractVarsForSelector(css, 'html:root.high-contrast');
const hcDark = extractVarsForSelector(css, 'html:root.dark.high-contrast');

const themes: Record<string, VarMap> = {
  'açık': root,
  'koyu': layerVars(root, dark),
  'açık + renk körü': layerVars(root, cb),
  'koyu + renk körü': layerVars(root, dark, cb, cbDark),
  'açık + yüksek kontrast': layerVars(root, hc),
  'koyu + yüksek kontrast': layerVars(root, dark, hc, hcDark),
};

describe('QDL token kontrastı (WCAG 2.2 AA)', () => {
  it('ayrıştırıcı temel token bloklarını buluyor', () => {
    expect(root.background).toBeTruthy();
    expect(dark.background).toBeTruthy();
    expect(root['surface-1']).toBe('var(--card)');
    expect(cb['danger-text']).toBeTruthy();
    expect(hc['danger-text']).toBeTruthy();
  });

  for (const [themeName, vars] of Object.entries(themes)) {
    describe(themeName, () => {
      for (const pair of contrastContract()) {
        it(`${pair.fg} / ${pair.bg} ≥ ${pair.min}:1 (${pair.why})`, () => {
          const fg = resolveVar(vars, pair.fg);
          const bg = resolveVar(vars, pair.bg);
          expect(fg).toBeTruthy();
          expect(bg).toBeTruthy();
          const ratio = contrastRatio(fg as string, bg as string);
          if (!(ratio >= pair.min)) {
            throw new Error(`${themeName}: ${pair.fg} (${fg}) / ${pair.bg} (${bg}) = ${ratio.toFixed(2)}:1 < ${pair.min}:1`);
          }
        });
      }
    });
  }

  it('P0-38: koyu temada text-destructive (danger-text) koyu zeminde ≥ 4,5:1', () => {
    const vars = themes['koyu'];
    expect(contrastRatio(resolveVar(vars, 'danger-text')!, resolveVar(vars, 'background')!)).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(resolveVar(vars, 'danger-text')!, resolveVar(vars, 'card')!)).toBeGreaterThanOrEqual(4.5);
  });

  it('eski shadcn adları rol token\'larına bağlı (geriye uyumluluk)', () => {
    for (const vars of Object.values(themes)) {
      expect(resolveVar(vars, 'destructive')).toBe(resolveVar(vars, 'danger'));
      expect(resolveVar(vars, 'destructive-foreground')).toBe(resolveVar(vars, 'danger-fg'));
      expect(resolveVar(vars, 'success-foreground')).toBe(resolveVar(vars, 'success-fg'));
    }
    // Birincil buton metni (beyaz) marka dolgusu üzerinde AA
    expect(contrastRatio(resolveVar(root, 'primary-foreground')!, resolveVar(root, 'primary')!)).toBeGreaterThanOrEqual(4.5);
  });
});

describe('globals.css ad alanı kuralları', () => {
  it('P0-38: tailwindcss-animate sınıfı `.animate-in` yeniden tanımlanmıyor', () => {
    expect(css).not.toMatch(/^\s*\.animate-in\s*\{/m);
    expect(css).toMatch(/\.qx-enter\s*\{/);
  });

  it('Tailwind/eklenti ile çakışan keyframe adları tanımlanmıyor', () => {
    for (const name of ['fade-in', 'float', 'enter', 'exit']) {
      // String.raw: düz şablon dizesinde `\s` → `s` olur ve test hiçbir şeyi yakalamazdı.
      expect(css).not.toMatch(new RegExp(String.raw`@keyframes\s+${name}\s*\{`));
    }
  });

  it('koyu token bloğu body üzerinde yeniden bildirilmiyor (body.dark erişilebilirlik modlarını ezmesin)', () => {
    // Çıplak `.dark { --background … }` body.dark'ta varsayılanları yeniden bildirir ve html'deki
    // renk körü/yüksek kontrast/tema değerlerini tüm sayfa için geçersiz kılardı.
    expect(extractVarsForSelector(css, '.dark').background).toBeUndefined();
    expect(dark.background).toBeTruthy();
  });

  it('erişilebilirlik modları çalışma zamanı temasından daha özgül (tema a11y değerlerini ezmez)', () => {
    const spec = (sel: string) => {
      const ids = (sel.match(/#[\w-]+/g) ?? []).length;
      const classes = (sel.match(/(\.[\w-]+|:(?!not\()[\w-]+)/g) ?? []).length;
      const types = (sel.replace(/:not\(|\)/g, ' ').match(/(^|[\s>+~])[a-z][\w-]*/g) ?? []).length;
      return ids * 10000 + classes * 100 + types;
    };
    const themeMax = Math.max(spec(':root:not(.dark)'), spec(':root.dark'));
    for (const sel of ['html:root.high-contrast', 'html:root.dark.high-contrast', 'html:root.colorblind', 'html:root.colorblind.dark']) {
      expect(css).toContain(`${sel} {`);
      expect(spec(sel)).toBeGreaterThan(themeMax);
    }
    // Varsayılan koyu blok temadan az özgül.
    expect(spec('.dark:not(body)')).toBeLessThan(themeMax);
  });

  it('`delay-*` / `animate-in-slow` gibi eklenti adlarını ezen yardımcılar yok', () => {
    expect(css).not.toMatch(/^\s*\.delay-\d+\s*\{/m);
    expect(css).not.toMatch(/\.animate-in-slow/);
  });
});
