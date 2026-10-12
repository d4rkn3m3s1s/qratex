/**
 * Arayüz sesleri — tek API: `playSound(name)`.
 *
 * - Prosedürel Web Audio sentezi (bkz. recipes.ts) → indirme yok, lisans yok.
 * - AudioContext TEMBEL: ilk kullanıcı etkileşiminde oluşturulur/"resume" edilir
 *   (iOS Safari / Capacitor WKWebView otomatik çalma kuralı).
 * - Tercih kapsam başına (müşteri AÇIK düşük seviye, bayi/admin KAPALI) — prefs.ts.
 * - Spam koruması + eşzamanlı ses sınırı — gate.ts.
 * - Opsiyonel haptik: Capacitor Haptics eklentisi çalışma anında varsa o, yoksa
 *   navigator.vibrate (Android Chrome); iOS Safari'de sessizce yok sayılır.
 *   Haptik de aynı "Arayüz sesleri" anahtarına bağlıdır.
 *
 * Sunucuda / AudioContext yoksa hiçbir şey yapmaz, asla fırlatmaz.
 */
import { SoundGate } from './gate';
import { SOUND_RECIPES, resolveSoundName, type SoundAlias, type SoundName, type SoundRecipe } from './recipes';
import { readSoundPrefs, scopeFromPath, type SoundScope } from './prefs';

export type { SoundName, SoundAlias } from './recipes';
export { SOUND_NAMES, SOUND_ALIASES, resolveSoundName } from './recipes';
export * from './prefs';

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let noiseBuf: AudioBuffer | null = null;
let listening = false;
const gate = new SoundGate();

function currentScope(): SoundScope {
  return typeof window === 'undefined' ? 'customer' : scopeFromPath(window.location.pathname);
}

function getCtx(): AudioContext | null {
  if (ctx) return ctx;
  if (typeof window === 'undefined') return null;
  const AC: typeof AudioContext | undefined =
    window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AC) return null;
  try {
    ctx = new AC({ latencyHint: 'interactive' });
    master = ctx.createGain();
    // Yumuşatıcı: hafif alçak geçiren + kompresör → hiçbir ses sert duyulmaz.
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 9000;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -18;
    comp.ratio.value = 4;
    master.connect(lp).connect(comp).connect(ctx.destination);
  } catch {
    ctx = null;
    master = null;
  }
  return ctx;
}

/** İlk dokunuş/tuşta bağlamı aç (iOS kilidi). Yalnız ses açıksa bağlam oluşturulur. */
function ensureUnlockListeners() {
  if (listening || typeof window === 'undefined') return;
  listening = true;
  const remove = () => {
    window.removeEventListener('pointerdown', unlock, true);
    window.removeEventListener('keydown', unlock, true);
    window.removeEventListener('touchend', unlock, true);
  };
  function unlock() {
    if (!readSoundPrefs(currentScope()).enabled) return; // kapalıyken AudioContext hiç açılmaz
    const c = getCtx();
    if (!c) return remove();
    try {
      // iOS: sessiz 1 örneklik buffer çalmak bağlamı kalıcı açar.
      const s = c.createBufferSource();
      s.buffer = c.createBuffer(1, 1, 22050);
      s.connect(c.destination);
      s.start(0);
    } catch {
      /* ignore */
    }
    void c
      .resume?.()
      .then(() => {
        if (c.state === 'running') remove();
      })
      .catch(() => {});
  }
  window.addEventListener('pointerdown', unlock, true);
  window.addEventListener('keydown', unlock, true);
  window.addEventListener('touchend', unlock, true);
  // Uygulama arka plandan dönünce iOS bağlamı "interrupted" bırakabilir.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && ctx && ctx.state !== 'running') void ctx.resume?.().catch(() => {});
  });
}

if (typeof window !== 'undefined') ensureUnlockListeners();

function getNoise(c: AudioContext): AudioBuffer {
  if (noiseBuf && noiseBuf.sampleRate === c.sampleRate) return noiseBuf;
  const len = Math.floor(c.sampleRate * 0.25);
  noiseBuf = c.createBuffer(1, len, c.sampleRate);
  const d = noiseBuf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  return noiseBuf;
}

function render(c: AudioContext, out: GainNode, recipe: SoundRecipe, volume: number) {
  const t0 = c.currentTime + 0.005;
  for (const s of recipe.steps) {
    const start = t0 + s.at;
    const end = start + s.dur;
    const env = c.createGain();
    const peak = Math.max(0.0002, s.gain * volume);
    env.gain.setValueAtTime(0.0001, start);
    env.gain.exponentialRampToValueAtTime(peak, start + Math.min(0.008, s.dur / 4));
    env.gain.exponentialRampToValueAtTime(0.0001, end);
    env.connect(out);
    if (s.wave === 'noise') {
      const src = c.createBufferSource();
      src.buffer = getNoise(c);
      const bp = c.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.value = s.freq;
      bp.Q.value = 1.2;
      src.connect(bp).connect(env);
      src.start(start);
      src.stop(end + 0.02);
    } else {
      const osc = c.createOscillator();
      osc.type = s.wave;
      osc.frequency.setValueAtTime(s.freq, start);
      if (s.freqEnd) osc.frequency.exponentialRampToValueAtTime(s.freqEnd, end);
      osc.connect(env);
      osc.start(start);
      osc.stop(end + 0.02);
    }
  }
}

type HapticsPlugin = {
  impact?: (o: { style: 'LIGHT' | 'MEDIUM' | 'HEAVY' }) => Promise<void>;
  notification?: (o: { type: 'SUCCESS' | 'ERROR' | 'WARNING' }) => Promise<void>;
};

function haptic(recipe: SoundRecipe) {
  if (!recipe.haptic && !recipe.vibrate) return;
  try {
    const cap = (window as unknown as {
      Capacitor?: { isNativePlatform?: () => boolean; Plugins?: { Haptics?: HapticsPlugin } };
    }).Capacitor;
    const h = cap?.isNativePlatform?.() ? cap.Plugins?.Haptics : undefined;
    if (h && recipe.haptic) {
      if (recipe.haptic === 'success' || recipe.haptic === 'error') {
        void h.notification?.({ type: recipe.haptic === 'success' ? 'SUCCESS' : 'ERROR' })?.catch(() => {});
      } else {
        void h.impact?.({ style: recipe.haptic.toUpperCase() as 'LIGHT' | 'MEDIUM' | 'HEAVY' })?.catch(() => {});
      }
      return;
    }
    if (recipe.vibrate && typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
      navigator.vibrate(recipe.vibrate);
    }
  } catch {
    /* ignore */
  }
}

export interface PlaySoundOptions {
  /** Ses seviyesi çarpanı (0..1), tercih seviyesiyle çarpılır. */
  volume?: number;
  /** false → haptik tetiklenmez. */
  haptic?: boolean;
}

/**
 * Bir arayüz sesi çal. Kapalıysa / bağlam açılamıyorsa / spam sınırındaysa
 * sessizce hiçbir şey yapmaz. Geç kalan sesler kuyruklanmaz (olaydan kopuk duyulur).
 */
export function playSound(input: SoundName | SoundAlias, opts: PlaySoundOptions = {}): void {
  if (typeof window === 'undefined') return;
  const name = resolveSoundName(input);
  if (!name) return;
  const recipe = SOUND_RECIPES[name];
  const prefs = readSoundPrefs(currentScope());
  if (!prefs.enabled || prefs.volume <= 0) return;
  if (!gate.tryAcquire(name, performance.now())) return;
  if (opts.haptic !== false) haptic(recipe);
  const c = getCtx();
  if (!c || !master) return;
  const out = master;
  const vol = prefs.volume * (opts.volume ?? 1);
  if (c.state === 'running') {
    try {
      render(c, out, recipe, vol);
    } catch {
      /* ignore */
    }
    return;
  }
  // Kullanıcı jestinin içindeysek resume hemen başarır → çal; değilse bu ses atlanır.
  void c
    .resume?.()
    .then(() => {
      if (c.state === 'running') render(c, out, recipe, vol);
    })
    .catch(() => {});
}

/** Ayar ekranındaki önizleme: tercihi yok sayar (kullanıcı jestinde çağrılır). */
export function previewSound(name: SoundName, volume: number): void {
  const c = getCtx();
  if (!c || !master) return;
  const out = master;
  void c
    .resume?.()
    .then(() => render(c, out, SOUND_RECIPES[name], volume))
    .catch(() => {});
}
