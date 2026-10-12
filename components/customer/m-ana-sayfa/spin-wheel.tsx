'use client';

/**
 * Günlük çark — yüz (SVG), ibre ve rAF fizik motoru.
 *
 * Görsel dil: düz yüzey dilimleri, tek dolu marka dilimi (en büyük puan), XP dilimleri
 * marka-ince, "pas" dilimi taralı. Gradient/parıltı yok; derinliği çivi halkası ve ince
 * ayraçlar verir.
 *
 * Fizik (motor React render'ı tetiklemez; açı/ibre/bulanıklık doğrudan transform/opacity):
 *   geri çekme (280 ms) → hızlanma (ease-in, 520 ms) → sabit hız (sunucu cevabını bekler)
 *   → sürtünmeyle yavaşlama (easeOutQuart; başlangıç türevi sabit hıza eşit, sıçrama yok)
 *   → hedefi OVER° geçip sönümlü geri sekme. Sonuç sunucudan gelir; çark o dilimde durur.
 */
import { memo, useCallback, useEffect, useMemo, useRef } from 'react';
import type { HomeSpinPrize } from '@/lib/customer-home/types';

export const VIEW = 400;
const C = VIEW / 2;
const R_FACE = 178;
const R_RIM = 196;
const R_PEG = 187;

export type PrizeText = { value: string; unit: string };

/** Dilim metni: sunucu etiketi yerine tür+değerden türetilir (tutarlı tipografi). */
export function prizeText(p: HomeSpinPrize, units: { points: string; xp: string; nothing: string }): PrizeText {
  if (p.type === 'nothing' || p.value <= 0) return { value: units.nothing, unit: '' };
  return { value: String(p.value), unit: p.type === 'xp' ? units.xp : units.points };
}

/** En büyük puan diliminin sırası (tek dolu marka dilimi); puan dilimi yoksa -1. */
export function jackpotIndex(prizes: HomeSpinPrize[]): number {
  let best = -1;
  prizes.forEach((p, i) => {
    if (p.type === 'points' && p.value > 0 && (best < 0 || p.value > prizes[best].value)) best = i;
  });
  return best;
}

function polar(r: number, deg: number): [number, number] {
  const rad = ((deg - 90) * Math.PI) / 180;
  return [C + r * Math.cos(rad), C + r * Math.sin(rad)];
}

function slicePath(i: number, seg: number, r = R_FACE): string {
  const [x0, y0] = polar(r, i * seg);
  const [x1, y1] = polar(r, (i + 1) * seg);
  return `M ${C} ${C} L ${x0} ${y0} A ${r} ${r} 0 ${seg > 180 ? 1 : 0} 1 ${x1} ${y1} Z`;
}

type Tone = 'jackpot' | 'xp' | 'nothing' | 'a' | 'b';

const FILL: Record<Tone, string> = {
  jackpot: 'hsl(var(--brand))',
  xp: 'hsl(var(--brand-subtle))',
  nothing: 'url(#qx-wheel-hatch)',
  a: 'hsl(var(--surface-1))',
  b: 'hsl(var(--surface-2))',
};
const INK: Record<Tone, string> = {
  jackpot: 'hsl(var(--brand-fg))',
  xp: 'hsl(var(--brand-text))',
  nothing: 'hsl(var(--text-2))',
  a: 'hsl(var(--text-1))',
  b: 'hsl(var(--text-1))',
};

export type WheelFaceProps = {
  prizes: HomeSpinPrize[];
  units: { points: string; xp: string; nothing: string };
  /** Kazanan dilim: diğerleri karartılır (sonuç anı). */
  winner?: number | null;
  /** Kartın "kullanıldı" hâli: renkler geri çekilir, yalnız büyük dilim konturla kalır. */
  muted?: boolean;
  /** Yalnız metin katmanı (hız bulanıklığı hayaleti). */
  labelsOnly?: boolean;
  className?: string;
};

/** Çark yüzü (statik SVG). Döndürme dışarıda: sarmalayan elemanın transform'u. */
export const WheelFace = memo(function WheelFace({ prizes, units, winner = null, muted = false, labelsOnly = false, className }: WheelFaceProps) {
  const count = Math.max(1, prizes.length);
  const seg = 360 / count;
  const jp = jackpotIndex(prizes);
  const small = count > 8;

  const slices = useMemo(
    () =>
      prizes.map((p, i) => {
        const tone: Tone =
          i === jp ? 'jackpot' : p.type === 'nothing' || p.value <= 0 ? 'nothing' : p.type === 'xp' ? 'xp' : i % 2 === 0 ? 'a' : 'b';
        const mid = (i + 0.5) * seg;
        const [vx, vy] = polar(small ? 128 : 136, mid);
        const [ux, uy] = polar(small ? 100 : 104, mid);
        return { id: p.id, tone, mid, vx, vy, ux, uy, text: prizeText(p, units), path: slicePath(i, seg) };
      }),
    [prizes, seg, jp, small, units]
  );

  if (labelsOnly) {
    return (
      <svg viewBox={`0 0 ${VIEW} ${VIEW}`} className={className} aria-hidden focusable="false">
        {slices.map((s) => (
          <text
            key={s.id}
            x={s.vx}
            y={s.vy}
            transform={`rotate(${s.mid} ${s.vx} ${s.vy})`}
            textAnchor="middle"
            dominantBaseline="central"
            fontSize={small ? 24 : 32}
            fontWeight={700}
            fill={INK[s.tone]}
          >
            {s.text.value}
          </text>
        ))}
      </svg>
    );
  }

  return (
    <svg viewBox={`0 0 ${VIEW} ${VIEW}`} className={className} aria-hidden focusable="false">
      <defs>
        <pattern id="qx-wheel-hatch" width="10" height="10" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <rect width="10" height="10" fill="hsl(var(--surface-3))" />
          <line x1="0" y1="0" x2="0" y2="10" stroke="hsl(var(--border-strong))" strokeWidth="2" />
        </pattern>
      </defs>

      {/* Jant: düz marka halkası (muted'da nötr). */}
      <circle cx={C} cy={C} r={R_RIM} fill={muted ? 'hsl(var(--surface-3))' : 'hsl(var(--brand))'} />
      <circle cx={C} cy={C} r={R_FACE + 1} fill="hsl(var(--surface-0))" />

      {slices.map((s, i) => (
        <path
          key={s.id}
          d={s.path}
          fill={muted && s.tone !== 'nothing' ? (s.tone === 'jackpot' ? 'hsl(var(--brand-subtle))' : FILL[i % 2 === 0 ? 'a' : 'b']) : FILL[s.tone]}
          stroke="hsl(var(--border-subtle))"
          strokeWidth="1.5"
        />
      ))}

      {slices.map((s) => (
        <g key={`t-${s.id}`} fill={muted ? (s.tone === 'jackpot' ? 'hsl(var(--brand-text))' : 'hsl(var(--text-2))') : INK[s.tone]}>
          <text
            x={s.vx}
            y={s.vy}
            transform={`rotate(${s.mid} ${s.vx} ${s.vy})`}
            textAnchor="middle"
            dominantBaseline="central"
            fontSize={small ? 24 : s.text.unit ? 32 : 22}
            fontWeight={700}
            style={{ fontVariantNumeric: 'tabular-nums', letterSpacing: '-0.02em' }}
          >
            {s.text.value}
          </text>
          {s.text.unit ? (
            <text
              x={s.ux}
              y={s.uy}
              transform={`rotate(${s.mid} ${s.ux} ${s.uy})`}
              textAnchor="middle"
              dominantBaseline="central"
              fontSize={small ? 11 : 13}
              fontWeight={600}
              style={{ letterSpacing: '0.08em', textTransform: 'uppercase' }}
              opacity={0.8}
            >
              {s.text.unit}
            </text>
          ) : null}
        </g>
      ))}

      {/* Sonuç anı: kazanan dışındaki dilimler geri çekilir (yalnız opacity geçişi). */}
      {slices.map((s, i) => (
        <path
          key={`d-${s.id}`}
          d={s.path}
          fill="hsl(var(--surface-0))"
          style={{ opacity: winner != null && winner !== i ? 0.62 : 0, transition: 'opacity 320ms var(--ease-standard, ease)' }}
        />
      ))}
      {winner != null && slices[winner] ? (
        <path d={slices[winner].path} fill="none" stroke="hsl(var(--text-1))" strokeWidth="4" strokeLinejoin="round" />
      ) : null}

      {/* Çivi halkası: dilim sınırlarında; ibre bunlara çarpar. */}
      {slices.map((s, i) => {
        const [px, py] = polar(R_PEG, i * seg);
        return (
          <circle
            key={`p-${s.id}`}
            cx={px}
            cy={py}
            r={5}
            fill={muted ? 'hsl(var(--surface-1))' : 'hsl(var(--brand-fg))'}
            stroke={muted ? 'hsl(var(--border-strong))' : 'none'}
            strokeWidth="1.5"
          />
        );
      })}

      {/* Göbek */}
      <circle cx={C} cy={C} r={40} fill="hsl(var(--surface-0))" stroke="hsl(var(--border-strong))" strokeWidth="2" />
      <circle cx={C} cy={C} r={26} fill={muted ? 'hsl(var(--surface-3))' : 'hsl(var(--brand))'} />
      <text
        x={C}
        y={C + 1}
        textAnchor="middle"
        dominantBaseline="central"
        fontSize="24"
        fontWeight={800}
        fill={muted ? 'hsl(var(--text-2))' : 'hsl(var(--brand-fg))'}
      >
        {muted ? '?' : 'Q'}
      </text>
    </svg>
  );
});

/** İbre (dil): pim noktası üstte; çiviye çarpınca bu noktada döner. */
export function WheelPointer({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 40 52" className={className} aria-hidden focusable="false">
      <path
        d="M20 50 L6 18 C4 8 12 2 20 2 C28 2 36 8 34 18 Z"
        fill="hsl(var(--text-1))"
        stroke="hsl(var(--surface-0))"
        strokeWidth="3"
        strokeLinejoin="round"
      />
      <circle cx="20" cy="15" r="5" fill="hsl(var(--surface-0))" />
    </svg>
  );
}

// ─── Fizik motoru ─────────────────────────────────────────────────────────────

const WIND_MS = 280;
const WIND_DEG = 14;
const ACCEL_MS = 520;
/** Sabit hız (derece/ms ≈ 3,5 tur/sn). */
const VMAX = 1.25;
/** Sunucu hemen dönse bile en az bu kadar tam hızda dönsün. */
const MIN_CRUISE_MS = 260;
const MIN_TURNS = 3;
const OVER = 7;
const SETTLE_MS = 720;

type Phase = 'idle' | 'wind' | 'accel' | 'cruise' | 'decel' | 'settle';

export type WheelFrame = { angle: number; speed: number; deflect: number };

function easeOutQuart(u: number) {
  return 1 - Math.pow(1 - u, 4);
}

/** Pointer altında `index` diliminin (dilim içi sapmayla) durduğu mutlak açı; `from + minDeg`'den sonraki ilk denk. */
export function landingAngle(from: number, index: number | null, count: number, minDeg: number, jitter = Math.random()): number {
  const seg = 360 / Math.max(1, count);
  const w = index == null ? jitter * 360 : (index + 0.5) * seg + (jitter - 0.5) * seg * 0.5;
  const base = from + minDeg;
  const want = (((-w - base) % 360) + 360) % 360;
  return base + want;
}

/**
 * rAF fizik motoru. `apply` her karede çağrılır (DOM'u doğrudan günceller);
 * `onPeg` çivi geçişinde (hız, derece/ms).
 */
export function useWheelEngine({
  count,
  apply,
  onPeg,
}: {
  count: number;
  apply: (f: WheelFrame) => void;
  onPeg?: (speed: number) => void;
}) {
  const seg = 360 / Math.max(1, count);
  const st = useRef({
    phase: 'idle' as Phase,
    a: -seg / 2 + 4,
    t: 0,
    from: 0,
    dist: 0,
    dur: 0,
    final: 0,
    deflect: 0,
    peg: 0,
    target: undefined as number | null | undefined,
    done: null as null | (() => void),
  });
  const raf = useRef<number | null>(null);
  const applyRef = useRef(apply);
  const pegRef = useRef(onPeg);
  applyRef.current = apply;
  pegRef.current = onPeg;

  const loop = useCallback(() => {
    let last = performance.now();
    const frame = (now: number) => {
      const s = st.current;
      const dt = Math.min(48, Math.max(1, now - last));
      last = now;
      const prev = s.a;
      s.t += dt;
      switch (s.phase) {
        case 'wind': {
          const u = Math.min(1, s.t / WIND_MS);
          s.a = s.from - WIND_DEG * Math.sin((u * Math.PI) / 2);
          if (u >= 1) {
            s.phase = 'accel';
            s.t = 0;
          }
          break;
        }
        case 'accel': {
          const u = Math.min(1, s.t / ACCEL_MS);
          s.a += VMAX * u * u * dt;
          if (u >= 1) {
            s.phase = 'cruise';
            s.t = 0;
          }
          break;
        }
        case 'cruise': {
          s.a += VMAX * dt;
          if (s.target !== undefined && s.t >= MIN_CRUISE_MS) {
            const exact = s.target !== null;
            s.final = landingAngle(s.a, s.target, count, exact ? MIN_TURNS * 360 : 360);
            s.from = s.a;
            s.dist = s.final + (exact ? OVER : 0) - s.a;
            // easeOutQuart'ın başlangıç türevi 4 → süre, başlangıç hızı VMAX'e eşit olacak şekilde.
            s.dur = (4 * s.dist) / VMAX;
            s.phase = 'decel';
            s.t = 0;
          }
          break;
        }
        case 'decel': {
          const u = Math.min(1, s.t / s.dur);
          s.a = s.from + s.dist * easeOutQuart(u);
          if (u >= 1) {
            s.phase = s.target === null ? 'idle' : 'settle';
            s.t = 0;
          }
          break;
        }
        case 'settle': {
          const u = Math.min(1, s.t / SETTLE_MS);
          s.a = s.final + OVER * Math.exp(-5 * u) * Math.cos(Math.PI * 1.5 * u);
          if (u >= 1) {
            s.a = s.final;
            s.phase = 'idle';
          }
          break;
        }
        default:
          break;
      }

      const delta = s.a - prev;
      const speed = Math.abs(delta) / dt;
      const peg = Math.floor(s.a / seg);
      if (peg !== s.peg) {
        s.peg = peg;
        // Çivi ibrenin ucunu dönüş yönünde iter: saat yönü dönüşte ibre saat tersine sapar.
        s.deflect = -Math.sign(delta || 1) * Math.min(28, 7 + speed * 18);
        pegRef.current?.(speed);
      }
      s.deflect *= Math.exp(-dt / 65);
      applyRef.current({ angle: s.a, speed, deflect: s.deflect });

      if (s.phase === 'idle') {
        raf.current = null;
        applyRef.current({ angle: s.a, speed: 0, deflect: 0 });
        const cb = s.done;
        s.done = null;
        cb?.();
        return;
      }
      raf.current = requestAnimationFrame(frame);
    };
    raf.current = requestAnimationFrame(frame);
  }, [count, seg]);

  useEffect(
    () => () => {
      if (raf.current != null) cancelAnimationFrame(raf.current);
    },
    []
  );

  /** Geri çekme + hızlanma; sonuç gelene kadar sabit hızda döner. */
  const start = useCallback(() => {
    const s = st.current;
    if (s.phase !== 'idle') return;
    s.phase = 'wind';
    s.t = 0;
    s.from = s.a;
    s.target = undefined;
    s.peg = Math.floor(s.a / seg);
    loop();
  }, [loop, seg]);

  /** Sunucunun seçtiği dilime in (`null` → hedefsiz yavaşla, hata hâli). */
  const land = useCallback((index: number | null, done: () => void) => {
    const s = st.current;
    s.target = index;
    s.done = done;
    if (s.phase === 'idle') done();
  }, []);

  /** Azaltılmış hareket: dönmeden hedef dilime geç. */
  const snap = useCallback(
    (index: number) => {
      const s = st.current;
      s.a = landingAngle(s.a, index, count, 0, 0.5);
      s.peg = Math.floor(s.a / seg);
      applyRef.current({ angle: s.a, speed: 0, deflect: 0 });
    },
    [count, seg]
  );

  const initialAngle = st.current.a;
  return { start, land, snap, initialAngle };
}

// ─── Geri sayım ───────────────────────────────────────────────────────────────

export function splitMs(ms: number) {
  const total = Math.max(0, Math.floor(ms / 1000));
  return { h: Math.floor(total / 3600), m: Math.floor((total % 3600) / 60), s: total % 60 };
}

export function pad2(n: number) {
  return n < 10 ? `0${n}` : String(n);
}
