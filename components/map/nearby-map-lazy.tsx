'use client';

import dynamic from 'next/dynamic';
import { Skeleton } from '@/components/ui/skeleton';
import type { NearbyMapPoint } from './nearby-map';

/**
 * Harita sarmalayıcı: Leaflet `window` gerektirdiği için ssr:false ZORUNLU.
 * Ayrıca leaflet+react-leaflet ayrı chunk'a düşer → sayfa ilk yükü ağırlaşmaz
 * (RES/TBT korunur, harita yalnız görüntülenirken indirilir).
 */
const NearbyMap = dynamic(() => import('./nearby-map'), {
  ssr: false,
  loading: () => <Skeleton className="h-[360px] w-full rounded-2xl" />,
});

export type { NearbyMapPoint };
export default NearbyMap;
