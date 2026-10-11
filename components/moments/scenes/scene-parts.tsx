'use client';

import { useEffect, useRef, type CSSProperties, type ReactNode } from 'react';
import { m as Motion } from 'framer-motion';
import { DURATION, EASE, SPRING } from '@/lib/motion';
import { cn } from '@/lib/utils';
import { buzz, confetti, sound, type SoundName } from '@/lib/moments/effects';
import { sceneGradient, type ScenePair } from '@/lib/moments/scene-colors';
import { odometerColumns } from './scene-math';
import { useSceneCopy } from '@/lib/moments/scene-copy';

/**
 * Sahne kabuklarının ortak DOM parçaları: odometre, ilerleme çubuğu, eylem düğmesi,
 * geçiş ipucu, azaltılmış hareket kartı ve tek seferlik efekt tetikleyicisi.
 */

// ───────────────────────────── Odometre ─────────────────────────────

/**
 * Eski → yeni sayı, basamak basamak yukarı kayar. `flip` false iken eski değer görünür.
 * `from` daha kısaysa baştaki sütun yeni basamakla birlikte belirir.
 * Görsel; erişilebilir metni çağıran ayrıca verir (aria-hidden).
 */
export function Odometer({
  from,
  to,
  flip,
  className,
  style,
}: {
  from: number;
  to: number;
  flip: boolean;
  className?: string;
  style?: CSSProperties;
}) {
  const cols = odometerColumns(from, to);
  return (
    <span aria-hidden className={cn('inline-flex tabular-nums leading-none', className)} style={style}>
      {cols.map((c, i) => {
        const changes = c.from !== c.to;
        return (
          <span key={i} className="relative inline-block h-[1em] overflow-hidden" style={{ width: '0.62em' }}>
            <Motion.span
              className="absolute inset-x-0 top-0 flex flex-col items-center"
              initial={false}
              animate={{ y: flip && changes ? '-1em' : '0em' }}
              transition={{ ...SPRING.snappy, delay: flip ? (cols.length - 1 - i) * 0.07 : 0 }}
            >
              <span className="block h-[1em]" style={{ opacity: c.from == null ? 0 : 1 }}>
                {c.from ?? c.to}
              </span>
              <span className="block h-[1em]">{c.to}</span>
            </Motion.span>
          </span>
        );
      })}
    </span>
  );
}

// ───────────────────────────── İlerleme çubuğu ─────────────────────────────

export function SceneProgress({
  pct,
  colors,
  run,
  label,
  tone = 'stage',
}: {
  /** 0–100 */
  pct: number;
  colors: ScenePair;
  /** true olunca 0'dan hedefe dolar; 'static' → hareketsiz, doğrudan hedefte (azaltılmış). */
  run: boolean | 'static';
  /** Görünür etiket (ör. "Sonraki seviyeye 420 XP"). */
  label: string;
  /** stage: koyu sahne zemini; card: yüzey token'ları. */
  tone?: 'stage' | 'card';
}) {
  const v = Math.max(0, Math.min(100, Math.round(pct)));
  return (
    <div className="w-full">
      <div className={cn('mb-1.5 flex items-center justify-between qx-small font-medium', tone === 'stage' ? 'text-white/75' : 'text-fg-muted')}>
        <span>{label}</span>
        <span className="tabular-nums">%{v}</span>
      </div>
      <div
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={v}
        aria-label={label}
        className={cn('h-2 w-full overflow-hidden rounded-full', tone === 'stage' ? 'bg-white/15' : 'bg-surface-3')}
      >
        {run === 'static' ? (
          <div className="h-full rounded-full" style={{ width: `${v}%`, background: sceneGradient(colors) }} />
        ) : (
          <Motion.div
            className="h-full rounded-full"
            style={{ background: sceneGradient(colors) }}
            initial={{ width: '0%' }}
            animate={{ width: run ? `${v}%` : '0%' }}
            transition={{ duration: DURATION.slow * 2.5, ease: EASE.emphasized }}
          />
        )}
      </div>
    </div>
  );
}

// ───────────────────────────── Düğme / ipucu ─────────────────────────────

/** Koyu sahne üzerindeki birincil eylem (odak halkası `focus` token'ı). */
export function StageAction({ children, onClick, autoFocus }: { children: ReactNode; onClick: () => void; autoFocus?: boolean }) {
  return (
    <button
      type="button"
      data-scene-autofocus={autoFocus ? '' : undefined}
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      className="inline-flex min-h-11 items-center justify-center rounded-full bg-white px-6 text-sm font-semibold text-neutral-900 shadow-lg transition-transform duration-fast active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2 focus-visible:ring-offset-black"
    >
      {children}
    </button>
  );
}

/** `compact`: alçak ekranda (≤ 700 px) gizlenir — eylem düğmesi ve Esc/dokunuş yine çalışır. */
export function DismissHint({ tone = 'stage', compact }: { tone?: 'stage' | 'card'; compact?: boolean }) {
  const copy = useSceneCopy();
  return (
    <p
      className={cn(
        'qx-caption',
        tone === 'stage' ? 'text-white/60' : 'text-fg-subtle',
        compact && '[@media(max-height:700px)]:hidden',
      )}
    >
      {copy.dismissHint}
    </p>
  );
}

// ───────────────────────────── Azaltılmış hareket kartı ─────────────────────────────

/**
 * Azaltılmış harekette tek sade kart: 3B/konfeti/ses yok, yalnız kabuğun opaklık geçişi.
 * QDL yüzey token'ları (açık/koyu tema uyumlu).
 */
export function ReducedSceneCard({
  titleId,
  visual,
  overline,
  title,
  children,
  actions,
}: {
  titleId: string;
  visual: ReactNode;
  overline: string;
  title: string;
  children?: ReactNode;
  actions: ReactNode;
}) {
  return (
    <div
      onClick={(e) => e.stopPropagation()}
      className="w-[min(24rem,calc(100vw-2rem))] overflow-hidden rounded-2xl bg-surface-2 text-fg ring-1 ring-inset ring-border qx-elevation-3"
    >
      <div className="relative h-36 w-full overflow-hidden bg-surface-3">{visual}</div>
      <div className="flex flex-col gap-3 p-5 text-center">
        <p className="qx-overline text-brand">{overline}</p>
        <h2 id={titleId} className="qx-h2 text-fg">
          {title}
        </h2>
        {children}
        <div className="mt-1 flex flex-col items-center gap-2">{actions}</div>
      </div>
    </div>
  );
}

/** Kart üzerindeki birincil eylem (yüzey token'ları). */
export function CardAction({ children, onClick, autoFocus }: { children: ReactNode; onClick: () => void; autoFocus?: boolean }) {
  return (
    <button
      type="button"
      data-scene-autofocus={autoFocus ? '' : undefined}
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      className="inline-flex min-h-11 w-full items-center justify-center rounded-xl bg-brand px-5 text-sm font-semibold text-brand-fg transition-colors duration-fast hover:bg-brand/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2 focus-visible:ring-offset-surface-2"
    >
      {children}
    </button>
  );
}

// ───────────────────────────── Efektler ─────────────────────────────

/**
 * `when` ilk kez true olduğunda ses + titreşim (+ 3B yoksa konfeti) TEK KEZ çalar.
 * `lib/moments/effects` azaltılmış harekette hepsini zaten no-op yapar.
 */
export function useSceneCue(when: boolean, opts: { sound: SoundName; buzz: number | number[]; confettiColors?: string[]; withConfetti: boolean }) {
  const fired = useRef(false);
  const optsRef = useRef(opts);
  useEffect(() => {
    optsRef.current = opts;
  });
  useEffect(() => {
    if (!when || fired.current) return;
    fired.current = true;
    const o = optsRef.current;
    sound(o.sound);
    buzz(o.buzz);
    if (o.withConfetti) confetti('burst', { colors: o.confettiColors, origin: { x: 0.5, y: 0.45 } });
  }, [when]);
}
