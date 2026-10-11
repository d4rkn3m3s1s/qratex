import { Suspense } from 'react';
import type { Metadata } from 'next';
import { requireAuth } from '@/lib/api-auth';
import { prisma } from '@/lib/prisma';
import { SkeletonStats, SkeletonTable } from '@/components/states';
import { getPrivacyOverview } from '@/lib/admin-privacy/server';
import type { PrivacyOverview } from '@/lib/admin-privacy/contract';
import { PrivacyCenter } from '@/components/admin/a-kvkk/privacy-center';

/**
 * Admin → KVKK merkezi (/admin/privacy). Eski /admin/privacy-requests ve /admin/compliance buraya
 * kalıcı yönlenir. Sunucu önce: genel bakış (uyum kontrolleri) sunucuda ölçülür; okunamazsa
 * istemci kendi isteğini atar ve hatayı görünür gösterir (sessiz sıfır yok).
 */
export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'KVKK merkezi',
  description: 'Veri sahibi talepleri, kişisel veri envanteri, saklama süreleri, rıza kanıtı ve 5651 kayıtları.',
  robots: { index: false, follow: false },
};

const OVERVIEW_CACHE_KEY = 'admin:privacy-overview:v1';

async function loadOverview(): Promise<PrivacyOverview | null> {
  try {
    const { redisGetJson, redisSetJson } = await import('@/lib/redis');
    const cached = await redisGetJson<PrivacyOverview>(OVERVIEW_CACHE_KEY);
    if (cached) return cached;
    const fresh = await getPrivacyOverview(prisma);
    await redisSetJson(OVERVIEW_CACHE_KEY, fresh, 60);
    return fresh;
  } catch (err) {
    console.error('[admin/privacy] genel bakış ön yüklemesi başarısız:', err);
    return null;
  }
}

export default async function AdminPrivacyPage() {
  const auth = await requireAuth(['ADMIN']);
  const initial = 'error' in auth ? null : await loadOverview();

  return (
    <Suspense
      fallback={
        <div className="mx-auto max-w-7xl space-y-6">
          <SkeletonStats />
          <SkeletonTable />
        </div>
      }
    >
      <PrivacyCenter initialOverview={initial} openCount={initial?.dsr.open} />
    </Suspense>
  );
}
