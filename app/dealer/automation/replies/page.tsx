import type { Metadata } from 'next';
import { getServerLocale } from '@/lib/server-locale';
import { HydrationBoundary, QueryClient, dehydrate } from '@tanstack/react-query';
import { requireAuth } from '@/lib/api-auth';
import { loadRepliesOverview } from '@/lib/dealer-automation/replies.server';
import { AUTOMATION_KEYS } from '@/lib/dealer-automation/types';
import { RepliesScreen } from '@/components/dealer/b-otomasyon/replies-screen';

export const dynamic = 'force-dynamic';

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getServerLocale().catch(() => 'tr' as const);
  return locale === 'en'
    ? { title: 'Auto-replies · Automation', description: 'Rules that automatically reply to feedback or open an incident based on a condition.' }
    : { title: 'Otomatik yanıtlar · Otomasyon', description: 'Geri bildirime koşula göre otomatik yanıt yazan ya da vaka açan kurallar.' };
}

/**
 * Bayi › Otomasyon › Otomatik yanıtlar. Sunucu önce: kurallar + sayaçlar BFF ile AYNI
 * yükleyiciden gelir ve önbelleğe gömülür. Yükleme düşerse istemci BFF'i çağırır ve hatayı
 * görünür gösterir (boş liste gibi DEĞİL).
 */
export default async function AutomationRepliesPage() {
  const auth = await requireAuth(['DEALER']);
  const queryClient = new QueryClient();
  if (!('error' in auth)) {
    try {
      queryClient.setQueryData(AUTOMATION_KEYS.replies, await loadRepliesOverview(auth.session.user.id));
    } catch (err) {
      console.error('[automation-replies] SSR yüklemesi başarısız; istemci yeniden deneyecek', err);
    }
  }
  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      <RepliesScreen />
    </HydrationBoundary>
  );
}
