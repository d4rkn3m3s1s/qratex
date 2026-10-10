import { Suspense } from 'react';
import { getServerSession } from 'next-auth';
import { redirect } from 'next/navigation';
import { authOptions } from '@/lib/auth';
import { getDiscoveryConfig } from '@/lib/discovery-config';
import { isPlaceCategory } from '@/lib/places/categories';
import { getSavedPlaces, getTopPlaces } from '@/lib/places/data.server';
import { getDeals } from '@/lib/places/deals.server';
import { resolvePlacesAccess } from '@/lib/places/gate.server';
import { PLACES_TABS, type PlacesTab } from '@/lib/places/types';
import { PlacesExplorer, type PlacesInitialData } from '@/components/customer/m-kesfet/places-explorer';
import { PlacesModuleOff, PlacesSkeleton } from '@/components/customer/m-kesfet/places-static';
import { getPlacesCopy } from '@/components/customer/m-kesfet/copy';
import { getServerLocale } from '@/lib/server-locale';
import type { Metadata } from 'next';

export const dynamic = 'force-dynamic';

export async function generateMetadata(): Promise<Metadata> {
  const copy = getPlacesCopy(await getServerLocale());
  return { title: copy.title, description: copy.description };
}

type SearchParams = Record<string, string | string[] | undefined>;
const ID_RE = /^[A-Za-z0-9_-]{1,64}$/;

function first(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v;
}

/**
 * Ölü derin linkler: `?focus=` / `?dealerId=` / `?venue=` → mekân detayı
 * (`/customer/places/[dealerId]`); `?promo=` → sponsorlu duyurunun mekânı, yoksa Fırsatlar.
 */
async function canonicalHref(sp: SearchParams): Promise<string | null> {
  const legacyVenue = first(sp.focus) ?? first(sp.dealerId) ?? first(sp.venue);
  const promo = first(sp.promo);
  if (!legacyVenue && !promo) return null;
  const out = new URLSearchParams();
  for (const [key, raw] of Object.entries(sp)) {
    if (key === 'focus' || key === 'dealerId' || key === 'venue' || key === 'promo') continue;
    for (const v of Array.isArray(raw) ? raw : raw === undefined ? [] : [raw]) out.append(key, v);
  }
  let venue = legacyVenue && ID_RE.test(legacyVenue) ? legacyVenue : null;
  if (!venue && promo) {
    // Ana sayfadaki sponsorlu kart: duyurunun işletmesi varsa onun çekmecesi, yoksa Fırsatlar.
    try {
      const config = await getDiscoveryConfig();
      const item = config.sponsored.find((s) => s.id === promo);
      if (item?.dealerId && ID_RE.test(item.dealerId)) venue = item.dealerId;
    } catch {
      /* ayar okunamazsa Fırsatlar'a düş */
    }
    if (!venue && !out.has('tab')) out.set('tab', 'deals');
  }
  if (venue) return `/customer/places/${encodeURIComponent(venue)}`;
  const qs = out.toString();
  return qs ? `/customer/places?${qs}` : '/customer/places';
}

/**
 * Keşfet (`/customer/places`) — sunucu bileşeni. Yetki + modül kapısı sunucuda; etkin sekmenin
 * kritik verisi (Kaydettiklerim / Fırsatlar / En iyiler) sunucuda hesaplanıp istemci adasına
 * başlangıç verisi olarak geçer (ilk boyamada istek yok). "Yakınımda" konum gerektirdiği için
 * tarayıcıda yüklenir. Veri okunamazsa ada kendi isteğini atar ve hatayı görünür gösterir.
 */
export default async function PlacesPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id || session.user.role !== 'CUSTOMER') redirect('/auth/signin?callbackUrl=%2Fcustomer%2Fplaces');
  const sp = await searchParams;
  const canonical = await canonicalHref(sp);
  if (canonical) redirect(canonical);

  const modules = await resolvePlacesAccess(session.user.id);
  if (!modules.places) return <PlacesModuleOff />;

  const tabRaw = first(sp.tab);
  const tab: PlacesTab = tabRaw && (PLACES_TABS as readonly string[]).includes(tabRaw) ? (tabRaw as PlacesTab) : 'nearby';
  const userId = session.user.id;
  const initial: PlacesInitialData = { saved: null, deals: null, top: null };
  try {
    if (tab === 'saved') initial.saved = await getSavedPlaces(userId);
    else if (tab === 'deals' && modules.deals) initial.deals = await getDeals(userId);
    else if (tab === 'top') {
      const cat = first(sp.category);
      initial.top = await getTopPlaces(userId, { category: isPlaceCategory(cat) ? cat : null, window: first(sp.window) === '30' ? 30 : 90 });
    }
  } catch (error) {
    // İlk veri okunamadı: istemci kendi isteğini atar ve hata/tekrar dene durumunu gösterir.
    console.error('[customer/places] ilk veri okunamadı', error);
  }

  return (
    <Suspense fallback={<PlacesSkeleton />}>
      <PlacesExplorer initial={initial} dealsEnabled={modules.deals} />
    </Suspense>
  );
}
