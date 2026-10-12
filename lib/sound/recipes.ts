/**
 * Qratex ses ailesi — Web Audio ile prosedürel sentez (dosya yok, lisans riski sıfır).
 *
 * Ortak dil: yumuşak sinüs/üçgen tonlar, C majör pentatonik (C–D–E–G–A) üzerinde,
 * hızlı atak + üstel sönüm, hafif alçak geçiren filtre. Böylece hepsi tek bir
 * "ses ailesi" gibi duyulur; hiçbiri 600 ms'yi geçmez.
 */
export type SoundName =
  | 'tap'
  | 'toggle'
  | 'success'
  | 'coin'
  | 'reward'
  | 'error'
  | 'notify'
  | 'flip'
  | 'tick';

export interface ToneStep {
  /** Dalga biçimi; 'noise' kısa filtreli gürültü patlaması (kart hışırtısı, tık). */
  wave: OscillatorType | 'noise';
  /** Başlangıç frekansı (Hz). noise için filtre merkezi. */
  freq: number;
  /** Varsa frekans bu değere üstel kayar (glide). */
  freqEnd?: number;
  /** Sese göre başlangıç (s). */
  at: number;
  /** Süre (s). */
  dur: number;
  /** Tepe kazanç (0..1, ana seviye ile çarpılır). */
  gain: number;
}

export interface SoundRecipe {
  steps: ToneStep[];
  /** Aynı sesin art arda en az bu kadar ms arayla çalınması (spam koruması). */
  minIntervalMs: number;
  /** Opsiyonel haptik (navigator.vibrate deseni, ms). */
  vibrate?: number | number[];
  /** Capacitor Haptics etkisi. */
  haptic?: 'light' | 'medium' | 'heavy' | 'success' | 'error';
}

// Notalar (Hz)
const C5 = 523.25, D5 = 587.33, E5 = 659.25, G5 = 783.99, A5 = 880, C6 = 1046.5, E6 = 1318.5, G6 = 1568, C7 = 2093;
const A3 = 220, E4 = 329.63, C4 = 261.63;

export const SOUND_RECIPES: Record<SoundName, SoundRecipe> = {
  // Hafif tık: çok kısa, yüksek, neredeyse "dokunma" hissi.
  tap: { minIntervalMs: 60, steps: [{ wave: 'sine', freq: 1800, freqEnd: 1200, at: 0, dur: 0.035, gain: 0.25 }] },
  // Aç/kapa: iki notalı yukarı kayış.
  toggle: {
    minIntervalMs: 90,
    steps: [{ wave: 'triangle', freq: G5, freqEnd: C6, at: 0, dur: 0.09, gain: 0.3 }],
    haptic: 'light',
  },
  // Başarı: yumuşak çift ton (E5 → A5), ikincisi biraz daha uzun.
  success: {
    minIntervalMs: 250,
    steps: [
      { wave: 'sine', freq: E5, at: 0, dur: 0.12, gain: 0.35 },
      { wave: 'sine', freq: A5, at: 0.09, dur: 0.22, gain: 0.35 },
      { wave: 'triangle', freq: A5 * 2, at: 0.09, dur: 0.12, gain: 0.06 },
    ],
    vibrate: 12,
    haptic: 'success',
  },
  // Puan/para: parlak, kısa iki kıvılcım (B-C tarzı jeton yerine pentatonik E6→G6).
  coin: {
    minIntervalMs: 120,
    steps: [
      { wave: 'triangle', freq: E6, at: 0, dur: 0.06, gain: 0.28 },
      { wave: 'sine', freq: G6, at: 0.055, dur: 0.18, gain: 0.3 },
      { wave: 'sine', freq: C7, at: 0.055, dur: 0.08, gain: 0.06 },
    ],
    vibrate: 8,
    haptic: 'light',
  },
  // Ödül/seviye/kutu: yükselen arpej + parıltı.
  reward: {
    minIntervalMs: 600,
    steps: [
      { wave: 'triangle', freq: C5, at: 0, dur: 0.14, gain: 0.3 },
      { wave: 'triangle', freq: E5, at: 0.08, dur: 0.14, gain: 0.3 },
      { wave: 'triangle', freq: G5, at: 0.16, dur: 0.16, gain: 0.3 },
      { wave: 'sine', freq: C6, at: 0.24, dur: 0.34, gain: 0.34 },
      { wave: 'sine', freq: E6, at: 0.3, dur: 0.22, gain: 0.08 },
      { wave: 'noise', freq: 7000, at: 0.24, dur: 0.18, gain: 0.04 },
    ],
    vibrate: [15, 40, 20],
    haptic: 'success',
  },
  // Hata: kibar, alçak, inen iki ton — alarm değil.
  error: {
    minIntervalMs: 400,
    steps: [
      { wave: 'triangle', freq: E4, at: 0, dur: 0.12, gain: 0.3 },
      { wave: 'sine', freq: C4, freqEnd: A3, at: 0.1, dur: 0.22, gain: 0.3 },
    ],
    vibrate: [20, 40, 20],
    haptic: 'error',
  },
  // Bildirim: tek, yuvarlak "ding" (D5 + oktav gölgesi).
  notify: {
    minIntervalMs: 1500,
    steps: [
      { wave: 'sine', freq: D5, at: 0, dur: 0.3, gain: 0.3 },
      { wave: 'sine', freq: D5 * 2, at: 0, dur: 0.16, gain: 0.08 },
    ],
    vibrate: 10,
    haptic: 'light',
  },
  // Kart çevirme: kısa bant-geçiren gürültü "fıs" + minik ton.
  flip: {
    minIntervalMs: 120,
    steps: [
      { wave: 'noise', freq: 2500, at: 0, dur: 0.07, gain: 0.18 },
      { wave: 'sine', freq: 900, freqEnd: 1300, at: 0.01, dur: 0.05, gain: 0.08 },
    ],
  },
  // Çark tıkırtısı: çok kısa, art arda çalınır (minInterval düşük).
  tick: { minIntervalMs: 35, steps: [{ wave: 'noise', freq: 4200, at: 0, dur: 0.018, gain: 0.22 }] },
};

export const SOUND_NAMES = Object.keys(SOUND_RECIPES) as SoundName[];

/** Anlamsal takma adlar (çağıran olayın adını kullanabilsin) → aile sesi. */
export const SOUND_ALIASES = {
  points: 'coin',
  'task-complete': 'success',
  thanks: 'success',
  badge: 'reward',
  'level-up': 'reward',
  'box-open': 'reward',
  open: 'toggle',
  close: 'toggle',
} as const satisfies Record<string, SoundName>;

export type SoundAlias = keyof typeof SOUND_ALIASES;

export function resolveSoundName(name: SoundName | SoundAlias | string): SoundName | null {
  if (name in SOUND_RECIPES) return name as SoundName;
  return (SOUND_ALIASES as Record<string, SoundName>)[name] ?? null;
}

/** Bir tarifin toplam süresi (s) — eşzamanlı ses sayacının ne zaman düşeceği. */
export function recipeDuration(r: SoundRecipe): number {
  return r.steps.reduce((m, s) => Math.max(m, s.at + s.dur), 0);
}
