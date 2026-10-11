import { Suspense } from 'react';
import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { requireAuth } from '@/lib/api-auth';
import { canonicalFeedQs, canonicalStatsQs, parseFeedQuery } from '@/lib/admin-feedbacks/contract';
import { getFeedStats, listFeed } from '@/lib/admin-feedbacks/feed.server';
import { SkeletonStats, SkeletonTable } from '@/components/states';
import { FeedbacksScreen, type FeedbacksInitial } from '@/components/admin/a-geri-bildirimler/feedbacks-screen';

/**
 * Admin → Geri bildirimler: platform geneli moderasyon kuyruğu (QR ∪ tüketim yorumu).
 *
 * Sunucu önce: URL'deki görünümün ilk sayfası ve sayaçlar sunucuda paralel çekilir, istemci
 * adasına `initialData` olarak verilir. Bir kaynak düşerse istemci kendi sorgusunda görünür
 * hata + "Tekrar dene" gösterir ("200 + sıfırlar" yok). Eski derin bağlantılar (`?search=`
 * global arama/analitik, `?sentiment=` pano, `?type=`) yeni anahtarlara çevrilir.
 */
export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Geri bildirimler',
  description: 'Platformun müşteri sesi: dikkat gerektiren geri bildirimleri ayıklayın ve gerekçeli, geri alınabilir moderasyon yapın.',
};

type PageProps = { searchParams: Promise<Record<string, string | string[] | undefined>> };
const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? '';

async function settle<T>(p: Promise<T>): Promise<T | null> {
  try {
    return await p;
  } catch (err) {
    console.error('[admin/feedbacks] sunucu ön yüklemesi başarısız:', err);
    return null;
  }
}

export default async function AdminFeedbacksPage({ searchParams }: PageProps) {
  const sp = await searchParams;
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(sp)) {
    const val = first(v);
    if (val) params.set(k, val);
  }

  // Eski bağlantılar → yeni sözleşme (arama/duygu ile gelen kullanıcı "Tümü" görünümünde başlar).
  const legacySearch = params.get('search');
  const legacyType = params.get('type');
  const legacySentiment = params.has('sentiment') && !params.has('view');
  if (legacySearch !== null || legacyType !== null || legacySentiment) {
    if (legacySearch !== null) {
      params.delete('search');
      if (legacySearch.trim()) params.set('q', legacySearch.trim());
    }
    if (legacyType !== null) {
      params.delete('type');
      if (legacyType === 'qr' || legacyType === 'consumption') params.set('source', legacyType);
    }
    if (!params.has('view')) params.set('view', 'all');
    redirect(`/admin/feedbacks?${params.toString()}`);
  }

  // Sayfa proxy'de korunur; yetki kararı yine DB'den (rol değişimi / oturum iptali anında etkili).
  const auth = await requireAuth(['ADMIN']);
  const allowed = !('error' in auth);

  const query = parseFeedQuery(params);
  const listQs = canonicalFeedQs(query);
  const statsQs = canonicalStatsQs(query);

  const [stats, list] = allowed ? await Promise.all([settle(getFeedStats(query)), settle(listFeed(query))]) : [null, null];

  const initial: FeedbacksInitial = {
    stats: stats ? { qs: statsQs, data: stats } : null,
    list: list ? { qs: listQs, data: list } : null,
  };

  return (
    <Suspense
      fallback={
        <div className="mx-auto max-w-7xl space-y-6">
          <SkeletonStats />
          <SkeletonTable />
        </div>
      }
    >
      <FeedbacksScreen initial={initial} />
    </Suspense>
  );
}
