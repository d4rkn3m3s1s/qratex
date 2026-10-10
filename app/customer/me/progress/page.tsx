import type { Metadata } from 'next';
import Link from 'next/link';
import { PanelPage, PageHeader } from '@/components/ds/page';
import { EmptyState, ErrorState } from '@/components/states';
import { getModuleControls } from '@/lib/module-gate';
import { routeHref } from '@/lib/navigation/registry';
import { getServerLocale } from '@/lib/server-locale';
import { formatDate, getMeCopy, toMeLocale } from '@/components/customer/m-ben-ilerleme/copy';
import { parseProgressPeriod } from '@/components/customer/m-ben-ilerleme/period';
import { requireCustomerPage } from '@/components/customer/m-ben-ilerleme/server/page-auth';
import { getProgressSummary } from '@/components/customer/m-ben-ilerleme/server/summary';
import { getProgressTrends } from '@/components/customer/m-ben-ilerleme/server/trends';
import { getJourneyPage } from '@/components/customer/m-ben-ilerleme/server/journey';
import { ProgressHero } from '@/components/customer/m-ben-ilerleme/ui/progress-hero';
import { TodayStrip } from '@/components/customer/m-ben-ilerleme/ui/today-strip';
import { ContributionCard } from '@/components/customer/m-ben-ilerleme/ui/contribution-card';
import { LevelPath } from '@/components/customer/m-ben-ilerleme/ui/level-path';
import { BadgesStrip } from '@/components/customer/m-ben-ilerleme/ui/badges-strip';
import { TrendsSection } from '@/components/customer/m-ben-ilerleme/ui/trends-section';
import { JourneyFeed } from '@/components/customer/m-ben-ilerleme/ui/journey-feed';
import { SectionUnavailable } from '@/components/customer/m-ben-ilerleme/ui/section-unavailable';
import { SOFT_BUTTON } from '@/components/customer/m-ben-ilerleme/ui/styles';

export const dynamic = 'force-dynamic';

type PageProps = { searchParams: Promise<Record<string, string | string[] | undefined>> };

export async function generateMetadata(): Promise<Metadata> {
  const c = getMeCopy(toMeLocale(await getServerLocale())).progress;
  return { title: c.title, description: c.description, robots: { index: false } };
}

async function moduleState(): Promise<{ progress: boolean; journey: boolean }> {
  try {
    const controls = await getModuleControls();
    return { progress: controls.progress_hub !== false, journey: controls.journey_score !== false };
  } catch (error) {
    // Ayar okunamazsa varsayılan açık (asıl kapı API'lerde de uygulanır).
    console.error('[me-progress] modül ayarları okunamadı', error);
    return { progress: true, journey: true };
  }
}

/**
 * Ben → İlerleme (eski Gelişim merkezi + Yolculuk skoru + Trendler + Kişisel analitik).
 * Sunucu önce: özet, ilk dönem trendleri ve yolculuğun ilk sayfası burada paralel okunur;
 * istemci adaları yalnız dönem seçici/grafik ve akışın süzgeç/sayfalamasıdır.
 */
export default async function ProgressPage({ searchParams }: PageProps) {
  const locale = toMeLocale(await getServerLocale());
  const c = getMeCopy(locale).progress;
  const sp = await searchParams;
  const period = parseProgressPeriod(sp.period);
  const meHref = routeHref('customer.me');

  const header = (
    <PageHeader
      eyebrow={c.eyebrow}
      title={c.title}
      description={c.description}
      back={{ href: meHref, label: c.back }}
    />
  );

  const auth = await requireCustomerPage(`/customer/me/progress${period !== 30 ? `?period=${period}` : ''}`);
  if (auth.kind === 'forbidden') {
    return (
      <PanelPage register="play" header={header}>
        <EmptyState variant="permission" title={c.forbiddenTitle} description={c.forbiddenBody} />
      </PanelPage>
    );
  }

  const modules = await moduleState();
  if (auth.kind === 'unavailable' || !modules.progress) {
    return (
      <PanelPage register="play" header={header}>
        {modules.progress ? (
          <ErrorState
            variant="section"
            action={
              <Link href="/customer/me/progress" className={SOFT_BUTTON}>
                {c.retry}
              </Link>
            }
          />
        ) : (
          <EmptyState variant="permission" title={c.moduleOffTitle} description={c.moduleOffBody} />
        )}
      </PanelPage>
    );
  }

  const userId = auth.userId;
  const [summary, trends, journey] = await Promise.all([
    getProgressSummary(userId, { contributionEnabled: modules.journey }).catch((error) => {
      console.error('[me-progress] özet okunamadı', error);
      return null;
    }),
    getProgressTrends(userId, period).catch((error) => {
      console.error('[me-progress] trendler okunamadı', error);
      return null;
    }),
    modules.journey
      ? getJourneyPage(userId, { filter: 'all' }).catch((error) => {
          console.error('[me-progress] yolculuk okunamadı', error);
          return null;
        })
      : Promise.resolve(null),
  ]);

  if (!summary) {
    return (
      <PanelPage register="play" header={header}>
        <ErrorState
          variant="section"
          action={
            <Link href="/customer/me/progress" className={SOFT_BUTTON}>
              {c.retry}
            </Link>
          }
        />
      </PanelPage>
    );
  }

  return (
    <PanelPage
      register="play"
      header={header}
      aria-label={c.title}
    >
      <ProgressHero summary={summary} locale={locale} />
      <TodayStrip summary={summary} locale={locale} />

      <div className="grid items-start gap-section lg:grid-cols-2">
        {summary.contribution ? (
          <ContributionCard contribution={summary.contribution} pendingReviews={summary.pendingReviews} locale={locale} />
        ) : modules.journey ? (
          <SectionUnavailable locale={locale} />
        ) : null}
        <div className="grid min-w-0 gap-section">
          <LevelPath summary={summary} locale={locale} />
          <BadgesStrip summary={summary} locale={locale} />
        </div>
      </div>

      {trends ? <TrendsSection initial={trends} /> : <SectionUnavailable locale={locale} />}

      {modules.journey && <JourneyFeed initial={journey} memberSince={summary.memberSince} />}

      <p className="qx-caption text-center text-fg-subtle">
        {c.asOf(formatDate(summary.asOf, locale, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }))}
      </p>
    </PanelPage>
  );
}
