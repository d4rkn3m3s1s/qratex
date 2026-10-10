'use client';

import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { ErrorState } from '@/components/states';
import { playHubCopy, type PlayLocale } from './copy';

/**
 * Bölüm hatası — yalnız o bölüm düşer, sayfa çalışır (§4.4/9). "Tekrar dene" sunucu
 * bileşenini yeniden çizer (`router.refresh()`), tam sayfa yenilemesi yok.
 */
export function SectionError({
  locale,
  kind,
  className,
}: {
  locale: PlayLocale;
  kind: 'unavailable' | 'failed';
  className?: string;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const c = playHubCopy(locale);
  return (
    <ErrorState
      kind={kind === 'unavailable' ? 'offline' : 'generic'}
      variant="section"
      title={c.sectionErrorTitle}
      description={kind === 'unavailable' ? c.sectionUnavailable : undefined}
      onRetry={pending ? undefined : () => start(() => router.refresh())}
      headingLevel="h3"
      className={className}
    />
  );
}
