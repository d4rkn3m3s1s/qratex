'use client';

/**
 * Yılım yüklenemedi: boş durumdan AYRI hata görünümü + gerçek "Tekrar dene"
 * (sunucu bileşenini yeniden çalıştırır). Denetim bulgu 7: hata ile boşluk aynı metne düşüyordu.
 */
import { useRouter } from 'next/navigation';
import { useTransition } from 'react';
import { ErrorState } from '@/components/states';
import type { ErrorKind } from '@/components/states';
import { getYearCopy, type YearLocale } from './copy';

export function YearLoadError({ locale, kind = 'generic', digest }: { locale: YearLocale; kind?: ErrorKind; digest?: string }) {
  const copy = getYearCopy(locale);
  const router = useRouter();
  const [, startTransition] = useTransition();
  return (
    <div className="mx-auto w-full max-w-3xl">
      <ErrorState
        kind={kind}
        headingLevel="h1"
        title={kind === 'generic' ? copy.error.title : undefined}
        description={kind === 'generic' ? copy.error.body : undefined}
        digest={digest}
        onRetry={kind === 'generic' || kind === 'offline' ? () => startTransition(() => router.refresh()) : undefined}
      />
    </div>
  );
}
