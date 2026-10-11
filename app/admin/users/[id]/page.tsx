import { Suspense } from 'react';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { requireAuth } from '@/lib/api-auth';
import { getUser360 } from '@/lib/admin-users/detail.server';
import { SkeletonDetail } from '@/components/states';
import { User360Screen } from '@/components/admin/a-kullanicilar/user-360-screen';

/**
 * Admin → Kullanıcı 360 (`/admin/users/[id]`): kimlik, rol/erişim, ekonomi (puan defteri +
 * gerekçeli düzeltme), rozet/ödül, geri bildirim, güven/aktivite, işletme ve denetim izi.
 * Sunucu önce: özet sunucuda okunur; sekmeler kendi uçlarından yalnız açıldığında yüklenir.
 */
export const dynamic = 'force-dynamic';

export const metadata: Metadata = { title: 'Kullanıcı 360', robots: { index: false, follow: false } };

type PageProps = { params: Promise<{ id: string }> };

export default async function AdminUser360Page({ params }: PageProps) {
  const { id } = await params;
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(id)) notFound();
  const auth = await requireAuth(['ADMIN']);
  let initial = null;
  if (!('error' in auth)) {
    try {
      initial = await getUser360(id, auth.session.user.id);
      if (!initial) notFound();
    } catch (err) {
      // notFound() bir kontrol akışı hatasıdır; yeniden fırlatılır. Diğer hatalarda istemci
      // kendi sorgusunda görünür hata + "Tekrar dene" gösterir.
      if ((err as { digest?: string })?.digest?.startsWith('NEXT_')) throw err;
      console.error('[admin/users/[id]] sunucu ön yüklemesi başarısız:', err);
      initial = null;
    }
  }
  return (
    <Suspense fallback={<div className="mx-auto max-w-7xl"><SkeletonDetail /></div>}>
      <User360Screen id={id} initial={initial} />
    </Suspense>
  );
}
