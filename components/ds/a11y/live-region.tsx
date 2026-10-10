'use client';

import * as React from 'react';
import { cn } from '@/lib/utils';

export type Politeness = 'polite' | 'assertive';

export type AnnounceOptions = {
  /** `polite` (varsayılan): sıradaki duraklamada okunur. `assertive`: hemen keser — yalnız hata/acil durum. */
  politeness?: Politeness;
  /** Mesaj bu süre sonra temizlenir (ms). Varsayılan 7000; 0 → temizlenmez. */
  clearAfterMs?: number;
};

/* ─────────────────────────────────────────────────────────────
   Global duyurucu: body sonunda iki kalıcı, görünmez canlı bölge.
   Bölgeler içerik değişmeden ÖNCE DOM'da olmalı; bu yüzden ilk
   çağrıda bir kez oluşturulur ve sayfa boyunca yaşar (route geçişlerinde de).
───────────────────────────────────────────────────────────── */

const REGION_ID: Record<Politeness, string> = {
  polite: 'qx-live-polite',
  assertive: 'qx-live-assertive',
};

const clearTimers: Partial<Record<Politeness, ReturnType<typeof setTimeout>>> = {};
const writeTimers: Partial<Record<Politeness, ReturnType<typeof setTimeout>>> = {};

function ensureRegion(politeness: Politeness): HTMLElement | null {
  if (typeof document === 'undefined' || !document.body) return null;
  const id = REGION_ID[politeness];
  let el = document.getElementById(id);
  if (!el) {
    el = document.createElement('div');
    el.id = id;
    el.setAttribute('aria-live', politeness);
    el.setAttribute('aria-atomic', 'true');
    el.setAttribute('aria-relevant', 'additions text');
    el.setAttribute('data-qx-live', politeness);
    // sr-only eşdeğeri (Tailwind sınıfı purge edilebilir; satır içi güvenli)
    Object.assign(el.style, {
      position: 'absolute',
      width: '1px',
      height: '1px',
      padding: '0',
      margin: '-1px',
      overflow: 'hidden',
      clip: 'rect(0, 0, 0, 0)',
      whiteSpace: 'nowrap',
      border: '0',
    } satisfies Partial<CSSStyleDeclaration>);
    document.body.appendChild(el);
  }
  return el;
}

/**
 * Ekran okuyucuya mesaj duyurur (React dışından da çağrılabilir).
 * Aynı mesaj art arda verilse de yeniden okunur (önce temizlenir, sonra yazılır).
 */
export function announce(message: string, options: AnnounceOptions = {}): void {
  const politeness = options.politeness ?? 'polite';
  const clearAfterMs = options.clearAfterMs ?? 7000;
  const el = ensureRegion(politeness);
  if (!el || !message) return;
  const pendingClear = clearTimers[politeness];
  if (pendingClear) clearTimeout(pendingClear);
  const pendingWrite = writeTimers[politeness];
  if (pendingWrite) clearTimeout(pendingWrite);
  el.textContent = '';
  // Kısa gecikme: bazı ekran okuyucular aynı metnin yeniden yazılmasını değişiklik saymaz.
  writeTimers[politeness] = setTimeout(() => {
    el.textContent = message;
    if (clearAfterMs > 0) {
      clearTimers[politeness] = setTimeout(() => {
        el.textContent = '';
      }, clearAfterMs);
    }
  }, 60);
}

/**
 * Duyurucu kancası — kararlı `announce` fonksiyonu döndürür. İlk boyamada bölgeleri
 * hazırlar ki ilk duyuru kaçmasın.
 *
 *   const announce = useAnnouncer();
 *   announce('3 kayıt silindi');
 *   announce('Kaydedilemedi', { politeness: 'assertive' });
 */
export function useAnnouncer(): (message: string, options?: AnnounceOptions) => void {
  React.useEffect(() => {
    ensureRegion('polite');
    ensureRegion('assertive');
  }, []);
  return announce;
}

/**
 * Değer değiştikçe duyurur (ilk boyamada duyurmaz). Boş/undefined mesaj atlanır.
 *
 *   useAnnounceOnChange(isSaving ? 'Kaydediliyor' : saved ? 'Kaydedildi' : undefined);
 */
export function useAnnounceOnChange(message: string | null | undefined, options?: AnnounceOptions): void {
  const announcer = useAnnouncer();
  const first = React.useRef(true);
  const politeness = options?.politeness;
  const clearAfterMs = options?.clearAfterMs;
  React.useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    if (message) announcer(message, { politeness, clearAfterMs });
  }, [message, announcer, politeness, clearAfterMs]);
}

export type LiveRegionProps = Omit<React.HTMLAttributes<HTMLDivElement>, 'children' | 'role'> & {
  /** Duyurulacak içerik. Değiştiğinde okunur. */
  children?: React.ReactNode;
  politeness?: Politeness;
  /** Görünür bir durum satırı olarak da göster (varsayılan: görünmez). */
  visible?: boolean;
  /** Bölge bütün olarak mı okunsun (varsayılan true). */
  atomic?: boolean;
};

/**
 * Bildirimsel canlı bölge — bileşen ağacında kalıcı durur, içeriği değiştikçe okunur.
 * Görünür durum satırları (ör. "3 sonuç bulundu", "Kaydedildi") için `visible` verin.
 * Bölge, içerik değişmeden önce render edilmiş olmalı: koşullu render ETMEYİN,
 * içeriği boşaltın.
 */
export const LiveRegion = React.forwardRef<HTMLDivElement, LiveRegionProps>(
  ({ politeness = 'polite', visible = false, atomic = true, className, children, ...props }, ref) => (
    <div
      ref={ref}
      role={politeness === 'assertive' ? 'alert' : 'status'}
      aria-live={politeness}
      aria-atomic={atomic}
      className={cn(!visible && 'sr-only', className)}
      {...props}
    >
      {children}
    </div>
  ),
);
LiveRegion.displayName = 'LiveRegion';
