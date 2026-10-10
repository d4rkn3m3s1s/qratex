/**
 * An Motoru sahne renkleri — seviye / lig / rozet sahnelerinin (three.js + CSS zemin)
 * kullandığı SABİT hex tablolar. Spec: docs/superpowers/specs/2026-10-08-moment-engine-design.md §3.
 *
 * Neden hex (token değil)?
 *   WebGL gölgelendiricisi `hsl(var(--category-7))` okuyamaz; somut bir renk ister.
 *   `LeagueRule` ise yalnız Tailwind gradient sınıfı tutar. Bu yüzden tablolar burada
 *   sabittir ve değerler QDL token'larının açık tema karşılıklarından TÜRETİLMİŞTİR
 *   (`components/ds/play/league-colors.ts` ve `components/ds/play/rarity.ts` ile aynı
 *   ton eşleşmesi) — DOM amblemi ile 3B sahne aynı renk ailesinde kalır:
 *
 *     category-1 #7c3bed · category-2 #0da2e7 · category-4 #f59f0a · category-5 #e21d48
 *     category-6 #0ea6be · category-7 #f97415 · category-8 #d948ef · border-strong #7f8694
 *
 * Saf modül: React/three/DOM bağımlılığı yok (sunucu, istemci ve jest güvenle içe aktarır).
 */
import type { LeagueKey } from '@/lib/league-rules-core';

/** [ana renk, ikincil renk] — her ikisi de `#rrggbb`. */
export type ScenePair = readonly [string, string];

/** Marka çifti (`--gradient-from` → `--gradient-to`). Bilinmeyen lig/renk için yedek. */
export const BRAND_SCENE_COLORS: ScenePair = ['#7c3bed', '#d948ef'];

/** Lig → sahne renkleri. Bilinmeyen anahtar → `BRAND_SCENE_COLORS` (spec kararı). */
export const LEAGUE_SCENE_COLORS: Record<LeagueKey, ScenePair> = {
  BASLANGIC: ['#7f8694', '#cbd5e1'], // gümüş (text-3 → border-strong ailesi)
  KOR: ['#f97415', '#e21d48'], // kor: category-7 → category-5
  VEYRA: ['#7f8694', '#0da2e7'], // gümüş-gök: border-strong → category-2
  SAVASCI: ['#f59f0a', '#f97415'], // altın: category-4 → category-7
  ETERON: ['#0ea6be', '#0da2e7'], // buz: category-6 → category-2
  VETRA: ['#7c3bed', '#d948ef'], // menekşe: category-1 → category-8
  ZENOR: ['#e21d48', '#0da2e7'], // tayf: category-5 → (category-1) → category-2
};

export const SCENE_RARITIES = ['common', 'rare', 'epic', 'legendary'] as const;
export type SceneRarity = (typeof SCENE_RARITIES)[number];

/** Nadirlik → sahne renkleri (`components/ds/play/rarity.ts` edge/edgeTo ile aynı aile). */
export const RARITY_SCENE_COLORS: Record<SceneRarity, ScenePair> = {
  common: ['#7f8694', '#cbd5e1'],
  rare: ['#0da2e7', '#0ea6be'],
  epic: ['#7c3bed', '#d948ef'],
  legendary: ['#f59f0a', '#f97415'],
};

/** Seviye sahnesi marka renginde oynar (seviye kimliksiz bir ölçüdür). */
export const LEVEL_SCENE_COLORS: ScenePair = BRAND_SCENE_COLORS;

const HEX_RE = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i;

/** `#abc` / `abc` / `#aabbcc` → `#aabbcc` (küçük harf). Geçersiz → null. */
export function normalizeHex(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const m = HEX_RE.exec(value.trim());
  if (!m) return null;
  let h = m[1].toLowerCase();
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  return `#${h}`;
}

/** `#rrggbb` → [r, g, b] (0–255). Geçersiz girdi siyah döner. */
export function hexToRgb(hex: string): [number, number, number] {
  const n = normalizeHex(hex);
  if (!n) return [0, 0, 0];
  const v = parseInt(n.slice(1), 16);
  return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
}

function toHex(r: number, g: number, b: number): string {
  const c = (x: number) => Math.round(Math.min(255, Math.max(0, x))).toString(16).padStart(2, '0');
  return `#${c(r)}${c(g)}${c(b)}`;
}

/** İki rengi doğrusal karıştırır (t: 0 → a, 1 → b). */
export function mixHex(a: string, b: string, t: number): string {
  const k = Number.isFinite(t) ? Math.min(1, Math.max(0, t)) : 0;
  const [ar, ag, ab] = hexToRgb(a);
  const [br, bg, bb] = hexToRgb(b);
  return toHex(ar + (br - ar) * k, ag + (bg - ag) * k, ab + (bb - ab) * k);
}

/** Beyaza doğru açar (0..1). */
export function lightenHex(hex: string, amount: number): string {
  return mixHex(hex, '#ffffff', amount);
}

/** Siyaha doğru koyulaştırır (0..1). */
export function darkenHex(hex: string, amount: number): string {
  return mixHex(hex, '#000000', amount);
}

/** CSS `rgba()` dizgesi. */
export function hexToRgba(hex: string, alpha: number): string {
  const [r, g, b] = hexToRgb(hex);
  const a = Number.isFinite(alpha) ? Math.min(1, Math.max(0, alpha)) : 1;
  return `rgba(${r}, ${g}, ${b}, ${a})`;
}

/** Lig anahtarı → sahne çifti. Büyük/küçük harf ve boşluk toleranslı; bilinmeyen → marka. */
export function getLeagueSceneColors(key: string | null | undefined): ScenePair {
  const k = typeof key === 'string' ? key.trim().toUpperCase() : '';
  return Object.prototype.hasOwnProperty.call(LEAGUE_SCENE_COLORS, k)
    ? LEAGUE_SCENE_COLORS[k as LeagueKey]
    : BRAND_SCENE_COLORS;
}

/** DB'den gelen serbest nadirlik metnini sahne kademesine indirger (bilinmeyen → common). */
export function normalizeSceneRarity(value: unknown): SceneRarity {
  const v = typeof value === 'string' ? value.trim().toLowerCase() : '';
  return (SCENE_RARITIES as readonly string[]).includes(v) ? (v as SceneRarity) : 'common';
}

/**
 * Rozet sahnesi renkleri: admin'in rozete verdiği `color` (geçerli hex) doluysa O kullanılır
 * (ikincil ton aynı rengin açığı), değilse nadirlik tablosu.
 */
export function getBadgeSceneColors(badge: { color?: string | null; rarity?: string | null }): ScenePair {
  const own = normalizeHex(badge.color);
  if (own) return [own, lightenHex(own, 0.35)];
  return RARITY_SCENE_COLORS[normalizeSceneRarity(badge.rarity)];
}

/** Sahne arkasındaki koyu "set" zemini (renkli ışık lekesi + derin kenar). */
export function sceneBackdrop(pair: ScenePair): string {
  const [a, b] = pair;
  return [
    `radial-gradient(60% 50% at 50% 42%, ${hexToRgba(a, 0.42)} 0%, transparent 70%)`,
    `radial-gradient(90% 70% at 50% 110%, ${hexToRgba(b, 0.28)} 0%, transparent 70%)`,
    `linear-gradient(180deg, ${darkenHex(a, 0.86)} 0%, ${darkenHex(b, 0.92)} 100%)`,
  ].join(', ');
}
