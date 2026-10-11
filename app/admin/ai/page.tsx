import { Suspense } from 'react';
import type { Metadata } from 'next';
import { requireAuth } from '@/lib/api-auth';
import { prisma } from '@/lib/prisma';
import { SkeletonCards, SkeletonStats } from '@/components/states';
import { DEFAULT_AI_OPS_PERIOD, periodSchema } from '@/lib/admin-ai-ops/contract';
import { getBacklogSummary, getSignalsReport, getUsageReport } from '@/lib/admin-ai-ops/server';
import { AiOpsCenter, type AiOpsInitial } from '@/components/admin/a-ai-operasyon/ai-ops-center';

/**
 * Admin → AI Operasyon Merkezi (/admin/ai).
 *
 * Sunucu önce: seçili dönemin kullanım/sinyal özeti ve kuyruk özeti sunucuda okunur (saf okuma,
 * LLM yok, 60 sn Redis önbelleği). Bir kaynak düşerse istemci kendi isteğini atar ve hatayı
 * görünür gösterir ("200 + sıfırlar" yok).
 */
export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'AI Operasyon',
  description: 'AI motoru sağlığı, maliyet ve kota, analiz kuyruğu, bayi bazlı AI durumu ve müşteri sesi.',
};

type PageProps = { searchParams: Promise<Record<string, string | string[] | undefined>> };
const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? '';

async function settle<T>(p: Promise<T>): Promise<T | null> {
  try {
    return await p;
  } catch (err) {
    console.error('[admin/ai] sunucu ön yüklemesi başarısız:', err);
    return null;
  }
}

export default async function AdminAiOpsPage({ searchParams }: PageProps) {
  const sp = await searchParams;
  const period = periodSchema.parse(first(sp.period) || DEFAULT_AI_OPS_PERIOD);
  const tab = first(sp.tab) || 'genel';
  const initial: AiOpsInitial = { period, usage: null, signals: null, backlog: null };

  const auth = await requireAuth(['ADMIN']);
  if (!('error' in auth)) {
    const wantsSignals = tab === 'genel' || tab === 'sinyaller';
    const wantsUsage = tab === 'genel' || tab === 'kullanim';
    const [usage, signals, backlog] = await Promise.all([
      wantsUsage ? settle(getUsageReport(prisma, period)) : Promise.resolve(null),
      wantsSignals ? settle(getSignalsReport(prisma, period)) : Promise.resolve(null),
      settle(getBacklogSummary(prisma)),
    ]);
    initial.usage = usage;
    initial.signals = signals;
    initial.backlog = backlog;
  }

  return (
    <Suspense
      fallback={
        <div className="mx-auto max-w-7xl space-y-6">
          <SkeletonStats />
          <SkeletonCards />
        </div>
      }
    >
      <AiOpsCenter initial={initial} />
    </Suspense>
  );
}
