'use client';

import { useLocaleSafe } from '@/lib/app-locale';
import { uiCopy } from '@/lib/i18n/ui-copy';

/**
 * Yükleme iskeletinin ekran okuyucu metni, uygulama dilinde (mobil-erisilebilirlik-i18n B1).
 * `loading.tsx` dosyaları sunucu bileşeni; metin bu küçük istemci adasından gelir — segment dil
 * sınırı (lib/server-locale-boundary) sayesinde SSR'da da doğru dilde basılır.
 */
export function LoadingLabel({ kind = 'loading', tr, en }: { kind?: 'loading' | 'page'; tr?: string; en?: string }) {
  const locale = useLocaleSafe();
  const copy = uiCopy(locale);
  const text = locale === 'en' ? en : tr;
  return <span className="sr-only">{text ?? (kind === 'page' ? copy.pageLoading : copy.loading)}</span>;
}
