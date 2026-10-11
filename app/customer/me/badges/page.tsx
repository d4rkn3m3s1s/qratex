import type { Metadata } from 'next';
import { Suspense } from 'react';
import { redirect } from 'next/navigation';
import { requireAuth } from '@/lib/api-auth';
import { segmentLayoutMetadataNoindex } from '@/lib/segment-layout-metadata';
import { loadCustomerBadgeCollection } from '@/lib/badges/customer-collection';
import type { CollectionOverview } from '@/lib/badges/collection-logic';
import { BadgesExperience, BadgesSkeleton } from '@/components/customer/m-rozetler/badges-experience';

/**
 * /customer/me/badges — rozet koleksiyonu (Ben → Rozetler). Eski `/customer/badges` buraya
 * kalıcı yönlenir (sorgu korunur; bildirimlerin `?badge=` derin linki dahil).
 *
 * Sunucu önce: yetki DB'den (`requireAuth`: rol, ban, oturum sürümü), koleksiyon sunucuda
 * yüklenip istemci adasına `initialData` olarak verilir (ilk boyamada gerçek veri, CLS yok).
 * Yükleme başarısızsa ada kendisi dener ve hatayı görünür gösterir — sayfa düşmez.
 */
export const dynamic = 'force-dynamic';

export async function generateMetadata(): Promise<Metadata> {
  return segmentLayoutMetadataNoindex('layoutMetadata.customerBadges', 'layoutMetadata.customerBadgesDescription');
}

export default async function CustomerBadgesPage() {
  const auth = await requireAuth(['CUSTOMER']);
  if ('error' in auth) redirect('/auth/login?callbackUrl=%2Fcustomer%2Fme%2Fbadges');

  let initialData: CollectionOverview | null = null;
  try {
    initialData = await loadCustomerBadgeCollection(auth.session.user.id);
  } catch (error) {
    console.error('[customer/me/badges] sunucu yüklemesi başarısız; istemci yeniden deneyecek', error);
  }

  return (
    <Suspense fallback={<BadgesSkeleton />}>
      <BadgesExperience initialData={initialData} />
    </Suspense>
  );
}
