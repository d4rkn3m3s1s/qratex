import type { Metadata } from 'next';
import { Suspense } from 'react';
import { requireAuth } from '@/lib/api-auth';
import { getNavigationState } from '@/lib/admin-navigation/navigation.server';
import type { NavStudioState } from '@/lib/admin-navigation/contract';
import { NavigationStudio } from '@/components/admin/a-navigasyon-studyosu/studio';
import { SkeletonForm } from '@/components/states';

/**
 * Admin → Navigasyon Stüdyosu (/admin/navigation). Sunucu önce: güncel sıra/grup/görünürlük
 * + sürümler sunucuda okunur. Ön yükleme düşerse istemci görünür hata + "Tekrar dene" gösterir
 * (varsayılanlar asla "kayıtlı ayar" gibi sunulmaz — C2 yükleme kilidi).
 */
export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Navigasyon Stüdyosu',
  description: 'Admin, bayi ve müşteri menülerinin sırası, grupları ve görünürlüğü; canlı önizleme ve sürüm geçmişi.',
};

export default async function AdminNavigationPage() {
  let initial: NavStudioState | null = null;
  const auth = await requireAuth(['ADMIN']);
  if (!('error' in auth)) {
    try {
      initial = await getNavigationState();
    } catch (err) {
      console.error('[admin/navigation] sunucu ön yüklemesi başarısız:', err);
    }
  }
  return (
    <Suspense fallback={<SkeletonForm />}>
      <NavigationStudio initial={initial} />
    </Suspense>
  );
}
