'use client';

import { createContext, useContext, useEffect, useState, type ReactNode, type RefObject } from 'react';

/**
 * QDL ifade kaydı (yol haritası §4.1):
 *  - `ops`  → sakin: düz kart, elevation ≤ 1, glow/döngü yok, kısa geçişler.
 *  - `play` → ifadeli: cam, gradient kenar, glow, spring, `<Ambient>` döngüleri.
 *
 * Çözüm sırası: bileşenin `register` prop'u → en yakın `<RegisterProvider>` →
 * DOM'daki en yakın `[data-register]` atası (layout işaretler) → `play`.
 */
export type Register = 'ops' | 'play';

const RegisterContext = createContext<Register | null>(null);

export function RegisterProvider({ value, children }: { value: Register; children: ReactNode }) {
  return <RegisterContext.Provider value={value}>{children}</RegisterContext.Provider>;
}

/** Bağlamdaki kayıt (sağlayıcı yoksa `null`). */
export function useRegisterContext(): Register | null {
  return useContext(RegisterContext);
}

function readDomRegister(el: Element | null): Register | null {
  const host = el?.closest?.('[data-register]');
  const v = host?.getAttribute('data-register');
  return v === 'ops' || v === 'play' ? v : null;
}

/**
 * Bileşenin etkin kaydını döndürür. `ref` verilirse ve ne prop ne sağlayıcı
 * varsa, bağlandıktan sonra DOM'daki `[data-register]` atası okunur.
 */
export function useRegister(explicit?: Register, ref?: RefObject<Element | null>): Register {
  const ctx = useContext(RegisterContext);
  const [dom, setDom] = useState<Register | null>(null);

  useEffect(() => {
    if (explicit || ctx || !ref) return;
    setDom(readDomRegister(ref.current));
  }, [explicit, ctx, ref]);

  return explicit ?? ctx ?? dom ?? 'play';
}
