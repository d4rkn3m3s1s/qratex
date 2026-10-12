/**
 * Arayüz sesleri — tek API: `playSound(name)`.
 *
 * - Prosedürel Web Audio sentezi (bkz. recipes.ts) → indirme yok, lisans yok.
 *   Adım başına: yumuşak atak, StereoPanner, FM modülatör, detune; ses başına oda yankısı gönderimi.
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
import { DEFAULT_REVERB, SOUND_RECIPES, resolveSoundName, type SoundAlias, type SoundName, type SoundRecipe } from './recipes';
import { readSoundPrefs, scopeFromPath, type SoundScope } from './prefs';

export type { SoundName, SoundAlias } from './recipes';
export { SOUND_NAMES, SOUND_ALIASES, resolveSoundName } from './recipes';
export * from './prefs';

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let noiseBuf: AudioBuffer | null = null;
/** Oda yankısı girişi (ConvolverNode, üretilmiş IR). Yoksa yankısız çalınır. */
let reverbIn: GainNode | null = null;
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
    // Hafif oda: 0.45 s'lik stereo, üstel sönen gürültü IR'si (dosya yok). Kuru sinyal bozulmaz.
    try {
      const conv = ctx.createConvolver();
      conv.buffer = makeRoomIR(ctx, 0.45, 3.2);
      const rvLp = ctx.createBiquadFilter();
      rvLp.type = 'lowpass';
      rvLp.frequency.value = 5200;
      reverbIn = ctx.createGain();
      reverbIn.connect(conv).connect(rvLp).connect(lp);
    } catch {
      reverbIn = null;
    }
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

/** Üretilmiş küçük oda IR'si: her kanalda bağımsız gürültü × (1−t)^decay → doğal stereo genişlik. */
export function makeRoomIR(c: BaseAudioContext, seconds: number, decay: number): AudioBuffer {
  const len = Math.max(1, Math.floor(c.sampleRate * seconds));
  const buf = c.createBuffer(2, len, c.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
  }
  return buf;
}

function render(c: AudioContext, out: GainNode, recipe: SoundRecipe, volume: number) {
  const t0 = c.currentTime + 0.005;
  // Ses başına bir yankı gönderimi (tarif belirler; tick gibi sık sesler 0).
  let send: GainNode | null = null;
  const wet = recipe.reverb ?? DEFAULT_REVERB;
  if (reverbIn && wet > 0) {
    send = c.createGain();
    send.gain.value = wet;
    send.connect(reverbIn);
  }
  for (const s of recipe.steps) {
    const start = t0 + s.at;
    const end = start + s.dur;
    const env = c.createGain();
    const peak = Math.max(0.0002, s.gain * volume);
    const atk = Math.min(s.attack ?? 0.008, s.dur / 3);
    env.gain.setValueAtTime(0.0001, start);
    env.gain.exponentialRampToValueAtTime(peak, start + Math.max(0.002, atk));
    env.gain.exponentialRampToValueAtTime(0.0001, end);
    let tail: AudioNode = env;
    if (s.pan && typeof c.createStereoPanner === 'function') {
      const p = c.createStereoPanner();
      p.pan.value = Math.max(-1, Math.min(1, s.pan));
      env.connect(p);
      tail = p;
    }
    tail.connect(out);
    if (send) tail.connect(send);
    if (s.wave === 'noise') {
      const src = c.createBufferSource();
      src.buffer = getNoise(c);
      const bp = c.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.setValueAtTime(s.freq, start);
      if (s.freqEnd) bp.frequency.exponentialRampToValueAtTime(s.freqEnd, end);
      bp.Q.value = 1.2;
      src.connect(bp).connect(env);
      src.start(start);
      src.stop(end + 0.02);
    } else {
      const osc = c.createOscillator();
      osc.type = s.wave;
      osc.frequency.setValueAtTime(s.freq, start);
      if (s.freqEnd) osc.frequency.exponentialRampToValueAtTime(s.freqEnd, end);
      if (s.detune) osc.detune.setValueAtTime(s.detune, start);
      if (s.fm) {
        // FM: modülatör sapması sönümle birlikte azalır → çan/cam "ting", sonra saf ton.
        const mod = c.createOscillator();
        const dev = c.createGain();
        mod.frequency.setValueAtTime(s.freq * s.fm.ratio, start);
        dev.gain.setValueAtTime(s.freq * s.fm.index, start);
        dev.gain.exponentialRampToValueAtTime(Math.max(0.01, s.freq * s.fm.index * 0.05), end);
        mod.connect(dev).connect(osc.frequency);
        mod.start(start);
        mod.stop(end + 0.02);
      }
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
