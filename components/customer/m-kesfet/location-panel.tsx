'use client';

import { Loader2, LocateFixed, MapPinOff, Navigation, RefreshCw, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { TONE_CALLOUT } from '@/components/states';
import { usePlacesCopy } from './copy';
import { STALE_LOCATION_MS, type CoarseLocation, type LocationStatus } from './use-coarse-location';

/**
 * Konum durumu paneli — her durum için açık bir görünüm (izin isteme öncesi açıklama, alınıyor,
 * reddedildi + platform rehberi, alınamadı, desteklenmiyor) ve hazırken konum yaşı + güncelle.
 * Ham koordinat ASLA gösterilmez.
 */
export function LocationPanel({
  status,
  location,
  onRequest,
  onForget,
}: {
  status: LocationStatus;
  location: CoarseLocation | null;
  onRequest: () => void;
  onForget: () => void;
}) {
  const { copy } = usePlacesCopy();

  if (location && (status === 'ready' || status === 'locating')) {
    const ageMin = Math.max(0, Math.floor((Date.now() - location.at) / 60_000));
    const stale = Date.now() - location.at > STALE_LOCATION_MS;
    return (
      <div className="flex flex-wrap items-center gap-2" aria-live="polite">
        <span className={cn('qx-caption inline-flex items-center gap-1.5', stale ? 'text-warning' : 'text-fg-muted')}>
          <LocateFixed aria-hidden className="h-3.5 w-3.5" />
          {status === 'locating' ? copy.locLocating : copy.locAge(ageMin)}
        </span>
        <Button type="button" variant="ghost" size="sm" className="min-h-11 sm:min-h-9" onClick={onRequest} disabled={status === 'locating'}>
          {status === 'locating' ? <Loader2 aria-hidden className="mr-1.5 h-4 w-4 motion-safe:animate-spin" /> : <RefreshCw aria-hidden className="mr-1.5 h-4 w-4" />}
          {copy.locUpdate}
        </Button>
        <Button type="button" variant="ghost" size="sm" className="min-h-11 text-fg-muted sm:min-h-9" onClick={onForget}>
          <X aria-hidden className="mr-1.5 h-4 w-4" />
          {copy.locForget}
        </Button>
      </div>
    );
  }

  if (status === 'denied' || status === 'unsupported' || status === 'unavailable') {
    const title = status === 'denied' ? copy.locDeniedTitle : status === 'unsupported' ? copy.locUnsupported : copy.locUnavailable;
    return (
      <div role="status" className={cn('flex flex-col gap-2 rounded-card border p-4', TONE_CALLOUT.warning)}>
        <p className="qx-body flex items-center gap-2 font-semibold">
          <MapPinOff aria-hidden className="h-4 w-4 shrink-0" />
          {title}
        </p>
        {status === 'denied' && (
          <>
            <p className="qx-small text-fg-muted">{copy.locDeniedBody}</p>
            <ul className="qx-caption list-disc space-y-1 pl-5 text-fg-muted">
              <li>{copy.locDeniedHelpIos}</li>
              <li>{copy.locDeniedHelpAndroid}</li>
            </ul>
          </>
        )}
        {status !== 'unsupported' && (
          <div>
            <Button type="button" variant="outline" size="sm" className="min-h-11" onClick={onRequest}>
              <RefreshCw aria-hidden className="mr-1.5 h-4 w-4" />
              {copy.locRetry}
            </Button>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className={cn('flex flex-col gap-3 rounded-card border p-4 sm:flex-row sm:items-center', TONE_CALLOUT.brand)}>
      <div className="min-w-0 flex-1">
        <p className="qx-body font-semibold">{copy.locTitle}</p>
        <p className="qx-small mt-1 text-fg-muted">{copy.locBody}</p>
      </div>
      <Button type="button" className="min-h-11 shrink-0" onClick={onRequest} disabled={status === 'locating'} aria-busy={status === 'locating'}>
        {status === 'locating' ? <Loader2 aria-hidden className="mr-2 h-4 w-4 motion-safe:animate-spin" /> : <Navigation aria-hidden className="mr-2 h-4 w-4" />}
        {status === 'locating' ? copy.locLocating : copy.locUse}
      </Button>
    </div>
  );
}
