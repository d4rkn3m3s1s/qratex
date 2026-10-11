'use client';

import { useLocaleSafe } from '@/lib/app-locale';
import { uiCopy } from '@/lib/i18n/ui-copy';

/** Klavye / ekran okuyucu: üst kromu veya yan menüyü tab ile geçmeden ana içeriğe atlama (WCAG). */

type SkipToMainContentProps = {
  /** Hedef `<main id="...">` — dashboard için `dashboard-main`, auth için `auth-main` vb. */
  targetId?: string;
  /**
   * Metin türü: `main` → "Ana içeriğe atla", `content` → "İçeriğe atla" (genel site / okuma).
   * Metin uygulama dilinden gelir (eskiden sabit Türkçeydi; EN arayüzde de Türkçe okunuyordu).
   */
  variant?: 'main' | 'content';
  /** Özel metin (yalnız dil zaten çözülmüşse; çoğunlukla `variant` yeterli). */
  label?: string;
};

export function SkipToMainContent({ targetId = 'dashboard-main', variant = 'main', label }: SkipToMainContentProps) {
  const copy = uiCopy(useLocaleSafe());
  return (
    <a
      href={`#${targetId}`}
      className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-[max(1rem,env(safe-area-inset-top))] focus:z-skip focus:rounded-md focus:bg-primary focus:px-4 focus:py-3 focus:text-sm focus:font-medium focus:text-primary-foreground focus:shadow-lg focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 focus:ring-offset-background"
    >
      {label ?? (variant === 'content' ? copy.skipToContent : copy.skipToMain)}
    </a>
  );
}
