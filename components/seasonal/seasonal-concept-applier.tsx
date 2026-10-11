'use client';

import { useEffect, useState } from 'react';
import { X, Sparkles } from 'lucide-react';
import { publishSeasonalOverride } from '@/lib/seasonal-concept-events';

type Concept = {
  id: string;
  name: string;
  backgroundEffect: string | null;
  themePresetId: string | null;
  bannerText: string | null;
  bannerEmoji: string | null;
  endDate: string;
};

/**
 * Aktif dönemsel konsepti uygular: palet ve arka plan efektini kendi sahiplerine yayınlar
 * (`ThemeColorsProvider` paleti açık/koyu varyantıyla uygular ve mod değişiminde korur;
 * `DynamicBackground` efekti gösterir) ve banner gösterir. Banner kullanıcı tarafından
 * kapatılabilir (sessionStorage; konsept id'sine bağlı, yeni konseptte tekrar görünür).
 */
export function SeasonalConceptApplier() {
  const [concept, setConcept] = useState<Concept | null>(null);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/settings/seasonal-concept', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((data: { concept?: Concept | null } | null) => {
        if (cancelled || !data?.concept) return;
        setConcept(data.concept);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  // Palet + arka plan: tek sahiplerine yayınla.
  useEffect(() => {
    if (!concept) return;
    publishSeasonalOverride({ themePresetId: concept.themePresetId, backgroundEffect: concept.backgroundEffect });
    // Banner daha önce kapatıldı mı?
    try {
      const key = `seasonal-banner-dismissed-${concept.id}`;
      if (window.sessionStorage.getItem(key) === '1') setDismissed(true);
    } catch {
      /* yok say */
    }
  }, [concept]);

  const close = () => {
    setDismissed(true);
    if (concept) {
      try {
        window.sessionStorage.setItem(`seasonal-banner-dismissed-${concept.id}`, '1');
      } catch {
        /* yok say */
      }
    }
  };

  if (!concept || !concept.bannerText || dismissed) return null;

  return (
    <div
      role="status"
      className="relative z-30 flex items-center justify-center gap-2 bg-gradient-to-r from-primary/15 via-accent/10 to-primary/15 px-4 py-2 text-sm font-medium text-foreground border-b border-primary/20"
    >
      <Sparkles className="h-4 w-4 shrink-0 text-primary" aria-hidden />
      <span className="text-center">
        {concept.bannerEmoji ? `${concept.bannerEmoji} ` : ''}
        {concept.bannerText}
      </span>
      <button
        type="button"
        onClick={close}
        aria-label="Kapat"
        className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1 text-muted-foreground hover:text-foreground hover:bg-foreground/5"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}
