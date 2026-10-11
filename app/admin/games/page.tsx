import { Suspense } from 'react';
import type { Metadata } from 'next';
import { requireAuth } from '@/lib/api-auth';
import { SkeletonStats, SkeletonTable } from '@/components/states';
import { getGamesOverview } from '@/lib/admin-games/server';
import { GamesControlRoom } from '@/components/admin/a-oyunlar/games-control-room';
import type { GamesOverview } from '@/lib/admin-games/contract';

/**
 * Admin → Oyun Kontrol Odası (/admin/games). Denetim: docs/audit/2026-10-08/admin/admin_games.md.
 *
 * Sunucu önce: genel bakış (oyunlar + KPI) sunucuda çekilir, istemci adası `initial` alır.
 * Ön yükleme düşerse istemci kendi sorgusunda görünür hata + "Tekrar dene" gösterir
 * ("200 + sıfırlar" yok). Detay çekmecesi ve turnuva sekmesi tembel yüklenir.
 */
export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Oyun Kontrol Odası',
  description: 'Mini oyun portföyü, ödül ekonomisi, turnuva ve bütünlük sinyalleri.',
};

export default async function AdminGamesPage() {
  const auth = await requireAuth(['ADMIN']);
  let initial: GamesOverview | null = null;
  if (!('error' in auth)) {
    try {
      initial = await getGamesOverview();
    } catch (err) {
      console.error('[admin/games] sunucu ön yüklemesi başarısız:', err);
    }
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
      <GamesControlRoom initial={initial} />
    </Suspense>
  );
}
