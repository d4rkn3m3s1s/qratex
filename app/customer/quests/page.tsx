import { getServerSession } from 'next-auth';
import { redirect } from 'next/navigation';
import { authOptions } from '@/lib/auth';
import { assertModuleEnabled } from '@/lib/module-gate';
import { getQuestBoard } from '@/lib/quests/board';
import type { QuestBoard } from '@/lib/quests/board-types';
import { QuestBoardView } from '@/components/customer/m-gorevler/quest-board';

export const dynamic = 'force-dynamic';

/**
 * Oyna → Görevler. Sunucu bileşeni: oturum + modül kapısı + ilk pano sunucuda (ilk boyamada
 * boş "0" yok); etkileşim küçük istemci adasında (components/customer/m-gorevler).
 * Pano okunamazsa ada aynı ucu (`/api/customer/quests`) istemciden dener ve hatayı görünür kılar.
 */
export default async function CustomerQuestsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id || session.user.role !== 'CUSTOMER') {
    redirect('/auth/signin?callbackUrl=%2Fcustomer%2Fquests');
  }
  const userId = session.user.id;
  const params = await searchParams;
  const rawTab = params.tab;
  const initialTab = typeof rawTab === 'string' ? rawTab : null;

  let moduleDisabled = false;
  let initialBoard: QuestBoard | null = null;
  try {
    const gate = await assertModuleEnabled('quests', { userId });
    if (gate) {
      moduleDisabled = true;
    } else {
      initialBoard = await getQuestBoard(userId);
    }
  } catch (error) {
    // İstemci adası yeniden dener; başarısız olursa QueryState hata + "Tekrar dene" gösterir.
    console.error('[customer/quests] pano sunucuda hazırlanamadı', error);
  }

  return <QuestBoardView initialBoard={initialBoard} moduleDisabled={moduleDisabled} initialTab={initialTab} />;
}
