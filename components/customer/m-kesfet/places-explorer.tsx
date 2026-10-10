'use client';

import { useCallback, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { Compass, Heart, Medal, Zap } from 'lucide-react';
import { PageHeader, PanelPage, PanelErrorBoundary, SectionTabs } from '@/components/ds/page';
import { EmptyState } from '@/components/states';
import { PLACES_TABS, type DealsResponse, type PlacesTab, type SavedResponse, type TopResponse } from '@/lib/places/types';
import { venueHref, type Coords } from './api';
import { usePlacesCopy } from './copy';
import { DealsTab } from './deals-tab';
import { NearbyTab } from './nearby-tab';
import { SavedTab } from './saved-tab';
import { TopTab } from './top-tab';
import { useCoarseLocation } from './use-coarse-location';
import { usePlacesUrl } from './use-places-url';

export interface PlacesInitialData {
  saved: SavedResponse | null;
  deals: DealsResponse | null;
  top: TopResponse | null;
}

function isTab(v: string | null): v is PlacesTab {
  return !!v && (PLACES_TABS as readonly string[]).includes(v);
}

/**
 * Keşfet istemci adası: sekmeler (URL `?tab=`) ve tek konum kaynağı. Sekme içerikleri yalnız
 * etkinken çizilir; ilk sekmenin verisi sunucudan gelir. Mekân detayı ayrı yüzeydir
 * (`/customer/places/[dealerId]`); haritadan/butondan gidişler oraya.
 */
export function PlacesExplorer({ initial, dealsEnabled }: { initial: PlacesInitialData; dealsEnabled: boolean }) {
  const { copy } = usePlacesCopy();
  const url = usePlacesUrl();
  const loc = useCoarseLocation();
  const tabRaw = url.get('tab');
  const tab: PlacesTab = isTab(tabRaw) ? tabRaw : 'nearby';
  const router = useRouter();
  const coords: Coords = useMemo(() => (loc.location ? { lat: loc.location.lat, lng: loc.location.lng } : null), [loc.location]);

  const openVenue = useCallback((id: string) => router.push(venueHref(id)), [router]);
  const setTab = useCallback((next: string) => url.set({ tab: next === 'nearby' ? null : next }), [url]);

  const tabs = [
    { value: 'nearby', label: copy.tabs.nearby, icon: <Compass /> },
    { value: 'saved', label: copy.tabs.saved, icon: <Heart /> },
    { value: 'deals', label: copy.tabs.deals, icon: <Zap /> },
    { value: 'top', label: copy.tabs.top, icon: <Medal /> },
  ];

  return (
    <PanelPage register="ops" width="narrow" header={<PageHeader title={copy.title} description={copy.description} />}>
      <SectionTabs
        tabs={tabs}
        value={tab}
        onValueChange={setTab}
        ariaLabel={copy.tabsLabel}
        variant="underline"
        touchTarget
      >
        {(active) => (
          <PanelErrorBoundary resetKeys={[active]}>
            {active === 'nearby' && (
              <NearbyTab
                status={loc.status}
                location={loc.location}
                locationReady={loc.initialized}
                onRequestLocation={loc.request}
                onForgetLocation={loc.clear}
                onOpenVenue={openVenue}
              />
            )}
            {active === 'saved' && <SavedTab coords={coords} initial={initial.saved} onGoNearby={() => setTab('nearby')} />}
            {active === 'deals' &&
              (dealsEnabled ? (
                <DealsTab coords={coords} initial={initial.deals} onRequestLocation={loc.request} />
              ) : (
                <EmptyState variant="permission" title={copy.moduleOff} description={null} />
              ))}
            {active === 'top' && <TopTab initial={initial.top} />}
          </PanelErrorBoundary>
        )}
      </SectionTabs>
    </PanelPage>
  );
}
