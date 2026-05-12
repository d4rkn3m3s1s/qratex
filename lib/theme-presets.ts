import {
  BRAND_CARD_QR_DARK_HEX,
  BRAND_LILAC_HEX,
  BRAND_PRIMARY_HEX,
  BRAND_PRIMARY_HEX_DEEP,
  HEX_WHITE,
} from '@/lib/brand-colors';
import { CHART_HEX } from '@/lib/chart-palette';

const P = BRAND_PRIMARY_HEX.toUpperCase();
const up = (h: string) => h.toUpperCase();

/** Admin tema seçici kartları — arka plan / metin önizlemesi (hex’ler korunur) */
const THEME_ADMIN_PREVIEW_HEX = {
  /** “Mor Gece” önizleme — nötr koyu yüzey (sadece isim mor) */
  nightChromeBg: '#0a0a0b',
  nightChromeFg: '#fafafa',
  blueBg: '#0f172a',
  blueFg: '#f8fafc',
  greenBg: '#0d1117',
  greenFg: '#f0fdf4',
  orangeBg: '#1c1917',
  orangeFg: '#fef3c7',
  pinkFg: '#fdf2f8',
} as const;

/**
 * Uygulama teması: `activeTheme` id → CSS değişkenlerine (providers / hooks) uygulanan 3’lü hex.
 * `admin/themes` tam kart renkleri için `getAdminThemePresetsBase` ile genişletilir.
 */
export const THEME_COLOR_PRESETS = {
  purple: { primary: P, secondary: up(BRAND_LILAC_HEX), accent: up(CHART_HEX.pinkLight) },
  purpleLight: { primary: '#7C3AED', secondary: '#A78BFA', accent: '#C4B5FD' },
  blue: { primary: up(CHART_HEX.blue), secondary: up(CHART_HEX.cyan), accent: up(CHART_HEX.skyLight) },
  blueLight: { primary: '#2563EB', secondary: '#38BDF8', accent: '#0EA5E9' },
  green: { primary: up(CHART_HEX.green), secondary: up(CHART_HEX.emerald), accent: up(CHART_HEX.emerald400) },
  greenLight: { primary: '#059669', secondary: '#22C55E', accent: '#65A30D' },
  orange: { primary: up(CHART_HEX.orange), secondary: up(CHART_HEX.orange400), accent: up(CHART_HEX.amber300) },
  orangeLight: { primary: '#EA580C', secondary: '#FB923C', accent: '#F59E0B' },
  pink: { primary: up(CHART_HEX.pink), secondary: up(CHART_HEX.pinkLight), accent: up(CHART_HEX.pink200) },
  pinkLight: { primary: '#DB2777', secondary: '#F472B6', accent: '#EC4899' },
  light: { primary: up(BRAND_PRIMARY_HEX_DEEP), secondary: P, accent: up(CHART_HEX.violet) },
  aurora: { primary: '#7C3AED', secondary: '#06B6D4', accent: '#22C55E' },
  auroraLight: { primary: '#6D28D9', secondary: '#0891B2', accent: '#16A34A' },
  cyberpunk: { primary: '#EC4899', secondary: '#8B5CF6', accent: '#22D3EE' },
  cyberpunkLight: { primary: '#DB2777', secondary: '#7C3AED', accent: '#06B6D4' },
  royalGold: { primary: '#D4AF37', secondary: '#8B5CF6', accent: '#F59E0B' },
  royalGoldLight: { primary: '#CA8A04', secondary: '#7C3AED', accent: '#F59E0B' },
  obsidian: { primary: '#60A5FA', secondary: '#14B8A6', accent: '#A78BFA' },
  obsidianLight: { primary: '#2563EB', secondary: '#0F766E', accent: '#7C3AED' },
  lava: { primary: '#F43F5E', secondary: '#FB923C', accent: '#FACC15' },
  lavaLight: { primary: '#E11D48', secondary: '#EA580C', accent: '#CA8A04' },
  arctic: { primary: '#0EA5E9', secondary: '#22D3EE', accent: '#818CF8' },
  arcticLight: { primary: '#0284C7', secondary: '#06B6D4', accent: '#6366F1' },
  forestNight: { primary: '#10B981', secondary: '#84CC16', accent: '#14B8A6' },
  forestNightLight: { primary: '#059669', secondary: '#65A30D', accent: '#0D9488' },
  amethyst: { primary: '#A855F7', secondary: '#EC4899', accent: '#F472B6' },
  amethystLight: { primary: '#9333EA', secondary: '#DB2777', accent: '#EC4899' },
} as const;

export type ThemePresetId = keyof typeof THEME_COLOR_PRESETS;

type AdminThemeRow = {
  id: ThemePresetId;
  name: string;
  description: string;
  mode: 'light' | 'dark';
  colors: {
    primary: string;
    secondary: string;
    accent: string;
    background: string;
    foreground: string;
  };
};

const ADMIN_THEME_META: Record<
  ThemePresetId,
  { name: string; description: string; background: string; foreground: string; mode: 'light' | 'dark' }
> = {
  purple: {
    name: 'Mor Gece',
    description: 'Varsayılan koyu tema',
    background: up(THEME_ADMIN_PREVIEW_HEX.nightChromeBg),
    foreground: up(THEME_ADMIN_PREVIEW_HEX.nightChromeFg),
    mode: 'dark',
  },
  purpleLight: {
    name: 'Mor Gün',
    description: 'Açık mor arayüz',
    background: up('#F5F3FF'),
    foreground: up('#1E1B4B'),
    mode: 'light',
  },
  blue: {
    name: 'Okyanus',
    description: 'Mavi tonları',
    background: up(THEME_ADMIN_PREVIEW_HEX.blueBg),
    foreground: up(THEME_ADMIN_PREVIEW_HEX.blueFg),
    mode: 'dark',
  },
  blueLight: {
    name: 'Okyanus Gün',
    description: 'Açık mavi tema',
    background: up('#EFF6FF'),
    foreground: up('#0C4A6E'),
    mode: 'light',
  },
  green: {
    name: 'Orman',
    description: 'Yeşil tonları',
    background: up(THEME_ADMIN_PREVIEW_HEX.greenBg),
    foreground: up(THEME_ADMIN_PREVIEW_HEX.greenFg),
    mode: 'dark',
  },
  greenLight: {
    name: 'Orman Gün',
    description: 'Açık yeşil tema',
    background: up('#ECFDF5'),
    foreground: up('#14532D'),
    mode: 'light',
  },
  orange: {
    name: 'Gün Batımı',
    description: 'Sıcak tonlar',
    background: up(THEME_ADMIN_PREVIEW_HEX.orangeBg),
    foreground: up(THEME_ADMIN_PREVIEW_HEX.orangeFg),
    mode: 'dark',
  },
  orangeLight: {
    name: 'Gün Batımı Gün',
    description: 'Açık turuncu tema',
    background: up('#FFF7ED'),
    foreground: up('#7C2D12'),
    mode: 'light',
  },
  pink: {
    name: 'Çiçek',
    description: 'Pembe tonları',
    background: up(BRAND_CARD_QR_DARK_HEX),
    foreground: up(THEME_ADMIN_PREVIEW_HEX.pinkFg),
    mode: 'dark',
  },
  pinkLight: {
    name: 'Çiçek Gün',
    description: 'Açık pembe tema',
    background: up('#FDF2F8'),
    foreground: up('#831843'),
    mode: 'light',
  },
  light: {
    name: 'Aydınlık',
    description: 'Açık tema',
    background: up(HEX_WHITE),
    foreground: up(CHART_HEX.gray800),
    mode: 'light',
  },
  aurora: {
    name: 'Aurora',
    description: 'Mor-cyan premium kontrast',
    background: up('#0A0F1F'),
    foreground: up('#E2E8F0'),
    mode: 'dark',
  },
  auroraLight: {
    name: 'Aurora Gün',
    description: 'Açık aurora paleti',
    background: up('#F0FDFF'),
    foreground: up('#1E1B4B'),
    mode: 'light',
  },
  cyberpunk: {
    name: 'Cyberpunk',
    description: 'Neon pembe ve elektrik mavi',
    background: up('#0B0B14'),
    foreground: up('#F1F5F9'),
    mode: 'dark',
  },
  cyberpunkLight: {
    name: 'Cyberpunk Gün',
    description: 'Açık neon görünüm',
    background: up('#FDF4FF'),
    foreground: up('#4A044E'),
    mode: 'light',
  },
  royalGold: {
    name: 'Royal Gold',
    description: 'Altın-mor lüks görünüm',
    background: up('#15111F'),
    foreground: up('#FAF5D7'),
    mode: 'dark',
  },
  royalGoldLight: {
    name: 'Royal Gold Gün',
    description: 'Açık lüks altın',
    background: up('#FFFBEB'),
    foreground: up('#78350F'),
    mode: 'light',
  },
  obsidian: {
    name: 'Obsidian',
    description: 'Koyu taş + sakin mavi/teal',
    background: up('#0B1019'),
    foreground: up('#E5E7EB'),
    mode: 'dark',
  },
  obsidianLight: {
    name: 'Obsidian Gün',
    description: 'Açık taş paleti',
    background: up('#F8FAFC'),
    foreground: up('#0F172A'),
    mode: 'light',
  },
  lava: {
    name: 'Lava',
    description: 'Kırmızı-turuncu enerjik görünüm',
    background: up('#1A1010'),
    foreground: up('#FDECEC'),
    mode: 'dark',
  },
  lavaLight: {
    name: 'Lava Gün',
    description: 'Açık sıcak kırmızı',
    background: up('#FFF1F2'),
    foreground: up('#881337'),
    mode: 'light',
  },
  arctic: {
    name: 'Arctic',
    description: 'Buz gibi temiz mavi tonlar',
    background: up('#0B1420'),
    foreground: up('#E6F3FF'),
    mode: 'dark',
  },
  arcticLight: {
    name: 'Arctic Gün',
    description: 'Açık buz mavisi',
    background: up('#F0F9FF'),
    foreground: up('#0C4A6E'),
    mode: 'light',
  },
  forestNight: {
    name: 'Forest Night',
    description: 'Doğal yeşil gece estetiği',
    background: up('#0C1511'),
    foreground: up('#E8F7EF'),
    mode: 'dark',
  },
  forestNightLight: {
    name: 'Forest Gün',
    description: 'Açık doğal yeşil',
    background: up('#F0FDF4'),
    foreground: up('#14532D'),
    mode: 'light',
  },
  amethyst: {
    name: 'Amethyst',
    description: 'Mor-pembe premium neon',
    background: up('#140F1C'),
    foreground: up('#F6EEFF'),
    mode: 'dark',
  },
  amethystLight: {
    name: 'Amethyst Gün',
    description: 'Açık mor-pembe',
    background: up('#FAF5FF'),
    foreground: up('#581C87'),
    mode: 'light',
  },
};

/** Admin tema seçici kartları — `isActive` sayfada state ile eklenir */
export function getAdminThemePresetsBase(): AdminThemeRow[] {
  return (Object.keys(THEME_COLOR_PRESETS) as ThemePresetId[]).map((id) => {
    const meta = ADMIN_THEME_META[id];
    const core = THEME_COLOR_PRESETS[id];
    return {
      id,
      name: meta.name,
      description: meta.description,
      mode: meta.mode,
      colors: {
        primary: core.primary,
        secondary: core.secondary,
        accent: core.accent,
        background: meta.background,
        foreground: meta.foreground,
      },
    };
  });
}

/** Özel renk formu varsayılanı — mor preset ile hizalı */
export const DEFAULT_CUSTOM_THEME_HEX: { primary: string; secondary: string; accent: string } = {
  primary: P,
  secondary: up(BRAND_LILAC_HEX),
  accent: up(CHART_HEX.pinkLight),
};
