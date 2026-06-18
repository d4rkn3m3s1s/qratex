/**
 * Pacman oyunu için Web Audio ses motoru. Tek paylaşılan AudioContext; ses dosyası
 * yok (paket boyutu eklemez). "Animasyonları azalt" erişilebilirlik tercihi açıksa
 * tüm sesler susar.
 *
 * İlk kullanıcı etkileşiminde context oluşur (autoplay politikası).
 */
let ctx: AudioContext | null = null;

function muted(): boolean {
  if (typeof document === 'undefined') return true;
  return document.documentElement.classList.contains('reduce-animations');
}

function getCtx(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  if (muted()) return null;
  if (!ctx) {
    const Ctx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return null;
    try {
      ctx = new Ctx();
    } catch {
      return null;
    }
  }
  if (ctx.state === 'suspended') ctx.resume().catch(() => {});
  return ctx;
}

function tone(
  c: AudioContext,
  freq: number,
  startOffset: number,
  dur: number,
  type: OscillatorType,
  peak = 0.2,
  freqEnd?: number
) {
  const osc = c.createOscillator();
  const gain = c.createGain();
  const t0 = c.currentTime + startOffset;
  const t1 = t0 + dur;
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t0);
  if (freqEnd) osc.frequency.exponentialRampToValueAtTime(Math.max(1, freqEnd), t1);
  gain.gain.setValueAtTime(0.0001, t0);
  gain.gain.exponentialRampToValueAtTime(peak, t0 + 0.012);
  gain.gain.exponentialRampToValueAtTime(0.0001, t1);
  osc.connect(gain);
  gain.connect(c.destination);
  osc.start(t0);
  osc.stop(t1 + 0.02);
}

/** Yıldız toplama: kısa parlak "ping" (frekans pitch'i toplanan sayıyla yükselir). */
export function sfxCollectStar(index = 0): void {
  const c = getCtx();
  if (!c) return;
  const base = 880 + index * 90;
  tone(c, base, 0, 0.12, 'triangle', 0.18);
  tone(c, base * 1.5, 0.04, 0.1, 'sine', 0.12);
}

/** Power-up alımı: yükselen büyülü sweep. */
export function sfxPowerUp(): void {
  const c = getCtx();
  if (!c) return;
  tone(c, 300, 0, 0.28, 'sawtooth', 0.16, 1200);
  tone(c, 600, 0.05, 0.24, 'sine', 0.12, 1600);
}

/** Hayalet yeme (power modunda): tatmin edici "blop". */
export function sfxEatGhost(): void {
  const c = getCtx();
  if (!c) return;
  tone(c, 200, 0, 0.18, 'square', 0.2, 700);
}

/** Yakalanma / kayıp: alçalan üzgün ton. */
export function sfxHit(): void {
  const c = getCtx();
  if (!c) return;
  tone(c, 440, 0, 0.5, 'sawtooth', 0.22, 80);
}

/** Kazanma fanfarı. */
export function sfxWin(): void {
  const c = getCtx();
  if (!c) return;
  const notes = [523.25, 659.25, 783.99, 1046.5];
  notes.forEach((f, i) => tone(c, f, i * 0.11, 0.2, 'triangle', 0.22));
}

/** Power modu bitiyor uyarısı. */
export function sfxWarn(): void {
  const c = getCtx();
  if (!c) return;
  tone(c, 520, 0, 0.08, 'square', 0.1);
  tone(c, 520, 0.12, 0.08, 'square', 0.1);
}

/** Kullanıcı etkileşiminde context'i hazırlamak için (Oyna butonu). */
export function primeAudio(): void {
  getCtx();
}
