'use client';

import { Lock } from 'lucide-react';
import { PageHeader, PanelPage } from '@/components/ds/page';
import { EmptyState } from '@/components/states';
import { usePlacesCopy } from './copy';
import { VenueListSkeleton } from './venue-card';

/** Keşfet yükleniyor — başlık + sekme iskeleti + kart iskeleti (statik, parıltısız). */
export function PlacesSkeleton() {
  const { copy } = usePlacesCopy();
  return (
    <PanelPage register="ops" width="narrow" header={<PageHeader title={copy.title} description={copy.description} />}>
      <div role="status" aria-busy="true" aria-live="polite" className="flex flex-col gap-4">
        <span className="sr-only">{copy.sheetLoading}</span>
        <div className="flex gap-2 border-b border-subtle pb-2" aria-hidden>
          {[0, 1, 2, 3].map((i) => (
            <span key={i} className="h-8 w-24 rounded-chip bg-surface-muted" />
          ))}
        </div>
        <VenueListSkeleton />
      </div>
    </PanelPage>
  );
}

/** Modül/menü yönetici tarafından kapatıldıysa. */
export function PlacesModuleOff() {
  const { copy } = usePlacesCopy();
  return (
    <PanelPage register="ops" width="narrow" header={<PageHeader title={copy.title} />}>
      <EmptyState variant="permission" icon={Lock} title={copy.moduleOff} description={null} headingLevel="h2" />
    </PanelPage>
  );
}
