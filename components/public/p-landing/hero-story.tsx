'use client';

import { useEffect, useState } from 'react';
import { AnimatePresence, m as Motion } from 'framer-motion';
import { Award, QrCode, Star } from 'lucide-react';
import { Ambient, DURATION, EASE, SPRING } from '@/lib/motion';
import { fmt } from './fmt';
import type { LandingCopy } from './landing-copy';

type StoryCopy = LandingCopy['story'];

const FRAME_MS = 2800;
const FRAMES = ['scan', 'rate', 'reward'] as const;
type Frame = (typeof FRAMES)[number];

/**
 * Hero'daki telefon mikro-hikâyesi (play kaydı, tek "imza an").
 * - Dekoratif: tüm kare içeriği `aria-hidden`; anlamı `figcaption` taşır.
 * - Döngü yalnız `<Ambient>` içinde: görünür alanda değilken, sekme gizliyken ya da
 *   azaltılmış harekette DURUR; azaltılmış harekette statik özet kare gösterilir.
 * - Çapraz geçişte çıkan ve giren kare örtüşür (boş kare oluşmaz).
 * - Kare konumu (absolute inset) animasyonsuz sarmalayıcıda; framer yalnız opaklık/y taşır.
 * Puan/XP değerleri sunucudaki puan matrisinden gelir.
 */
export function HeroStory({
  copy,
  points,
  xp,
  pointsLabel,
  xpLabel,
}: {
  copy: StoryCopy;
  points: string;
  xp: string;
  pointsLabel: string;
  xpLabel: string;
}) {
  const summary = fmt(copy.staticSummary, { points, xp });
  return (
    <figure className="relative mx-auto w-full max-w-[19rem]">
      {/* Arka parıltı: konum dış katmanda, statik (dekor). */}
      <div
        aria-hidden
        className="pointer-events-none absolute -inset-6 rounded-[3rem] bg-gradient-to-br from-primary/25 via-transparent to-primary/10 blur-2xl"
      />
      <div className="relative rounded-[2.5rem] border border-strong bg-surface-2 p-2.5 shadow-2xl">
        <div className="relative aspect-[9/16] overflow-hidden rounded-[2rem] border border-subtle bg-surface-0">
          <div aria-hidden className="absolute left-1/2 top-2 z-10 h-1.5 w-16 -translate-x-1/2 rounded-full bg-fg/15" />
          <span className="absolute right-3 top-5 z-10 rounded-full border border-subtle bg-surface-1 px-2 py-0.5 text-xs font-medium text-fg-muted">
            {copy.exampleTag}
          </span>
          <Ambient className="absolute inset-0" fallback={<StaticFrame copy={copy} points={points} xp={xp} />}>
            <StoryCycler copy={copy} points={points} xp={xp} pointsLabel={pointsLabel} xpLabel={xpLabel} />
          </Ambient>
        </div>
      </div>
      <figcaption className="sr-only">{summary}</figcaption>
    </figure>
  );
}

function StoryCycler({
  copy,
  points,
  xp,
  pointsLabel,
  xpLabel,
}: {
  copy: StoryCopy;
  points: string;
  xp: string;
  pointsLabel: string;
  xpLabel: string;
}) {
  const [index, setIndex] = useState(0);
  useEffect(() => {
    const id = window.setInterval(() => setIndex((i) => (i + 1) % FRAMES.length), FRAME_MS);
    return () => window.clearInterval(id);
  }, []);
  const frame: Frame = FRAMES[index];

  return (
    <div className="absolute inset-0">
      <AnimatePresence initial={false}>
        <Motion.div
          key={frame}
          className="absolute inset-0 flex flex-col items-center justify-center gap-5 px-6 pt-10 text-center"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0, transition: { duration: DURATION.slow, ease: EASE.emphasized } }}
          exit={{ opacity: 0, y: -10, transition: { duration: DURATION.slow, ease: EASE.exit } }}
        >
          {frame === 'scan' && <ScanFrame copy={copy} />}
          {frame === 'rate' && <RateFrame copy={copy} />}
          {frame === 'reward' && <RewardFrame copy={copy} points={points} xp={xp} pointsLabel={pointsLabel} xpLabel={xpLabel} />}
        </Motion.div>
      </AnimatePresence>
      <StepDots index={index} />
    </div>
  );
}

function StepDots({ index }: { index: number }) {
  return (
    <div className="absolute bottom-5 left-0 right-0 flex justify-center gap-1.5">
      {FRAMES.map((f, i) => (
        <span
          key={f}
          className={
            i === index
              ? 'h-1.5 w-5 rounded-full bg-brand transition-all duration-base ease-standard'
              : 'h-1.5 w-1.5 rounded-full bg-fg/20 transition-all duration-base ease-standard'
          }
        />
      ))}
    </div>
  );
}

function ScanFrame({ copy }: { copy: StoryCopy }) {
  return (
    <>
      <div className="relative grid h-36 w-36 place-items-center rounded-3xl bg-surface-2">
        {/* Vizör köşeleri */}
        <span className="absolute left-2 top-2 h-6 w-6 rounded-tl-xl border-l-4 border-t-4 border-brand" />
        <span className="absolute right-2 top-2 h-6 w-6 rounded-tr-xl border-r-4 border-t-4 border-brand" />
        <span className="absolute bottom-2 left-2 h-6 w-6 rounded-bl-xl border-b-4 border-l-4 border-brand" />
        <span className="absolute bottom-2 right-2 h-6 w-6 rounded-br-xl border-b-4 border-r-4 border-brand" />
        <QrCode className="h-20 w-20 text-fg" strokeWidth={1.5} />
        {/* Tarama çizgisi: konum dış katmanda, yalnız y animasyonu içte. */}
        <div className="absolute inset-x-4 top-4 bottom-4 overflow-hidden">
          <Motion.span
            className="block h-0.5 w-full rounded-full bg-brand shadow-[0_0_12px_hsl(var(--primary))]"
            animate={{ y: [0, 104, 0] }}
            transition={{ duration: FRAME_MS / 1000, ease: EASE.standard, repeat: Infinity }}
          />
        </div>
      </div>
      <FrameText title={copy.scanTitle} body={copy.scanBody} />
    </>
  );
}

function RateFrame({ copy }: { copy: StoryCopy }) {
  return (
    <>
      <div className="flex gap-1.5">
        {[0, 1, 2, 3, 4].map((i) => (
          <Motion.span
            key={i}
            initial={{ opacity: 0.25, scale: 0.85 }}
            animate={{ opacity: 1, scale: 1, transition: { ...SPRING.bouncy, delay: 0.15 + i * 0.12 } }}
          >
            <Star className="h-8 w-8 fill-warning text-warning" />
          </Motion.span>
        ))}
      </div>
      <div className="w-full space-y-2 rounded-2xl border border-subtle bg-surface-1 p-3 text-left">
        <span className="block h-2 w-11/12 rounded-full bg-fg/15" />
        <span className="block h-2 w-9/12 rounded-full bg-fg/15" />
        <span className="block h-2 w-6/12 rounded-full bg-fg/10" />
      </div>
      <FrameText title={copy.rateTitle} body={copy.rateBody} />
    </>
  );
}

function RewardFrame({
  copy,
  points,
  xp,
  pointsLabel,
  xpLabel,
}: {
  copy: StoryCopy;
  points: string;
  xp: string;
  pointsLabel: string;
  xpLabel: string;
}) {
  return (
    <>
      <Motion.div
        className="grid h-24 w-24 place-items-center rounded-full bg-gradient-to-br from-primary to-primary/60 text-primary-foreground shadow-glow"
        initial={{ scale: 0.6, opacity: 0 }}
        animate={{ scale: 1, opacity: 1, transition: SPRING.bouncy }}
      >
        <Award className="h-12 w-12" />
      </Motion.div>
      <div className="flex flex-col items-center gap-2">
        <span className="rounded-full bg-brand px-4 py-1.5 text-lg font-bold text-brand-fg qx-num">
          +{points} {pointsLabel}
        </span>
        <div className="h-2 w-40 overflow-hidden rounded-full bg-fg/10" aria-hidden>
          <Motion.span
            className="block h-full rounded-full bg-gradient-to-r from-primary to-primary/60"
            initial={{ width: '20%' }}
            animate={{ width: '70%', transition: { duration: DURATION.celebrate, ease: EASE.emphasized, delay: 0.2 } }}
          />
        </div>
        <span className="text-xs font-medium text-fg-muted qx-num">
          +{xp} {xpLabel}
        </span>
      </div>
      <FrameText title={fmt(copy.rewardTitle, { points })} body={fmt(copy.rewardBody, { xp })} />
    </>
  );
}

function FrameText({ title, body }: { title: string; body: string }) {
  return (
    <div>
      <p className="text-base font-semibold text-fg">{title}</p>
      <p className="mt-1 text-sm text-fg-muted">{body}</p>
    </div>
  );
}

/** Azaltılmış hareket / durdurulmuş durum: üç adım tek karede, hareketsiz. */
function StaticFrame({ copy, points, xp }: { copy: StoryCopy; points: string; xp: string }) {
  const rows = [
    { icon: QrCode, title: copy.scanTitle, body: copy.scanBody },
    { icon: Star, title: copy.rateTitle, body: copy.rateBody },
    { icon: Award, title: fmt(copy.rewardTitle, { points }), body: fmt(copy.rewardBody, { xp }) },
  ];
  return (
    <div className="absolute inset-0 flex flex-col justify-center gap-3 px-5 pt-10">
      {rows.map((r, i) => (
        <div
          key={r.title}
          className={
            i === 2
              ? 'flex items-start gap-3 rounded-2xl border border-brand-border bg-brand-subtle p-3'
              : 'flex items-start gap-3 rounded-2xl border border-subtle bg-surface-1 p-3'
          }
        >
          <r.icon className="mt-0.5 h-5 w-5 shrink-0 text-brand" />
          <div className="min-w-0">
            <p className="text-sm font-semibold text-fg">{r.title}</p>
            <p className="text-xs text-fg-muted">{r.body}</p>
          </div>
        </div>
      ))}
    </div>
  );
}
