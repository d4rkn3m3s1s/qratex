/**
 * Qratex ses ailesi — Web Audio ile prosedürel sentez (dosya yok, lisans riski sıfır).
 *
 * Ortak dil: yumuşak sinüs/üçgen tonlar, C majör pentatonik (C–D–E–G–A) üzerinde,
 * hızlı ama yumuşak atak + üstel sönüm, ince FM/oktav harmonik katmanı, ±0.1–0.3 stereo
 * genişlik, koro için ±5–7 cent detune, ana zincirde üretilmiş kısa oda yankısı (ConvolverNode)
 * ve hafif alçak geçiren filtre. Böylece hepsi tek bir
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
  | 'tick'
  | 'like'
  | 'copy'
  | 'send'
  | 'receive-message'
  | 'swipe'
  | 'unlock'
  | 'streak'
  | 'rank-up'
  | 'purchase'
  | 'delete-soft'
  | 'open-sheet'
  | 'close-sheet'
  | 'toggle-on'
  | 'toggle-off'
  | 'scan-success'
  | 'celebration';

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
  /** Atak süresi (s). Yoksa 8 ms (ya da dur/4). Yumuşak "şişme" için 0.015–0.03. */
  attack?: number;
  /** Stereo konum −1..1 (hafif genişlik için ±0.15–0.3). */
  pan?: number;
  /** FM sentez: modülatör = freq·ratio, sapma = freq·index (çan/cam tınısı); sapma sönümle azalır. */
  fm?: { ratio: number; index: number };
  /** Cent cinsinden ince akort kayması (iki katmanla koro/genişlik). */
  detune?: number;
}

export interface SoundRecipe {
  steps: ToneStep[];
  /** Aynı sesin art arda en az bu kadar ms arayla çalınması (spam koruması). */
  minIntervalMs: number;
  /** Opsiyonel haptik (navigator.vibrate deseni, ms). */
  vibrate?: number | number[];
  /** Capacitor Haptics etkisi. */
  haptic?: 'light' | 'medium' | 'heavy' | 'success' | 'error';
  /** Oda yankısı gönderimi (0..0.3). Yoksa DEFAULT_REVERB — "premium" hafif oda. */
  reverb?: number;
}

export const DEFAULT_REVERB = 0.08;

// Notalar (Hz)
const C5 = 523.25, D5 = 587.33, E5 = 659.25, G5 = 783.99, A5 = 880, C6 = 1046.5, E6 = 1318.5, G6 = 1568, C7 = 2093;
const A3 = 220, E4 = 329.63, C4 = 261.63, G4 = 392, A4 = 440, D6 = 1174.66, A6 = 1760;

export const SOUND_RECIPES: Record<SoundName, SoundRecipe> = {
  // Hafif tık: çok kısa, yüksek, neredeyse "dokunma" hissi.
  tap: {
    minIntervalMs: 60,
    reverb: 0.03,
    steps: [
      { wave: 'sine', freq: 1800, freqEnd: 1200, at: 0, dur: 0.035, gain: 0.22, attack: 0.003 },
      { wave: 'noise', freq: 5000, at: 0, dur: 0.012, gain: 0.05 },
    ],
  },
  // Aç/kapa: iki notalı yukarı kayış.
  toggle: {
    minIntervalMs: 90,
    steps: [
      { wave: 'triangle', freq: G5, freqEnd: C6, at: 0, dur: 0.09, gain: 0.28 },
      { wave: 'sine', freq: C6 * 2, at: 0.03, dur: 0.05, gain: 0.03, pan: 0.2 },
    ],
    haptic: 'light',
  },
  // Başarı: yumuşak çift ton (E5 → A5), ikincisi biraz daha uzun.
  success: {
    minIntervalMs: 250,
    steps: [
      { wave: 'sine', freq: E5, at: 0, dur: 0.12, gain: 0.33, attack: 0.01, pan: -0.12 },
      { wave: 'sine', freq: A5, at: 0.09, dur: 0.22, gain: 0.33, attack: 0.012, fm: { ratio: 2, index: 0.25 }, pan: 0.12 },
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
      { wave: 'sine', freq: G6, at: 0.055, dur: 0.18, gain: 0.28, fm: { ratio: 3.5, index: 0.35 }, pan: 0.15 },
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
      { wave: 'sine', freq: C6, at: 0.24, dur: 0.34, gain: 0.26, detune: -5, pan: -0.2 },
      { wave: 'sine', freq: C6, at: 0.24, dur: 0.34, gain: 0.2, detune: 5, pan: 0.2 },
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
      { wave: 'sine', freq: C4, freqEnd: A3, at: 0.1, dur: 0.22, gain: 0.3, attack: 0.015 },
      { wave: 'sine', freq: C5, at: 0.1, dur: 0.1, gain: 0.03 },
    ],
    vibrate: [20, 40, 20],
    haptic: 'error',
  },
  // Bildirim: tek, yuvarlak "ding" (D5 + oktav gölgesi).
  notify: {
    minIntervalMs: 1500,
    steps: [
      { wave: 'sine', freq: D5, at: 0, dur: 0.3, gain: 0.3, fm: { ratio: 3.5, index: 0.6 } },
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
  tick: { minIntervalMs: 35, reverb: 0, steps: [{ wave: 'noise', freq: 4200, at: 0, dur: 0.018, gain: 0.22 }] },

  // ─── Genişletilmiş aile (2026-10) — hepsi C pentatonik, ince harmonik katman + hafif stereo ───
  // Kalp/beğeni: yumuşak FM "bloop" yukarı + oktav parıltısı sağda.
  like: {
    minIntervalMs: 150,
    reverb: 0.1,
    steps: [
      { wave: 'sine', freq: G5, freqEnd: C6, at: 0, dur: 0.12, gain: 0.3, attack: 0.012, fm: { ratio: 2, index: 0.6 } },
      { wave: 'sine', freq: C6 * 2, at: 0.05, dur: 0.1, gain: 0.05, pan: 0.25 },
    ],
    haptic: 'light',
    vibrate: 6,
  },
  // Kopyala: minik ahşap tık + kısa cam ton, soldan sağa.
  copy: {
    minIntervalMs: 200,
    reverb: 0.04,
    steps: [
      { wave: 'noise', freq: 3200, at: 0, dur: 0.02, gain: 0.14, pan: -0.15 },
      { wave: 'sine', freq: E6, at: 0.045, dur: 0.06, gain: 0.16, pan: 0.15 },
    ],
  },
  // Gönder: yukarı süzülen hava + tonal kuyruk.
  send: {
    minIntervalMs: 300,
    steps: [
      { wave: 'noise', freq: 1800, freqEnd: 3600, at: 0, dur: 0.12, gain: 0.08, attack: 0.03 },
      { wave: 'sine', freq: C5, freqEnd: G5, at: 0.02, dur: 0.14, gain: 0.24, attack: 0.015 },
      { wave: 'triangle', freq: G5 * 2, at: 0.1, dur: 0.08, gain: 0.04, pan: 0.2 },
    ],
    haptic: 'light',
  },
  // Mesaj geldi: yuvarlak FM çan, iki nota aşağı (dikkat çekmeden).
  'receive-message': {
    minIntervalMs: 1200,
    reverb: 0.12,
    steps: [
      { wave: 'sine', freq: A5, at: 0, dur: 0.16, gain: 0.24, fm: { ratio: 3.5, index: 0.8 }, pan: 0.1 },
      { wave: 'sine', freq: E5, at: 0.09, dur: 0.26, gain: 0.26, fm: { ratio: 3.5, index: 0.5 }, pan: -0.1 },
    ],
    vibrate: 10,
    haptic: 'light',
  },
  // Kaydırma: kısa hışırtı, yükselen filtre.
  swipe: {
    minIntervalMs: 120,
    reverb: 0.03,
    steps: [{ wave: 'noise', freq: 1500, freqEnd: 4500, at: 0, dur: 0.09, gain: 0.1, attack: 0.025 }],
  },
  // Kilit açıldı: mekanik tık + açılan beşli (G → D).
  unlock: {
    minIntervalMs: 500,
    reverb: 0.12,
    steps: [
      { wave: 'noise', freq: 2600, at: 0, dur: 0.025, gain: 0.16 },
      { wave: 'triangle', freq: G5, at: 0.05, dur: 0.12, gain: 0.22, pan: -0.15 },
      { wave: 'sine', freq: D6, at: 0.12, dur: 0.24, gain: 0.24, fm: { ratio: 2, index: 0.4 }, pan: 0.15 },
    ],
    haptic: 'medium',
    vibrate: 12,
  },
  // Seri (streak): hızlı üç basamak + sıcak alt oktav.
  streak: {
    minIntervalMs: 600,
    reverb: 0.1,
    steps: [
      { wave: 'triangle', freq: E5, at: 0, dur: 0.08, gain: 0.22, pan: -0.2 },
      { wave: 'triangle', freq: G5, at: 0.06, dur: 0.08, gain: 0.22 },
      { wave: 'sine', freq: A5, at: 0.12, dur: 0.22, gain: 0.28, pan: 0.2 },
      { wave: 'sine', freq: A4, at: 0.12, dur: 0.22, gain: 0.06 },
    ],
    vibrate: [8, 30, 12],
    haptic: 'medium',
  },
  // Sıra yükseldi: beşli yükselişi, koro (±6 cent) katmanı geniş stereo.
  'rank-up': {
    minIntervalMs: 800,
    reverb: 0.16,
    steps: [
      { wave: 'triangle', freq: G4, at: 0, dur: 0.14, gain: 0.22 },
      { wave: 'triangle', freq: D5, at: 0.1, dur: 0.14, gain: 0.24 },
      { wave: 'sine', freq: G5, at: 0.2, dur: 0.36, gain: 0.28, detune: -6, pan: -0.25 },
      { wave: 'sine', freq: G5, at: 0.2, dur: 0.36, gain: 0.2, detune: 6, pan: 0.25 },
      { wave: 'sine', freq: D6, at: 0.26, dur: 0.24, gain: 0.06, fm: { ratio: 2, index: 0.5 } },
    ],
    vibrate: [12, 40, 18],
    haptic: 'success',
  },
  // Satın alma/harcama: yumuşak alçak dokunuş + jeton çanı.
  purchase: {
    minIntervalMs: 500,
    reverb: 0.1,
    steps: [
      { wave: 'sine', freq: C5, at: 0, dur: 0.08, gain: 0.2, fm: { ratio: 1.5, index: 0.4 } },
      { wave: 'sine', freq: G6, at: 0.07, dur: 0.2, gain: 0.2, fm: { ratio: 3.5, index: 0.6 }, pan: 0.2 },
      { wave: 'noise', freq: 6000, at: 0.07, dur: 0.06, gain: 0.03 },
    ],
    vibrate: 10,
    haptic: 'success',
  },
  // Yumuşak silme: inen hışırtı + kısa düşen ton (yargılamadan).
  'delete-soft': {
    minIntervalMs: 250,
    steps: [
      { wave: 'noise', freq: 3000, freqEnd: 900, at: 0, dur: 0.11, gain: 0.08, attack: 0.02 },
      { wave: 'sine', freq: G4, freqEnd: E4, at: 0.02, dur: 0.12, gain: 0.18 },
    ],
    haptic: 'light',
  },
  // Sheet açıldı / kapandı: hava + yön veren ton (yukarı = açık).
  'open-sheet': {
    minIntervalMs: 200,
    reverb: 0.05,
    steps: [
      { wave: 'noise', freq: 1200, freqEnd: 2600, at: 0, dur: 0.1, gain: 0.06, attack: 0.03 },
      { wave: 'sine', freq: E5, freqEnd: A5, at: 0.01, dur: 0.1, gain: 0.12, attack: 0.02 },
    ],
  },
  'close-sheet': {
    minIntervalMs: 200,
    reverb: 0.05,
    steps: [
      { wave: 'noise', freq: 2600, freqEnd: 1200, at: 0, dur: 0.09, gain: 0.06, attack: 0.02 },
      { wave: 'sine', freq: A5, freqEnd: E5, at: 0.01, dur: 0.09, gain: 0.11, attack: 0.015 },
    ],
  },
  // Anahtar açık / kapalı: aynı tık, yön farklı.
  'toggle-on': {
    minIntervalMs: 90,
    reverb: 0.04,
    steps: [
      { wave: 'noise', freq: 4000, at: 0, dur: 0.015, gain: 0.1 },
      { wave: 'triangle', freq: G5, freqEnd: C6, at: 0.005, dur: 0.07, gain: 0.2, pan: 0.15 },
    ],
    haptic: 'light',
  },
  'toggle-off': {
    minIntervalMs: 90,
    reverb: 0.04,
    steps: [
      { wave: 'noise', freq: 3200, at: 0, dur: 0.015, gain: 0.1 },
      { wave: 'triangle', freq: C6, freqEnd: G5, at: 0.005, dur: 0.07, gain: 0.17, pan: -0.15 },
    ],
    haptic: 'light',
  },
  // QR okundu: iki parlak cam çan (beşli), net ama kibar.
  'scan-success': {
    minIntervalMs: 600,
    reverb: 0.1,
    steps: [
      { wave: 'sine', freq: C6, at: 0, dur: 0.1, gain: 0.24, fm: { ratio: 2, index: 0.5 }, pan: -0.15 },
      { wave: 'sine', freq: G6, at: 0.07, dur: 0.2, gain: 0.24, fm: { ratio: 2, index: 0.3 }, pan: 0.15 },
    ],
    vibrate: 15,
    haptic: 'success',
  },
  // Büyük an: pentatonik akor çiçeği + koro + parıltı. Ailenin tek uzun sesi (≤ 1.2 s).
  celebration: {
    minIntervalMs: 2500,
    reverb: 0.22,
    steps: [
      { wave: 'triangle', freq: C5, at: 0, dur: 0.16, gain: 0.22, pan: -0.3 },
      { wave: 'triangle', freq: E5, at: 0.07, dur: 0.16, gain: 0.22, pan: -0.1 },
      { wave: 'triangle', freq: G5, at: 0.14, dur: 0.16, gain: 0.22, pan: 0.1 },
      { wave: 'triangle', freq: A5, at: 0.21, dur: 0.16, gain: 0.22, pan: 0.3 },
      { wave: 'sine', freq: C6, at: 0.3, dur: 0.8, gain: 0.26, detune: -7, pan: -0.25, attack: 0.02 },
      { wave: 'sine', freq: C6, at: 0.3, dur: 0.8, gain: 0.2, detune: 7, pan: 0.25, attack: 0.02 },
      { wave: 'sine', freq: E6, at: 0.36, dur: 0.6, gain: 0.08, fm: { ratio: 2, index: 0.4 } },
      { wave: 'sine', freq: C4, at: 0.3, dur: 0.7, gain: 0.08, attack: 0.04 },
      { wave: 'sine', freq: A6, at: 0.42, dur: 0.12, gain: 0.04, pan: 0.4 },
      { wave: 'sine', freq: G6, at: 0.52, dur: 0.12, gain: 0.04, pan: -0.4 },
      { wave: 'noise', freq: 8000, at: 0.3, dur: 0.4, gain: 0.03, attack: 0.05 },
    ],
    vibrate: [20, 50, 20, 50, 30],
    haptic: 'heavy',
  },
};

/** Tek "uzun" ses bütçesi istisnası. */
export const LONG_SOUNDS: readonly SoundName[] = ['celebration'];

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
  heart: 'like',
  favorite: 'like',
  message: 'receive-message',
  'message-sent': 'send',
  'qr-scan': 'scan-success',
  redeem: 'purchase',
  remove: 'delete-soft',
  'sheet-open': 'open-sheet',
  'sheet-close': 'close-sheet',
  confetti: 'celebration',
  'big-win': 'celebration',
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
