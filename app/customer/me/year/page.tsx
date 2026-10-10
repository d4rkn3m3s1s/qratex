import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { requireAuth } from '@/lib/api-auth';
import { isPrismaConnectivityError } from '@/lib/prisma';
import { getServerLocale } from '@/lib/server-locale';
import { resolvePeriod } from '@/lib/customer-year/period';
import { getMemberSince, getYearSummary, YearUserNotFoundError } from '@/lib/customer-year/summary.server';
import type { YearSummary } from '@/lib/customer-year/contract';
import { getYearCopy } from '@/components/customer/m-yilim/copy';
import { YearExperience } from '@/components/customer/m-yilim/year-experience';
import { YearLoadError } from '@/components/customer/m-yilim/year-load-error';

/**
 * /customer/me/year — "Yılım" (Ben → Yılım). Sunucu bileşeni: yetki DB'den (`requireAuth`),
 * dönem URL'den (`?year=2026&month=3`, Europe/Istanbul), özet sunucuda hesaplanır ve küçük
 * istemci adasına prop olarak geçer (istemcide ilk veri isteği yok). Tam ekran hikâye adası
 * yalnız açılınca yüklenir.
 *
 * Eski rota `/customer/my-year` buraya kalıcı yönlendirilir.
 */
export const dynamic = 'force-dynamic';

type PageProps = { searchParams: Promise<Record<string, string | string[] | undefined>> };

export async function generateMetadata(): Promise<Metadata> {
  const copy = getYearCopy(await getServerLocale());
  return { title: copy.pageTitle, description: copy.pageDescription, robots: { index: false } };
}

const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

export default async function CustomerYearPage({ searchParams }: PageProps) {
  const [locale, sp] = await Promise.all([getServerLocale(), searchParams]);
  const yearLocale = locale === 'en' ? 'en' : 'tr';

  const auth = await requireAuth(['CUSTOMER']);
  if ('error' in auth) {
    const status = auth.error.status;
    if (status === 401) {
      const q = new URLSearchParams();
      for (const [k, v] of Object.entries(sp)) {
        const val = first(v);
        if (val) q.set(k, val);
      }
      const back = `/customer/me/year${q.size ? `?${q.toString()}` : ''}`;
      redirect(`/auth/login?callbackUrl=${encodeURIComponent(back)}`);
    }
    return <YearLoadError locale={yearLocale} kind={status === 403 ? 'forbidden' : 'generic'} />;
  }

  const userId = auth.session.user.id;
  const now = new Date();
  let summary: YearSummary;
  try {
    const memberSince = await getMemberSince(userId);
    const { period, adjusted } = resolvePeriod({ year: first(sp.year), month: first(sp.month) }, now, memberSince);
    summary = await getYearSummary({ userId, period, adjusted, now });
  } catch (err) {
    if (err instanceof YearUserNotFoundError) return <YearLoadError locale={yearLocale} kind="notFound" />;
    if (!isPrismaConnectivityError(err)) console.error('[my-year] özet hesaplanamadı', err);
    return <YearLoadError locale={yearLocale} kind="generic" />;
  }

  return <YearExperience summary={summary} locale={yearLocale} />;
}
