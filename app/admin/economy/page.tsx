import { Suspense } from 'react';
import type { Metadata } from 'next';
import { requireAuth } from '@/lib/api-auth';
import { SkeletonForm, SkeletonStats } from '@/components/states';
import { parseEconomyTab, type LeaguesResource, type MatrixResource, type MultipliersResource, type Preload } from '@/lib/admin-economy/contract';
import { loadLeaguesResource, loadMatrixResource, loadMultipliersResource } from '@/lib/admin-economy/server';
import { EconomyStudio } from '@/components/admin/a-ekonomi-studyosu/economy-studio';

/**
 * Admin → Ekonomi Stüdyosu (/admin/economy): Puan matrisi · Çarpan ve tavanlar · Ligler ·
 * Simülasyon. Eski /admin/points-matrix, /admin/gamification-settings, /admin/league-settings
 * ve /admin/economy-sim buraya kalıcı yönlenir.
 *
 * Sunucu önce: üç düzenlenebilir kaynak (değer + sürüm) paralel okunur. Biri düşerse o sekme
 * düzenlemeyi KİLİTLER ve "Tekrar dene" gösterir (C2 yükleme kilidi — istemcide varsayılan
 * kopya yok); kaydetme `baseVersion` taşır, çakışmada 409. Simülasyon (ağır defter
 * sorguları) yalnız sekmesi açılınca istemcide yüklenir.
 */
export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Ekonomi Stüdyosu',
  description: 'Puan kuralları, çarpanlar, tavanlar, ligler ve gerçek defter verisiyle ekonomi simülasyonu.',
};

type PageProps = { searchParams: Promise<Record<string, string | string[] | undefined>> };

async function settle<T>(p: Promise<T>, label: string): Promise<T | null> {
  try {
    return await p;
  } catch (err) {
    console.error(`[admin/economy] ${label} ön yüklemesi başarısız:`, err);
    return null;
  }
}

export default async function AdminEconomyPage({ searchParams }: PageProps) {
  const sp = await searchParams;
  const rawTab = Array.isArray(sp.tab) ? sp.tab[0] : sp.tab;
  const tab = parseEconomyTab(rawTab);

  const auth = await requireAuth(['ADMIN']);
  let matrix: Preload<MatrixResource> = null;
  let multipliers: Preload<MultipliersResource> = null;
  let leagues: Preload<LeaguesResource> = null;
  if (!('error' in auth)) {
    [matrix, multipliers, leagues] = await Promise.all([
      settle(loadMatrixResource(), 'puan matrisi'),
      settle(loadMultipliersResource(), 'çarpanlar'),
      settle(loadLeaguesResource(), 'ligler'),
    ]);
  }

  return (
    <Suspense
      fallback={
        <div className="mx-auto max-w-6xl space-y-6">
          <SkeletonStats />
          <SkeletonForm />
        </div>
      }
    >
      <EconomyStudio initialTab={tab} initial={{ matrix, multipliers, leagues }} />
    </Suspense>
  );
}
