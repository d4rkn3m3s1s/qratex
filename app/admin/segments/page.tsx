/**
 * /admin/segments — Segmentler: kayıt defteri (günlük CLV segment ataması) + bayi segment
 * kampanyaları için TEK onay kuyruğu + inovasyon modül ayarları.
 * Sunucu bileşeni: yetki DB'den (`requireAuth`), genel bakış sunucuda hesaplanır; başarısızsa
 * istemci kendisi çeker ve hatayı görünür gösterir (QueryState) — "200 + sıfırlar" yok.
 */
import type { Metadata } from 'next';
import { requireAuth } from '@/lib/api-auth';
import { getSegmentOverview } from '@/components/admin/a-segmentler/server/segments';
import { SegmentsClient } from '@/components/admin/a-segmentler/ui/segments-client';
import type { SegmentOverview } from '@/components/admin/a-segmentler/domain';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Segmentler',
  robots: { index: false, follow: false },
};

async function loadInitial(): Promise<SegmentOverview | null> {
  const auth = await requireAuth(['ADMIN']);
  if ('error' in auth) return null;
  try {
    return await getSegmentOverview();
  } catch (err) {
    console.error('[segments] sunucu ön hesaplaması başarısız; istemci yeniden deneyecek', err);
    return null;
  }
}

export default async function AdminSegmentsPage() {
  const initial = await loadInitial();
  return <SegmentsClient initial={initial} />;
}
