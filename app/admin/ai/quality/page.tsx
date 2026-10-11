import { Suspense } from 'react';
import type { Metadata } from 'next';
import { requireAuth } from '@/lib/api-auth';
import { SkeletonStats, SkeletonTable } from '@/components/states';
import { chatListQuerySchema, chatQsFromUrl, chatStatsQuerySchema, sampleListQuerySchema, sampleQsFromUrl } from '@/lib/ai-quality/contract';
import { getQualityMetrics, listSamples } from '@/lib/ai-quality/quality.server';
import { getChatStats, listChats } from '@/lib/ai-quality/chats.server';
import { AiQualityCenter, type QualityInitial } from '@/components/admin/a-ai-kalite/ai-quality-center';

/**
 * Admin → AI Kalite (/admin/ai/quality) — İnceleme kuyruğu + Sohbet denetimi.
 * Eski /admin/ai-quality ve /admin/qra-chat-logs buraya kalıcı yönlenir.
 *
 * Sunucu önce: metrikler ve URL'deki aktif sekmenin ilk sayfası sunucuda okunur; istemci adası
 * `initialData` alır. Bir kaynak düşerse istemci kendi sorgusunda görünür hata + "Tekrar dene"
 * gösterir ("200 + sıfırlar" yok).
 */
export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'AI Kalite',
  description: 'AI analizlerinin insan değerlendirmesi ve QRA asistanı sohbet denetimi.',
};

type PageProps = { searchParams: Promise<Record<string, string | string[] | undefined>> };
const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? '';

async function settle<T>(p: Promise<T>): Promise<T | null> {
  try {
    return await p;
  } catch (err) {
    console.error('[admin/ai/quality] sunucu ön yüklemesi başarısız:', err);
    return null;
  }
}

export default async function AdminAiQualityPage({ searchParams }: PageProps) {
  const sp = await searchParams;
  const flat: Record<string, string> = Object.fromEntries(Object.entries(sp).map(([k, v]) => [k, first(v)]));
  const get = (k: string) => flat[k] ?? null;
  const tab = flat.tab === 'sohbet' ? 'sohbet' : 'inceleme';

  const initial: QualityInitial = { metrics: null, samples: null, chatStats: null, chats: null };
  // Sayfa proxy'de korunur (rol + gizli kapı); yetki kararı yine DB'den.
  const auth = await requireAuth(['ADMIN']);
  if ('error' in auth) return <AiQualityCenter initial={initial} />;

  if (tab === 'inceleme') {
    const qs = sampleQsFromUrl(get);
    const [metrics, page] = await Promise.all([
      settle(getQualityMetrics()),
      settle(listSamples(sampleListQuerySchema.parse(Object.fromEntries(new URLSearchParams(qs))))),
    ]);
    initial.metrics = metrics;
    if (page) initial.samples = { qs, page };
  } else {
    const qs = chatQsFromUrl(get);
    const period = chatStatsQuerySchema.parse({ period: ['24h', '30d'].includes(flat.period) ? flat.period : '7d' }).period;
    const [metrics, stats, page] = await Promise.all([
      settle(getQualityMetrics()),
      settle(getChatStats({ period })),
      settle(listChats(chatListQuerySchema.parse(Object.fromEntries(new URLSearchParams(qs))))),
    ]);
    initial.metrics = metrics;
    if (stats) initial.chatStats = { period, data: stats };
    if (page) initial.chats = { qs, page };
  }

  return (
    <Suspense
      fallback={
        <div className="mx-auto max-w-7xl space-y-6">
          <SkeletonStats />
          <SkeletonTable />
        </div>
      }
    >
      <AiQualityCenter initial={initial} />
    </Suspense>
  );
}
