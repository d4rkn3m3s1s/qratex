import type { Metadata } from 'next';
import { requireAuth } from '@/lib/api-auth';
import type { JobsView } from '@/lib/observability/contract';
import { loadJobsView } from '@/lib/observability/jobs.server';
import { JobsCenter } from '@/components/admin/a-gozlemlenebilirlik/jobs-center';

/**
 * Admin → Arka plan işleri (/admin/jobs). Kaynak: günlük orkestratörün kayıt defteri +
 * `Settings[cron_daily_state]` (her işin son koşusu, son başarılı koşusu, hatası, ardışık hata
 * sayısı ve son 14 koşu). Sunucu önce; istemci yalnız yenileme ve "şimdi çalıştır" taşır.
 */
export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Arka plan işleri',
  description: 'Günlük cron alt işlerinin son koşusu, sonucu, süresi, ardışık hataları ve koşu geçmişi.',
};

export default async function AdminJobsPage() {
  let initial: JobsView | null = null;
  const auth = await requireAuth(['ADMIN']);
  if (!('error' in auth)) {
    try {
      initial = await loadJobsView();
    } catch (err) {
      console.error('[admin/jobs] sunucu ön yüklemesi başarısız:', err);
    }
  }
  return <JobsCenter initial={initial} />;
}
