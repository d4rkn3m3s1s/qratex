'use client';

import { useCallback, useEffect, useRef } from 'react';
import { AnimatePresence, m as Motion } from 'framer-motion';
import { ChevronLeft, ChevronRight, ExternalLink, X } from 'lucide-react';
import { useReducedMotionPref } from '@/lib/motion';
import type { ChangelogShot } from '@/lib/changelog/types';
import { fmtDate } from './meta';

/** Ekran görüntüsü ışık kutusu: Esc kapatır, ← → gezinir, odak kutuda tutulur. */
export function Lightbox({ shots, index, onIndex, onClose }: { shots: ChangelogShot[]; index: number | null; onIndex: (i: number) => void; onClose: () => void }) {
  const reduce = useReducedMotionPref();
  const closeRef = useRef<HTMLButtonElement>(null);
  const open = index != null && shots[index] != null;
  const shot = open ? shots[index] : null;
  const go = useCallback((d: number) => { if (index != null && shots.length > 1) onIndex((index + d + shots.length) % shots.length); }, [index, shots.length, onIndex]);

  useEffect(() => {
    if (!open) return;
    const prevFocus = document.activeElement as HTMLElement | null;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      else if (e.key === 'ArrowRight') go(1);
      else if (e.key === 'ArrowLeft') go(-1);
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
      prevFocus?.focus?.();
    };
  }, [open, onClose, go]);

  return (
    <AnimatePresence>
      {shot ? (
        <Motion.div
          key="lightbox"
          role="dialog"
          aria-modal="true"
          aria-label={shot.caption || 'Ekran görüntüsü'}
          className="fixed inset-0 z-[var(--z-modal)] flex flex-col items-center justify-center gap-3 bg-[hsl(var(--overlay)/0.88)] p-4 backdrop-blur-md"
          initial={reduce ? false : { opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={reduce ? undefined : { opacity: 0 }}
          onClick={onClose}
        >
          <div className="flex w-full max-w-5xl items-center justify-between gap-2 text-sm text-white/80">
            <span className="qx-num">{(index ?? 0) + 1} / {shots.length}</span>
            <button ref={closeRef} type="button" onClick={onClose} className="grid h-11 w-11 place-items-center rounded-full bg-white/10 text-white hover:bg-white/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white" aria-label="Kapat">
              <X className="h-5 w-5" aria-hidden />
            </button>
          </div>
          <div className="relative flex w-full max-w-5xl min-h-0 items-center justify-center" onClick={(e) => e.stopPropagation()}>
            <AnimatePresence mode="wait" initial={false}>
              <Motion.img
                key={shot.src}
                src={shot.src}
                alt={shot.caption || 'Ekran görüntüsü'}
                className="max-h-[75vh] w-auto max-w-full rounded-xl object-contain shadow-2xl"
                initial={reduce ? false : { opacity: 0, scale: 0.94, y: 12 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={reduce ? undefined : { opacity: 0, scale: 0.97 }}
                transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
              />
            </AnimatePresence>
            {shots.length > 1 ? (
              <>
                <button type="button" onClick={() => go(-1)} className="absolute left-1 grid h-11 w-11 place-items-center rounded-full bg-black/40 text-white hover:bg-black/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white" aria-label="Önceki görüntü">
                  <ChevronLeft className="h-5 w-5" aria-hidden />
                </button>
                <button type="button" onClick={() => go(1)} className="absolute right-1 grid h-11 w-11 place-items-center rounded-full bg-black/40 text-white hover:bg-black/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white" aria-label="Sonraki görüntü">
                  <ChevronRight className="h-5 w-5" aria-hidden />
                </button>
              </>
            ) : null}
          </div>
          <p className="max-w-3xl text-center text-sm text-white/85" onClick={(e) => e.stopPropagation()}>
            {shot.caption}
            {shot.date ? <span className="text-white/60"> · {fmtDate(shot.date)}</span> : null}
            {shot.url ? (
              <a href={shot.url} target="_blank" rel="noopener noreferrer" className="ml-2 inline-flex items-center gap-1 text-white underline-offset-2 hover:underline">
                Kaynak <ExternalLink className="h-3 w-3" aria-hidden />
              </a>
            ) : null}
          </p>
        </Motion.div>
      ) : null}
    </AnimatePresence>
  );
}
