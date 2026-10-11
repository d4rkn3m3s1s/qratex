'use client';

import { m } from 'framer-motion';
import { DURATION, EASE, useMotionPolicy } from '@/lib/motion';
import { cn } from '@/lib/utils';

/**
 * Sakin ilerleme çubuğu (ops kaydı): ilk görünüşte ve değer değişince 300 ms dolar; azaltılmış
 * harekette anında. Değer metinle de verilir (yalnız renge/uzunluğa dayanmaz).
 */
export function ProgressBar({ percent, label, done, className }: { percent: number | null; label: string; done?: boolean; className?: string }) {
  const { reduce } = useMotionPolicy();
  const pct = percent == null ? 0 : Math.max(0, Math.min(100, percent));
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={percent == null ? undefined : Math.round(pct)}
      aria-valuetext={percent == null ? 'Hedef tanımsız' : `%${Math.round(pct)}`}
      className={cn('h-2 w-full overflow-hidden rounded-full bg-surface-3', className)}
    >
      <m.div
        className={cn('h-full rounded-full', done ? 'bg-success' : 'bg-brand')}
        initial={reduce ? false : { width: 0 }}
        animate={{ width: `${pct}%` }}
        transition={reduce ? { duration: 0 } : { duration: DURATION.base, ease: EASE.standard }}
      />
    </div>
  );
}

/** Kategori → müşteri kartıyla aynı anahtar (renk değil anlam; metin her zaman yazılır). */
export const CATEGORY_EMOJI: Record<string, string> = {
  water: '💧',
  education: '📚',
  environment: '🌱',
  animals: '🐾',
  health: '🩺',
};

/** Önerilen simgeler (serbest metin yerine seçici; gerekirse tek emoji yazılabilir). */
export const ICON_CHOICES = ['💧', '📚', '🌱', '🌳', '🐾', '🐶', '🐱', '🩺', '❤️', '🍞', '🏠', '🎒', '♻️', '🌍', '🤝', '⭐'];
