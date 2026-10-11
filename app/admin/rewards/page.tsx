import { Suspense } from 'react';
import type { Metadata } from 'next';
import { requireAuth } from '@/lib/api-auth';
import { SkeletonStats, SkeletonTable } from '@/components/states';
import { getModuleControls } from '@/lib/module-gate';
import { cosmeticListQuerySchema, cosmeticsQs, rewardListQuerySchema, rewardsQs } from '@/lib/admin-store/contract';
import { getRewardStats, listRewards } from '@/lib/admin-store/rewards.server';
import { getRedemptionStats } from '@/lib/admin-store/redemptions.server';
import { getCosmeticStats, listCosmetics } from '@/lib/admin-store/cosmetics.server';
import { StoreCenter, type StoreInitial } from '@/components/admin/a-magaza-oduller/store-center';

/**
 * Admin → Mağaza ve Ödüller (/admin/rewards) — Ödüller · Kozmetik · Talepler.
 *
 * Sunucu önce: KPI sayıları ve URL'deki aktif sekmenin ilk sayfası sunucuda okunur; istemci adası
 * `initialData` alır. Bir kaynak düşerse istemci kendi sorgusunda görünür hata + "Tekrar dene"
 * gösterir ("200 + sıfırlar" yok). Talepler sekmesi açılınca yüklenir.
 */
export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Mağaza ve Ödüller',
  description: 'Ödül kataloğu, kozmetik vitrini ve ödül talebi teslim zinciri.',
};

type PageProps = { searchParams: Promise<Record<string, string | string[] | undefined>> };
const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? '';

async function settle<T>(p: Promise<T>): Promise<T | null> {
  try {
    return await p;
  } catch (err) {
    console.error('[admin/rewards] sunucu ön yüklemesi başarısız:', err);
    return null;
  }
}

function sortFromUrl(raw: string): string | null {
  return raw || null;
}

export default async function AdminRewardsPage({ searchParams }: PageProps) {
  const sp = await searchParams;
  const flat = Object.fromEntries(Object.entries(sp).map(([k, v]) => [k, first(v)]));
  const tab = flat.tab === 'kozmetik' || flat.tab === 'talepler' ? flat.tab : 'oduller';

  const initial: StoreInitial = { rewardStats: null, redemptionStats: null, cosmeticStats: null, rewards: null, cosmetics: null, rewardsModuleOff: false };
  // Sayfa proxy'de korunur (rol + gizli kapı); yetki kararı yine DB'den.
  const auth = await requireAuth(['ADMIN']);
  if ('error' in auth) return <StoreCenter initial={initial} />;

  const page = Number(flat.page) > 0 ? Number(flat.page) : 1;
  const size = Number(flat.size) > 0 ? Number(flat.size) : undefined;
  const [rewardStats, redemptionStats, cosmeticStats, controls] = await Promise.all([
    settle(getRewardStats()),
    settle(getRedemptionStats()),
    settle(getCosmeticStats()),
    settle(getModuleControls()),
  ]);
  initial.rewardStats = rewardStats;
  initial.redemptionStats = redemptionStats;
  initial.cosmeticStats = cosmeticStats;
  initial.rewardsModuleOff = (controls as Record<string, unknown> | null)?.rewards === false;

  if (tab === 'oduller') {
    const parsed = rewardListQuerySchema.safeParse({
      q: flat.q && flat.q.trim().length >= 2 ? flat.q : undefined,
      status: flat.status || undefined,
      type: flat.type || undefined,
      page,
      size,
    });
    if (parsed.success) {
      const qs = rewardsQs({ q: parsed.data.q, status: parsed.data.status, type: parsed.data.type, sort: sortFromUrl(flat.sort), page: parsed.data.page, size: parsed.data.size });
      const sorted = rewardListQuerySchema.parse(Object.fromEntries(new URLSearchParams(qs)));
      const data = await settle(listRewards(sorted));
      if (data) initial.rewards = { qs, page: data };
    }
  } else if (tab === 'kozmetik') {
    const parsed = cosmeticListQuerySchema.safeParse({
      q: flat.q && flat.q.trim().length >= 2 ? flat.q : undefined,
      status: flat.status || undefined,
      type: flat.type || undefined,
      rarity: flat.rarity || undefined,
      page,
      size,
    });
    if (parsed.success) {
      const qs = cosmeticsQs({
        q: parsed.data.q,
        type: parsed.data.type,
        status: parsed.data.status,
        rarity: parsed.data.rarity,
        sort: sortFromUrl(flat.sort),
        page: parsed.data.page,
        size: parsed.data.size,
      });
      const sorted = cosmeticListQuerySchema.parse(Object.fromEntries(new URLSearchParams(qs)));
      const data = await settle(listCosmetics(sorted));
      if (data) initial.cosmetics = { qs, page: data };
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
      <StoreCenter initial={initial} />
    </Suspense>
  );
}
