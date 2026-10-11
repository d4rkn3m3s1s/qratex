import type { Metadata } from 'next';
import { requireAuth } from '@/lib/api-auth';
import { resolveDealerScope } from '@/lib/auth/scope';
import { getServerLocale } from '@/lib/server-locale';
import { getStaffToday } from '@/lib/staff-ops/server';
import type { StaffToday } from '@/lib/staff-ops/types';
import { ErrorState } from '@/components/states';
import { StaffTodayScreen } from '@/components/staff/b-ekip/staff-today';

export const dynamic = 'force-dynamic';

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getServerLocale().catch(() => 'tr' as const);
  return locale === 'en'
    ? { title: 'Today', description: 'Your shift, tasks, checklists, leave, training and field reports.' }
    : { title: 'Bugün', description: 'Vardiyan, görevlerin, kontrol listelerin, izin, eğitim ve saha bildirimlerin.' };
}

type PageProps = { searchParams: Promise<Record<string, string | string[] | undefined>> };

/**
 * Personel → Bugün (denetim raporları docs/audit/2026-10-08/bayi/staff.md + staff_field.md).
 * Sunucu önce: tek BFF verisi (`getStaffToday`) burada yüklenir; düşerse istemci adası görünür
 * hata + "Tekrar dene" gösterir. Pasif personel kiracı çözümünde reddedilir.
 */
export default async function StaffHomePage({ searchParams }: PageProps) {
  const sp = await searchParams;
  const auth = await requireAuth(['STAFF']);
  if ('error' in auth) {
    return <ErrorState kind="forbidden" variant="page" />;
  }
  const scope = await resolveDealerScope(auth.session, { allowRoles: ['STAFF'] });
  if (!scope.ok) {
    return <ErrorState kind="forbidden" variant="page" description={scope.message} />;
  }
  const initial = await getStaffToday(auth.session.user.id, scope.dealerId).catch((err): StaffToday | null => {
    console.error('[staff] sunucu ön yüklemesi başarısız:', err);
    return null;
  });
  return <StaffTodayScreen initial={initial} openReport={sp.bildir === '1'} />;
}
