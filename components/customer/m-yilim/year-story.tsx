'use client';

/**
 * Yılım — tam ekran sinematik hikâye (Spotify Wrapped tarzı, play kaydı).
 *
 * Etkileşim: sağa dokun / sola kaydır → ileri, sola dokun / sağa kaydır → geri, basılı tut →
 * duraklat; klavyede ← → (ve ↑ ↓), Esc kapatır. Görünür Önceki / Duraklat / Sonraki
 * düğmeleri ≥ 44px. Bölüm değişimi `aria-live` ile duyurulur.
 *
 * Hareket: slayt geçişi yatay kayma + opaklık (`slow`/`fast`, QDL easing), sayı açılışları
 * ≤ 1,2 sn, zemin ölçülü 2D canvas. Azaltılmış harekette: otomatik ilerleme YOK, kayma yok,
 * sayaç yok, canvas tek statik kare — slaytlar statik okunur.
 *
 * Radix Dialog: odak tuzağı, Esc, aria-modal, kapanınca açan öğeye odak dönüşü.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { AnimatePresence, m as Motion, type Variants } from 'framer-motion';
import { ChevronLeft, ChevronRight, Pause, Play, X } from 'lucide-react';
import { IconButton } from '@/components/ds/a11y/icon-button';
import { announce } from '@/components/ds/a11y/live-region';
import { DURATION, EASE, useReducedMotionPref } from '@/lib/motion';
import { cn } from '@/lib/utils';
import type { YearSummary } from '@/lib/customer-year/contract';
import type { YearCopy } from './copy';
import { buildSlides, SLIDE_ACCENT, SLIDE_DURATION_MS } from './slides-model';
import { SLIDE_COMPONENTS, slideTitle } from './slides';
import { StoryAura } from './story-aura';

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  summary: YearSummary;
  copy: YearCopy;
};

const slideVariants: Variants = {
  enter: (dir: number) => ({ x: dir * 48, opacity: 0 }),
  center: { x: 0, opacity: 1, transition: { duration: DURATION.slow, ease: EASE.emphasized } },
  exit: (dir: number) => ({ x: dir * -48, opacity: 0, transition: { duration: DURATION.fast, ease: EASE.exit } }),
};

const SWIPE_PX = 48;
const DARK_BTN = 'text-white hover:bg-white/[0.15] hover:text-white focus-visible:ring-white focus-visible:ring-offset-0';

export default function YearStory({ open, onOpenChange, summary, copy }: Props) {
  const slides = useMemo(() => buildSlides(summary), [summary]);
  const [index, setIndex] = useState(0);
  const [dir, setDir] = useState(1);
  const [paused, setPaused] = useState(false);
  const reduce = useReducedMotionPref();
  const barRef = useRef<HTMLSpanElement>(null);
  const holdRef = useRef(false);
  const pointer = useRef<{ x: number; y: number; swiped: boolean } | null>(null);
  const suppressClick = useRef(false);

  const total = slides.length;
  const id = slides[Math.min(index, total - 1)];
  const isLast = index >= total - 1;
  const autoplay = open && !reduce && !paused && !isLast;
  const periodLabel = copy.periodLabel(summary.period.year, summary.period.month);

  const go = useCallback(
    (delta: number) => {
      setIndex((i) => {
        const next = Math.max(0, Math.min(total - 1, i + delta));
        if (next !== i) setDir(delta > 0 ? 1 : -1);
        return next;
      });
    },
    [total]
  );

  // Açılışta baştan.
  useEffect(() => {
    if (open) {
      setIndex(0);
      setDir(1);
      setPaused(false);
    }
  }, [open]);

  // Bölüm değişimini duyur.
  useEffect(() => {
    if (!open) return;
    announce(copy.story.progress(index + 1, total, slideTitle(id, copy)));
  }, [open, index, total, id, copy]);

  // Otomatik ilerleme: rAF ile süre biriktir (gizli sekmede / basılı tutarken birikmez);
  // ilerleme çubuğu React render'ı olmadan transform ile güncellenir.
  const elapsedRef = useRef(0);
  useEffect(() => {
    elapsedRef.current = 0; // yeni bölüm: süre sıfırdan
  }, [index, open]);

  useEffect(() => {
    if (!autoplay) {
      // Duraklatılmışsa çubuk olduğu yerde kalır; azaltılmış harekette / son bölümde dolu.
      if (barRef.current && (reduce || isLast)) barRef.current.style.transform = 'scaleX(1)';
      return;
    }
    let last = performance.now();
    let raf = 0;
    const tick = (now: number) => {
      const dt = now - last;
      last = now;
      if (!document.hidden && !holdRef.current) elapsedRef.current += Math.min(dt, 100);
      const p = Math.min(1, elapsedRef.current / SLIDE_DURATION_MS);
      if (barRef.current) barRef.current.style.transform = `scaleX(${p})`;
      if (p >= 1) {
        go(1);
        return;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [autoplay, index, go, reduce, isLast]);

  const onKeyDown = (e: React.KeyboardEvent) => {
    const tag = (e.target as HTMLElement).tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA') return;
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown' || e.key === 'PageDown') {
      e.preventDefault();
      go(1);
    } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp' || e.key === 'PageUp') {
      e.preventDefault();
      go(-1);
    } else if (e.key === 'Home') {
      e.preventDefault();
      setDir(-1);
      setIndex(0);
    } else if (e.key === 'End') {
      e.preventDefault();
      setDir(1);
      setIndex(total - 1);
    }
  };

  const isInteractive = (t: EventTarget | null) =>
    t instanceof Element && !!t.closest('a,button,input,select,textarea,[role="button"],[role="link"]');

  const onPointerDown = (e: React.PointerEvent) => {
    if (isInteractive(e.target)) return;
    pointer.current = { x: e.clientX, y: e.clientY, swiped: false };
    holdRef.current = true;
  };
  const onPointerUp = (e: React.PointerEvent) => {
    holdRef.current = false;
    const p = pointer.current;
    pointer.current = null;
    if (!p) return;
    const dx = e.clientX - p.x;
    const dy = e.clientY - p.y;
    if (Math.abs(dx) > SWIPE_PX && Math.abs(dx) > Math.abs(dy)) {
      suppressClick.current = true;
      go(dx < 0 ? 1 : -1);
    }
  };
  const onPointerCancel = () => {
    holdRef.current = false;
    pointer.current = null;
  };
  const onStageClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (suppressClick.current) {
      suppressClick.current = false;
      return;
    }
    if (isInteractive(e.target)) return;
    // Seçili metin varsa (kullanıcı alıntıyı seçiyor) gezinme yapma.
    if (typeof window !== 'undefined' && String(window.getSelection?.() ?? '').length > 0) return;
    const rect = e.currentTarget.getBoundingClientRect();
    go(e.clientX - rect.left < rect.width * 0.3 ? -1 : 1);
  };

  const Slide = SLIDE_COMPONENTS[id];
  const replay = () => {
    setDir(-1);
    setIndex(0);
    setPaused(false);
  };

  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-modal bg-black/80 data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 duration-base" />
        <DialogPrimitive.Content
          data-register="play"
          aria-describedby={undefined}
          onKeyDown={onKeyDown}
          className={cn(
            'fixed inset-0 z-modal flex items-stretch justify-center outline-none [color-scheme:dark]',
            'data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 duration-base'
          )}
        >
          <DialogPrimitive.Title className="sr-only">{copy.story.dialogLabel(periodLabel)}</DialogPrimitive.Title>
          {/* Sahne: mobilde tam ekran, masaüstünde ortalanmış 9:16 pano. Konum CSS'te (framer dışı). */}
          <div className="relative flex h-dvh w-full flex-col overflow-hidden bg-black text-white sm:my-4 sm:h-[min(52rem,calc(100dvh-2rem))] sm:max-w-[28rem] sm:rounded-[2rem] sm:border sm:border-white/15 sm:shadow-2xl">
            <StoryAura accent={SLIDE_ACCENT[id]} className="pointer-events-none absolute inset-0 h-full w-full" />
            <div aria-hidden="true" className="pointer-events-none absolute inset-0 bg-gradient-to-b from-black/35 via-transparent to-black/45" />

            {/* İlerleme çubukları */}
            <div className="relative z-10 flex gap-1 px-4 pt-[max(0.75rem,env(safe-area-inset-top))]" aria-hidden="true">
              {slides.map((s, i) => (
                <span key={s} className="h-1 flex-1 overflow-hidden rounded-full bg-white/[0.25]">
                  {i < index ? <span className="block h-full w-full bg-white" /> : null}
                  {i === index ? (
                    <span ref={barRef} className="block h-full w-full origin-left bg-white" style={{ transform: reduce ? 'scaleX(1)' : 'scaleX(0)' }} />
                  ) : null}
                </span>
              ))}
            </div>

            {/* Başlık satırı */}
            <div className="relative z-10 flex items-center gap-2 px-3 pt-2">
              <p className="min-w-0 flex-1 truncate pl-1 qx-small font-semibold text-white/85">
                {copy.overline} · {periodLabel}
              </p>
              {!reduce && !isLast ? (
                <IconButton
                  aria-label={paused ? copy.story.play : copy.story.pause}
                  pressed={paused}
                  icon={paused ? <Play /> : <Pause />}
                  shape="circle"
                  onClick={() => setPaused((p) => !p)}
                  className={DARK_BTN}
                />
              ) : null}
              <DialogPrimitive.Close asChild>
                <IconButton aria-label={copy.story.close} icon={<X />} shape="circle" className={DARK_BTN} />
              </DialogPrimitive.Close>
            </div>

            {/* Slayt alanı: dokun/kaydır gezinme */}
            <div
              className="relative z-10 min-h-0 flex-1 touch-pan-y select-none"
              onPointerDown={onPointerDown}
              onPointerUp={onPointerUp}
              onPointerCancel={onPointerCancel}
              onPointerLeave={onPointerCancel}
              onClick={onStageClick}
            >
              <AnimatePresence initial={false} custom={dir} mode="wait">
                <Motion.section
                  key={id}
                  custom={dir}
                  variants={slideVariants}
                  initial="enter"
                  animate="center"
                  exit="exit"
                  aria-roledescription={copy.locale === 'en' ? 'slide' : 'slayt'}
                  aria-label={copy.story.progress(index + 1, total, slideTitle(id, copy))}
                  className="absolute inset-0 overflow-y-auto overscroll-contain px-6 pb-4 pt-4"
                >
                  <Slide summary={summary} copy={copy} onReplay={replay} onDone={() => onOpenChange(false)} />
                </Motion.section>
              </AnimatePresence>
            </div>

            {/* Görünür gezinme (klavye / ekran okuyucu / motor güçlüğü) */}
            <nav
              aria-label={copy.story.dialogLabel(periodLabel)}
              className="relative z-10 flex items-center justify-between gap-2 px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-1"
            >
              <IconButton
                aria-label={copy.story.prev}
                icon={<ChevronLeft />}
                shape="circle"
                disabled={index === 0}
                onClick={() => go(-1)}
                className={DARK_BTN}
              />
              <span className="font-display qx-small tabular-nums text-white/80" aria-hidden="true">
                {index + 1} / {total}
              </span>
              <IconButton
                aria-label={copy.story.next}
                icon={<ChevronRight />}
                shape="circle"
                disabled={isLast}
                onClick={() => go(1)}
                className={DARK_BTN}
              />
            </nav>
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
