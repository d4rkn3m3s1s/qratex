'use client';

/**
 * /staff — personelin tek ekranı "Bugün". Sunucu ilk veriyi verir; React Query 60 sn'de bir ve
 * sekmeye dönünce `/api/staff/today`'i yeniler (kasada açık bırakılan tablette yeni görev görünür).
 * Sıra: vardiya → yapılacaklar (kontrol listesi, görevler, atananlar) → geri bildirimim →
 * takvim / izin / eğitim / bildirimlerim. Saha bildirimi her zaman üstte tek dokunuşla.
 */
import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Megaphone } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ErrorState, QueryState } from '@/components/states';
import { STAFF_TODAY_QUERY_KEY, type StaffToday } from '@/lib/staff-ops/types';
import { fmtDay, teamFetch } from '@/components/dealer/b-ekip/shared';
import { useStaffCopy } from './copy';
import { ShiftCard } from './shift-card';
import { FieldReportSheet, useFieldReportQueue } from './field-report-sheet';
import {
  AssignedSection,
  CalendarSection,
  ChecklistsSection,
  FeedbackSection,
  LeaveSection,
  ReportsSection,
  TasksSection,
  TrainingSection,
} from './sections';

export function StaffTodayScreen({ initial, openReport = false }: { initial: StaffToday | null; openReport?: boolean }) {
  const { s, locale } = useStaffCopy();
  const [sheetOpen, setSheetOpen] = useState(false);
  const queue = useFieldReportQueue();

  useEffect(() => {
    if (!openReport) return;
    setSheetOpen(true);
    const url = new URL(window.location.href);
    url.searchParams.delete('bildir');
    window.history.replaceState(window.history.state, '', `${url.pathname}${url.search}${url.hash}`);
  }, [openReport]);

  const query = useQuery({
    queryKey: [STAFF_TODAY_QUERY_KEY],
    queryFn: () => teamFetch<StaffToday>('/api/staff/today'),
    initialData: initial ?? undefined,
    staleTime: 15_000,
    refetchInterval: 60_000,
    refetchOnWindowFocus: true,
  });

  if (!query.data && !query.isFetching && (query.isError || !initial)) {
    return <ErrorState variant="page" title={s.loadError} description={s.loadErrorDesc} onRetry={() => query.refetch()} />;
  }

  return (
    <QueryState query={query} skeleton="detail" onRetry={() => query.refetch()} error={{ title: s.loadError }}>
      {(data) => (
        <div className="mx-auto w-full max-w-5xl space-y-5">
          <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div className="min-w-0">
              <p className="qx-caption font-semibold uppercase tracking-wide text-fg-muted">
                {s.today} · {fmtDay(data.todayYmd, locale, { weekday: 'long', day: 'numeric', month: 'long' })}
              </p>
              <h1 className="qx-h2 truncate text-fg">{s.hello(data.profile.name)}</h1>
              <p className="qx-small text-fg-muted">{[data.profile.jobTitle, data.profile.businessName].filter(Boolean).join(' · ')}</p>
            </div>
            <Button onClick={() => setSheetOpen(true)} variant="outline" className="min-h-12 justify-start sm:justify-center" aria-describedby="saha-ipucu">
              <Megaphone className="mr-2 h-5 w-5" aria-hidden />
              {s.report}
              {queue.pending > 0 && <span className="qx-caption qx-num ml-2 rounded-chip bg-warning-subtle px-1.5 text-fg">{queue.pending}</span>}
            </Button>
            <span id="saha-ipucu" className="sr-only">
              {s.reportHint}
            </span>
          </header>

          <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_22rem]">
            <div className="min-w-0 space-y-5">
              <ShiftCard data={data} />
              <ChecklistsSection data={data} />
              <TasksSection data={data} />
              <AssignedSection data={data} />
            </div>
            <div className="min-w-0 space-y-5">
              <FeedbackSection data={data} />
              <CalendarSection data={data} />
              <ReportsSection data={data} queued={queue.pending} />
            </div>
          </div>
          <div className="grid gap-5 lg:grid-cols-2">
            <LeaveSection data={data} />
            <TrainingSection data={data} />
          </div>

          <FieldReportSheet open={sheetOpen} onOpenChange={setSheetOpen} onQueued={queue.refresh} />
        </div>
      )}
    </QueryState>
  );
}
