import { Suspense } from 'react';
import type { Metadata } from 'next';
import { headers } from 'next/headers';
import { HydrationBoundary, QueryClient, dehydrate } from '@tanstack/react-query';
import { requireAuth } from '@/lib/api-auth';
import { getModuleControls } from '@/lib/module-gate';
import { getServerLocale } from '@/lib/server-locale';
import { getConversation, listConversations, loadAssistantOverview } from '@/lib/dealer-assistant/server';
import { ErrorState } from '@/components/states';
import { AssistantScreen } from '@/components/dealer/b-asistan/assistant-screen';
import { AssistantSkeleton } from '@/components/dealer/b-asistan/skeleton';
import { assistantKeys } from '@/lib/dealer-assistant/types';

export const dynamic = 'force-dynamic';

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getServerLocale().catch(() => 'tr' as const);
  return locale === 'en'
    ? { title: 'AI Assistant', description: 'Ask your business data: answers backed by queried numbers and cited reviews.' }
    : { title: 'AI Asistan', description: 'İşletme verine sor: sorgudan gelen sayılar ve kaynak yorumlarla desteklenen yanıtlar.' };
}

const ID_RE = /^[A-Za-z0-9_-]{1,64}$/;

/**
 * Bayi AI Asistan (eski `/dealer/ai-chat` + `/dealer/ask-analytics`) — sunucuda ilk render.
 *
 * Modül kapısı (`ai_features`) sayfada da uygulanır. Kritik veri (açılış özeti, sohbet listesi,
 * `?c=` sohbeti) sunucuda yüklenir; bu sayfa LLM ÇAĞIRMAZ. SSR yüklemesi başarısızsa istemci
 * adası BFF'i çağırır ve hatayı görünür gösterir (sıfır/boş liste gibi davranmaz).
 */
export default async function DealerAssistantPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const rawC = typeof sp.c === 'string' ? sp.c : null;
  const conversationId = rawC && ID_RE.test(rawC) ? rawC : null;
  const [auth, controls] = await Promise.all([
    requireAuth(['DEALER']),
    getModuleControls().catch(() => ({}) as Record<string, boolean>),
  ]);

  if ((controls as Record<string, boolean | undefined>).ai_features === false) {
    return (
      <div className="mx-auto w-full max-w-7xl">
        <ErrorState kind="moduleDisabled" />
      </div>
    );
  }

  const queryClient = new QueryClient();
  const softNav = (await headers()).get('rsc') === '1';
  if (!softNav && !('error' in auth)) {
    const dealerId = auth.session.user.id;
    const [overview, list, detail] = await Promise.allSettled([
      loadAssistantOverview(dealerId),
      listConversations(dealerId),
      conversationId ? getConversation(dealerId, conversationId) : Promise.resolve(null),
    ]);
    if (overview.status === 'fulfilled') queryClient.setQueryData(assistantKeys.overview(), overview.value);
    else console.error('[dealer-assistant] SSR özet yüklenemedi; istemci yeniden deneyecek', overview.reason);
    if (list.status === 'fulfilled') queryClient.setQueryData(assistantKeys.list(''), { pages: [list.value], pageParams: [null] });
    if (detail.status === 'fulfilled' && detail.value && conversationId) queryClient.setQueryData(assistantKeys.conversation(conversationId), detail.value);
  }

  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      <Suspense fallback={<AssistantSkeleton />}>
        <AssistantScreen />
      </Suspense>
    </HydrationBoundary>
  );
}
