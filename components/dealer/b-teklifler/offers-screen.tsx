'use client';

import { useCallback, useState } from 'react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowRight, BadgePercent, Clock, Info, Plus, RefreshCw, Sparkles, UserRound, Zap } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { PanelPage, PageHeader, PageGrid } from '@/components/ds/page';
import { MetricGrid, MetricTile } from '@/components/ds/data';
import { QueryState } from '@/components/states';
import { cn } from '@/lib/utils';
import { DEALER_OFFERS_QUERY_KEY, type DealerOffersOverview } from '@/lib/dealer/offers/types';
import { fetchOffersOverview, stopFlash } from './api';
import { OffersCopyProvider, useOffersCopy, useOffersLocale } from './context';
import type { OffersLocale } from './copy';
import { FlashOffersSection } from './flash-section';
import { HappyHoursSection } from './happy-hour-section';
import { PersonalOffersSection } from './personal-section';
import { RemedyTemplatesSection } from './templates-section';
import { formatTime } from './format';
import { useNow } from './use-now';

// Form çekmeceleri (RHF + zod + alanlar) yalnız açılınca yüklenir.
const FlashSheet = dynamic(() => import('./flash-sheet').then((m) => m.FlashSheet), { ssr: false });
const HappyHourSheet = dynamic(() => import('./happy-hour-sheet').then((m) => m.HappyHourSheet), { ssr: false });
const PersonalSheet = dynamic(() => import('./personal-sheet').then((m) => m.PersonalSheet), { ssr: false });

type SheetKind = 'flash' | 'happy' | 'personal' | null;

function MovedNotice() {
  const copy = useOffersCopy();
  const router = useRouter();
  const pathname = usePathname();
  const links = [
    { label: copy.moved.segments, where: copy.moved.segmentsWhere, href: '/dealer/campaigns' },
    { label: copy.moved.table, where: copy.moved.tableWhere, href: '/dealer/inbox/incidents' },
    { label: copy.moved.weekly, where: copy.moved.weeklyWhere, href: '/dealer' },
  ];
  return (
    <section role="status" aria-labelledby="offers-moved-title" className="rounded-lg border border-info-border bg-info-subtle p-4 text-fg">
      <div className="flex items-start gap-3">
        <Info className="mt-0.5 h-5 w-5 shrink-0 text-info" aria-hidden />
        <div className="min-w-0 flex-1 space-y-2">
          <h2 id="offers-moved-title" className="qx-body font-semibold">
            {copy.moved.title}
          </h2>
          <p className="qx-small text-fg-muted">{copy.moved.body}</p>
          <ul className="grid gap-1 sm:grid-cols-3">
            {links.map((l) => (
              <li key={l.href}>
                <Link
                  href={l.href}
                  className="qx-small flex min-h-11 items-center gap-2 rounded-md border border-info-border bg-surface-1 px-3 py-2 transition-colors duration-fast hover:bg-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block font-medium text-fg">{l.label}</span>
                    <span className="qx-caption block text-fg-muted">{l.where}</span>
                  </span>
                  <ArrowRight className="h-4 w-4 shrink-0 text-fg-muted" aria-hidden />
                </Link>
              </li>
            ))}
          </ul>
        </div>
        <Button type="button" variant="ghost" size="sm" className="min-h-11 shrink-0" onClick={() => router.replace(pathname, { scroll: false })}>
          {copy.moved.dismiss}
        </Button>
      </div>
    </section>
  );
}

type SheetState = {
  sheet: SheetKind;
  setSheet: (k: SheetKind) => void;
  mounted: Record<Exclude<SheetKind, null>, boolean>;
  openSheet: (k: Exclude<SheetKind, null>) => void;
};

function useSheets(): SheetState {
  const [sheet, setSheet] = useState<SheetKind>(null);
  const [mounted, setMounted] = useState<Record<Exclude<SheetKind, null>, boolean>>({ flash: false, happy: false, personal: false });
  const openSheet = useCallback((k: Exclude<SheetKind, null>) => {
    setMounted((m) => (m[k] ? m : { ...m, [k]: true }));
    setSheet(k);
  }, []);
  return { sheet, setSheet, mounted, openSheet };
}

function OffersBody({
  data,
  refetch,
  isFetching,
  sheets,
}: {
  data: DealerOffersOverview;
  refetch: () => unknown;
  isFetching: boolean;
  sheets: SheetState;
}) {
  const copy = useOffersCopy();
  const queryClient = useQueryClient();
  const now = useNow(new Date(data.generatedAt).getTime());
  const { sheet, setSheet, mounted, openSheet } = sheets;
  const invalidate = useCallback(() => queryClient.invalidateQueries({ queryKey: DEALER_OFFERS_QUERY_KEY }), [queryClient]);

  const onStop = useCallback(
    async (id: string) => {
      await stopFlash(id); // hata fırlatırsa onay diyaloğu açık kalır ve mesajı gösterir
      toast.success(copy.flash.stopped);
      await invalidate();
    },
    [copy.flash.stopped, invalidate],
  );

  const flash = data.flash.status === 'ready' ? data.flash.data : null;
  const happy = data.happyHours.status === 'ready' ? data.happyHours.data : null;
  const personal = data.personal.status === 'ready' ? data.personal.data : null;
  const liveCount = flash ? flash.items.filter((o) => o.status === 'live').length : null;
  const scheduledCount = flash ? flash.items.filter((o) => o.status === 'scheduled').length : null;
  const happyLive = happy ? happy.items.filter((h) => h.isActive && h.liveNow).length : null;
  const personalOpen = personal ? personal.awaitingApproval + personal.openWithCustomer : null;

  return (
    <div className="space-y-4">
      <MetricGrid cols={4}>
        <MetricTile label={copy.kpi.live} metric={{ value: liveCount }} icon={<Zap />} tone="success" hint={flash ? copy.kpi.hintOpen(flash.openCount, flash.maxOpen) : undefined} size="compact" />
        <MetricTile label={copy.kpi.scheduled} metric={{ value: scheduledCount }} icon={<Clock />} tone="info" size="compact" />
        <MetricTile label={copy.kpi.happyLive} metric={{ value: happyLive }} icon={<Sparkles />} tone="brand" hint={happy ? copy.kpi.hintHappy(happy.items.length) : undefined} size="compact" />
        <MetricTile
          label={copy.kpi.personalOpen}
          metric={{ value: personalOpen }}
          icon={<UserRound />}
          tone={personal && personal.awaitingApproval > 0 ? 'warning' : 'neutral'}
          hint={personal ? copy.kpi.hintPersonal(personal.awaitingApproval) : undefined}
          size="compact"
        />
      </MetricGrid>

      <FlashOffersSection state={data.flash} now={now} onCreate={() => openSheet('flash')} onStop={onStop} onRetry={refetch} />

      <PageGrid cols={2}>
        <HappyHoursSection state={data.happyHours} onCreate={() => openSheet('happy')} onChanged={invalidate} onRetry={refetch} />
        <PersonalOffersSection state={data.personal} now={now} onCreate={() => openSheet('personal')} onRetry={refetch} />
      </PageGrid>

      <RemedyTemplatesSection state={data.remedyTemplates} onRetry={refetch} />

      {mounted.flash && flash && (
        <FlashSheet open={sheet === 'flash'} onOpenChange={(o) => setSheet(o ? 'flash' : null)} hasLocation={flash.hasLocation} onCreated={invalidate} />
      )}
      {mounted.happy && (
        <HappyHourSheet open={sheet === 'happy'} onOpenChange={(o) => setSheet(o ? 'happy' : null)} onCreated={invalidate} />
      )}
      {mounted.personal && personal && (
        <PersonalSheet
          open={sheet === 'personal'}
          onOpenChange={(o) => setSheet(o ? 'personal' : null)}
          availableTypes={personal.availableTypes}
          onSent={invalidate}
        />
      )}
      <span className="sr-only" aria-live="polite">
        {isFetching ? copy.refresh : ''}
      </span>
    </div>
  );
}

function Screen({ fromInnovation }: { fromInnovation: boolean }) {
  const copy = useOffersCopy();
  const locale = useOffersLocale();
  const query = useQuery({
    queryKey: DEALER_OFFERS_QUERY_KEY,
    queryFn: ({ signal }) => fetchOffersOverview(signal),
    staleTime: 30_000,
    refetchOnWindowFocus: true,
  });
  const refetch = useCallback(() => query.refetch(), [query]);
  const sheets = useSheets();
  const flashReady = query.data?.flash.status === 'ready' ? query.data.flash.data : null;
  const canCreateFlash = !!flashReady && flashReady.hasBusinessName && flashReady.openCount < flashReady.maxOpen;

  return (
    <PanelPage
      register="ops"
      header={
        <PageHeader
          title={copy.title}
          description={copy.description}
          icon={<BadgePercent />}
          meta={
            query.data ? (
              <span className="qx-caption text-fg-muted tabular-nums">{copy.updatedAt(formatTime(query.data.generatedAt, locale))}</span>
            ) : undefined
          }
          actions={
            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="outline" size="sm" onClick={() => void query.refetch()} disabled={query.isFetching} className="min-h-11 gap-1.5">
                <RefreshCw className={cn('h-4 w-4', query.isFetching && 'motion-safe:animate-spin')} aria-hidden />
                {copy.refresh}
              </Button>
              {flashReady && (
                <Button type="button" size="sm" className="min-h-11 gap-1.5" disabled={!canCreateFlash} onClick={() => sheets.openSheet('flash')}>
                  <Plus className="h-4 w-4" aria-hidden />
                  {copy.newFlash}
                </Button>
              )}
            </div>
          }
        />
      }
    >
      {fromInnovation && <MovedNotice />}
      <QueryState query={query} skeleton="cards" isEmpty={() => false}>
        {(data) => <OffersBody data={data} refetch={refetch} isFetching={query.isFetching} sheets={sheets} />}
      </QueryState>
    </PanelPage>
  );
}

export function OffersScreen({ locale, fromInnovation }: { locale: OffersLocale; fromInnovation: boolean }) {
  return (
    <OffersCopyProvider locale={locale}>
      <Screen fromInnovation={fromInnovation} />
    </OffersCopyProvider>
  );
}
