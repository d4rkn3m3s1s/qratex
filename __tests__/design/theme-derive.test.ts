/**
 * Çalışma zamanı tema motoru — her preset ailesi × açık/koyu (ve uç özel temalar) için
 * türetilmiş token'lar QDL kontrast sözleşmesini sağlar; varsayılanlar globals.css ile aynı;
 * tema CSS'i erişilebilirlik modlarını ezmeyen seçicilerle üretilir.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { extractVarsForSelector, layerVars, resolveVar, type VarMap } from '@/lib/design/css-tokens';
import { contrastRatio } from '@/lib/design/contrast';
import { contrastContract } from '@/lib/design/tokens';
import { BASE_THEME_VARS, deriveThemeVars, onFill, type ThemeMode, type ThemeSeeds } from '@/lib/design/theme-derive';
import { THEME_FAMILIES, draftContrastReport } from '@/lib/design-system/theme-model';
import { BRAND_PRIMARY_HEX, VIEWPORT_THEME_COLOR_DARK, VIEWPORT_THEME_COLOR_LIGHT } from '@/lib/brand-colors';
import { hexToHSL } from '@/lib/hex-to-hsl';
import {
  RUNTIME_THEME_SELECTORS,
  buildRuntimeThemeCss,
  runtimePalette,
  runtimeThemeStateFromRows,
} from '@/lib/design-system/theme-runtime';

const css = readFileSync(path.join(__dirname, '..', '..', 'app', 'globals.css'), 'utf8');
const root = extractVarsForSelector(css, ':root');
const dark = layerVars(root, extractVarsForSelector(css, '.dark:not(body)'));
const baseFor = (mode: ThemeMode): VarMap => (mode === 'dark' ? dark : root);

function assertContract(label: string, vars: VarMap) {
  const failures: string[] = [];
  for (const pair of contrastContract()) {
    const fg = resolveVar(vars, pair.fg);
    const bg = resolveVar(vars, pair.bg);
    const ratio = contrastRatio(fg ?? '', bg ?? '');
    if (!(ratio >= pair.min)) failures.push(`${pair.fg}/${pair.bg} ${Number.isFinite(ratio) ? ratio.toFixed(2) : 'NaN'} < ${pair.min}`);
  }
  // Dolgu üstü metin (birincil/ikincil/vurgu düğmeleri) ve odak halkası
  for (const [fg, bg, min] of [
    ['primary-foreground', 'primary', 4.5],
    ['secondary-foreground', 'secondary', 4.5],
    ['accent-foreground', 'accent', 4.5],
    ['ring', 'background', 3],
  ] as const) {
    const ratio = contrastRatio(resolveVar(vars, fg) ?? '', resolveVar(vars, bg) ?? '');
    if (!(ratio >= min)) failures.push(`${fg}/${bg} ${ratio.toFixed(2)} < ${min}`);
  }
  if (failures.length) throw new Error(`${label}:\n  ${failures.join('\n  ')}`);
}

describe('tema türetme varsayılanları', () => {
  it('BASE_THEME_VARS globals.css ile birebir aynı', () => {
    for (const mode of ['light', 'dark'] as const) {
      for (const [name, value] of Object.entries(BASE_THEME_VARS[mode])) {
        expect([mode, name, resolveVar(baseFor(mode), name)]).toEqual([mode, name, value]);
      }
    }
  });

  it('marka hex sabitleri CSS token değerleriyle aynı ton (e-posta/PWA/varsayılan preset)', () => {
    expect(hexToHSL(BRAND_PRIMARY_HEX)).toBe(BASE_THEME_VARS.light.primary);
    // Tarayıcı çubuğu rengi sayfa zemininden ayırt edilemez (≤ 1,02:1)
    expect(contrastRatio(VIEWPORT_THEME_COLOR_LIGHT, BASE_THEME_VARS.light.background)).toBeLessThan(1.02);
    expect(contrastRatio(VIEWPORT_THEME_COLOR_DARK, BASE_THEME_VARS.dark.background)).toBeLessThan(1.02);
  });

  it('tohum yoksa hiçbir değişken yazılmaz', () => {
    expect(deriveThemeVars({}, 'light')).toEqual({});
    expect(deriveThemeVars({}, 'dark')).toEqual({});
  });
});

describe('her preset ailesi × mod kontrast sözleşmesini sağlar (eski: Kraliyet Altını 2,10:1)', () => {
  for (const fam of THEME_FAMILIES) {
    for (const mode of ['light', 'dark'] as const) {
      it(`${fam.id} / ${mode}`, () => {
        const vars = layerVars(baseFor(mode), deriveThemeVars(fam.variants[mode], mode));
        assertContract(`${fam.id}/${mode}`, vars);
        // Kart zeminden ayrışır (eskiden kart = zemin, ayrışma yalnız kenarlığa kalıyordu).
        if (mode === 'dark') expect(vars.card).not.toBe(vars.background);
      });
    }
  }
});

describe('uç özel temalar', () => {
  const cases: Array<[string, ThemeSeeds, ThemeMode]> = [
    ['sarı marka + açık gri ikincil', { primary: '#FFFF00', secondary: '#EEEEEE', accent: '#DDDDDD' }, 'light'],
    ['orta ton marka (beyaz da mürekkep de sınırda)', { primary: '#8B5CF6', secondary: '#DB2777', accent: '#10B981' }, 'dark'],
    ['koyu zemin açık modda (eski tek takım)', { primary: '#7C3AED', secondary: '#A855F7', accent: '#F472B6', background: '#000000', foreground: '#FFFFFF' }, 'light'],
    ['açık zemin koyu modda', { primary: '#60A5FA', secondary: '#14B8A6', accent: '#A78BFA', background: '#FFFFFF', foreground: '#111111' }, 'dark'],
    ['zayıf metin tohumu', { primary: '#0EA5E9', secondary: '#22D3EE', accent: '#818CF8', background: '#0B1420', foreground: '#334155' }, 'dark'],
  ];
  for (const [label, seeds, mode] of cases) {
    it(label, () => assertContract(label, layerVars(baseFor(mode), deriveThemeVars(seeds, mode))));
  }

  it('dolgu üstü metin: beyaz yetmezse mürekkep seçilir', () => {
    expect(onFill('51 64% 52%').fg).toBe('240 10% 10%'); // #D4AF37
    expect(onFill('262 83% 58%').fg).toBe('0 0% 100%');
  });

  it('admin kontrast raporu çalışma zamanıyla aynı türetmeyi kullanır (tüm aileler geçer)', () => {
    for (const fam of THEME_FAMILIES) {
      expect([fam.id, draftContrastReport({ activeTheme: fam.id, customColors: null }).failing]).toEqual([fam.id, 0]);
    }
  });
});

describe('tema CSS üretimi', () => {
  it('ayarlanmamış / geçersiz tema → boş (CSS varsayılanı)', () => {
    expect(buildRuntimeThemeCss({ activeTheme: null, customColors: null })).toBe('');
    expect(buildRuntimeThemeCss({ activeTheme: 'light', customColors: null })).toBe('');
    expect(buildRuntimeThemeCss({ activeTheme: 'custom', customColors: null })).toBe('');
  });

  it('iki modun bloğu a11y modlarını ezmeyen seçicilerle üretilir', () => {
    const out = buildRuntimeThemeCss(runtimeThemeStateFromRows([{ key: 'activeTheme', value: 'green' }]));
    expect(out).toContain(`${RUNTIME_THEME_SELECTORS.light}{`);
    expect(out).toContain(`${RUNTIME_THEME_SELECTORS.dark}{`);
    expect(out).not.toMatch(/[<>"'`]/);
    // Yalnız sayısal HSL üçlüleri (enjeksiyon yüzeyi yok)
    for (const decl of out.replace(/[^{]*\{|\}/g, ';').split(';').filter(Boolean)) {
      expect(decl).toMatch(/^--[a-z0-9-]+:\d{1,3} \d{1,3}% \d{1,3}%$/);
    }
  });

  it('dönemsel konsept yönetici temasının üstünde, iki modda da', () => {
    const state = { ...runtimeThemeStateFromRows([{ key: 'activeTheme', value: 'blue' }]), seasonalThemeId: 'orangeLight' };
    expect(runtimePalette(state, 'light')?.primary).toBe(THEME_FAMILIES.find((f) => f.id === 'orange')!.variants.light.primary);
    expect(runtimePalette(state, 'dark')?.primary).toBe(THEME_FAMILIES.find((f) => f.id === 'orange')!.variants.dark.primary);
  });

  it('özel tema moda özel zemini kullanır', () => {
    const state = runtimeThemeStateFromRows([
      { key: 'activeTheme', value: 'custom' },
      {
        key: 'customColors',
        value: { primary: '#123456', secondary: '#654321', accent: '#abcdef', modes: { dark: { background: '#050505', foreground: '#fafafa' } } },
      },
    ]);
    expect(runtimePalette(state, 'dark')?.background).toBe('#050505');
    expect(runtimePalette(state, 'light')?.background).toBeUndefined();
  });
});
