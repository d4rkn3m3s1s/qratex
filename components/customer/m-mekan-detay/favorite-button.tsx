'use client';

import { useState, useTransition } from 'react';
import { Heart } from 'lucide-react';
import { toast } from 'sonner';
import { m as Motion } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { announce } from '@/components/ds/a11y';
import { useReducedMotionPref, SPRING } from '@/lib/motion';
import { cn } from '@/lib/utils';
import { getVenueCopy, type VenueLocale } from './copy';

/**
 * Kaydet / kaydedilenlerden çıkar — mevcut `/api/customer/favorites` (POST/DELETE) ucu.
 * İyimser güncelleme; hata olursa geri alınır ve görünür hata verilir.
 */
export function FavoriteButton({
  dealerId,
  dealerName,
  initial,
  locale,
}: {
  dealerId: string;
  dealerName: string;
  initial: boolean;
  locale: VenueLocale;
}) {
  const copy = getVenueCopy(locale);
  const [saved, setSaved] = useState(initial);
  const [pending, startTransition] = useTransition();
  const reduce = useReducedMotionPref();

  const toggle = () => {
    const next = !saved;
    setSaved(next);
    startTransition(async () => {
      try {
        const res = next
          ? await fetch('/api/customer/favorites', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ dealerId }),
            })
          : await fetch(`/api/customer/favorites?dealerId=${encodeURIComponent(dealerId)}`, { method: 'DELETE' });
        if (!res.ok) throw new Error(String(res.status));
        announce(next ? copy.savedAnnounce : copy.unsavedAnnounce);
      } catch {
        setSaved(!next);
        toast.error(copy.saveFailed);
        announce(copy.saveFailed, { politeness: 'assertive' });
      }
    });
  };

  return (
    <Button
      type="button"
      variant="outline"
      onClick={toggle}
      disabled={pending}
      aria-pressed={saved}
      aria-label={saved ? copy.unsaveAria(dealerName) : copy.saveAria(dealerName)}
      className={cn('min-h-11 gap-2', saved && 'border-brand-border bg-brand-subtle text-brand')}
    >
      <Motion.span
        aria-hidden
        className="inline-flex"
        key={saved ? 'on' : 'off'}
        initial={reduce ? false : { scale: 0.6 }}
        animate={{ scale: 1 }}
        transition={SPRING.snappy}
      >
        <Heart className={cn('h-4 w-4', saved && 'fill-current')} />
      </Motion.span>
      <span>{saved ? copy.saved : copy.save}</span>
    </Button>
  );
}
