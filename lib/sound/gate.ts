import { SOUND_RECIPES, recipeDuration, type SoundName } from './recipes';

/** Aynı anda çalabilecek en fazla ses (üst üste binen toast + ödül vb.). */
export const MAX_CONCURRENT_SOUNDS = 4;

/**
 * Saf zamanlama kapısı: ses başına en kısa aralık + eşzamanlı ses sınırı.
 * Zaman dışarıdan verilir (ms) → jest'te deterministik.
 */
export class SoundGate {
  private last = new Map<SoundName, number>();
  private endings: number[] = [];

  constructor(private readonly maxConcurrent = MAX_CONCURRENT_SOUNDS) {}

  /** Çalınabilirse kaydeder ve true döner. */
  tryAcquire(name: SoundName, nowMs: number): boolean {
    const recipe = SOUND_RECIPES[name];
    if (!recipe) return false;
    const prev = this.last.get(name);
    if (prev !== undefined && nowMs - prev < recipe.minIntervalMs) return false;
    this.endings = this.endings.filter((t) => t > nowMs);
    if (this.endings.length >= this.maxConcurrent) return false;
    this.last.set(name, nowMs);
    this.endings.push(nowMs + recipeDuration(recipe) * 1000);
    return true;
  }

  active(nowMs: number): number {
    return this.endings.filter((t) => t > nowMs).length;
  }
}
