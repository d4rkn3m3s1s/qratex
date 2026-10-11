import type { Metadata } from 'next';
import Link from 'next/link';
import { headers } from 'next/headers';
import { notFound, redirect } from 'next/navigation';
import { getServerSession } from 'next-auth';
import { Compass, Lock, Store } from 'lucide-react';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { getModuleControls } from '@/lib/module-gate';
import { getServerLocale } from '@/lib/server-locale';
import { categoryLabel } from '@/lib/places/categories';
import { getVenueDetail, isPlausibleDealerId } from '@/lib/venue-detail/detail';
import { resolveShareBase } from '@/lib/venue-detail/share';
import { PanelPage, PageHeader } from '@/components/ds/page';
import { EmptyState } from '@/components/states';
import { Button } from '@/components/ui/button';
import { getVenueCopy } from '@/components/customer/m-mekan-detay/copy';
import { FavoriteButton } from '@/components/customer/m-mekan-detay/favorite-button';
import { StampCard } from '@/components/customer/m-mekan-detay/stamp-card';
import { HistoryList } from '@/components/customer/m-mekan-detay/history-list';
import { ImprovementPanel } from '@/components/customer/m-mekan-detay/improvement-panel';
import {
  AboutCard,
  LiveBoostChip,
  OffersSection,
  OpenStatusChip,
  QuickActions,
} from '@/components/customer/m-mekan-detay/venue-sections';

/**
 * Mekân detayı (yol haritası §4.3, F3.1-d) — `/customer/experiences` içeriği buraya taşındı.
 *
 * Sunucu bileşeni: kritik veri (mekân, açık/kapalı, teklifler, ziyaret kartı, geçmişin ilk
 * sayfası, isteklerim) tek turda `getVenueDetail` ile gelir; istemci adaları yalnız
 * etkileşimli parçalar (kaydet, damga animasyonu, geçmiş sayfalama + paylaşım, iyileştirme formu).
 */
export const dynamic = 'force-dynamic';

type PageProps = { params: Promise<{ dealerId: string }> };

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { dealerId } = await params;
  const copy = getVenueCopy(await getServerLocale());
  let name: string | null = null;
  if (isPlausibleDealerId(dealerId)) {
    try {
      const d = await prisma.user.findFirst({
        where: { id: dealerId, role: 'DEALER', anonymizedAt: null },
        select: { businessName: true, name: true },
      });
      name = d?.businessName?.trim() || d?.name?.trim() || null;
    } catch {
      name = null; // başlık için DB zorunlu değil
    }
  }
  return { title: name ?? copy.notFoundTitle, robots: { index: false, follow: false } };
}

async function requestOrigin(): Promise<string | null> {
  try {
    const h = await headers();
    const host = h.get('x-forwarded-host') ?? h.get('host');
    if (!host) return null;
    const proto = h.get('x-forwarded-proto') ?? (host.startsWith('localhost') ? 'http' : 'https');
    return `${proto}://${host}`;
  } catch {
    return null;
  }
}

export default async function VenueDetailPage({ params }: PageProps) {
  const { dealerId } = await params;
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    redirect(`/auth/login?callbackUrl=${encodeURIComponent(`/customer/places/${dealerId}`)}`);
  }
  const locale = await getServerLocale();
  const copy = getVenueCopy(locale);

  const backToPlaces = (
    <Button asChild variant="outline" className="gap-2">
      <Link href="/customer/places">
        <Compass aria-hidden className="h-4 w-4" />
        {copy.goToPlaces}
      </Link>
    </Button>
  );

  if (session.user.role !== 'CUSTOMER') {
    return (
      <EmptyState variant="permission" icon={Lock} title={copy.forbiddenTitle} description={copy.forbiddenBody} headingLevel="h2" />
    );
  }

  const modules = await getModuleControls();
  if (modules.discovery === false) {
    return (
      <EmptyState
        variant="permission"
        icon={Lock}
        title={copy.moduleOffTitle}
        description={copy.moduleOffBody}
        headingLevel="h2"
        action={backToPlaces}
      />
    );
  }

  if (!isPlausibleDealerId(dealerId)) notFound();
  const now = new Date();
  const detail = await getVenueDetail({
    userId: session.user.id,
    dealerId,
    baseUrl: resolveShareBase(await requestOrigin()),
    now,
  });
  if (!detail) notFound();

  const { dealer } = detail;
  const subtitle = [dealer.category ? categoryLabel(dealer.category, locale) : null, dealer.address]
    .filter(Boolean)
    .join(' · ');

  return (
    <PanelPage
      register="ops"
      header={
        <PageHeader
          back={{ href: '/customer/places', label: copy.backToPlaces }}
          title={dealer.name}
          description={subtitle || undefined}
          icon={
            dealer.logo ? (
              // eslint-disable-next-line @next/next/no-img-element -- bayi logosu harici URL olabilir
              <img src={dealer.logo} alt="" className="h-full w-full rounded-control object-cover" loading="eager" />
            ) : (
              <Store />
            )
          }
          meta={
            <div className="flex flex-wrap items-center gap-2">
              <OpenStatusChip state={detail.hours.state} copy={copy} />
              <LiveBoostChip happyHours={detail.happyHours} copy={copy} />
            </div>
          }
          actions={<FavoriteButton dealerId={dealer.id} dealerName={dealer.name} initial={detail.isFavorite} locale={locale} />}
        />
      }
      aside={<AboutCard detail={detail} copy={copy} now={now} />}
      asideLabel={copy.aboutTitle}
      asideOnMobile="after"
    >
      <QuickActions detail={detail} copy={copy} />
      <OffersSection detail={detail} copy={copy} />
      <StampCard dealerId={dealer.id} visits={detail.visits} locale={locale} />
      <HistoryList
        dealerId={dealer.id}
        dealerName={dealer.name}
        initial={detail.history}
        stamp={detail.generatedAt}
        initialLinks={detail.share.links}
        shareEnabled={detail.share.enabled}
        locale={locale}
      />
      <ImprovementPanel
        dealerId={dealer.id}
        improvement={detail.improvement}
        responseTime={detail.responseTime}
        locale={locale}
      />
    </PanelPage>
  );
}
