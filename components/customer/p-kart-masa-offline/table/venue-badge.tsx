/**
 * İşletme kimliği (logo/baş harf + ad + şube/QR etiketi). Misafir sinyali hangi işletmeye
 * gönderdiğini görür; kopyalanmış ya da yanlış QR'ı fark edebilir (rapor envanter #7).
 * Sunucu ve istemci bileşenlerinde kullanılabilir (hook yok).
 */
import { MapPin } from 'lucide-react';
import type { SignalVenue } from '@/lib/table-signal/venue';

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).slice(0, 2);
  return parts.map((p) => p.charAt(0).toLocaleUpperCase('tr-TR')).join('') || 'Q';
}

export function VenueBadge({ venue }: { venue: SignalVenue }) {
  return (
    <div className="flex min-w-0 items-center gap-3">
      {venue.logoUrl ? (
        // Harici bayi logosu (R2/CDN) — next/image alan adı listesine bağlı kalmamak için düz img.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={venue.logoUrl}
          alt=""
          width={48}
          height={48}
          className="h-12 w-12 shrink-0 rounded-control border border-border bg-surface-1 object-cover"
        />
      ) : (
        <span
          aria-hidden
          className="flex h-12 w-12 shrink-0 items-center justify-center rounded-control bg-brand-subtle font-display text-lg font-bold text-brand"
        >
          {initials(venue.name)}
        </span>
      )}
      <div className="min-w-0">
        <p className="truncate font-semibold text-fg">{venue.name}</p>
        {venue.placeLabel && (
          <p className="flex items-center gap-1 truncate text-sm text-fg-muted">
            <MapPin className="h-3.5 w-3.5 shrink-0" aria-hidden />
            {venue.placeLabel}
          </p>
        )}
      </div>
    </div>
  );
}
