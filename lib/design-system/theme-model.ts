/**
 * Tasarım Sistemi → Temalar: saf tema modeli (sunucu, istemci ve Jest ortak; DB yok).
 *
 * Denetim (admin_themes.md) karşılıkları:
 *  - Aile modeli AÇIK: yalnız hem koyu hem açık varyantı olan preset'ler seçilebilir
 *    (tek varyantlı "Aydınlık" koyu modda kırık karışım üretiyordu → seçici dışı, Bulgu 1).
 *    Aile anahtarı regex ile değil, bu tablodan gelir ("Aydınlık" → '' yazımı biter).
 *  - Sunucu doğrulaması: `activeTheme ∈ aile id'leri ∪ {'custom'}`, renkler `#RRGGBB`
 *    (3 haneli `#RGB` kabul edilip genişletilir), `defaultMode ∈ system|light|dark`.
 *  - Önizleme köke YAZMAZ: `resolvePaletteTokens` çalışma zamanının (SSR `<style>` +
 *    lib/apply-runtime-theme.ts) yazacağı değerleri aynı türetmeyle hesaplar; önizleme tuvali ve
 *    kontrast raporu bu değerlerden çizilir → sızıntı sınıfı hatalar (Bulgu 3, 6) yok.
 *
 * zod şemaları AYRI dosyada (./theme-schemas): bu modül kök sağlayıcıdan (tema çalışma zamanı)
 * her sayfanın ilk JS'ine giriyor; şemalar burada dururken zod (~13 KB gzip) da giriyordu.
 */
import { THEME_COLOR_PRESETS, getAdminThemePresetsBase, DEFAULT_CUSTOM_THEME_HEX, type ThemePresetId } from '@/lib/theme-presets';
import { contrastRatio } from '@/lib/design/contrast';
import { BASE_THEME_VARS, deriveThemeVars } from '@/lib/design/theme-derive';

export type ColorMode = 'light' | 'dark';
export type DefaultMode = 'system' | 'light' | 'dark';
export const DEFAULT_MODES: readonly DefaultMode[] = ['system', 'light', 'dark'];

export type FamilyGroup = 'brand' | 'cool' | 'warm' | 'vivid';
export const FAMILY_GROUP_LABEL: Record<FamilyGroup, string> = {
  brand: 'Marka varsayılanı',
  cool: 'Soğuk tonlar',
  warm: 'Doğa ve sıcak tonlar',
  vivid: 'Canlı ve neon',
};

/** Ailenin Türkçe adı + grubu (preset adları TR/EN karışıktı — Bulgu 13). */
const FAMILY_META: Record<string, { name: string; group: FamilyGroup; note: string }> = {
  purple: { name: 'Mor Gece', group: 'brand', note: 'Qratex marka moru' },
  blue: { name: 'Okyanus', group: 'cool', note: 'Mavi ve camgöbeği' },
  arctic: { name: 'Kutup', group: 'cool', note: 'Buz mavisi ve indigo' },
  obsidian: { name: 'Obsidyen', group: 'cool', note: 'Gök mavisi ve deniz yeşili' },
  aurora: { name: 'Aurora', group: 'cool', note: 'Mor, camgöbeği ve yeşil' },
  green: { name: 'Orman', group: 'warm', note: 'Yeşil tonlar' },
  forestNight: { name: 'Gece Ormanı', group: 'warm', note: 'Zümrüt ve fıstık yeşili' },
  orange: { name: 'Gün Batımı', group: 'warm', note: 'Turuncu ve kehribar' },
  lava: { name: 'Lav', group: 'warm', note: 'Kırmızı, turuncu, sarı' },
  royalGold: { name: 'Kraliyet Altını', group: 'warm', note: 'Altın ve mor' },
  pink: { name: 'Çiçek', group: 'vivid', note: 'Pembe tonlar' },
  cyberpunk: { name: 'Neon', group: 'vivid', note: 'Neon pembe ve elektrik mavisi' },
  amethyst: { name: 'Ametist', group: 'vivid', note: 'Mor ve pembe' },
};

export type Palette = {
  primary: string;
  secondary: string;
  accent: string;
  background?: string;
  foreground?: string;
};

export type ThemeFamily = {
  id: string;
  name: string;
  note: string;
  group: FamilyGroup;
  variants: Record<ColorMode, Palette>;
};

const PRESET_ROWS = new Map(getAdminThemePresetsBase().map((r) => [r.id as string, r]));

function presetPalette(id: string): Palette | null {
  const row = PRESET_ROWS.get(id);
  if (!row) return null;
  return {
    primary: row.colors.primary.toUpperCase(),
    secondary: row.colors.secondary.toUpperCase(),
    accent: row.colors.accent.toUpperCase(),
    background: row.colors.background.toUpperCase(),
    foreground: row.colors.foreground.toUpperCase(),
  };
}

/** Yalnız iki varyantlı aileler (koyu = `<id>`, açık = `<id>Light`). */
export const THEME_FAMILIES: readonly ThemeFamily[] = (Object.keys(THEME_COLOR_PRESETS) as ThemePresetId[])
  .filter((id) => !id.endsWith('Light') && `${id}Light` in THEME_COLOR_PRESETS)
  .map((id) => {
    const meta = FAMILY_META[id] ?? { name: PRESET_ROWS.get(id)?.name ?? id, group: 'vivid' as FamilyGroup, note: '' };
    return {
      id,
      name: meta.name,
      note: meta.note,
      group: meta.group,
      variants: { dark: presetPalette(id)!, light: presetPalette(`${id}Light`)! },
    };
  });

export const FAMILY_IDS: readonly string[] = THEME_FAMILIES.map((f) => f.id);
export const DEFAULT_FAMILY_ID = 'purple';

export function findFamily(id: string | null | undefined): ThemeFamily | null {
  return THEME_FAMILIES.find((f) => f.id === id) ?? null;
}

// ───────────────────────────── Renk girişi ─────────────────────────────

/** `#abc` / `abc` / `#AABBCC` → `#AABBCC`; geçersizse null. */
export function normalizeHex(input: unknown): string | null {
  if (typeof input !== 'string') return null;
  const m = input.trim().replace(/^#/, '');
  const full = /^[0-9a-f]{3}$/i.test(m) ? m.split('').map((c) => c + c).join('') : m;
  return /^[0-9a-f]{6}$/i.test(full) ? `#${full.toUpperCase()}` : null;
}

/** Özel tema renkleri (doğrulanmış biçim; şema: ./theme-schemas). */
export type ModeSurface = { background?: string; foreground?: string };
export type CustomColors = {
  primary: string;
  secondary: string;
  accent: string;
  modes?: { light?: ModeSurface; dark?: ModeSurface };
};

export type ThemeDraft = {
  activeTheme: string;
  customColors: CustomColors | null;
  defaultMode: DefaultMode;
};

// ───────────────────────────── Saklı değer okuma ─────────────────────────────

export type ThemeSnapshot = {
  /** Saklı ham değer (geçersiz/eski olabilir). */
  activeTheme: string | null;
  customColors: CustomColors | null;
  defaultMode: DefaultMode;
};

/** Saklı `customColors` → doğrulanmış biçim (eski `{primary,secondary,accent,background?,foreground?}` dahil). */
export function readStoredCustomColors(raw: unknown): CustomColors | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const r = raw as Record<string, unknown>;
  const primary = normalizeHex(r.primary);
  const secondary = normalizeHex(r.secondary);
  const accent = normalizeHex(r.accent);
  if (!primary || !secondary || !accent) return null;
  const out: CustomColors = { primary, secondary, accent };
  const modes: NonNullable<CustomColors['modes']> = {};
  const rawModes = (r.modes && typeof r.modes === 'object' ? r.modes : {}) as Record<string, unknown>;
  for (const mode of ['light', 'dark'] as const) {
    const m = (rawModes[mode] && typeof rawModes[mode] === 'object' ? rawModes[mode] : {}) as Record<string, unknown>;
    const bg = normalizeHex(m.background);
    const fg = normalizeHex(m.foreground);
    if (bg && fg) modes[mode] = { background: bg, foreground: fg };
  }
  // Eski tek-takım zemin/metin → iki moda da uygulanıyordu; aynı davranışı koru.
  const legacyBg = normalizeHex(r.background);
  const legacyFg = normalizeHex(r.foreground);
  if (legacyBg && legacyFg) {
    for (const mode of ['light', 'dark'] as const) if (!modes[mode]) modes[mode] = { background: legacyBg, foreground: legacyFg };
  }
  if (modes.light || modes.dark) out.modes = modes;
  return out;
}

export function readDefaultMode(raw: unknown): DefaultMode {
  return raw === 'light' || raw === 'dark' ? raw : 'system';
}

export function snapshotFromRows(rows: ReadonlyArray<{ key: string; value: unknown }>): ThemeSnapshot {
  const get = (k: string) => rows.find((r) => r.key === k)?.value;
  const at = get('activeTheme');
  return {
    activeTheme: typeof at === 'string' ? at : null,
    customColors: readStoredCustomColors(get('customColors')),
    defaultMode: readDefaultMode(get('defaultMode')),
  };
}

/** Saklı değer seçilebilir mi? (Eski `'light'` / `''` / bilinmeyen id → hayır.) */
export function isValidActiveTheme(snapshot: ThemeSnapshot): boolean {
  if (snapshot.activeTheme === 'custom') return snapshot.customColors !== null;
  return !!snapshot.activeTheme && FAMILY_IDS.includes(snapshot.activeTheme);
}

/** Düzenleme için başlangıç taslağı: geçersiz saklı değer marka varsayılanına düşer (ve uyarı gösterilir). */
export function draftFromSnapshot(snapshot: ThemeSnapshot): ThemeDraft {
  const valid = isValidActiveTheme(snapshot);
  return {
    activeTheme: valid ? (snapshot.activeTheme as string) : DEFAULT_FAMILY_ID,
    customColors: snapshot.customColors,
    defaultMode: snapshot.defaultMode,
  };
}

export const DEFAULT_DRAFT: ThemeDraft = { activeTheme: DEFAULT_FAMILY_ID, customColors: null, defaultMode: 'system' };

export function defaultCustomColors(): CustomColors {
  return {
    primary: DEFAULT_CUSTOM_THEME_HEX.primary.toUpperCase(),
    secondary: DEFAULT_CUSTOM_THEME_HEX.secondary.toUpperCase(),
    accent: DEFAULT_CUSTOM_THEME_HEX.accent.toUpperCase(),
  };
}

export function draftsEqual(a: ThemeDraft, b: ThemeDraft): boolean {
  const norm = (d: ThemeDraft) =>
    JSON.stringify({
      activeTheme: d.activeTheme,
      defaultMode: d.defaultMode,
      // Preset seçiliyken özel renkler yine saklanır; farkı yalnız özel temadayken say.
      customColors: d.activeTheme === 'custom' ? d.customColors : null,
    });
  return norm(a) === norm(b);
}

// ───────────────────────────── Palet çözümü ─────────────────────────────

/** Bir taslağın verilen moddaki paleti (çalışma zamanının seçeceği varyant). */
export function paletteFor(draft: Pick<ThemeDraft, 'activeTheme' | 'customColors'>, mode: ColorMode): Palette {
  if (draft.activeTheme === 'custom' && draft.customColors) {
    const c = draft.customColors;
    const surface = c.modes?.[mode];
    return { primary: c.primary, secondary: c.secondary, accent: c.accent, background: surface?.background, foreground: surface?.foreground };
  }
  const fam = findFamily(draft.activeTheme) ?? findFamily(DEFAULT_FAMILY_ID)!;
  return fam.variants[mode];
}

export type ResolvedTokens = {
  primary: string;
  primaryFg: string;
  secondary: string;
  secondaryFg: string;
  accent: string;
  accentFg: string;
  background: string;
  card: string;
  foreground: string;
  muted: string;
  mutedFg: string;
  border: string;
  /** Zemin üstü marka metni (`text-brand` / `text-primary`). */
  brandText: string;
  /** Odak halkası (zeminde ≥ 3:1). */
  ring: string;
};

/**
 * Çalışma zamanının yazacağı değerlerin AYNISI — tek türetme `lib/design/theme-derive.ts`
 * (SSR `<style>` ve istemci aynı fonksiyonu çağırır). Kart zeminden ayrışır; dolgu üstü
 * metin ve metin rolleri kontrast garantili seçilir.
 */
export function resolvePaletteTokens(p: Palette, mode: ColorMode): ResolvedTokens {
  const v = { ...BASE_THEME_VARS[mode], ...deriveThemeVars(p, mode) };
  return {
    primary: v.primary,
    primaryFg: v['primary-foreground'] ?? '0 0% 100%',
    secondary: v.secondary,
    secondaryFg: v['secondary-foreground'],
    accent: v.accent,
    accentFg: v['accent-foreground'],
    background: v.background,
    card: v.card,
    foreground: v.foreground,
    muted: v.muted,
    mutedFg: v['muted-foreground'],
    border: v.border,
    brandText: v['brand-text'],
    ring: v.ring ?? v.primary,
  };
}

export type ContrastCheck = {
  id: string;
  label: string;
  fg: string;
  bg: string;
  ratio: number;
  min: number;
  pass: boolean;
};

/** Kritik renk çiftleri (WCAG 2.2: metin 4.5:1, arayüz bileşeni 3:1). */
export function contrastChecks(t: ResolvedTokens): ContrastCheck[] {
  const pairs: Array<Omit<ContrastCheck, 'ratio' | 'pass'>> = [
    { id: 'text', label: 'Metin / zemin', fg: t.foreground, bg: t.background, min: 4.5 },
    { id: 'text-card', label: 'Metin / kart', fg: t.foreground, bg: t.card, min: 4.5 },
    { id: 'muted', label: 'İkincil metin / zemin', fg: t.mutedFg, bg: t.background, min: 4.5 },
    { id: 'primary', label: 'Birincil buton yazısı', fg: t.primaryFg, bg: t.primary, min: 4.5 },
    { id: 'secondary', label: 'İkincil buton yazısı', fg: t.secondaryFg, bg: t.secondary, min: 4.5 },
    { id: 'accent', label: 'Vurgu yüzeyi yazısı', fg: t.accentFg, bg: t.accent, min: 4.5 },
    { id: 'brand-text', label: 'Marka metni / kart', fg: t.brandText, bg: t.card, min: 4.5 },
    { id: 'muted-card', label: 'İkincil metin / kart', fg: t.mutedFg, bg: t.card, min: 4.5 },
    { id: 'ring', label: 'Odak halkası / zemin', fg: t.ring, bg: t.background, min: 3 },
  ];
  return pairs.map((p) => {
    const ratio = contrastRatio(p.fg, p.bg);
    return { ...p, ratio, pass: Number.isFinite(ratio) && ratio >= p.min };
  });
}

export type DraftContrastReport = Record<ColorMode, ContrastCheck[]> & { failing: number };

export function draftContrastReport(draft: Pick<ThemeDraft, 'activeTheme' | 'customColors'>): DraftContrastReport {
  const light = contrastChecks(resolvePaletteTokens(paletteFor(draft, 'light'), 'light'));
  const dark = contrastChecks(resolvePaletteTokens(paletteFor(draft, 'dark'), 'dark'));
  return { light, dark, failing: [...light, ...dark].filter((c) => !c.pass).length };
}

/** Taslağın insan-okur özeti (geçmiş satırı, onay diyaloğu). */
export function describeDraft(d: Pick<ThemeDraft, 'activeTheme'> | ThemeSnapshot): string {
  if (d.activeTheme === 'custom') return 'Özel tema';
  const fam = findFamily(d.activeTheme);
  if (fam) return fam.name;
  if (d.activeTheme === 'light') return 'Aydınlık (eski, tek varyantlı)';
  return d.activeTheme ? `Bilinmeyen değer “${d.activeTheme}”` : 'Ayarlanmamış (CSS varsayılanı)';
}

export const DEFAULT_MODE_LABEL: Record<DefaultMode, string> = { system: 'Sistem', light: 'Açık', dark: 'Koyu' };

/** Dışa aktarma: çalışma zamanının yazacağı CSS değişkenleri (iki mod). */
export function draftToCss(draft: Pick<ThemeDraft, 'activeTheme' | 'customColors'>): string {
  const block = (sel: string, mode: ColorMode) => {
    const vars = deriveThemeVars(paletteFor(draft, mode), mode);
    const lines = Object.entries(vars).map(([k, v]) => `  --${k}: ${v};`);
    return [`${sel} {`, ...lines, '}'].join('\n');
  };
  return `${block(':root', 'light')}\n\n${block('.dark', 'dark')}\n`;
}
