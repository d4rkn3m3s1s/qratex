'use client';

import { useEffect, useState } from 'react';

/**
 * Belgedeki GERÇEK CSS değişken değerlerini okur (globals.css + çalışma zamanı
 * tema preset'i + dönemsel konsept + erişilebilirlik modları dahil) ve tema,
 * preset ya da a11y sınıfı değişince yeniden okur.
 */
export function useLiveTokens(names: readonly string[]): Record<string, string> {
  const key = names.join('|');
  const [values, setValues] = useState<Record<string, string>>({});

  useEffect(() => {
    const list = key.split('|').filter(Boolean);
    const read = () => {
      const el = document.body ?? document.documentElement;
      const cs = getComputedStyle(el);
      const next: Record<string, string> = {};
      for (const n of list) next[n] = cs.getPropertyValue(`--${n}`).trim();
      setValues((prev) => {
        for (const n of list) if (prev[n] !== next[n]) return next;
        return prev;
      });
    };
    read();
    const mo = new MutationObserver(read);
    const opts = { attributes: true, attributeFilter: ['class', 'style', 'data-theme'] };
    mo.observe(document.documentElement, opts);
    if (document.body) mo.observe(document.body, opts);
    const mql = window.matchMedia?.('(prefers-contrast: more)');
    mql?.addEventListener?.('change', read);
    return () => {
      mo.disconnect();
      mql?.removeEventListener?.('change', read);
    };
  }, [key]);

  return values;
}
