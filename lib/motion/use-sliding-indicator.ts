'use client';

import { useLayoutEffect, useState, type RefObject } from 'react';

/**
 * Kayan sekme göstergesi (layoutId muadili, ek paket yok): liste içindeki aktif
 * `[role="tab"][data-state="active"]` ölçülür; tek bir mutlak gösterge elemanına
 * transform + boyut yazılır, geçişi CSS yapar (`transition-[transform,width,height]`).
 * Global LazyMotion `domAnimation` layout animasyonu içermediği için bilinçli olarak CSS.
 *
 * - İlk yerleşimde geçiş yok (gösterge yerinde doğar).
 * - Ölçüm hazır olana dek `ready=false` → çağıran sekmenin kendi aktif stilini korur
 *   (SSR/ilk boyada yanıp sönme yok).
 * - `inset`: göstergeyi yatayda içeri çeker (alt çizgi varyantı için).
 * - Azaltılmış hareket: global CSS politikası geçiş süresini sıfırlar → anında atlar.
 */
export function useSlidingIndicator(
  listRef: RefObject<HTMLElement | null>,
  indicatorRef: RefObject<HTMLElement | null>,
  opts: { inset?: number; heightFromTab?: boolean } = {},
): boolean {
  const { inset = 0, heightFromTab = true } = opts;
  const [ready, setReady] = useState(false);

  useLayoutEffect(() => {
    const list = listRef.current;
    const ind = indicatorRef.current;
    if (!list || !ind || typeof ResizeObserver === 'undefined' || typeof MutationObserver === 'undefined') return;
    let first = true;
    const measure = () => {
      const active = list.querySelector<HTMLElement>(':scope > [role="tab"][data-state="active"]');
      if (!active) {
        ind.style.opacity = '0';
        return;
      }
      ind.style.transitionDuration = first ? '0ms' : '';
      ind.style.width = `${Math.max(0, active.offsetWidth - inset * 2)}px`;
      if (heightFromTab) ind.style.height = `${active.offsetHeight}px`;
      const y = heightFromTab ? active.offsetTop : 0;
      ind.style.transform = `translate3d(${active.offsetLeft + inset}px, ${y}px, 0)`;
      ind.style.opacity = '1';
      first = false;
      setReady(true);
    };
    measure();
    const mo = new MutationObserver(measure);
    mo.observe(list, { subtree: true, attributes: true, attributeFilter: ['data-state'], childList: true });
    const ro = new ResizeObserver(measure);
    ro.observe(list);
    return () => {
      mo.disconnect();
      ro.disconnect();
    };
  }, [listRef, indicatorRef, inset, heightFromTab]);

  return ready;
}
