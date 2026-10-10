/**
 * An Motoru — TEK efekt cephesi (spec §2 `effects.ts`, yol haritası §5.3).
 *
 *   confetti(preset, opts?)  → konfeti (canvas-confetti yalnız ilk kullanımda lazy yüklenir)
 *   sound(name)              → kısa Web Audio sesi (dosya yok)
 *   buzz(pattern)            → mobil titreşim
 *   prefersReducedMotion()   → OS `prefers-reduced-motion` VEYA `html.reduce-animations`
 *
 * Azaltılmış harekette HEPSİ no-op'tur. Tercih kaynağı `lib/motion/policy.ts →
 * isReducedMotion()`'dır; burada ikinci bir uygulama YOKTUR. Tercih bir efekt
 * sürerken açılırsa çalan konfetiler anında durdurulur.
 *
 * Projede `canvas-confetti`'yi doğrudan import etmek yerine bu cephe kullanılır
 * (`lib/effects/confetti.ts` ve `useConfetti` sağlayıcısı buraya delege eder).
 */
import type confettiNs from 'canvas-confetti';
import { isReducedMotion, subscribeReducedMotion } from '@/lib/motion/policy';
import {
  haptic,
  sfxClick,
  sfxCollectStar,
  sfxFanfare,
  sfxReveal,
  sfxWin,
} from '@/lib/game-sounds';
import { playRewardChime } from '@/lib/play-chime';

type ConfettiFn = typeof confettiNs;
export type RawConfettiOptions = confettiNs.Options;

/** Hareket azaltılmalı mı? (OS veya uygulama ayarı). Sunucuda `false` döner ama efektler zaten tarayıcı ister. */
export function prefersReducedMotion(): boolean {
  return isReducedMotion();
}

function canRun(): boolean {
  return typeof window !== 'undefined' && !prefersReducedMotion();
}

// ─── Konfeti ────────────────────────────────────────────────────────────────

let loader: () => Promise<ConfettiFn> = () => import('canvas-confetti').then((m) => m.default);
let confettiPromise: Promise<ConfettiFn> | null = null;

function loadConfetti(): Promise<ConfettiFn> {
  if (!confettiPromise) {
    confettiPromise = loader().catch((err) => {
      confettiPromise = null; // ağ hatasında bir sonraki denemede yeniden yükle
      throw err;
    });
  }
  return confettiPromise;
}

/** Çalan zamanlayıcılı efektler (iptal için). */
const running = new Set<{ cancel: () => void }>();
let reducedUnsub: (() => void) | null = null;

function watchReducedMotion() {
  if (reducedUnsub || typeof window === 'undefined') return;
  reducedUnsub = subscribeReducedMotion(() => {
    if (prefersReducedMotion()) stopAllEffects();
  });
}

/** Çalan tüm konfeti efektlerini durdurur ve tuvali temizler. */
export function stopAllEffects(): void {
  for (const r of Array.from(running)) r.cancel();
  running.clear();
  if (confettiPromise) {
    void confettiPromise
      .then((c) => {
        try {
          c.reset();
        } catch {
          /* yoksay */
        }
      })
      .catch(() => {});
  }
}

export type ConfettiPreset =
  /** Tek orta patlama (buton, küçük başarı). */
  | 'burst'
  /** ~3 sn iki yandan çoklu patlama (büyük başarı). */
  | 'celebration'
  /** ~2 sn yanlardan altın yağmur (ödül). */
  | 'shower'
  /** Yıldız patlaması (3 dalga). */
  | 'stars'
  /** ~5 sn havai fişek. */
  | 'fireworks'
  /** ~3 sn iki yandan ince akış. */
  | 'pride'
  /** Merkez + iki yan dalga (oyun kazanma). */
  | 'sides'
  /** Küçük kıvılcım (puan kapsülü). */
  | 'spark';

export type ConfettiOptions = {
  /** Hex renkler. CSS rengi (`hsl(var(--brand))`) verilirse `resolveColor` ile çözülür. */
  colors?: string[];
  origin?: { x?: number; y?: number };
  zIndex?: number;
  /** Parçacık ölçeği (varsayılan 1). */
  scalar?: number;
};

const PALETTE = {
  brand: ['#9333ea', '#c084fc', '#f472b6'],
  cool: ['#3b82f6', '#60a5fa', '#22d3ee'],
  mixed: ['#9333ea', '#3b82f6', '#22d3ee'],
  gold: ['#fbbf24', '#f59e0b', '#facc15'],
  stars: ['#FFE400', '#FFBD00', '#E89400', '#FFCA6C', '#FDFFB8'],
} as const;

const DEFAULT_Z = 9999;

function hexify(colors: string[] | undefined): string[] | undefined {
  if (!colors || colors.length === 0) return undefined;
  const out = colors.map((c) => resolveColor(c)).filter((c): c is string => !!c);
  return out.length ? out : undefined;
}

type Runner = (c: ConfettiFn, o: Required<Pick<ConfettiOptions, 'zIndex'>> & ConfettiOptions, handle: { cancelled: boolean; timers: Array<ReturnType<typeof setTimeout>>; raf: number | null }) => void;

const randomInRange = (min: number, max: number) => Math.random() * (max - min) + min;

const PRESETS: Record<ConfettiPreset, Runner> = {
  burst: (c, o) => {
    c({
      particleCount: 100,
      spread: 70,
      origin: { x: o.origin?.x ?? 0.5, y: o.origin?.y ?? 0.6 },
      colors: o.colors ?? [...PALETTE.mixed],
      zIndex: o.zIndex,
      scalar: o.scalar,
    });
  },
  celebration: (c, o, h) => {
    const duration = 3000;
    const end = Date.now() + duration;
    const defaults = { startVelocity: 30, spread: 360, ticks: 60, zIndex: o.zIndex, scalar: o.scalar };
    const tick = () => {
      if (h.cancelled) return;
      const left = end - Date.now();
      if (left <= 0) return;
      const particleCount = 50 * (left / duration);
      c({ ...defaults, particleCount, origin: { x: randomInRange(0.1, 0.3), y: Math.random() - 0.2 }, colors: o.colors ?? [...PALETTE.brand] });
      c({ ...defaults, particleCount, origin: { x: randomInRange(0.7, 0.9), y: Math.random() - 0.2 }, colors: o.colors ?? [...PALETTE.cool] });
      h.timers.push(setTimeout(tick, 250));
    };
    tick();
  },
  shower: (c, o, h) => {
    const end = Date.now() + 2000;
    const colors = o.colors ?? [...PALETTE.gold];
    const frame = () => {
      if (h.cancelled) return;
      c({ particleCount: 2, angle: 60, spread: 55, origin: { x: 0 }, colors, zIndex: o.zIndex, scalar: o.scalar });
      c({ particleCount: 2, angle: 120, spread: 55, origin: { x: 1 }, colors, zIndex: o.zIndex, scalar: o.scalar });
      if (Date.now() < end) h.raf = requestAnimationFrame(frame);
    };
    frame();
  },
  stars: (c, o, h) => {
    const defaults = {
      spread: 360,
      ticks: 50,
      gravity: 0,
      decay: 0.94,
      startVelocity: 30,
      colors: o.colors ?? [...PALETTE.stars],
      zIndex: o.zIndex,
      origin: o.origin ? { x: o.origin.x ?? 0.5, y: o.origin.y ?? 0.5 } : undefined,
    };
    const shoot = () => {
      if (h.cancelled) return;
      c({ ...defaults, particleCount: 40, scalar: 1.2 * (o.scalar ?? 1), shapes: ['star'] });
      c({ ...defaults, particleCount: 10, scalar: 0.75 * (o.scalar ?? 1), shapes: ['circle'] });
    };
    h.timers.push(setTimeout(shoot, 0), setTimeout(shoot, 100), setTimeout(shoot, 200));
  },
  fireworks: (c, o, h) => {
    const duration = 5000;
    const end = Date.now() + duration;
    const defaults = { startVelocity: 30, spread: 360, ticks: 60, zIndex: o.zIndex, scalar: o.scalar, colors: o.colors };
    const tick = () => {
      if (h.cancelled) return;
      const left = end - Date.now();
      if (left <= 0) return;
      const particleCount = 50 * (left / duration);
      c({ ...defaults, particleCount, origin: { x: randomInRange(0.1, 0.3), y: Math.random() - 0.2 } });
      c({ ...defaults, particleCount, origin: { x: randomInRange(0.7, 0.9), y: Math.random() - 0.2 } });
      h.timers.push(setTimeout(tick, 250));
    };
    tick();
  },
  pride: (c, o, h) => {
    const end = Date.now() + 3000;
    const colors = o.colors ?? ['#9333ea', '#ffffff'];
    const frame = () => {
      if (h.cancelled) return;
      c({ particleCount: 2, angle: 60, spread: 55, origin: { x: 0 }, colors, zIndex: o.zIndex });
      c({ particleCount: 2, angle: 120, spread: 55, origin: { x: 1 }, colors, zIndex: o.zIndex });
      if (Date.now() < end) h.raf = requestAnimationFrame(frame);
    };
    frame();
  },
  sides: (c, o, h) => {
    const colors = o.colors ?? ['#9333ea', '#ffffff', '#fbbf24'];
    const scalar = o.scalar ?? 0.9;
    c({ particleCount: 90, spread: 75, origin: { x: o.origin?.x ?? 0.5, y: o.origin?.y ?? 0.55 }, colors, scalar, zIndex: o.zIndex });
    h.timers.push(
      setTimeout(() => !h.cancelled && c({ particleCount: 50, angle: 60, spread: 60, origin: { x: 0, y: 0.6 }, colors, zIndex: o.zIndex }), 180),
      setTimeout(() => !h.cancelled && c({ particleCount: 50, angle: 120, spread: 60, origin: { x: 1, y: 0.6 }, colors, zIndex: o.zIndex }), 300),
    );
  },
  spark: (c, o) => {
    c({
      particleCount: 28,
      spread: 60,
      startVelocity: 22,
      ticks: 70,
      gravity: 0.9,
      scalar: o.scalar ?? 0.7,
      origin: { x: o.origin?.x ?? 0.5, y: o.origin?.y ?? 0.12 },
      colors: o.colors ?? [...PALETTE.gold, '#ffffff'],
      zIndex: o.zIndex,
    });
  },
};

/**
 * Konfeti ön ayarını çalar. Dönüş: efekti erken durduran fonksiyon.
 * Azaltılmış harekette ya da sunucuda hiçbir şey yapmaz (canvas-confetti yüklenmez bile).
 */
export function confetti(preset: ConfettiPreset, opts: ConfettiOptions = {}): () => void {
  if (!canRun()) return () => {};
  watchReducedMotion();
  const handle = { cancelled: false, timers: [] as Array<ReturnType<typeof setTimeout>>, raf: null as number | null };
  const entry = {
    cancel: () => {
      handle.cancelled = true;
      for (const t of handle.timers) clearTimeout(t);
      handle.timers = [];
      if (handle.raf !== null && typeof cancelAnimationFrame === 'function') cancelAnimationFrame(handle.raf);
      running.delete(entry);
    },
  };
  running.add(entry);
  // Uzun efektler kendiliğinden biter; kaydı 6 sn sonra temizle.
  handle.timers.push(setTimeout(() => running.delete(entry), 6000));

  void loadConfetti()
    .then((c) => {
      if (handle.cancelled || prefersReducedMotion()) return;
      const run = PRESETS[preset] ?? PRESETS.burst;
      run(c, { ...opts, colors: hexify(opts.colors), zIndex: opts.zIndex ?? DEFAULT_Z }, handle);
    })
    .catch(() => {
      /* konfeti kritik değil */
    });

  return entry.cancel;
}

/**
 * Ham canvas-confetti çağrısı (özel seçenek gereken eski çağıranlar için; ör. `useConfetti().fire(opts)`).
 * Azaltılmışta no-op.
 */
export function confettiRaw(options: RawConfettiOptions): void {
  if (!canRun()) return;
  watchReducedMotion();
  void loadConfetti()
    .then((c) => {
      if (prefersReducedMotion()) return;
      c({ zIndex: DEFAULT_Z, ...options, colors: hexify(options.colors) ?? options.colors });
    })
    .catch(() => {});
}

// ─── Renk çözümü ────────────────────────────────────────────────────────────

const HEX_RE = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i;

function rgbStringToHex(rgb: string): string | null {
  const m = rgb.match(/rgba?\(\s*(\d+(?:\.\d+)?)[,\s]+(\d+(?:\.\d+)?)[,\s]+(\d+(?:\.\d+)?)/i);
  if (!m) return null;
  const to2 = (v: string) => Math.max(0, Math.min(255, Math.round(Number(v)))).toString(16).padStart(2, '0');
  return `#${to2(m[1])}${to2(m[2])}${to2(m[3])}`;
}

/**
 * CSS rengini (ör. `hsl(var(--category-4))`) canvas'ın anladığı hex'e çevirir.
 * Tema token'ı kullanan sahneler konfetiyi aynı renkle boyayabilsin diye.
 * Hex zaten hex ise aynen; çözülemezse `null`.
 */
export function resolveColor(css: string): string | null {
  if (typeof css !== 'string' || !css.trim()) return null;
  const v = css.trim();
  if (HEX_RE.test(v)) return v;
  // canvas-confetti '#' önekisiz hex'i de kabul eder (eski çağıranlar böyle veriyor).
  if (/^(?:[0-9a-f]{3}|[0-9a-f]{6})$/i.test(v)) return `#${v}`;
  if (v.startsWith('rgb')) return rgbStringToHex(v);
  if (typeof document === 'undefined' || !document.body) return null;
  try {
    const probe = document.createElement('span');
    probe.style.color = v;
    if (!probe.style.color) return null; // geçersiz CSS
    probe.style.display = 'none';
    document.body.appendChild(probe);
    const computed = getComputedStyle(probe).color;
    probe.remove();
    return rgbStringToHex(computed);
  } catch {
    return null;
  }
}

// ─── Ses ve titreşim ────────────────────────────────────────────────────────

export type SoundName =
  /** Yükselen üç nota (ödül, rozet). */
  | 'chime'
  /** Kısa parlak "ping" (puan kapsülü). */
  | 'coin'
  /** Kazanma arpeji (oyun, seviye). */
  | 'win'
  /** Büyük başarı fanfarı (lig). */
  | 'fanfare'
  /** Yumuşak mistik akor (rozet açılışı). */
  | 'reveal'
  /** Arayüz tıkı. */
  | 'click';

const SOUNDS: Record<SoundName, () => void> = {
  chime: playRewardChime,
  coin: () => sfxCollectStar(3),
  win: sfxWin,
  fanfare: sfxFanfare,
  reveal: sfxReveal,
  click: sfxClick,
};

/** Kısa ses çalar. Azaltılmışta, sunucuda ya da Web Audio yoksa sessizce geçer. */
export function sound(name: SoundName): void {
  if (!canRun()) return;
  try {
    SOUNDS[name]?.();
  } catch {
    /* ses kritik değil */
  }
}

export const BUZZ = {
  tap: 12,
  success: [18, 40, 28] as number[],
  big: [30, 60, 30, 60, 60] as number[],
} as const;

/** Titreşim. Azaltılmışta no-op. */
export function buzz(pattern: number | number[] = BUZZ.tap): void {
  if (!canRun()) return;
  haptic(pattern);
}

/** Yalnız testler: konfeti yükleyicisini değiştirir / durumu sıfırlar. */
export const __effectsTesting = {
  setLoader(fn: () => Promise<ConfettiFn>) {
    loader = fn;
    confettiPromise = null;
  },
  reset() {
    stopAllEffects();
    reducedUnsub?.();
    reducedUnsub = null;
    confettiPromise = null;
    loader = () => import('canvas-confetti').then((m) => m.default);
  },
  runningCount: () => running.size,
};
