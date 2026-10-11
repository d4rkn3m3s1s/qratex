'use client';

import { PanelRouteError } from '@/components/states/panel-route-error';

/** Panel segmenti hata sınırı — ortak görünüm, iç içe <main> yok (tasarım raporu O4). */
export default function AdminError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <PanelRouteError error={error} reset={reset} homeHref="/admin" scope="admin" noindex />;
}
