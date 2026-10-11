import { Suspense } from 'react';
import type { Metadata } from 'next';
import { requireAuth } from '@/lib/api-auth';
import { SkeletonDetail, SkeletonStats } from '@/components/states';
import { buildDealerQs, dealerListQuerySchema, parseStudioTab } from '@/lib/ai-studio/contract';
import { getStudioOverview } from '@/lib/ai-studio/overview.server';
import { getPromptsState } from '@/lib/ai-studio/prompts.server';
import { getLearningState } from '@/lib/ai-studio/learning.server';
import { getTonesState } from '@/lib/ai-studio/tones.server';
import { listDealers } from '@/lib/ai-studio/dealers.server';
import { getModelsState } from '@/lib/ai-studio/models.server';
import { StudioCenter, type StudioInitial } from '@/components/admin/a-prompt-studyosu/studio-center';

/**
 * Admin → Prompt ve Model Stüdyosu (/admin/ai/studio).
 *
 * Sunucu önce: KPI'lar ve URL'deki aktif sekmenin verisi sunucuda okunur (GET'te LLM yok);
 * istemci adası `initialData` alır ve sekmeler tembel yüklenir. Bir kaynak düşerse istemci kendi
 * sorgusunda görünür hata + "Tekrar dene" gösterir ("200 + sıfırlar" yok).
 */
export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Prompt ve Model Stüdyosu',
  description: 'Temel promptlar, öğrenilen kurallar, yanıt üslupları, bayi AI politikası ve model seçimi.',
};

type PageProps = { searchParams: Promise<Record<string, string | string[] | undefined>> };
const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? '';

async function settle<T>(p: Promise<T>): Promise<T | null> {
  try {
    return await p;
  } catch (err) {
    console.error('[admin/ai/studio] sunucu ön yüklemesi başarısız:', err);
    return null;
  }
}

export default async function AiStudioPage({ searchParams }: PageProps) {
  const sp = await searchParams;
  const tab = parseStudioTab(first(sp.tab) || 'promptlar');
  const initial: StudioInitial = { tab, overview: null };
  const auth = await requireAuth(['ADMIN']);

  if (!('error' in auth)) {
    const dq = dealerListQuerySchema.parse({
      q: first(sp.q) || undefined,
      filter: first(sp.durum) || undefined,
      page: first(sp.page) || undefined,
      size: first(sp.size) || undefined,
    });
    const [overview, prompts, learning, tones, dealers, models] = await Promise.all([
      settle(getStudioOverview()),
      tab === 'promptlar' ? settle(getPromptsState()) : Promise.resolve(null),
      tab === 'ogrenme' ? settle(getLearningState()) : Promise.resolve(null),
      tab === 'usluplar' ? settle(getTonesState()) : Promise.resolve(null),
      tab === 'bayiler' ? settle(listDealers(dq)) : Promise.resolve(null),
      tab === 'modeller' ? settle(getModelsState()) : Promise.resolve(null),
    ]);
    initial.overview = overview;
    initial.prompts = prompts;
    initial.learning = learning;
    initial.tones = tones;
    initial.models = models;
    initial.dealers = dealers ? { qs: buildDealerQs({ q: dq.q, filter: dq.filter, page: dq.page, size: dq.size }), page: dealers } : null;
  }

  return (
    <Suspense
      fallback={
        <div className="mx-auto max-w-7xl space-y-6">
          <SkeletonStats />
          <SkeletonDetail />
        </div>
      }
    >
      <StudioCenter initial={initial} />
    </Suspense>
  );
}
