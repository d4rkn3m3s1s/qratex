'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AnimatePresence, m as Motion } from 'framer-motion';
import {
  AlertTriangle,
  BarChart3,
  ClipboardList,
  Copy as CopyIcon,
  Download,
  ExternalLink,
  MessageSquareText,
  MoreHorizontal,
  Pencil,
  Plus,
  Search,
  Share2,
  Trash2,
} from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { PanelPage, PageHeader } from '@/components/ds/page';
import { MetricGrid, MetricTile, Sparkline } from '@/components/ds/data';
import { ChoiceChips } from '@/components/ds/a11y';
import { ConfirmAction, EmptyState, QueryState, TONE_CHIP } from '@/components/states';
import { listItem } from '@/lib/motion';
import { cn } from '@/lib/utils';
import { surveyTemplates } from '@/lib/dealer-surveys/templates';
import type { SurveyListData, SurveyListItem } from '@/lib/dealer-surveys/types';
import { deleteSurvey, duplicateSurvey, exportSurveyUrl, fetchSurveyList, patchSurvey, publicSurveyUrl, surveyKeys } from './api';
import { errorText, formatDate, formatRelative, useSurveyCopy } from './copy';
import { SurveyShareDialog, type ShareTarget } from './share-dialog';
import { SurveyStatusBadge } from './status-badge';

type StatusFilter = 'all' | 'live' | 'paused' | 'attention';
type SortKey = 'newest' | 'responses' | 'last';
const STATUS_FILTERS: StatusFilter[] = ['all', 'live', 'paused', 'attention'];
const SORT_KEYS: SortKey[] = ['newest', 'responses', 'last'];

/** URL'yi sunucu turu OLMADAN günceller (Next App Router `history.replaceState` ile senkron). */
function replaceQuery(patch: Record<string, string | null>) {
  const url = new URL(window.location.href);
  for (const [k, v] of Object.entries(patch)) {
    if (v == null || v === '') url.searchParams.delete(k);
    else url.searchParams.set(k, v);
  }
  window.history.replaceState(window.history.state, '', `${url.pathname}${url.search}${url.hash}`);
}

function trLower(s: string) {
  return s.toLocaleLowerCase('tr-TR');
}

export function SurveysScreen({ initial, now }: { initial: SurveyListData | null; now: number }) {
  const { copy, locale, tag } = useSurveyCopy();
  const qc = useQueryClient();
  const sp = useSearchParams();

  const [q, setQ] = useState(() => sp?.get('q') ?? '');
  const [status, setStatus] = useState<StatusFilter>(() => {
    const v = sp?.get('status') as StatusFilter | null;
    return v && STATUS_FILTERS.includes(v) ? v : 'all';
  });
  const [sort, setSort] = useState<SortKey>(() => {
    const v = sp?.get('sort') as SortKey | null;
    return v && SORT_KEYS.includes(v) ? v : 'newest';
  });
  const [highlight, setHighlight] = useState<string | null>(() => sp?.get('new') ?? null);
  const [shareTarget, setShareTarget] = useState<ShareTarget | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<SurveyListItem | null>(null);

  const query = useQuery({
    queryKey: surveyKeys.list,
    queryFn: fetchSurveyList,
    initialData: initial ?? undefined,
    staleTime: 30_000,
    refetchOnWindowFocus: true,
  });

  // Yeni oluşturulan anketi bir kez vurgula, sonra URL'den temizle.
  useEffect(() => {
    if (!highlight) return;
    replaceQuery({ new: null });
    const t = window.setTimeout(() => setHighlight(null), 4000);
    return () => window.clearTimeout(t);
  }, [highlight]);

  const toggle = useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) => patchSurvey(id, { isActive }),
    onMutate: async ({ id, isActive }) => {
      await qc.cancelQueries({ queryKey: surveyKeys.list });
      const prev = qc.getQueryData<SurveyListData>(surveyKeys.list);
      if (prev) {
        const surveys = prev.surveys.map((s) => (s.id === id ? { ...s, isActive } : s));
        const active = surveys.filter((s) => s.isActive).length;
        qc.setQueryData<SurveyListData>(surveyKeys.list, { ...prev, surveys, totals: { ...prev.totals, active, paused: surveys.length - active } });
      }
      setShareTarget((t) => (t && t.id === id ? { ...t, isActive } : t));
      return { prev };
    },
    onError: (e, _v, ctx) => {
      if (ctx?.prev) qc.setQueryData(surveyKeys.list, ctx.prev);
      toast.error(errorText(copy, locale, e));
    },
    onSuccess: (_d, v) => toast.success(v.isActive ? copy.toastPublished : copy.toastPaused),
    onSettled: () => qc.invalidateQueries({ queryKey: surveyKeys.all }),
  });

  const duplicate = useMutation({
    mutationFn: (id: string) => duplicateSurvey(id),
    onSuccess: (r) => {
      toast.success(copy.toastDuplicated);
      setHighlight(r.survey.id);
      void qc.invalidateQueries({ queryKey: surveyKeys.list });
    },
    onError: (e) => toast.error(errorText(copy, locale, e)),
  });

  function setFilter(patch: { q?: string; status?: StatusFilter; sort?: SortKey }) {
    if (patch.q !== undefined) setQ(patch.q);
    if (patch.status) setStatus(patch.status);
    if (patch.sort) setSort(patch.sort);
    replaceQuery({
      ...(patch.q !== undefined ? { q: patch.q.trim() || null } : {}),
      ...(patch.status ? { status: patch.status === 'all' ? null : patch.status } : {}),
      ...(patch.sort ? { sort: patch.sort === 'newest' ? null : patch.sort } : {}),
    });
  }

  const data = query.data;
  const visible = useMemo(() => {
    if (!data) return [];
    const needle = trLower(q.trim());
    const rows = data.surveys.filter((s) => {
      if (status === 'live' && !s.isActive) return false;
      if (status === 'paused' && s.isActive) return false;
      if (status === 'attention' && s.unanswerableQuestions === 0) return false;
      if (needle && !trLower(`${s.title} ${s.description ?? ''}`).includes(needle)) return false;
      return true;
    });
    const by = {
      newest: (a: SurveyListItem, b: SurveyListItem) => b.createdAt.localeCompare(a.createdAt),
      responses: (a: SurveyListItem, b: SurveyListItem) => b.responseCount - a.responseCount || b.createdAt.localeCompare(a.createdAt),
      last: (a: SurveyListItem, b: SurveyListItem) => (b.lastResponseAt ?? '').localeCompare(a.lastResponseAt ?? '') || b.createdAt.localeCompare(a.createdAt),
    }[sort];
    return [...rows].sort(by);
  }, [data, q, status, sort]);

  const quotaFull = !!data && data.quota.used >= data.quota.limit;
  const attentionCount = data?.surveys.filter((s) => s.unanswerableQuestions > 0).length ?? 0;
  const filtersActive = q.trim() !== '' || status !== 'all';

  const newButton = quotaFull ? (
    <Button className="w-full gap-2 sm:w-auto" disabled aria-describedby="survey-quota-note">
      <Plus aria-hidden className="size-4" /> {copy.newSurvey}
    </Button>
  ) : (
    <Button asChild className="w-full gap-2 sm:w-auto">
      <Link href="/dealer/surveys/create">
        <Plus aria-hidden className="size-4" /> {copy.newSurvey}
      </Link>
    </Button>
  );

  return (
    <PanelPage
      register="ops"
      header={
        <PageHeader
          eyebrow={copy.eyebrow}
          title={copy.listTitle}
          description={copy.listDescription}
          icon={<ClipboardList />}
          actions={newButton}
        />
      }
    >
      <QueryState
        query={query}
        skeleton="list"
        loadingLabel={copy.loading}
        isEmpty={(d) => d.surveys.length === 0}
        error={{ title: copy.loadFailed }}
        empty={<SurveysEmpty />}
      >
        {(d) => (
          <div className="space-y-5">
            {quotaFull && (
              <p id="survey-quota-note" role="status" className={cn('qx-small flex items-start gap-2 rounded-card border p-3', 'border-warning-border bg-warning-subtle text-fg')}>
                <AlertTriangle aria-hidden className="mt-0.5 size-4 shrink-0 text-warning" />
                {copy.quotaFull(d.quota.limit)}
              </p>
            )}

            <MetricGrid cols={4}>
              <MetricTile label={copy.metricActive} metric={{ value: d.totals.active, unit: `/ ${d.totals.total}` }} icon={<ClipboardList />} tone="success" size="compact" showSparkline={false} />
              <MetricTile
                label={copy.metricResponses7d}
                metric={{ value: d.totals.responses7d, series: d.totals.trend }}
                icon={<MessageSquareText />}
                tone="brand"
                size="compact"
                sparklineLabel={copy.trend14Label(d.totals.trend.reduce((s, n) => s + n, 0))}
              />
              <MetricTile label={copy.metricResponsesAll} metric={{ value: d.totals.responsesAll }} icon={<BarChart3 />} tone="info" size="compact" showSparkline={false} />
              <MetricTile
                label={copy.quotaLabel}
                metric={{ value: d.quota.used, unit: `/ ${d.quota.limit}` }}
                icon={<ClipboardList />}
                tone={quotaFull ? 'warning' : 'neutral'}
                size="compact"
                showSparkline={false}
              />
            </MetricGrid>

            {/* Araç çubuğu: arama + durum + sıralama (URL'de kalıcı, sunucu turu yok) */}
            <div className="flex flex-col gap-3 rounded-card border border-subtle bg-surface-1 p-3 sm:p-4 lg:flex-row lg:items-end">
              <div className="min-w-0 flex-1 space-y-1.5">
                <Label htmlFor="survey-search" className="qx-caption text-fg-muted">
                  {copy.searchLabel}
                </Label>
                <div className="relative">
                  <Search aria-hidden className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-fg-muted" />
                  <Input
                    id="survey-search"
                    type="search"
                    value={q}
                    onChange={(e) => setFilter({ q: e.target.value })}
                    placeholder={copy.searchPlaceholder}
                    className="h-11 pl-9"
                  />
                </div>
              </div>
              <div className="min-w-0 space-y-1.5">
                <span id="survey-status-label" className="qx-caption block text-fg-muted">
                  {copy.statusFilterLabel}
                </span>
                <ChoiceChips
                  aria-labelledby="survey-status-label"
                  value={status}
                  onChange={(v) => setFilter({ status: (v as StatusFilter) ?? 'all' })}
                  options={[
                    { value: 'all', label: copy.filterAll },
                    { value: 'live', label: copy.filterLive },
                    { value: 'paused', label: copy.filterPaused },
                    ...(attentionCount > 0 ? [{ value: 'attention', label: `${copy.filterAttention} (${attentionCount})` }] : []),
                  ]}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="survey-sort" className="qx-caption text-fg-muted">
                  {copy.sortLabel}
                </Label>
                <select
                  id="survey-sort"
                  value={sort}
                  onChange={(e) => setFilter({ sort: e.target.value as SortKey })}
                  className="h-11 w-full rounded-control border border-input bg-surface-1 px-3 text-sm text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus lg:w-44"
                >
                  <option value="newest">{copy.sortNewest}</option>
                  <option value="responses">{copy.sortResponses}</option>
                  <option value="last">{copy.sortLast}</option>
                </select>
              </div>
            </div>

            <p className="qx-caption text-fg-muted" aria-live="polite">
              {copy.resultCount(visible.length, d.surveys.length)}
            </p>

            {visible.length === 0 ? (
              <EmptyState
                variant="filtered"
                icon={Search}
                title={copy.filteredEmpty}
                description={null}
                compact
                action={
                  filtersActive ? (
                    <Button variant="outline" onClick={() => setFilter({ q: '', status: 'all' })}>
                      {copy.clearFilters}
                    </Button>
                  ) : undefined
                }
              />
            ) : (
              <ul className="space-y-3">
                <AnimatePresence initial={false}>
                  {visible.map((s, i) => (
                    <Motion.li key={s.id} variants={listItem} custom={i} initial="hidden" animate="visible" exit="exit">
                      <SurveyRow
                        survey={s}
                        now={now}
                        highlighted={highlight === s.id}
                        togglePending={toggle.isPending && toggle.variables?.id === s.id}
                        onToggle={(isActive) => toggle.mutate({ id: s.id, isActive })}
                        onShare={() => setShareTarget({ id: s.id, title: s.title, isActive: s.isActive })}
                        onDuplicate={() => duplicate.mutate(s.id)}
                        duplicating={duplicate.isPending && duplicate.variables === s.id}
                        onDelete={() => setDeleteTarget(s)}
                        quotaFull={quotaFull}
                        exportHref={exportSurveyUrl(s.id, 'all', locale)}
                        tag={tag}
                      />
                    </Motion.li>
                  ))}
                </AnimatePresence>
              </ul>
            )}
          </div>
        )}
      </QueryState>

      <SurveyShareDialog
        target={shareTarget}
        open={!!shareTarget}
        onOpenChange={(o) => !o && setShareTarget(null)}
        onPublish={(id) => toggle.mutate({ id, isActive: true })}
        publishing={toggle.isPending}
      />

      <ConfirmAction
        open={!!deleteTarget}
        onOpenChange={(o) => !o && setDeleteTarget(null)}
        tone="danger"
        title={copy.deleteTitle}
        description={deleteTarget ? copy.deleteDescription(deleteTarget.title) : undefined}
        confirmLabel={copy.deleteConfirm}
        onConfirm={async () => {
          if (!deleteTarget) return;
          try {
            await deleteSurvey(deleteTarget.id);
          } catch (e) {
            throw new Error(errorText(copy, locale, e));
          }
          toast.success(copy.toastDeleted);
          setDeleteTarget(null);
          await qc.invalidateQueries({ queryKey: surveyKeys.list });
        }}
      />
    </PanelPage>
  );
}

function SurveyRow({
  survey: s,
  now,
  highlighted,
  togglePending,
  onToggle,
  onShare,
  onDuplicate,
  duplicating,
  onDelete,
  quotaFull,
  exportHref,
  tag,
}: {
  survey: SurveyListItem;
  now: number;
  highlighted: boolean;
  togglePending: boolean;
  onToggle: (isActive: boolean) => void;
  onShare: () => void;
  onDuplicate: () => void;
  duplicating: boolean;
  onDelete: () => void;
  quotaFull: boolean;
  exportHref: string;
  tag: string;
}) {
  const { copy } = useSurveyCopy();
  const titleId = `survey-${s.id}-title`;
  const toggleId = `survey-${s.id}-toggle`;
  const trendTotal = s.trend.reduce((a, n) => a + n, 0);
  const canDelete = s.responseCount === 0;

  return (
    <article
      aria-labelledby={titleId}
      className={cn(
        'min-w-0 rounded-card border bg-surface-1 p-4 qx-elevation-1 transition-shadow duration-base sm:p-5',
        highlighted && 'ring-2 ring-brand ring-offset-2 ring-offset-surface-0',
      )}
    >
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center">
        <div className="flex min-w-0 flex-1 items-start gap-3">
          <div aria-hidden className={cn('grid size-10 shrink-0 place-items-center rounded-control', s.isActive ? TONE_CHIP.success : TONE_CHIP.neutral)}>
            <ClipboardList className="size-5" />
          </div>
          <div className="min-w-0 flex-1 space-y-1.5">
            <div className="flex flex-wrap items-center gap-2">
              <h2 id={titleId} className="qx-body min-w-0 break-words font-semibold text-fg">
                <Link href={`/dealer/surveys/${s.id}/results`} className="rounded-sm hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus">
                  {s.title}
                </Link>
              </h2>
              <SurveyStatusBadge active={s.isActive} />
            </div>
            {s.description && <p className="qx-small line-clamp-1 text-fg-muted">{s.description}</p>}
            <p className="qx-caption flex flex-wrap gap-x-3 gap-y-1 text-fg-muted tabular-nums">
              <span>{copy.questionsCount(s.questionCount)}</span>
              <span>{copy.responsesCount(s.responseCount)}</span>
              <span>{s.lastResponseAt ? copy.lastResponse(formatRelative(s.lastResponseAt, tag, now)) : copy.noResponsesYet}</span>
              <span>{copy.createdOn(formatDate(s.createdAt, tag))}</span>
            </p>
            {s.unanswerableQuestions > 0 && (
              <p className={cn('qx-caption inline-flex items-start gap-1.5 rounded-chip px-2 py-1', TONE_CHIP.warning)}>
                <AlertTriangle aria-hidden className="mt-px size-3.5 shrink-0" />
                <span>
                  <strong className="font-semibold">{copy.unanswerable(s.unanswerableQuestions)}</strong> · {copy.unanswerableHint}{' '}
                  <Link href={`/dealer/surveys/${s.id}/edit`} className="font-semibold underline underline-offset-2">
                    {copy.edit}
                  </Link>
                </span>
              </p>
            )}
          </div>
        </div>

        <div className="flex shrink-0 flex-wrap items-center gap-2 lg:flex-nowrap">
          <div className="hidden w-24 sm:block" title={copy.trend14Label(trendTotal)}>
            <Sparkline data={s.trend} height={28} tone={s.isActive ? 'brand' : 'neutral'} zeroBased area label={copy.trend14Label(trendTotal)} />
          </div>
          <div className="flex min-h-11 items-center gap-2 rounded-control px-1">
            <Switch
              id={toggleId}
              checked={s.isActive}
              disabled={togglePending}
              onCheckedChange={onToggle}
              aria-label={copy.toggleAria(s.title)}
            />
            <Label htmlFor={toggleId} className="qx-caption cursor-pointer text-fg-muted" aria-hidden>
              {copy.live}
            </Label>
          </div>
          <Button variant="outline" className="min-h-11 gap-2" onClick={onShare} aria-label={copy.shareAria(s.title)}>
            <Share2 aria-hidden className="size-4" />
            <span className="hidden sm:inline">{copy.share}</span>
          </Button>
          <Button asChild variant="outline" className="min-h-11 gap-2">
            <Link href={`/dealer/surveys/${s.id}/results`} aria-label={copy.resultsAria(s.title)}>
              <BarChart3 aria-hidden className="size-4" />
              <span className="hidden sm:inline">{copy.results}</span>
            </Link>
          </Button>
          <DropdownMenu modal={false}>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" aria-label={copy.moreActions(s.title)}>
                <MoreHorizontal aria-hidden className="size-5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-60">
              <DropdownMenuItem asChild className="min-h-11 gap-2">
                <Link href={`/dealer/surveys/${s.id}/edit`}>
                  <Pencil aria-hidden className="size-4" /> {copy.edit}
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem className="min-h-11 gap-2" disabled={quotaFull || duplicating} onSelect={onDuplicate}>
                <CopyIcon aria-hidden className="size-4" /> {copy.duplicate}
              </DropdownMenuItem>
              {s.isActive && (
                <DropdownMenuItem asChild className="min-h-11 gap-2">
                  <a href={publicSurveyUrl('', s.id)} target="_blank" rel="noopener noreferrer">
                    <ExternalLink aria-hidden className="size-4" /> {copy.openPublic}
                  </a>
                </DropdownMenuItem>
              )}
              <DropdownMenuItem asChild className="min-h-11 gap-2" disabled={s.responseCount === 0}>
                <a href={s.responseCount === 0 ? undefined : exportHref} download>
                  <Download aria-hidden className="size-4" /> {copy.exportCsv}
                </a>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              {canDelete ? (
                <DropdownMenuItem className="min-h-11 gap-2 text-danger focus:text-danger" onSelect={onDelete}>
                  <Trash2 aria-hidden className="size-4" /> {copy.delete}
                </DropdownMenuItem>
              ) : (
                <DropdownMenuItem disabled className="min-h-11 flex-col items-start gap-0.5">
                  <span className="flex items-center gap-2">
                    <Trash2 aria-hidden className="size-4" /> {copy.delete}
                  </span>
                  <span className="qx-caption text-fg-muted">{copy.deleteLockedHint}</span>
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </article>
  );
}

function SurveysEmpty() {
  const { copy, locale } = useSurveyCopy();
  const templates = surveyTemplates(locale).slice(0, 3);
  return (
    <div className="space-y-4">
      <EmptyState
        icon={ClipboardList}
        title={copy.emptyTitle}
        description={copy.emptyDescription}
        action={
          <Button asChild variant="outline" className="gap-2">
            <Link href="/dealer/surveys/create?start=blank">
              <Plus aria-hidden className="size-4" /> {copy.emptyBlank}
            </Link>
          </Button>
        }
      />
      <ul className="grid gap-3 sm:grid-cols-3">
        {templates.map((tpl) => (
          <li key={tpl.key}>
            <Link
              href={`/dealer/surveys/create?template=${tpl.key}`}
              className="flex h-full min-h-11 flex-col gap-1 rounded-card border border-subtle bg-surface-1 p-4 transition-colors duration-fast hover:border-brand-border hover:bg-brand-subtle focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
            >
              <span className="qx-body font-semibold text-fg">{tpl.title}</span>
              <span className="qx-small text-fg-muted">{tpl.pitch}</span>
              <span className="qx-caption mt-auto pt-2 text-brand">{copy.templateQuestions(tpl.questions.length)} · {copy.chooseTemplate} →</span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
