import { Suspense } from 'react';
import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { requireAuth } from '@/lib/api-auth';
import { resolveDealerScope } from '@/lib/auth/scope';
import { getServerLocale } from '@/lib/server-locale';
import { legacyInboxParams, normalizeInboxFilters } from '@/lib/dealer-inbox/core';
import { getInboxMeta, getInboxSummary, INBOX_PAGE_SIZE, listInbox } from '@/lib/dealer-inbox/server';
import { parseDateRange, toPeriod } from '@/components/ds/page/date-range';
import { ErrorState, SkeletonList } from '@/components/states';
import { InboxScreen, KPI_PERIOD_KEYS, type InboxInitial } from '@/components/dealer/b-gelen-kutusu/inbox-screen';

/**
 * Gelen Kutusu → Tümü (yol haritası §4.3, F3.2(b)). QR geri bildirimleri + tüketim yorumları tek
 * listede: durum (yeni / yanıtlandı / çözüldü), SLA, duygu ve AI sinyalleri, `?id=` detay çekmecesi,
 * şablonlu + AI taslaklı yanıt (otomatik yanıtla çakışmasız), telafi, atama, toplu işlem.
 *
 * Birleşen eski rotalar (kalıcı yönlendirme): /dealer/feedbacks, /dealer/reviews (→ ?source=consumption).
 *
 * Sunucu önce: ilk liste sayfası, KPI özeti ve yardımcı veri paralel çekilip istemci adasına
 * `initial` olarak verilir. Bir kaynak düşerse diğerleri gelir; düşen kaynak istemcide görünür
 * hata + "Tekrar dene" ile gösterilir (sıfır gösterilmez).
 */
export const dynamic = 'force-dynamic';

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getServerLocale().catch(() => 'tr' as const);
  return locale === 'en'
    ? { title: 'All', description: 'QR feedback and purchase reviews: reply, remedy, assign and resolve.' }
    : { title: 'Tümü', description: 'QR geri bildirimleri ve tüketim yorumları: yanıtla, telafi et, ata, kapat.' };
}

type PageProps = { searchParams: Promise<Record<string, string | string[] | undefined>> };

async function settle<T>(p: Promise<T>): Promise<T | null> {
  try {
    return await p;
  } catch (err) {
    console.error('[dealer-inbox] sunucu ön yüklemesi başarısız:', err);
    return null;
  }
}

export default async function DealerInboxPage({ searchParams }: PageProps) {
  const sp = await searchParams;
  // Eski parametreler (`next.config` yönlendirmesi sorguyu olduğu gibi taşır): ?tab=qr → ?source=qr, ?search= → ?q=.
  if (sp.tab !== undefined || sp.search !== undefined) {
    const mapped = legacyInboxParams(sp);
    redirect(`/dealer/inbox${mapped.size ? `?${mapped}` : ''}`);
  }
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(sp)) {
    const x = Array.isArray(v) ? v[0] : v;
    if (x != null) params.set(k, x);
  }

  // Rol proxy'de korunur; yetki ve kiracı kararı yine DB'den (oturum iptali, personel aktifliği).
  const auth = await requireAuth(['DEALER', 'STAFF']);
  const scope = 'error' in auth ? null : await resolveDealerScope(auth.session, { allowRoles: ['DEALER', 'STAFF'] });
  if (!scope || !scope.ok) {
    return <ErrorState kind="forbidden" variant="page" headingLevel="h2" />;
  }

  const filters = normalizeInboxFilters(params);
  const period = toPeriod(parseDateRange(params, { keys: KPI_PERIOD_KEYS, defaultPreset: 'last30' })).range;

  const [list, summary, meta] = await Promise.all([
    settle(listInbox(scope.dealerId, scope.actorId, filters, { limit: INBOX_PAGE_SIZE })),
    settle(getInboxSummary(scope.dealerId, { from: new Date(period.from), to: new Date(period.to) })),
    settle(getInboxMeta(scope.dealerId, scope.actorId)),
  ]);

  const initial: InboxInitial = { filters, period, list, summary, meta, readOnly: false };

  return (
    <Suspense fallback={<SkeletonList rows={6} />}>
      <InboxScreen initial={initial} />
    </Suspense>
  );
}
