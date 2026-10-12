'use client';

import { useEffect, useState, type ComponentType } from 'react';
import { CONSENT_OPEN_EVENT } from '@/lib/consent/client';
import type { ConsentSurface } from './consent-record';

/** Tercih merkezini belirli bir yüzeyden açar (footer, ayarlar, politika sayfası). */
export function openConsentCenter(surface: ConsentSurface = 'other'): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(CONSENT_OPEN_EVENT, { detail: { surface } }));
}

type CenterProps = { onDecided?: () => void; initialSurface?: ConsentSurface };

/**
 * Tercih merkezi kabuğu (perf-2): diyalog (Radix Dialog + Switch) kök layout'ta her sayfanın
 * ilk yük JS'ine giriyordu, oysa yalnız kullanıcı "Tercihleri yönet"e basınca açılır. İlk açma
 * olayında modül yüklenir ve ilk olayın yüzeyiyle açık başlar; sonraki açmaları kendisi dinler.
 */
export function ConsentCenterLazy({ onDecided }: { onDecided?: () => void }) {
  const [state, setState] = useState<{ Center: ComponentType<CenterProps>; surface: ConsentSurface } | null>(null);

  useEffect(() => {
    if (state) return;
    let cancelled = false;
    const onOpen = (e: Event) => {
      const surface = (e as CustomEvent<{ surface?: ConsentSurface } | undefined>).detail?.surface ?? 'other';
      window.removeEventListener(CONSENT_OPEN_EVENT, onOpen);
      void import('./consent-center').then((mod) => {
        if (!cancelled) setState({ Center: mod.ConsentCenter, surface });
      });
    };
    window.addEventListener(CONSENT_OPEN_EVENT, onOpen);
    return () => {
      cancelled = true;
      window.removeEventListener(CONSENT_OPEN_EVENT, onOpen);
    };
  }, [state]);

  if (!state) return null;
  const { Center, surface } = state;
  return <Center onDecided={onDecided} initialSurface={surface} />;
}
