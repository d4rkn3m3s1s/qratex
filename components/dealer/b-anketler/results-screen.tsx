'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { m as Motion } from 'framer-motion';
import { AlertTriangle, BarChart3, Clock, Download, Pencil, Share2, Smile, Star, UserRound } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { PanelPage, PageHeader, SectionTabs } from '@/components/ds/page';
import { ChartFrame, lazyChart, MetricGrid, MetricTile } from '@/components/ds/data';
import { ChoiceChips } from '@/components/ds/a11y';
import { EmptyState, QueryState, TONE_CALLOUT } from '@/components/states';
import { listItem } from '@/lib/motion';
import { cn } from '@/lib/utils';
import { dayDiff, istanbulDay } from '@/components/ds/page/date-range';
import { SURVEY_RANGES, type SurveyQuestionSummary, type SurveyRange, type SurveyResultsData } from '@/lib/dealer-surveys/types';
import { exportSurveyUrl, fetchSurveyResults, patchSurvey, surveyKeys } from './api';
import { errorText, formatDate, formatNumber, formatRelative, useSurveyCopy } from './copy';
import { QuestionResultCard } from './question-result';
import { ResponsesList } from './responses-list';
import { SurveyShareDialog } from './share-dialog';
import { SurveyStatusBadge } from './status-badge';
import { TextsSheet } from './texts-sheet';

const TrendChart = lazyChart(() => import('./trend-chart'));

type Tab = 'summary' | 'responses';

function replaceQuery(patch: Record<string, string | null>) {
  const url = new URL(window.location.href);
  for (const [k, v] of Object.entries(patch)) {
    if (v == null || v === '') url.searchParams.delete(k);
    else url.searchParams.set(k, v);
  }
  window.history.replaceState(window.history.state, '', `${url.pathname}${url.search}${url.hash}`);
}

/**
 * Anket detay merkezi (`/dealer/surveys/[id]/results`): başlık şeridinde yayın anahtarı,
 * paylaş (link + QR), düzenle ve sunucu CSV'si; dönem seçici; Özet (KPI + günlük eğilim +
 * soru kartları) ve Yanıtlar (tekil yanıtlar) sekmeleri. Dönem/sekme URL'de kalır (sunucu turu
 * yok); ilk veri sunucudan gelir.
 */
export function SurveyResultsScreen({
  surveyId,
  initial,
  initialRange,
  now,
}: {
  surveyId: string;
  initial: SurveyResultsData | null;
  initialRange: SurveyRange;
  now: number;
}) {
  const { copy, locale, tag } = useSurveyCopy();
  const qc = useQueryClient();
  const sp = useSearchParams();
  const [range, setRange] = useState<SurveyRange>(initialRange);
  const [tab, setTab] = useState<Tab>(() => (sp?.get('tab') === 'responses' ? 'responses' : 'summary'));
  const [shareOpen, setShareOpen] = useState(() => sp?.get('share') === '1');
  const [textsQ, setTextsQ] = useState<SurveyQuestionSummary | null>(null);

  useEffect(() => {
    if (sp?.get('share') === '1') replaceQuery({ share: null });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const query = useQuery({
    queryKey: surveyKeys.results(surveyId, range),
    queryFn: () => fetchSurveyResults(surveyId, range),
    initialData: range === initialRange && initial ? initial : undefined,
    placeholderData: keepPreviousData,
    staleTime: 30_000,
    refetchOnWindowFocus: true,
    retry: (count, err) => (err as { status?: number }).status !== 404 && count < 1,
  });

  const toggle = useMutation({
    mutationFn: (isActive: boolean) => patchSurvey(surveyId, { isActive }),
    onMutate: async (isActive) => {
      const key = surveyKeys.results(surveyId, range);
      await qc.cancelQueries({ queryKey: key });
      const prev = qc.getQueryData<SurveyResultsData>(key);
      if (prev) qc.setQueryData<SurveyResultsData>(key, { ...prev, survey: { ...prev.survey, isActive } });
      return { prev, key };
    },
    onError: (e, _v, ctx) => {
      if (ctx?.prev) qc.setQueryData(ctx.key, ctx.prev);
      toast.error(errorText(copy, locale, e));
    },
    onSuccess: (_d, isActive) => toast.success(isActive ? copy.toastPublished : copy.toastPaused),
    onSettled: () => qc.invalidateQueries({ queryKey: surveyKeys.all }),
  });

  function chooseRange(next: SurveyRange) {
    setRange(next);
    replaceQuery({ range: next === 'all' ? null : next });
  }
  function chooseTab(next: string) {
    const t = next === 'responses' ? 'responses' : 'summary';
    setTab(t);
    replaceQuery({ tab: t === 'summary' ? null : t });
  }

  const d = query.data;
  const s = d?.survey;

  const header = (
    <PageHeader
      eyebrow={copy.resultsEyebrow}
      title={s?.title ?? copy.results}
      description={s?.description ?? undefined}
      icon={<BarChart3 />}
      back={{ href: '/dealer/surveys', label: copy.backToList }}
      meta={
        s ? (
          <div className="qx-caption flex flex-wrap items-center gap-x-3 gap-y-1 text-fg-muted">
            <SurveyStatusBadge active={s.isActive} />
            <span>{copy.createdOn(formatDate(s.createdAt, tag))}</span>
            <span>{copy.publishedFor(Math.max(0, dayDiff(istanbulDay(new Date(s.createdAt)), istanbulDay(new Date(now)))))}</span>
            <span>{d?.totals.lastResponseAt ? copy.lastResponse(formatRelative(d.totals.lastResponseAt, tag, now)) : copy.noResponsesYet}</span>
          </div>
        ) : undefined
      }
      actions={
        s ? (
          <div className="flex w-full flex-wrap gap-2 sm:w-auto">
            <Button
              variant={s.isActive ? 'outline' : 'default'}
              className="min-h-11 flex-1 sm:flex-none"
              loading={toggle.isPending}
              onClick={() => toggle.mutate(!s.isActive)}
            >
              {s.isActive ? copy.pauseSurvey : copy.resumeSurvey}
            </Button>
            <Button variant="outline" className="min-h-11 flex-1 gap-2 sm:flex-none" onClick={() => setShareOpen(true)}>
              <Share2 aria-hidden className="size-4" /> {copy.share}
            </Button>
            <Button asChild variant="outline" className="min-h-11 flex-1 gap-2 sm:flex-none">
              <Link href={`/dealer/surveys/${surveyId}/edit`}>
                <Pencil aria-hidden className="size-4" /> {copy.edit}
              </Link>
            </Button>
            {d && d.totals.responsesAll > 0 && (
              <Button asChild variant="outline" className="min-h-11 flex-1 gap-2 sm:flex-none">
                <a href={exportSurveyUrl(surveyId, range, locale)} download title={copy.csvTruncatedNote}>
                  <Download aria-hidden className="size-4" /> {copy.exportCsv}
                </a>
              </Button>
            )}
          </div>
        ) : undefined
      }
    />
  );

  return (
    <PanelPage register="ops" header={header}>
      <QueryState
        query={query}
        skeleton="detail"
        error={{ title: copy.resultsLoadFailed, action: (
          <Button asChild variant="outline">
            <Link href="/dealer/surveys">{copy.backToList}</Link>
          </Button>
        ) }}
        isEmpty={() => false}
      >
        {(data) => (
          <div className="space-y-5">
            {data.survey.unanswerableQuestions > 0 && (
              <p role="status" className={cn('qx-small flex items-start gap-2 rounded-card border p-3', TONE_CALLOUT.warning)}>
                <AlertTriangle aria-hidden className="mt-0.5 size-4 shrink-0 text-warning" />
                <span>
                  {copy.unanswerableResults(data.survey.unanswerableQuestions)}{' '}
                  <Link href={`/dealer/surveys/${surveyId}/edit`} className="font-semibold underline underline-offset-2">
                    {copy.edit}
                  </Link>
                </span>
              </p>
            )}

            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <ChoiceChips
                aria-label={copy.rangeLabel}
                value={range}
                onChange={(v) => v && chooseRange(v as SurveyRange)}
                options={SURVEY_RANGES.map((r) => ({ value: r, label: copy.ranges[r] }))}
              />
              {query.isFetching && !query.isLoading && <span className="qx-caption text-fg-muted" aria-live="polite">…</span>}
            </div>

            <SectionTabs
              value={tab}
              onValueChange={chooseTab}
              ariaLabel={copy.results}
              tabs={[
                { value: 'summary', label: copy.tabSummary },
                { value: 'responses', label: copy.tabResponses, count: data.totals.responses },
              ]}
            >
              {(active) =>
                active === 'responses' ? (
                  <ResponsesList surveyId={surveyId} range={range} />
                ) : (
                  <Summary data={data} range={range} now={now} onSeeAllTexts={setTextsQ} onShare={() => setShareOpen(true)} onPublish={() => toggle.mutate(true)} publishing={toggle.isPending} />
                )
              }
            </SectionTabs>
          </div>
        )}
      </QueryState>

      <SurveyShareDialog
        target={s ? { id: s.id, title: s.title, isActive: s.isActive } : null}
        open={shareOpen && !!s}
        onOpenChange={setShareOpen}
        onPublish={() => toggle.mutate(true)}
        publishing={toggle.isPending}
      />
      <TextsSheet surveyId={surveyId} question={textsQ} range={range} onClose={() => setTextsQ(null)} />
    </PanelPage>
  );
}

function Summary({
  data,
  range,
  now,
  onSeeAllTexts,
  onShare,
  onPublish,
  publishing,
}: {
  data: SurveyResultsData;
  range: SurveyRange;
  now: number;
  onSeeAllTexts: (q: SurveyQuestionSummary) => void;
  onShare: () => void;
  onPublish: () => void;
  publishing: boolean;
}) {
  const { copy, tag } = useSurveyCopy();
  const { totals, ratingOverall, trend } = data;
  const membersPct = totals.responses > 0 ? (totals.members / totals.responses) * 100 : null;
  const trendTotal = trend.reduce((a, p) => a + p.n, 0);
  const peak = trend.reduce((m, p) => Math.max(m, p.n), 0);
  const dayFmt = useMemo(() => new Intl.DateTimeFormat(tag, { timeZone: 'UTC', day: 'numeric', month: 'short' }), [tag]);
  const chartData = useMemo(() => trend.map((p) => ({ ...p, label: dayFmt.format(new Date(`${p.day}T00:00:00Z`)) })), [trend, dayFmt]);

  if (totals.responses === 0) {
    return (
      <EmptyState
        icon={BarChart3}
        title={copy.emptyResultsTitle}
        description={data.survey.isActive ? copy.emptyResultsLive : copy.emptyResultsPaused}
        action={
          data.survey.isActive ? (
            <Button className="gap-2" onClick={onShare}>
              <Share2 aria-hidden className="size-4" /> {copy.share}
            </Button>
          ) : (
            <Button onClick={onPublish} loading={publishing}>
              {copy.resumeSurvey}
            </Button>
          )
        }
        headingLevel="h2"
      />
    );
  }

  return (
    <div className="space-y-5">
      <MetricGrid cols={4}>
        <MetricTile
          label={copy.metricResponses}
          metric={{ value: totals.responses, series: trend.slice(-30).map((p) => p.n) }}
          icon={<BarChart3 />}
          tone="brand"
          size="compact"
          hint={copy.rangeLong[range]}
          sparklineLabel={copy.trendSummary(trendTotal, trend.length, peak)}
        />
        <MetricTile
          label={copy.metricMembers}
          metric={{ value: membersPct == null ? null : Math.round(membersPct), format: 'percent', n: totals.responses }}
          icon={<UserRound />}
          tone="info"
          size="compact"
          hint={copy.metricMembersHint}
          showSparkline={false}
        />
        {ratingOverall.n > 0 ? (
          <>
            <MetricTile
              label={copy.metricAvg}
              metric={{ value: ratingOverall.avg, fractionDigits: 1, unit: '/ 5', n: ratingOverall.n, minN: 5 }}
              icon={<Star />}
              tone="warning"
              size="compact"
              hint={copy.metricAvgHint}
              showSparkline={false}
            />
            <MetricTile
              label={copy.metricSatisfied}
              metric={{ value: ratingOverall.satisfiedPct, format: 'percent', n: ratingOverall.n, minN: 5 }}
              icon={<Smile />}
              tone="success"
              size="compact"
              hint={copy.metricSatisfiedHint}
              showSparkline={false}
            />
          </>
        ) : (
          <MetricTile
            label={copy.metricLast}
            metric={{ value: null }}
            icon={<Clock />}
            tone="neutral"
            size="compact"
            hint={totals.lastResponseAt ? formatRelative(totals.lastResponseAt, tag, now) : copy.noResponsesYet}
            showSparkline={false}
          />
        )}
      </MetricGrid>

      <ChartFrame
        title={copy.trendTitle}
        description={copy.trendDescription(range === 'all' && trend.length >= 90 ? copy.rangeLong['90d'] : copy.rangeLong[range])}
        data={chartData}
        columns={[
          { key: 'label', label: copy.trendDay },
          { key: 'n', label: copy.trendCount, numeric: true, format: (v) => formatNumber(Number(v), tag) },
        ]}
        summary={copy.trendSummary(trendTotal, trend.length, peak)}
        height={220}
        empty={{ title: copy.trendEmpty, description: null }}
      >
        <TrendChart data={chartData} countLabel={copy.trendCount} />
      </ChartFrame>

      <div className="space-y-3">
        {data.questions.map((q, i) => (
          <Motion.div key={q.questionId} variants={listItem} custom={i} initial="hidden" animate="visible">
            <QuestionResultCard q={q} index={i} totalResponses={totals.responses} now={now} onSeeAllTexts={onSeeAllTexts} />
          </Motion.div>
        ))}
      </div>
    </div>
  );
}
