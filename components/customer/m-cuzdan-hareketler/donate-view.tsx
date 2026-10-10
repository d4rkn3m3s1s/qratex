'use client';

/**
 * Cüzdan → Bağış istemci adası (eski /customer/donations).
 *
 * Üstte kişisel etki (katalog filtresinden bağımsız — B4), gerçek sıra ve "bir üst sıraya"
 * (B3), önerilen proje (ölü hero CTA'sının yerini alan gerçek eylem — B6), "nasıl işler"
 * açıklaması (video vaadi yok). Sekmeler URL'de: Projeler · Topluluk · Bağışlarım; eski
 * `?tab=leaderboard` derin bağlantısı Topluluk'a düşer (B8). Kategori filtresi istemcide,
 * tam sayfa iskelete düşmeden (B7). Bağış sonrası önbellek yerinde güncellenir + arkadan tazelenir.
 */
import { useEffect, useMemo, useState } from 'react';
import dynamic from 'next/dynamic';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useSession } from 'next-auth/react';
import { Heart, Info, LayoutGrid, Receipt, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ChoiceChips } from '@/components/ds/a11y';
import { DetailSheet, KeyValueList } from '@/components/ds/data';
import { SectionTabs, PanelErrorBoundary } from '@/components/ds/page';
import { EmptyState, QueryState, SkeletonList } from '@/components/states';
import { CUSTOMER_HOME_QUERY_KEY } from '@/lib/customer-home/types';
import { normalizeCategory, KNOWN_CATEGORIES, type KnownCategory } from '@/lib/customer-wallet/donate/impact';
import type { DonateOverview, DonationProjectDto, MakeDonationResult, MyImpact } from '@/lib/customer-wallet/donate/service';
import { COMMUNITY_KEY, DONATE_KEY, fetchDonate, HISTORY_KEY, shouldRetry } from './api';
import { useMovesCopy, type MovesCopy } from './copy';
import { ProjectCard, ProjectIcon, ProgressBar, daysUntil } from './donate-parts';
import { readDonateTab, type DonateTab } from './filters';
import { useFormatters, type Formatters } from './format';
import { useSearchParamState } from './use-param';

// Sekmeler ve bağış paneli yalnız gerektiğinde yüklenir (ilk boyama: etki kartı + projeler).
const CommunityTab = dynamic(() => import('./community-tab').then((m) => m.CommunityTab), { loading: () => <SkeletonList rows={5} /> });
const HistoryTab = dynamic(() => import('./history-tab').then((m) => m.HistoryTab), { loading: () => <SkeletonList rows={5} /> });
const DonateSheet = dynamic(() => import('./donate-sheet').then((m) => m.DonateSheet));

/**
 * Açık panelin projesi: bağış sonrası önbellek güncellense de panel AÇILIŞTAKİ anlık görüntüyle
 * kalır (başarı anındaki "önce → sonra" ilerlemesi doğru çizilsin). Kimlik değişince yenilenir.
 */
function useDonateTarget(projects: DonationProjectDto[] | undefined, id: string | null): DonationProjectDto | null {
  const live = id ? projects?.find((p) => p.id === id) ?? null : null;
  const [snapshot, setSnapshot] = useState<DonationProjectDto | null>(live);
  useEffect(() => {
    if (!id) setSnapshot(null);
    else if (live && (!snapshot || snapshot.id !== id)) setSnapshot(live);
  }, [id, live, snapshot]);
  return id ? (snapshot && snapshot.id === id ? snapshot : live) : null;
}

export function DonateView({ initial }: { initial: DonateOverview | null }) {
  const { copy, locale } = useMovesCopy();
  const fmt = useFormatters(locale);
  const url = useSearchParamState();
  const qc = useQueryClient();
  const { update } = useSession();
  const tab = readDonateTab(url.get);
  const projectParam = url.get('project');
  const receiptParam = url.get('receipt');
  const [donateId, setDonateId] = useState<string | null>(null);

  const q = useQuery({
    queryKey: DONATE_KEY,
    queryFn: ({ signal }) => fetchDonate(signal),
    initialData: initial ?? undefined,
    staleTime: 30_000,
    retry: shouldRetry,
  });
  const data = q.data;
  const target = useDonateTarget(data?.projects, donateId);

  const setTab = (next: DonateTab) => url.patch({ tab: next === 'projects' ? null : next, receipt: null, project: null });

  const onDonated = (res: MakeDonationResult, before: DonationProjectDto) => {
    qc.setQueryData<DonateOverview>(DONATE_KEY, (prev) => {
      if (!prev || res.duplicate) return prev;
      return {
        ...prev,
        balance: res.balance,
        projects: prev.projects.map((p) =>
          p.id === before.id
            ? {
                ...p,
                current: res.project.current,
                goal: res.project.goal,
                progress: res.project.progress,
                myDonation: p.myDonation + res.receipt.points,
                donationCount: p.donationCount + 1,
              }
            : p,
        ),
        me: {
          ...prev.me,
          totalDonated: prev.me.totalDonated + res.receipt.points,
          donationCount: prev.me.donationCount + 1,
          defaultPublic: res.receipt.isPublic,
        },
      };
    });
    // Kişisel etki, sıra ve topluluk sunucudan taze gelsin (önbellek sürümlendi).
    void qc.invalidateQueries({ queryKey: DONATE_KEY });
    void qc.invalidateQueries({ queryKey: HISTORY_KEY });
    void qc.invalidateQueries({ queryKey: COMMUNITY_KEY });
    void qc.invalidateQueries({ queryKey: ['wallet-activity'] });
    void qc.invalidateQueries({ queryKey: CUSTOMER_HOME_QUERY_KEY });
    // Üst çubuktaki bakiye (oturum) senkronu.
    void update?.({ points: res.balance }).catch(() => undefined);
  };

  return (
    <div className="space-y-4">
      <QueryState query={q} skeleton="cards">
        {(d) => (
          <>
            <ImpactCard data={d} fmt={fmt} copy={copy} onDonate={setDonateId} />
            <HowItWorks copy={copy} />
          </>
        )}
      </QueryState>

      <SectionTabs
        tabs={[
          { value: 'projects', label: copy.donateTabs.projects, icon: <LayoutGrid /> },
          { value: 'community', label: copy.donateTabs.community, icon: <Users /> },
          { value: 'history', label: copy.donateTabs.history, icon: <Receipt /> },
        ]}
        value={tab}
        onValueChange={(v) => setTab(v as DonateTab)}
        ariaLabel={copy.donateTabsLabel}
        variant="pill"
        touchTarget
      >
        {(active) => (
          <PanelErrorBoundary resetKeys={[active]}>
            {active === 'projects' ? (
              data ? (
                <ProjectsTab
                  data={data}
                  fmt={fmt}
                  category={url.get('category')}
                  onCategory={(c) => url.patch({ category: c })}
                  onDetails={(id) => url.patch({ project: id })}
                  onDonate={setDonateId}
                />
              ) : null
            ) : active === 'community' ? (
              <CommunityTab />
            ) : (
              <HistoryTab
                onBrowse={() => setTab('projects')}
                receiptId={receiptParam}
                onOpenReceipt={(id) => url.patch({ receipt: id })}
                onCloseReceipt={() => url.patch({ receipt: null })}
              />
            )}
          </PanelErrorBoundary>
        )}
      </SectionTabs>

      <DetailSheet
        open={!!projectParam && !!data}
        id={projectParam}
        onOpenChange={(open) => {
          if (!open) url.patch({ project: null });
        }}
        title={(id: string) => data?.projects.find((p) => p.id === id)?.name ?? copy.details}
        size="md"
        footer={(id: string) => {
          const p = data?.projects.find((x) => x.id === id);
          return p ? (
            <Button
              className="min-h-11 w-full"
              disabled={p.progress.completed || (data?.balance ?? 0) < 1}
              onClick={() => {
                url.patch({ project: null });
                setDonateId(p.id);
              }}
            >
              <Heart className="mr-2 h-4 w-4" aria-hidden />
              {copy.donateCta}
            </Button>
          ) : null;
        }}
      >
        {(id: string) => <ProjectDetail project={data?.projects.find((p) => p.id === id) ?? null} fmt={fmt} copy={copy} />}
      </DetailSheet>

      {data ? (
        <DonateSheet
          project={target}
          balance={data.balance}
          defaultPublic={data.me.defaultPublic}
          fmt={fmt}
          onClose={() => setDonateId(null)}
          onDonated={onDonated}
          onStale={() => void qc.invalidateQueries({ queryKey: DONATE_KEY })}
        />
      ) : null}
    </div>
  );
}

/** Aynı birim+etiketli etkileri toplar ("1.240 litre temiz su"). */
function aggregateImpacts(impacts: MyImpact[]): Array<{ key: string; value: number; unit: string; label: string }> {
  const map = new Map<string, { key: string; value: number; unit: string; label: string }>();
  for (const i of impacts) {
    if (!i.impact) continue;
    const key = `${i.impact.unit}|${i.impact.label}`;
    const prev = map.get(key);
    if (prev) prev.value = Math.round((prev.value + i.impact.value) * 100) / 100;
    else map.set(key, { key, value: i.impact.value, unit: i.impact.unit, label: i.impact.label });
  }
  return [...map.values()].sort((a, b) => b.value - a.value).slice(0, 4);
}

function ImpactCard({ data, fmt, copy, onDonate }: { data: DonateOverview; fmt: Formatters; copy: MovesCopy; onDonate: (id: string) => void }) {
  const me = data.me;
  const impacts = aggregateImpacts(me.impacts);
  const recommended = data.recommendedProjectId ? data.projects.find((p) => p.id === data.recommendedProjectId) ?? null : null;
  return (
    <section aria-labelledby="impact-title" className="space-y-3 rounded-card border border-subtle bg-surface-1 p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <h2 id="impact-title" className="qx-h3 text-fg">
          {copy.yourImpact}
        </h2>
        <span className="qx-caption qx-num rounded-chip bg-surface-muted px-2 py-1 text-fg-muted">{copy.balanceLine(fmt.int(data.balance))}</span>
      </div>
      {me.totalDonated > 0 ? (
        <>
          <p className="qx-small text-fg">{copy.impactSummary(fmt.int(me.totalDonated), me.projectsSupported)}</p>
          {impacts.length > 0 ? (
            <ul className="flex flex-wrap gap-2">
              {impacts.map((i) => (
                <li key={i.key} className="rounded-control border border-brand-border bg-brand-subtle px-3 py-2">
                  <span className="qx-num block text-lg font-semibold text-brand">
                    {fmt.dec(i.value)} {i.unit}
                  </span>
                  {i.label ? <span className="qx-caption block text-fg-muted">{i.label}</span> : null}
                </li>
              ))}
            </ul>
          ) : null}
          {me.impacts.some((i) => i.closed) ? (
            <p className="qx-caption text-fg-subtle">
              {me.impacts
                .filter((i) => i.closed)
                .map((i) => `${i.name} (${copy.closedProject})`)
                .join(' · ')}
            </p>
          ) : null}
          <p className="qx-caption text-fg-muted">
            {me.standing.rank
              ? me.standing.rank === 1
                ? `${copy.rankLine(fmt.int(1), fmt.int(me.standing.donors))} · ${copy.topRank}`
                : `${copy.rankLine(fmt.int(me.standing.rank), fmt.int(me.standing.donors))}${me.standing.gapToNext ? ` · ${copy.gapLine(fmt.int(me.standing.gapToNext))}` : ''}`
              : copy.privateOnly}
          </p>
        </>
      ) : (
        <p className="qx-small text-fg-muted">{copy.impactNone}</p>
      )}
      {recommended ? (
        <div className="flex flex-wrap items-center gap-3 rounded-control border border-subtle bg-surface-0 p-3">
          <ProjectIcon icon={recommended.icon} category={recommended.category} size={40} />
          <div className="min-w-0 flex-1">
            <p className="qx-caption text-fg-muted">{copy.recommended}</p>
            <p className="qx-small truncate font-medium text-fg">{recommended.name}</p>
            {recommended.progress.remaining != null ? (
              <p className="qx-caption qx-num text-fg-muted">{copy.recommendedNear(fmt.int(recommended.progress.remaining))}</p>
            ) : null}
          </div>
          <Button className="min-h-11" onClick={() => onDonate(recommended.id)} disabled={data.balance < 1}>
            <Heart className="mr-2 h-4 w-4" aria-hidden />
            {copy.donateCta}
          </Button>
        </div>
      ) : null}
    </section>
  );
}

function HowItWorks({ copy }: { copy: MovesCopy }) {
  return (
    <details className="group rounded-card border border-subtle bg-surface-1 px-4 py-1">
      <summary className="qx-small flex min-h-11 cursor-pointer list-none items-center gap-2 font-medium text-fg [&::-webkit-details-marker]:hidden">
        <Info className="h-4 w-4 text-fg-muted" aria-hidden />
        {copy.howTitle}
      </summary>
      <ol className="qx-small list-decimal space-y-1.5 pb-3 pl-5 text-fg-muted">
        {copy.howSteps.map((s) => (
          <li key={s}>{s}</li>
        ))}
      </ol>
    </details>
  );
}

function ProjectsTab({
  data,
  fmt,
  category,
  onCategory,
  onDetails,
  onDonate,
}: {
  data: DonateOverview;
  fmt: Formatters;
  category: string | null;
  onCategory: (c: string | null) => void;
  onDetails: (id: string) => void;
  onDonate: (id: string) => void;
}) {
  const { copy } = useMovesCopy();
  const present = useMemo(() => {
    const set = new Set<KnownCategory | 'other'>(data.projects.map((p) => p.category));
    return [...KNOWN_CATEGORIES.filter((c) => set.has(c)), ...(set.has('other') ? (['other'] as const) : [])];
  }, [data.projects]);
  const active = category ? (category === 'other' ? 'other' : normalizeCategory(category)) : null;
  const activeValid = active && present.includes(active) ? active : null;
  const list = activeValid ? data.projects.filter((p) => p.category === activeValid) : data.projects;

  if (data.projects.length === 0) {
    return <EmptyState icon={Heart} title={copy.projectsEmptyTitle} description={copy.projectsEmptyDesc} />;
  }

  return (
    <div className="space-y-4">
      {present.length > 1 ? (
        <ChoiceChips
          aria-label={copy.categoryFilter}
          size="sm"
          scroll
          options={[{ value: 'all', label: copy.categories.all }, ...present.map((c) => ({ value: c, label: copy.categories[c] }))]}
          value={activeValid ?? 'all'}
          onChange={(v) => onCategory(v && v !== 'all' ? v : null)}
        />
      ) : null}
      {list.length === 0 ? (
        <EmptyState compact title={copy.categoryEmpty} />
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2">
          {list.map((p) => (
            <li key={p.id}>
              <ProjectCard
                project={p}
                fmt={fmt}
                canDonate={data.balance >= 1}
                onDetails={() => onDetails(p.id)}
                onDonate={() => onDonate(p.id)}
              />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function ProjectDetail({ project, fmt, copy }: { project: DonationProjectDto | null; fmt: Formatters; copy: MovesCopy }) {
  if (!project) return <EmptyState compact title={copy.errors.NOT_FOUND} />;
  const p = project.progress;
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <ProjectIcon icon={project.icon} category={project.category} size={48} />
        <span className="qx-caption text-fg-muted">{copy.categories[project.category]}</span>
      </div>
      <p className="qx-small whitespace-pre-line text-fg">{project.description}</p>
      {p.percent != null ? (
        <div className="space-y-1.5">
          <ProgressBar percent={p.percent} label={copy.progressAria(fmt.int(project.current), fmt.int(project.goal), fmt.dec(p.percent))} />
          <p className="qx-caption qx-num text-fg-muted">
            {copy.progressLabel(fmt.dec(p.percent))} · {fmt.int(project.current)} / {fmt.int(project.goal)}
            {p.completed ? ` · ${copy.goalReached}` : ` · ${copy.remaining(fmt.int(p.remaining ?? 0))}`}
          </p>
        </div>
      ) : null}
      <KeyValueList
        items={[
          {
            id: 'rate',
            label: copy.receiptFields.impact,
            value: project.impact ? copy.impactRate(project.impact.unit, fmt.dec(project.impact.perPoint), project.impact.label) : null,
            hidden: !project.impact,
          },
          {
            id: 'dates',
            label: copy.dates,
            value: copy.startEnd(fmt.dayLongYear(project.startDate), project.endDate ? fmt.dayLongYear(project.endDate) : null),
            hint: project.endDate ? copy.daysLeft(daysUntil(project.endDate)) : undefined,
          },
          { id: 'count', label: copy.donateTabs.community, value: copy.donationCount(fmt.int(project.donationCount)) },
          {
            id: 'mine',
            label: copy.yourImpact,
            value: copy.yourContribution(fmt.int(project.myDonation)),
            hidden: project.myDonation <= 0,
          },
        ]}
      />
      {project.tags.length > 0 ? (
        <div>
          <p className="qx-caption mb-1.5 text-fg-muted">{copy.tags}</p>
          <ul className="flex flex-wrap gap-1.5">
            {project.tags.map((t) => (
              <li key={t} className="qx-caption rounded-chip border border-subtle bg-surface-muted px-2 py-0.5 text-fg-muted">
                {t}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
