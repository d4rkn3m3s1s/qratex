import { Suspense } from 'react';
import type { Metadata } from 'next';
import { permanentRedirect } from 'next/navigation';
import { requireAuth } from '@/lib/api-auth';
import { SkeletonDetail, SkeletonStats } from '@/components/states';
import { getCouncilSettings } from '@/lib/council/config.server';
import { getSessionDetail, listSessions } from '@/lib/council/sessions.server';
import { CouncilWorkspace, type CouncilInitial } from '@/components/admin/a-ajan-konseyi/council-workspace';

/**
 * Admin → Ajan Konseyi (/admin/agent-council) — Oturum · Geçmiş · Ayarlar.
 *
 * Sunucu önce: ayarlar (AI sağlayıcı durumu dahil), açık oturum (`?oturum=`), son oturumlar ve
 * geçmişin ilk sayfası sunucuda okunur. Bir kaynak düşerse istemci kendi sorgusunda görünür hata
 * + "Tekrar dene" gösterir. GET'te LLM çağrısı yok; LLM yalnız POST …/step ile çalışır.
 */
export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Ajan Konseyi',
  description: 'Stratejik soruları uzman yapay zekâ ajanlarına tartıştırın; kaydedilen kararlar ve bayi aksiyonları.',
  robots: { index: false, follow: false },
};

type PageProps = { searchParams: Promise<Record<string, string | string[] | undefined>> };
const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? '';

async function settle<T>(p: Promise<T>): Promise<T | null> {
  try {
    return await p;
  } catch (err) {
    console.error('[admin/agent-council] sunucu ön yüklemesi başarısız:', err);
    return null;
  }
}

export default async function AgentCouncilPage({ searchParams }: PageProps) {
  const sp = await searchParams;
  // Eski derin bağlantı: ?runId= → ?oturum=
  const legacyRun = first(sp.runId);
  if (legacyRun) permanentRedirect(`/admin/agent-council?oturum=${encodeURIComponent(legacyRun)}`);

  const initial: CouncilInitial = { settings: null, session: null, recent: null, history: null };
  // Sayfa proxy'de korunur (rol + gizli kapı); yetki kararı yine DB'den.
  const auth = await requireAuth(['ADMIN']);
  if ('error' in auth) return <CouncilWorkspace initial={initial} />;

  const tab = first(sp.tab);
  const sessionId = first(sp.oturum).slice(0, 64);
  const [settings, session, recent, history] = await Promise.all([
    settle(getCouncilSettings()),
    sessionId && tab !== 'gecmis' && tab !== 'ayarlar' ? settle(getSessionDetail(sessionId)) : Promise.resolve(null),
    !sessionId && !tab ? settle(listSessions({ status: 'all', limit: 5 })) : Promise.resolve(null),
    tab === 'gecmis' && !first(sp.q) && !first(sp.durum) ? settle(listSessions({ status: 'all', limit: 20 })) : Promise.resolve(null),
  ]);
  Object.assign(initial, { settings, session, recent, history });

  return (
    <Suspense
      fallback={
        <div className="mx-auto max-w-7xl space-y-6">
          <SkeletonStats />
          <SkeletonDetail />
        </div>
      }
    >
      <CouncilWorkspace initial={initial} />
    </Suspense>
  );
}
