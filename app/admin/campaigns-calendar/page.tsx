import { Suspense } from 'react';
import type { Metadata } from 'next';
import { requireAuth } from '@/lib/api-auth';
import { SkeletonStats } from '@/components/states';
import { loadCalendar } from '@/lib/campaigns-calendar/server';
import type { CalendarData } from '@/lib/campaigns-calendar/contract';
import { CalendarStudio } from '@/components/admin/a-kampanya-takvimi/calendar-studio';

/**
 * Admin → Kampanya Takvimi (/admin/campaigns-calendar): sezon kampanyaları (ekonomi katmanı)
 * ve görünüm konseptleri tek zaman çizelgesinde; canlı kazanan, çakışma, bütçe/tavan,
 * gerçek defter etkisi. Eski /admin/seasonal-campaigns ve /admin/seasonal-concepts buraya
 * kalıcı yönlenir.
 *
 * Sunucu önce: zaman çizelgesi (pencere + canlı özet) burada okunur; düşerse istemci
 * görünür hata + "Tekrar dene" gösterir (boş takvim taklidi yok).
 */
export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Kampanya Takvimi',
  description: 'Sezon kampanyaları ve görünüm konseptleri tek zaman çizelgesinde: çakışma, bütçe ve gerçek etki.',
};

type PageProps = { searchParams: Promise<Record<string, string | string[] | undefined>> };

const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

export default async function CampaignsCalendarPage({ searchParams }: PageProps) {
  const sp = await searchParams;
  const rawFrom = first(sp.from);
  const from = rawFrom && !Number.isNaN(new Date(rawFrom).getTime()) ? new Date(rawFrom).toISOString() : null;
  const rawDays = Number(first(sp.days));
  const days = [30, 90, 180].includes(rawDays) ? rawDays : 90;

  const auth = await requireAuth(['ADMIN']);
  let initial: CalendarData | null = null;
  let initialError: string | null = null;
  if (!('error' in auth)) {
    try {
      initial = await loadCalendar({ from: from ?? undefined, days });
    } catch (err) {
      console.error('[admin/campaigns-calendar] ön yükleme başarısız:', err);
      initialError = 'Takvim sunucuda okunamadı. Kayıtlar değişmedi; tekrar deneyin.';
    }
  }

  return (
    <Suspense
      fallback={
        <div className="mx-auto max-w-7xl space-y-6">
          <SkeletonStats />
        </div>
      }
    >
      <CalendarStudio initial={initial} initialFrom={from} initialDays={days} initialError={initialError} />
    </Suspense>
  );
}
