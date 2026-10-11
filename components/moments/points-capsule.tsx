'use client';

import { useEffect, useRef, useState } from 'react';
import { m as Motion } from 'framer-motion';
import { Coins, Sparkles } from 'lucide-react';
import { DURATION, DURATION_MS, EASE, SPRING, useNumberTicker, useReducedMotionPref } from '@/lib/motion';
import { MOMENT_PULSE_EVENT } from '@/components/ds/play/points-chip';
import { formatInt } from '@/components/ds/play/shared';
import { buzz, confetti, sound } from '@/lib/moments/effects';
import type { PointsMoment } from '@/lib/moments/types';
import { useSceneCopy } from '@/lib/moments/scene-copy';
import { useLocaleSafe } from '@/lib/app-locale';

/**
 * Puan kapsülü (spec §3 "Puan" satırı): akışı kesmeyen, `pointer-events: none`,
 * üst ortada "+120" yaylı belirip sayar; küçük kıvılcım. Sayfada
 * `[data-moment-anchor="points"]` (üst çubuktaki `PointsChip momentAnchor`) varsa
 * kapsül oraya uçar ve hedefe "nabız" olayı gönderir; yoksa yukarı doğru söner.
 *
 * Süre bütçesi `DURATION.celebrate` (≤ 1,2 sn görünür + kısa çıkış). Azaltılmış
 * harekette: konfeti/ses/titreşim yok, yalnız opaklık; okunabilsin diye biraz daha
 * uzun durur. Ekran okuyucuya `aria-live="polite"` ile bir kez duyurulur.
 */
type Phase = 'enter' | 'fly' | 'fade';

const HOLD_MS = DURATION_MS.celebrate - DURATION_MS.slow; // ~880 ms sonra ayrılmaya başla
const REDUCED_HOLD_MS = 1600;

function findAnchor(): HTMLElement | null {
  if (typeof document === 'undefined') return null;
  const nodes = document.querySelectorAll<HTMLElement>('[data-moment-anchor="points"]');
  for (const el of Array.from(nodes)) {
    const r = el.getBoundingClientRect();
    const visible =
      r.width > 0 &&
      r.height > 0 &&
      r.bottom > 0 &&
      r.right > 0 &&
      r.top < window.innerHeight &&
      r.left < window.innerWidth;
    if (visible) return el;
  }
  return null;
}

export function PointsCapsule({ moment, onDone }: { moment: PointsMoment; onDone: () => void }) {
  const reduce = useReducedMotionPref();
  const copy = useSceneCopy();
  const pointsUnit = useLocaleSafe() === 'en' ? 'points' : 'puan';
  const capsuleRef = useRef<HTMLDivElement | null>(null);
  const anchorRef = useRef<HTMLElement | null>(null);
  const doneRef = useRef(false);
  const [phase, setPhase] = useState<Phase>('enter');
  const [delta, setDelta] = useState({ x: 0, y: 0 });
  // Canlı bölge boş bağlanır, içerik bir kare sonra yazılır → ekran okuyucu güvenle duyurur.
  const [announce, setAnnounce] = useState(false);
  useEffect(() => {
    const id = window.setTimeout(() => setAnnounce(true), 50);
    return () => window.clearTimeout(id);
  }, []);
  const points = useNumberTicker(moment.points, { animateOnMount: !reduce, durationMs: 600 });
  const xp = moment.xp ?? 0;

  const finish = () => {
    if (doneRef.current) return;
    doneRef.current = true;
    onDone();
  };

  // Efektler: yalnız bir kez, giriş anında.
  useEffect(() => {
    if (reduce) return;
    const rect = capsuleRef.current?.getBoundingClientRect();
    const origin =
      rect && typeof window !== 'undefined'
        ? { x: (rect.left + rect.width / 2) / window.innerWidth, y: (rect.top + rect.height) / window.innerHeight }
        : undefined;
    const stop = confetti('spark', { origin });
    sound('coin');
    buzz();
    return stop;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Zamanlama: bekle → (hedef varsa) uç / (yoksa) sön.
  useEffect(() => {
    const t = window.setTimeout(
      () => {
        if (reduce) {
          setPhase('fade');
          return;
        }
        const anchor = moment.points > 0 ? findAnchor() : null; // yalnız XP: puan çipine uçmaz
        const cap = capsuleRef.current;
        if (anchor && cap) {
          const a = anchor.getBoundingClientRect();
          const c = cap.getBoundingClientRect();
          anchorRef.current = anchor;
          setDelta({ x: a.left + a.width / 2 - (c.left + c.width / 2), y: a.top + a.height / 2 - (c.top + c.height / 2) });
          setPhase('fly');
        } else {
          setPhase('fade');
        }
      },
      reduce ? REDUCED_HOLD_MS : HOLD_MS,
    );
    // Emniyet: animasyon olayı gelmese bile kuyruk tıkanmasın.
    const guard = window.setTimeout(finish, (reduce ? REDUCED_HOLD_MS : HOLD_MS) + 1500);
    return () => {
      window.clearTimeout(t);
      window.clearTimeout(guard);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reduce]);

  const animate =
    phase === 'enter'
      ? { opacity: 1, scale: 1, x: 0, y: 0 }
      : phase === 'fly'
        ? { opacity: 0.2, scale: 0.35, x: delta.x, y: delta.y }
        : { opacity: 0, scale: reduce ? 1 : 0.96, x: 0, y: reduce ? 0 : -24 };

  const transition =
    phase === 'enter'
      ? reduce
        ? { duration: DURATION.fast }
        : SPRING.bouncy
      : phase === 'fly'
        ? { duration: DURATION.slow, ease: EASE.emphasized }
        : { duration: reduce ? DURATION.fast : DURATION.slow, ease: EASE.exit };

  const hasPoints = moment.points > 0;
  const label = copy.pointsEarned(moment.points, xp);

  return (
    // Konum bu sarmalayıcıda (CSS); animasyon içteki Motion öğesinde (framer transform'u Tailwind translate'ini ezmesin).
    <div
      className="pointer-events-none fixed inset-x-0 z-toast flex justify-center px-4"
      style={{ top: 'calc(env(safe-area-inset-top, 0px) + 0.75rem)' }}
      data-moment-capsule=""
    >
      <span className="sr-only" role="status" aria-live="polite" aria-atomic="true">
        {announce ? label : ''}
      </span>
      <Motion.div
        ref={capsuleRef}
        aria-hidden
        initial={reduce ? { opacity: 0 } : { opacity: 0, scale: 0.6, y: -12 }}
        animate={animate}
        transition={transition}
        onAnimationComplete={() => {
          if (phase === 'fly') {
            try {
              anchorRef.current?.dispatchEvent(new CustomEvent(MOMENT_PULSE_EVENT));
            } catch {
              /* yoksay */
            }
            finish();
          } else if (phase === 'fade') {
            finish();
          }
        }}
        className="flex items-center gap-2 rounded-full bg-surface-2 px-4 py-2 text-fg ring-1 ring-inset ring-warning-border backdrop-blur-md qx-elevation-3"
      >
        {hasPoints ? (
          <>
            <span className="flex size-7 items-center justify-center rounded-full bg-warning-subtle text-warning">
              <Coins className="size-4" strokeWidth={2.4} />
            </span>
            <span className="qx-num text-lg font-bold tabular-nums text-warning">+{formatInt(points)}</span>
            <span className="qx-small font-medium text-fg-muted">{pointsUnit}</span>
          </>
        ) : (
          <span className="flex size-7 items-center justify-center rounded-full bg-brand-subtle text-brand">
            <Sparkles className="size-4" strokeWidth={2.4} />
          </span>
        )}
        {xp > 0 && (
          <>
            {hasPoints && <span className="h-4 w-px bg-border" />}
            {hasPoints && <Sparkles className="size-3.5 text-brand" strokeWidth={2.4} />}
            <span className={hasPoints ? 'qx-small font-semibold tabular-nums text-brand' : 'qx-num text-lg font-bold tabular-nums text-brand'}>
              +{formatInt(xp)} XP
            </span>
          </>
        )}
      </Motion.div>
    </div>
  );
}
