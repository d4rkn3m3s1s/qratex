'use client';

import { useCallback, useEffect, useId, useMemo, useState } from 'react';
import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query';
import { m as Motion } from 'framer-motion';
import { toast } from 'sonner';
import { CalendarClock, ChevronLeft, ChevronRight, Megaphone, Plus, Search, Send, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { PanelPage, PageHeader, SectionTabs, useUrlState } from '@/components/ds/page';
import { MetricGrid, MetricTile } from '@/components/ds/data';
import { ConfirmAction, EmptyState, InlineError, QueryState, SkeletonList } from '@/components/states';
import { listItem, useMotionPolicy } from '@/lib/motion';
import { cn } from '@/lib/utils';
import {
  CAMPAIGN_SEGMENT_KEYS,
  LIST_TABS,
  isCampaignSegment,
  parseListTab,
  type CampaignSegmentKey,
  type ListTab,
} from '../domain';
import type { CampaignDto, CampaignListItem, CampaignListResult, CampaignSummary, PrefillDraft } from '../types';
import { campaignApi, campaignKeys, type ListQuery } from '../client/api';
import { useCampaignCopy } from '../client/use-copy';
import { fmtDate, fmtDay, fmtNumber } from '../copy';
import { CampaignEditor, type EditorTarget } from './campaign-editor';
import { CampaignRow, type RowAction } from './campaign-row';
import { SendDialog } from './send-dialog';

export type CampaignsScreenProps = {
  /** ADMIN salt-okunur görünümünde hedef bayi; bayinin kendisi için null. */
  dealerId: string | null;
  readOnly: boolean;
  prefill: PrefillDraft | null;
};

type ConfirmState = { kind: 'delete' | 'archive' | 'unschedule'; item: CampaignListItem } | null;

function perfHref(id: string, dealerId: string | null): string {
  return `/dealer/campaigns/${encodeURIComponent(id)}/performance${dealerId ? `?dealerId=${encodeURIComponent(dealerId)}` : ''}`;
}

/**
 * Kampanya merkezi (istemci adası). İlk liste ve özet sunucuda yüklenip önbelleğe gömülür;
 * sekme/arama/kitle/sayfa URL'de (paylaşılabilir, geri tuşu çalışır).
 */
export function CampaignsScreen({ dealerId, readOnly, prefill }: CampaignsScreenProps) {
  const { c, locale } = useCampaignCopy();
  const qc = useQueryClient();
  const url = useUrlState();
  // `set` yalnız URL değişince yenilenir; efektler nesnenin kendisine değil buna bağlanır.
  const setUrl = url.set;
  const policy = useMotionPolicy();
  // İlk (sunucuda çizilen) liste animasyonsuz görünür; sekme/sayfa değişiminde giriş animasyonu.
  const [animateList, setAnimateList] = useState(false);
  useEffect(() => setAnimateList(true), []);
  const searchId = useId();
  const segmentId = useId();

  const tab = parseListTab(url.get('tab'));
  const qParam = url.get('q') ?? '';
  const segParam = url.get('segment');
  // `?new=1&segment=…` bir ön-dolu editör bağlantısıdır; oradaki kitle liste filtresi değildir.
  const prefillLink = url.get('new') === '1';
  const segment: CampaignSegmentKey | null = !prefillLink && isCampaignSegment(segParam) ? segParam : null;
  const page = Math.max(1, Number(url.get('page')) || 1);
  const listQuery: ListQuery = { tab, q: qParam, segment, page };

  const [search, setSearch] = useState(qParam);
  useEffect(() => setSearch(qParam), [qParam]);
  useEffect(() => {
    const v = search.trim();
    if (v === qParam) return;
    const t = setTimeout(() => setUrl({ q: v || null, page: null }), 300);
    return () => clearTimeout(t);
  }, [search, qParam, setUrl]);

  const summary = useQuery({
    queryKey: campaignKeys.summary(dealerId),
    queryFn: ({ signal }) => campaignApi.summary(dealerId, signal),
    staleTime: 30_000,
  });
  const list = useQuery({
    queryKey: campaignKeys.list(dealerId, listQuery),
    queryFn: ({ signal }) => campaignApi.list(dealerId, listQuery, signal),
    placeholderData: keepPreviousData,
    staleTime: 15_000,
  });

  const [editor, setEditor] = useState<EditorTarget | null>(null);
  const [sendTarget, setSendTarget] = useState<{ campaign: CampaignDto; mode: 'now' | 'schedule' } | null>(null);
  const [confirm, setConfirm] = useState<ConfirmState>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const invalidate = useCallback(() => qc.invalidateQueries({ queryKey: campaignKeys.root(dealerId) }), [qc, dealerId]);

  // Derin bağlantı: ?new=1 (+segment/title/message/source) editörü ön-dolu açar;
  // ?edit=<id> kaydı yükleyip düzenlemeye açar (performans → "Benzerini oluştur").
  useEffect(() => {
    if (readOnly) return;
    if (prefill?.open) {
      setEditor({ mode: 'create', prefill });
      url.set({ new: null, segment: null, title: null, message: null, source: null });
    }
    // Yalnız ilk açılışta.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const editParam = url.get('edit');
  useEffect(() => {
    if (readOnly || !editParam) return;
    let cancelled = false;
    campaignApi
      .get(dealerId, editParam)
      .then((r) => {
        if (!cancelled) setEditor({ mode: 'edit', campaign: r.campaign });
      })
      .catch((err: unknown) => {
        if (!cancelled) toast.error(err instanceof Error ? err.message : c.errors.generic);
      })
      .finally(() => {
        if (!cancelled) setUrl({ edit: null });
      });
    return () => {
      cancelled = true;
    };
  }, [editParam, readOnly, dealerId, setUrl, c.errors.generic]);

  async function runRowMutation(item: CampaignListItem, fn: () => Promise<unknown>, success: string) {
    setBusyId(item.id);
    try {
      await fn();
      toast.success(success);
      await invalidate();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : c.errors.generic);
    } finally {
      setBusyId(null);
    }
  }

  function onAction(action: RowAction, item: CampaignListItem) {
    if (readOnly) return;
    switch (action) {
      case 'edit':
        setEditor({ mode: 'edit', campaign: item });
        break;
      case 'send':
        setSendTarget({ campaign: item, mode: 'now' });
        break;
      case 'schedule':
        setSendTarget({ campaign: item, mode: 'schedule' });
        break;
      case 'unschedule':
      case 'archive':
      case 'delete':
        setConfirm({ kind: action, item });
        break;
      case 'unarchive':
        void runRowMutation(item, () => campaignApi.archive(item.id, false), c.confirm.unarchived);
        break;
      case 'duplicate':
        void runRowMutation(
          item,
          async () => {
            await campaignApi.duplicate(item.id, c.confirm.copySuffix);
            if (tab !== 'drafts') url.set({ tab: null, page: null });
          },
          c.confirm.duplicated
        );
        break;
    }
  }

  const s = summary.data;
  const counts = list.data?.counts;
  const tabs = useMemo(
    () => LIST_TABS.map((t) => ({ value: t, label: c.tabs[t], count: counts?.[t] })),
    [c.tabs, counts]
  );
  const filtered = !!qParam || !!segment;

  const header = (
    <PageHeader
      eyebrow={c.page.eyebrow}
      title={c.page.title}
      description={c.page.description}
      icon={<Megaphone aria-hidden className="h-5 w-5" />}
      actions={
        readOnly ? null : (
          <Button onClick={() => setEditor({ mode: 'create' })} className="w-full gap-2 shadow-none sm:w-auto">
            <Plus aria-hidden className="h-4 w-4" />
            {c.page.newCampaign}
          </Button>
        )
      }
      meta={readOnly ? <span className="qx-caption text-fg-muted">{c.page.readOnly}</span> : undefined}
    />
  );

  return (
    <PanelPage register="ops" header={header}>
      {/* Özet şeridi — son 30 gün, gerçek sayılar; veri yoksa "—". */}
      <section aria-label={c.summary.title} className="space-y-2">
        <h2 className="qx-overline text-fg-muted">{c.summary.title}</h2>
        {summary.isError ? (
          <InlineError variant="banner" onRetry={() => void summary.refetch()}>
            {summary.error instanceof Error ? summary.error.message : c.errors.generic}
          </InlineError>
        ) : (
          <MetricGrid cols={4}>
            <MetricTile
              label={c.summary.sent}
              icon={<Send aria-hidden className="h-4 w-4" />}
              tone="brand"
              loading={summary.isLoading}
              metric={{ value: s ? s.sentCampaigns : null }}
            />
            <MetricTile
              label={c.summary.reached}
              icon={<Users aria-hidden className="h-4 w-4" />}
              tone="info"
              loading={summary.isLoading}
              metric={{ value: s ? s.reached : null }}
            />
            <MetricTile
              label={c.summary.openRate}
              tone="success"
              loading={summary.isLoading}
              metric={{ value: s?.openRate ?? null, format: 'percent', n: s?.inAppDelivered ?? null }}
              hint={
                s
                  ? s.inAppDelivered > 0
                    ? c.summary.openRateHint(fmtNumber(s.opened, locale), fmtNumber(s.inAppDelivered, locale))
                    : c.summary.noDelivery
                  : undefined
              }
            />
            <MetricTile
              label={c.summary.scheduled}
              icon={<CalendarClock aria-hidden className="h-4 w-4" />}
              tone="neutral"
              loading={summary.isLoading}
              metric={{ value: s ? s.scheduledUpcoming : null }}
              hint={
                s
                  ? [
                      s.nextScheduledAt ? c.summary.nextAt(fmtDate(s.nextScheduledAt, locale, { day: 'numeric', month: 'long' })) : c.summary.noneScheduled,
                      c.summary.drafts(fmtNumber(s.drafts, locale)),
                    ].join(' · ')
                  : undefined
              }
            />
          </MetricGrid>
        )}
      </section>

      <section aria-label={c.page.title} className="space-y-4">
        <SectionTabs
          tabs={tabs}
          value={tab}
          onValueChange={(v) => url.set({ tab: v === 'drafts' ? null : v, page: null })}
          ariaLabel={c.page.title}
          touchTarget
        />

        <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
          <div className="min-w-0 flex-1 space-y-1">
            <label htmlFor={searchId} className="qx-caption font-medium text-fg-muted">
              {c.filters.search}
            </label>
            <div className="relative">
              <Search aria-hidden className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-fg-subtle" />
              <Input
                id={searchId}
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={c.filters.searchPlaceholder}
                className="pl-9"
                maxLength={100}
              />
            </div>
          </div>
          <div className="space-y-1 sm:w-64">
            <label htmlFor={segmentId} className="qx-caption font-medium text-fg-muted">
              {c.filters.segment}
            </label>
            <select
              id={segmentId}
              value={segment ?? ''}
              onChange={(e) => url.set({ segment: e.target.value || null, page: null })}
              className="h-11 w-full rounded-control border border-strong bg-surface-1 px-3 qx-small text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
            >
              <option value="">{c.filters.allSegments}</option>
              {CAMPAIGN_SEGMENT_KEYS.map((k) => (
                <option key={k} value={k}>
                  {c.segments[k].label}
                </option>
              ))}
            </select>
          </div>
          {filtered && (
            <Button
              variant="ghost"
              className="sm:self-end"
              onClick={() => {
                setSearch('');
                url.set({ q: null, segment: null, page: null });
              }}
            >
              {c.filters.clear}
            </Button>
          )}
        </div>

        <QueryState<CampaignListResult>
          query={list}
          skeleton={<SkeletonList rows={4} />}
          isEmpty={(d) => d.items.length === 0}
          empty={
            <ListEmpty
              tab={tab}
              filtered={filtered}
              readOnly={readOnly}
              dealerId={dealerId}
              onCreate={(seg) =>
                setEditor({
                  mode: 'create',
                  prefill: seg
                    ? { open: true, segment: seg, title: c.templates[seg].title, message: c.templates[seg].message, source: null }
                    : null,
                })
              }
              onClear={() => {
                setSearch('');
                url.set({ q: null, segment: null, page: null });
              }}
            />
          }
          showRefreshing
        >
          {(d) => (
            <div className="space-y-3">
              <Motion.ul
                key={`${d.tab}-${d.page}`}
                initial={animateList ? 'hidden' : false}
                animate="visible"
                variants={policy.variants({ hidden: {}, visible: {} })}
                className="space-y-3"
              >
                {d.items.map((item, i) => (
                  <Motion.li key={item.id} variants={policy.variants(listItem)} custom={i}>
                    <CampaignRow
                      item={item}
                      readOnly={readOnly}
                      busy={busyId === item.id}
                      performanceHref={perfHref(item.id, dealerId)}
                      onAction={onAction}
                    />
                  </Motion.li>
                ))}
              </Motion.ul>
              {d.pageCount > 1 && (
                <nav aria-label={c.pager.label} className="flex items-center justify-between gap-2 pt-1">
                  <Button
                    variant="outline"
                    onClick={() => url.set({ page: d.page - 1 <= 1 ? null : String(d.page - 1) })}
                    disabled={d.page <= 1 || list.isFetching}
                    className="gap-1"
                  >
                    <ChevronLeft aria-hidden className="h-4 w-4" />
                    <span className="sr-only sm:not-sr-only">{c.pager.prev}</span>
                  </Button>
                  <span className="qx-small qx-num text-fg-muted" aria-live="polite">
                    {c.pager.status(fmtNumber(d.page, locale), fmtNumber(d.pageCount, locale))}
                  </span>
                  <Button
                    variant="outline"
                    onClick={() => url.set({ page: String(d.page + 1) })}
                    disabled={d.page >= d.pageCount || list.isFetching}
                    className="gap-1"
                  >
                    <span className="sr-only sm:not-sr-only">{c.pager.next}</span>
                    <ChevronRight aria-hidden className="h-4 w-4" />
                  </Button>
                </nav>
              )}
            </div>
          )}
        </QueryState>
      </section>

      {!readOnly && (
        <>
          <CampaignEditor
            target={editor}
            dealerId={dealerId}
            onClose={() => setEditor(null)}
            onSaved={(campaign, opts) => {
              setEditor(null);
              void invalidate();
              if (opts.andSend) setSendTarget({ campaign, mode: 'now' });
              else toast.success(c.editor.saved);
              if (opts.created && tab !== 'drafts') url.set({ tab: null, page: null });
            }}
          />
          <SendDialog
            campaign={sendTarget?.campaign ?? null}
            initialMode={sendTarget?.mode ?? 'now'}
            dealerId={dealerId}
            onClose={() => setSendTarget(null)}
            onDone={(r) => {
              setSendTarget(null);
              void invalidate();
              if (r.mode === 'now') {
                toast.success(c.send.sentToast(fmtNumber(r.recipients, locale)));
                url.set({ tab: 'sent', page: null });
              } else {
                toast.success(c.send.scheduledToast(fmtDay(r.day, locale, { day: 'numeric', month: 'long' })));
                url.set({ tab: 'scheduled', page: null });
              }
            }}
          />
          <ConfirmAction
            open={confirm !== null}
            onOpenChange={(v) => {
              if (!v) setConfirm(null);
            }}
            tone={confirm?.kind === 'delete' ? 'danger' : 'warning'}
            title={
              confirm?.kind === 'delete' ? c.confirm.deleteTitle : confirm?.kind === 'archive' ? c.confirm.archiveTitle : c.confirm.unscheduleTitle
            }
            description={
              <>
                <span className="block font-medium text-fg">{confirm?.item.title}</span>
                {confirm?.kind === 'delete' ? c.confirm.deleteBody : confirm?.kind === 'archive' ? c.confirm.archiveBody : c.confirm.unscheduleBody}
              </>
            }
            irreversibleNote={confirm?.kind === 'delete' ? undefined : false}
            confirmLabel={
              confirm?.kind === 'delete' ? c.confirm.deleteConfirm : confirm?.kind === 'archive' ? c.confirm.archiveConfirm : c.confirm.unscheduleConfirm
            }
            onConfirm={async () => {
              const target = confirm;
              if (!target) return;
              if (target.kind === 'delete') await campaignApi.remove(target.item.id);
              else if (target.kind === 'archive') await campaignApi.archive(target.item.id, true);
              else await campaignApi.unschedule(target.item.id);
              toast.success(
                target.kind === 'delete' ? c.confirm.deleted : target.kind === 'archive' ? c.confirm.archived : c.confirm.unscheduled
              );
              await invalidate();
            }}
          />
        </>
      )}
    </PanelPage>
  );
}

function ListEmpty({
  tab,
  filtered,
  readOnly,
  dealerId,
  onCreate,
  onClear,
}: {
  tab: ListTab;
  filtered: boolean;
  readOnly: boolean;
  dealerId: string | null;
  onCreate: (segment: CampaignSegmentKey | null) => void;
  onClear: () => void;
}) {
  const { c, locale } = useCampaignCopy();
  // Öneri kartları yalnız taslak sekmesinde ve gerçek kitle sayılarıyla.
  const audience = useQuery({
    queryKey: campaignKeys.audience(dealerId),
    queryFn: ({ signal }) => campaignApi.audience(dealerId, signal),
    enabled: tab === 'drafts' && !filtered && !readOnly,
    staleTime: 60_000,
  });

  if (filtered) {
    return (
      <EmptyState
        variant="filtered"
        title={c.empty.filteredTitle}
        description={null}
        action={
          <Button variant="outline" onClick={onClear}>
            {c.filters.clear}
          </Button>
        }
      />
    );
  }

  const text: Record<ListTab, [string, string]> = {
    drafts: [c.empty.draftsTitle, c.empty.draftsBody],
    scheduled: [c.empty.scheduledTitle, c.empty.scheduledBody],
    sent: [c.empty.sentTitle, c.empty.sentBody],
    archived: [c.empty.archivedTitle, c.empty.archivedBody],
  };
  const suggestions = (audience.data?.segments ?? []).filter((s) => s.key !== 'all' && s.reachable > 0).slice(0, 3);

  return (
    <div className="space-y-4">
      <EmptyState
        variant={tab === 'drafts' ? 'first-use' : 'default'}
        title={text[tab][0]}
        description={text[tab][1]}
        headingLevel="h3"
        action={
          !readOnly && tab === 'drafts' ? (
            <Button onClick={() => onCreate(null)} className="gap-2 shadow-none">
              <Plus aria-hidden className="h-4 w-4" />
              {c.page.newCampaign}
            </Button>
          ) : undefined
        }
      />
      {suggestions.length > 0 && (
        <section aria-label={c.empty.suggestions} className="space-y-2">
          <h3 className="qx-small font-semibold text-fg">{c.empty.suggestions}</h3>
          <ul className="grid grid-cols-1 gap-2 sm:grid-cols-3">
            {suggestions.map((s) => (
              <li key={s.key} className={cn('flex flex-col gap-2 rounded-card border border-subtle bg-surface-1 p-4')}>
                <span className="qx-small font-semibold text-fg">{c.segments[s.key].label}</span>
                <span className="qx-caption text-fg-muted">{c.segments[s.key].hint}</span>
                <Button variant="outline" size="sm" className="mt-auto h-11" onClick={() => onCreate(s.key)}>
                  {c.empty.suggestionCta(fmtNumber(s.reachable, locale))}
                </Button>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
