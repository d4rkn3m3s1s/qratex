'use client';

import { useRouter } from 'next/navigation';
import { ErrorState } from '@/components/states';
import { useKasaCopy } from './copy';

/** Kasa açılış verisi sunucuda yüklenemedi: görünür hata + yeniden dene (RSC yenileme). */
export function KasaLoadError() {
  const router = useRouter();
  const { copy } = useKasaCopy();
  return (
    <div className="mx-auto w-full max-w-3xl">
      <ErrorState variant="page" title={copy.kasa.loadError} description={copy.kasa.loadErrorDesc} onRetry={() => router.refresh()} />
    </div>
  );
}
