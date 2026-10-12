'use client';

/**
 * Sayan sayı — QDL'nin TEK sayaç bileşeni. Önceki değerden yenisine yumuşakça sayar
 * (`useNumberTicker`, rAF; framer gerekmez), azaltılmış harekette doğrudan son değer.
 *
 *   <AnimatedNumber value={balance} />                       // 12.450 (tr-TR)
 *   <AnimatedNumber value={total} animateOnMount />          // açılışta 0'dan sayar
 *   <AnimatedNumber value={n} format={(v) => `+${fmt(v)}`} />
 *
 * - Rakamlar `tabular-nums` → sayarken genişlik zıplamaz.
 * - Görsel ara değerler `aria-hidden`; ekran okuyucu yalnız SON değeri (veya `srLabel`) okur.
 * - Hedef tamsayıysa ara değerler yuvarlanır (biçimdeki ondalık titremez).
 */
import { useMemo } from 'react';
import { useNumberTicker } from '@/lib/motion/use-number-ticker';
import { cn } from '@/lib/utils';

export type AnimatedNumberProps = {
  value: number;
  /** Biçimleyici. Varsayılan: `Intl.NumberFormat(locale)` (tr-TR → 12.450). */
  format?: (n: number) => string;
  /** Varsayılan biçimleyicinin dili. Varsayılan `tr-TR`. */
  locale?: string;
  /** Varsayılan biçimleyicide en fazla ondalık. Varsayılan 0. */
  maximumFractionDigits?: number;
  /** İlk boyamada 0'dan say (yalnız kutlama anları; panelde değişim anlatılır). */
  animateOnMount?: boolean;
  durationMs?: number;
  /** Ekran okuyucu metni; verilmezse biçimlenmiş son değer. `null` → hiç okunmaz (çevre zaten okuyorsa). */
  srLabel?: string | null;
  className?: string;
};

export function AnimatedNumber({
  value,
  format,
  locale = 'tr-TR',
  maximumFractionDigits = 0,
  animateOnMount = false,
  durationMs,
  srLabel,
  className,
}: AnimatedNumberProps) {
  const fmt = useMemo(() => {
    if (format) return format;
    const nf = new Intl.NumberFormat(locale, { maximumFractionDigits });
    return (n: number) => (Number.isFinite(n) ? nf.format(n) : '—');
  }, [format, locale, maximumFractionDigits]);
  const ticked = useNumberTicker(value, { animateOnMount, ...(durationMs ? { durationMs } : {}) });
  const shown = Number.isInteger(value) ? Math.round(ticked) : ticked;
  const finalText = srLabel === undefined ? fmt(value) : srLabel;

  return (
    <span className={cn('tabular-nums', className)}>
      <span aria-hidden="true">{fmt(shown)}</span>
      {finalText !== null && <span className="sr-only">{finalText}</span>}
    </span>
  );
}
