'use client';

/**
 * /dealer/team — ekip operasyon merkezi. Sunucu ilk veriyi verir (RSC); React Query yalnız
 * `/api/dealer/staff/hub` BFF'ini çağırır (60 sn'de bir, sekme görünürken). Sekme ve hafta URL'de
 * tutulur ama sunucu turu yapılmadan (`history.replaceState`) — derin bağlantı verilebilir.
 * Ağır sekmeler (vardiya ızgarası, eğitim/kontrol, saha, onaylar) yalnız açıldığında yüklenir.
 */
import dynamic from 'next/dynamic';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { AlarmClock, CalendarDays, ClipboardCheck, GraduationCap, MapPin, Star, UserPlus, Users, Inbox } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { MetricGrid, MetricTile, PageHeader, PanelPage, SectionTabs } from '@/components/ds';
import { ErrorState, QueryState, SkeletonList } from '@/components/states';
import { TEAM_HUB_QUERY_KEY, type TeamHub } from '@/lib/staff-ops/types';
import { fmtRelative, teamFetch } from './shared';
import { useTeamCopy } from './copy';
import { MembersPanel } from './members-panel';
import { InviteDialog } from './invite-dialog';

const Loading = () => <SkeletonList rows={4} />;
const SchedulePanel = dynamic(() => import('./schedule-panel').then((m) => m.SchedulePanel), { loading: Loading });
const TasksPanel = dynamic(() => import('./tasks-panel').then((m) => m.TasksPanel), { loading: Loading });
const ApprovalsPanel = dynamic(() => import('./approvals-panel').then((m) => m.ApprovalsPanel), { loading: Loading });
const FieldPanel = dynamic(() => import('./field-panel').then((m) => m.FieldPanel), { loading: Loading });
const TrainingPanel = dynamic(() => import('./training-panel').then((m) => m.TrainingPanel), { loading: Loading });

const TABS = ['ekip', 'vardiya', 'gorevler', 'onaylar', 'saha', 'egitim'] as const;
type TabKey = (typeof TABS)[number];

/** URL'yi sunucu turu OLMADAN günceller (Next App Router `history.replaceState` ile senkron). */
function patchUrl(patch: Record<string, string | null>) {
  const url = new URL(window.location.href);
  for (const [k, v] of Object.entries(patch)) {
    if (v == null) url.searchParams.delete(k);
    else url.searchParams.set(k, v);
  }
  window.history.replaceState(window.history.state, '', `${url.pathname}${url.search}${url.hash}`);
}

function readParam(key: string): string | null {
  if (typeof window === 'undefined') return null;
  return new URL(window.location.href).searchParams.get(key);
}

export function TeamHubScreen({ initial }: { initial: TeamHub | null }) {
  const { copy, locale } = useTeamCopy();
  const [tab, setTab] = useState<TabKey>('ekip');
  const [week, setWeek] = useState<string | null>(initial?.weekStart ?? null);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [focusUser, setFocusUser] = useState<string | null>(null);

  // İlk boyamadan sonra URL'deki sekmeyi uygula (SSR ile hidrasyon uyumsuzluğu olmasın).
  useEffect(() => {
    const t = readParam('tab');
    if (t && (TABS as readonly string[]).includes(t)) setTab(t as TabKey);
  }, []);

  const changeTab = useCallback((v: string) => {
    const next = (TABS as readonly string[]).includes(v) ? (v as TabKey) : 'ekip';
    setTab(next);
    patchUrl({ tab: next === 'ekip' ? null : next });
  }, []);

  const changeWeek = useCallback(
    (w: string) => {
      setWeek(w);
      patchUrl({ week: w === initial?.todayYmd ? null : w });
    },
    [initial?.todayYmd]
  );

  const query = useQuery({
    queryKey: [TEAM_HUB_QUERY_KEY, week],
    queryFn: () => teamFetch<TeamHub>(`/api/dealer/staff/hub${week ? `?week=${week}` : ''}`),
    initialData: initial && (week ?? initial.weekStart) === initial.weekStart ? initial : undefined,
    placeholderData: keepPreviousData,
    staleTime: 20_000,
    refetchInterval: 60_000,
    refetchOnWindowFocus: true,
  });

  const data = query.data;
  const k = data?.kpis;
  const activeMembers = useMemo(() => data?.members.filter((m) => m.isActive) ?? [], [data?.members]);

  const openPerson = useCallback(
    (userId: string, target: TabKey) => {
      setFocusUser(userId);
      changeTab(target);
    },
    [changeTab]
  );

  const header = (
    <PageHeader
      eyebrow={copy.hub.eyebrow}
      title={copy.hub.title}
      description={copy.hub.description}
      icon={<Users className="h-5 w-5" aria-hidden />}
      meta={data ? <span className="qx-caption text-fg-muted">{copy.hub.refreshed(fmtRelative(data.generatedAt, locale))}</span> : null}
      actions={
        <Button onClick={() => setInviteOpen(true)} className="min-h-11">
          <UserPlus className="mr-2 h-4 w-4" aria-hidden />
          {copy.hub.invite}
        </Button>
      }
    />
  );

  if (!data && !query.isFetching && (query.isError || !initial)) {
    return (
      <PanelPage header={header} register="ops">
        <ErrorState variant="page" title={copy.common.loadError} description={copy.common.loadErrorDesc} onRetry={() => query.refetch()} />
        <InviteDialog open={inviteOpen} onOpenChange={setInviteOpen} />
      </PanelPage>
    );
  }

  return (
    <PanelPage header={header} register="ops">
      <QueryState query={query} skeleton="cards" onRetry={() => query.refetch()} error={{ title: copy.common.loadError }}>
        {(hub) => (
          <div className="space-y-6">
            <MetricGrid cols={3}>
              <MetricTile
                label={copy.hub.kpi.onShift}
                metric={{ value: hub.kpis.onShiftNow }}
                icon={<AlarmClock aria-hidden />}
                tone="success"
                hint={copy.hub.kpi.onShiftHint(hub.kpis.scheduledToday)}
                animate
                size="compact"
              />
              <MetricTile
                label={copy.hub.kpi.late}
                metric={{ value: hub.kpis.lateOrMissedToday }}
                icon={<CalendarDays aria-hidden />}
                tone={hub.kpis.lateOrMissedToday ? 'warning' : 'neutral'}
                hint={copy.hub.kpi.lateHint}
                animate
                size="compact"
              />
              <MetricTile
                label={copy.hub.kpi.leave}
                metric={{ value: hub.kpis.pendingLeave }}
                icon={<Inbox aria-hidden />}
                tone={hub.kpis.pendingLeave ? 'warning' : 'neutral'}
                animate
                size="compact"
              />
              <MetricTile
                label={copy.hub.kpi.overdue}
                metric={{ value: hub.kpis.overdueTasks }}
                icon={<ClipboardCheck aria-hidden />}
                tone={hub.kpis.overdueTasks ? 'danger' : 'neutral'}
                hint={copy.hub.kpi.overdueHint(hub.kpis.openTasks)}
                animate
                size="compact"
              />
              <MetricTile
                label={copy.hub.kpi.field}
                metric={{ value: hub.kpis.openFieldReports }}
                icon={<MapPin aria-hidden />}
                tone={hub.kpis.urgentFieldReports ? 'danger' : 'info'}
                hint={copy.hub.kpi.fieldHint(hub.kpis.urgentFieldReports)}
                animate
                size="compact"
              />
              <MetricTile
                label={copy.hub.kpi.rating}
                metric={{ value: hub.kpis.feedback30.avg, fractionDigits: 1, unit: '★', n: hub.kpis.feedback30.n, minN: 5 }}
                icon={<Star aria-hidden />}
                tone="brand"
                hint={copy.hub.kpi.ratingHint(hub.kpis.feedback30.n)}
                size="compact"
              />
            </MetricGrid>

            <SectionTabs
              value={tab}
              onValueChange={changeTab}
              ariaLabel={copy.hub.title}
              tabs={[
                { value: 'ekip', label: copy.hub.tabs.team, icon: <Users />, count: activeMembers.length },
                { value: 'vardiya', label: copy.hub.tabs.schedule, icon: <CalendarDays /> },
                { value: 'gorevler', label: copy.hub.tabs.tasks, icon: <ClipboardCheck />, count: hub.kpis.openTasks },
                { value: 'onaylar', label: copy.hub.tabs.approvals, icon: <Inbox />, count: hub.kpis.pendingLeave },
                { value: 'saha', label: copy.hub.tabs.field, icon: <MapPin />, count: hub.kpis.openFieldReports },
                { value: 'egitim', label: copy.hub.tabs.training, icon: <GraduationCap /> },
              ]}
            >
              {(active) => {
                switch (active) {
                  case 'vardiya':
                    return <SchedulePanel hub={hub} onWeekChange={changeWeek} loading={query.isFetching && query.isPlaceholderData} />;
                  case 'gorevler':
                    return <TasksPanel hub={hub} focusUserId={focusUser} />;
                  case 'onaylar':
                    return <ApprovalsPanel hub={hub} />;
                  case 'saha':
                    return <FieldPanel hub={hub} />;
                  case 'egitim':
                    return <TrainingPanel hub={hub} />;
                  default:
                    return <MembersPanel hub={hub} onInvite={() => setInviteOpen(true)} onOpenPerson={openPerson} />;
                }
              }}
            </SectionTabs>
          </div>
        )}
      </QueryState>
      <InviteDialog open={inviteOpen} onOpenChange={setInviteOpen} />
    </PanelPage>
  );
}
