/**
 * Oyun efekt cephesi — ses, titreşim, konfeti ve sarsıntı TEK kapıdan.
 *
 * Kaynak sırası (yol haritası §4.2 kural 1 + §5.3):
 *   1. Hareket politikası (`lib/motion/policy → isReducedMotion`: OS VEYA uygulama ayarı)
 *      → azaltılmışta ses, titreşim, konfeti ve sarsıntı HİÇ çalmaz.
 *   2. Oyuncunun oyun tercihleri (`prefs.ts`: 🔊 ses, 📳 titreşim) → ek kısma.
 *   3. An Motoru efektleri (`lib/moments/effects`: `sound`, `buzz`, `confetti`) asıl çalıcıdır;
 *      oyunlar canvas-confetti'yi ya da `navigator.vibrate`'i DOĞRUDAN çağırmaz.
 *
 * Oyuna özel sentez sesleri (`lib/game-sounds` → `sfxHit`, `sfxCombo(2)`…) `fx.sfx(() => sfxHit())`
 * ile sarılır; böylece ses anahtarı ve politika onlara da uygulanır.
 */
import { isReducedMotion } from '@/lib/motion/policy';
import {
  buzz,
  confetti as momentsConfetti,
  sound as momentsSound,
  BUZZ,
  type ConfettiOptions,
  type ConfettiPreset,
  type SoundName,
} from '@/lib/moments/effects';
import { getGamePrefs } from './prefs';

export interface GameFx {
  /** Ses çalabilir mi (politika + tercih). */
  canSound(): boolean;
  /** Titreşim verebilir mi. */
  canHaptic(): boolean;
  /** Görsel kutlama / sarsıntı çalabilir mi (politika). */
  canCelebrate(): boolean;
  /** An Motoru adlı sesi. */
  sound(name: SoundName): void;
  /** Oyuna özel sentez sesi (ör. `() => sfxCombo(3)`). */
  sfx(play: () => void): void;
  /** Titreşim; `tap` | `success` | `big` ya da ms deseni. */
  haptic(pattern?: keyof typeof BUZZ | number | number[]): void;
  /** Konfeti (azaltılmışta no-op). Dönüş: erken durdurma. */
  confetti(preset: ConfettiPreset, opts?: ConfettiOptions): () => void;
  /** Ekran sarsıntısı genliği (px) — azaltılmışta 0. Oyun kendi çiziminde uygular. */
  shake(amplitude: number): number;
}

function inBrowser(): boolean {
  return typeof window !== 'undefined';
}

export const gameFx: GameFx = {
  canSound() {
    return inBrowser() && !isReducedMotion() && getGamePrefs().sound;
  },
  canHaptic() {
    return inBrowser() && !isReducedMotion() && getGamePrefs().haptics;
  },
  canCelebrate() {
    return inBrowser() && !isReducedMotion();
  },
  sound(name) {
    if (!gameFx.canSound()) return;
    momentsSound(name);
  },
  sfx(play) {
    if (!gameFx.canSound()) return;
    try {
      play();
    } catch {
      /* ses kritik değil */
    }
  },
  haptic(pattern = 'tap') {
    if (!gameFx.canHaptic()) return;
    const p = typeof pattern === 'string' ? BUZZ[pattern] : pattern;
    buzz(p as number | number[]);
  },
  confetti(preset, opts) {
    return momentsConfetti(preset, opts);
  },
  shake(amplitude) {
    return gameFx.canCelebrate() ? amplitude : 0;
  },
};
