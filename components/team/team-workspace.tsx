'use client';

import { Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useQueryClient } from '@tanstack/react-query';
import {
  Archive,
  Bot,
  Building2,
  CalendarDays,
  CheckSquare,
  ClipboardList,
  Download,
  Factory,
  FileStack,
  Flag,
  FolderOpen,
  KanbanSquare,
  LayoutList,
  ListChecks,
  MoreHorizontal,
  Plus,
  Sparkles,
  Tags,
  Users2,
  Workflow,
} from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { FilterBar, PanelPage, PageHeader, SectionTabs, useFilterState, useUrlState, type FilterField } from '@/components/ds/page';
import { DetailSheet } from '@/components/ds/data';
import { ConfirmAction, QueryState, SkeletonCards } from '@/components/states';
import { PRIORITY_META, STATUS_META, TASK_PRIORITIES, TASK_STATUSES } from '@/lib/team/constants';
import { isWeekKey } from '@/lib/team-week';
import { errorMessage, teamFetch } from './lib/api';
import { API, invalidateTasks, useSummary, useTags, useTasks, useTeamMeta, type TaskQuery } from './lib/queries';
import { downloadCsv, tasksToCsv } from './lib/csv';
import { WorkspaceProvider, capsOf, toTeamViewer, type WorkspaceContextValue } from './workspace-context';
import { WeekNav } from './week-nav';
import { SummaryStrip } from './summary-strip';
import { MyWork } from './my-work';
import { KanbanView } from './board/kanban-view';
import { ListView, type GroupBy } from './board/list-view';
import { BulkBar } from './board/bulk-bar';
import { SavedViews, VIEW_KEYS } from './saved-views';
import { TaskDetail, TaskDetailTitle } from './task-detail/task-detail';
import { displayName } from './shared';
import type { ClientViewer, TeamMeta } from './lib/types';

const NewTaskDialog = dynamic(() => import('./new-task-dialog'), { ssr: false });
const TemplatesDialog = dynamic(() => import('./dialogs/templates-dialog'), { ssr: false });
const AutomationsDialog = dynamic(() => import('./dialogs/automations-dialog'), { ssr: false });
const TagsDialog = dynamic(() => import('./dialogs/tags-dialog'), { ssr: false });
const AiAskDialog = dynamic(() => import('./dialogs/ai-dialogs').then((m) => m.AiAskDialog), { ssr: false });
const AiSummaryDialog = dynamic(() => import('./dialogs/ai-dialogs').then((m) => m.AiSummaryDialog), { ssr: false });
const tabFallback = { loading: () => <SkeletonCards /> };
const CalendarView = dynamic(() => import('./board/calendar-view').then((m) => m.CalendarView), tabFallback);
const ReviewQueue = dynamic(() => import('./review-queue').then((m) => m.ReviewQueue), tabFallback);
const InitiativesView = dynamic(() => import('./initiatives/initiatives-view').then((m) => m.InitiativesView), tabFallback);
const FilesView = dynamic(() => import('./files-view').then((m) => m.FilesView), tabFallback);
const ReportsView = dynamic(() => import('./reports').then((m) => m.ReportsView), tabFallback);

type Tab = 'mine' | 'board' | 'list' | 'calendar' | 'review' | 'initiatives' | 'files' | 'reports' | 'archive';
const WEEK_TABS: Tab[] = ['board', 'list', 'calendar', 'reports'];
const TASK_TABS: Tab[] = ['board', 'list', 'calendar', 'reports', 'archive'];

export type TeamWorkspaceProps = {
  basePath: '/admin/ekip' | '/customer/ekip';
  viewer: ClientViewer;
  initialMeta: TeamMeta | undefined;
  currentWeekKey: string;
};

/**
 * Ekip çalışma alanı — iki panelde de AYNI bileşen (teamOnly mimarisi korunur). Yetki sunucuda
 * çözülür ve `viewer` olarak gelir; arayüz yalnız `capabilitiesFor(viewer)` bayraklarına bakar
 * (denetim Y1). Durum URL'de (sekme, hafta, filtreler, açık görev) → paylaşılabilir bağlantı.
 */
export function TeamWorkspace(props: TeamWorkspaceProps) {
  return (
    <Suspense fallback={<SkeletonCards />}>
      <WorkspaceInner {...props} />
    </Suspense>
  );
}

function WorkspaceInner({ basePath, viewer, initialMeta, currentWeekKey }: TeamWorkspaceProps) {
  const url = useUrlState();
  const qc = useQueryClient();
  const meta = useTeamMeta(initialMeta);
  const tagsQ = useTags();
  const can = capsOf(viewer);
  const departments = useMemo(() => meta.data?.departments ?? [], [meta.data]);
  const members = useMemo(() => meta.data?.members ?? [], [meta.data]);
  const tags = useMemo(() => tagsQ.data?.items ?? [], [tagsQ.data]);

  const allowed: Tab[] = useMemo(
    () => ['mine', 'board', 'list', 'calendar', ...(can.approve ? (['review'] as Tab[]) : []), 'initiatives', 'files', ...(can.reports ? (['reports', 'archive'] as Tab[]) : [])],
    [can.approve, can.reports]
  );
  const defaultTab: Tab = viewer.isManager ? 'board' : 'mine';
  const rawTab = url.get('tab') as Tab | null;
  const tab: Tab = rawTab && allowed.includes(rawTab) ? rawTab : defaultTab;
  const rawWeek = url.get('week');
  const weekKey = rawWeek && isWeekKey(rawWeek) ? rawWeek : currentWeekKey;

  const setUrl = url.set;
  const openTask = useCallback((id: string) => setUrl({ task: id }), [setUrl]);
  const ctx: WorkspaceContextValue = useMemo(
    () => ({ basePath, viewer, teamViewer: toTeamViewer(viewer), can, departments, members, tags, weekKey, currentWeekKey, openTask }),
    [basePath, viewer, can, departments, members, tags, weekKey, currentWeekKey, openTask]
  );

  // ── Filtreler (URL) ──
  const fields: FilterField[] = useMemo(
    () => [
      { type: 'search', key: 'q', label: 'Ara', placeholder: 'Görev, açıklama ya da etiket' },
      { type: 'select', key: 'status', label: 'Durum', allLabel: 'Tüm durumlar', options: TASK_STATUSES.map((s) => ({ value: s, label: STATUS_META[s].label })) },
      { type: 'select', key: 'priority', label: 'Öncelik', allLabel: 'Tüm öncelikler', options: TASK_PRIORITIES.map((p) => ({ value: p, label: PRIORITY_META[p].label })) },
      { type: 'select', key: 'mine', label: 'Kapsam', allLabel: 'Tüm görevler', options: [{ value: '1', label: 'Yalnız bana atananlar' }] },
      {
        type: 'select',
        key: 'assignedTo',
        label: 'Atanan',
        allLabel: 'Herkes',
        options: [{ value: 'unassigned', label: 'Atanmamış' }, ...members.filter((m) => m.inTeam || m.isAdmin).map((m) => ({ value: m.id, label: displayName(m) }))],
      },
      { type: 'select', key: 'tag', label: 'Etiket', allLabel: 'Tüm etiketler', options: tags.map((t) => ({ value: t.label, label: `#${t.label}` })) },
      ...(viewer.isManager
        ? ([{ type: 'select', key: 'department', label: 'Departman', allLabel: 'Tüm departmanlar', options: departments.map((d) => ({ value: d.slug, label: d.name })) }] as FilterField[])
        : []),
    ],
    [members, tags, departments, viewer.isManager]
  );
  const filters = useFilterState(fields, { resetKeys: [] });
  const fv = filters.values as Record<string, string>;
  const sort = url.get('sort') ?? 'default';
  const group = (url.get('group') as GroupBy | null) ?? 'none';

  const taskQuery: TaskQuery = {
    view: tab === 'archive' ? 'archive' : 'board',
    weekKey: tab === 'archive' ? undefined : weekKey,
    q: fv.q || undefined,
    status: fv.status || undefined,
    priority: fv.priority || undefined,
    mine: fv.mine || undefined,
    assignedTo: fv.mine ? undefined : fv.assignedTo || undefined,
    tag: fv.tag || undefined,
    department: fv.department || undefined,
    sort,
  };
  const tasks = useTasks(taskQuery, TASK_TABS.includes(tab));
  const summary = useSummary(weekKey, fv.department || undefined);
  const items = useMemo(() => tasks.data?.items ?? [], [tasks.data]);

  // ── Seçim ──
  const [selectMode, setSelectMode] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  useEffect(() => {
    setSelectMode(false);
    setSelected(new Set());
  }, [tab, weekKey]);
  const toggleSelect = useCallback((id: string) => setSelected((s) => {
    const n = new Set(s);
    if (n.has(id)) n.delete(id);
    else n.add(id);
    return n;
  }), []);
  const toggleAll = useCallback((ids: string[], on: boolean) => setSelected(on ? new Set(ids) : new Set()), []);

  // ── Diyaloglar ──
  const [dialog, setDialog] = useState<null | 'new' | 'templates' | 'automations' | 'tags' | 'ask' | 'summary' | 'autotask'>(null);
  useEffect(() => {
    if (!can.createTask) return;
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      if (e.metaKey || e.ctrlKey || e.altKey || !el) return;
      if (el.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName) || el.closest('[role="dialog"]')) return;
      if (e.key === 'n' || e.key === 'N') {
        e.preventDefault();
        setDialog('new');
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [can.createTask]);

  const pickTag = useCallback((tag: string) => setUrl({ tag }), [setUrl]);
  const applyView = (config: Record<string, string>) => {
    const patch: Record<string, string | null> = {};
    for (const k of VIEW_KEYS) patch[k] = config[k] ?? null;
    url.set(patch);
    toast.success('Görünüm uygulandı');
  };
  const currentConfig: Record<string, string> = Object.fromEntries(VIEW_KEYS.map((k) => [k, url.get(k) ?? '']));

  const roleLabel = viewer.isAdmin ? 'Platform yöneticisi' : viewer.teamRole === 'yonetici' ? 'Ekip yöneticisi' : 'Ekip üyesi';
  const deptNames = viewer.departments.map((s) => departments.find((d) => d.slug === s)?.name).filter(Boolean).join(', ');
  const reviewCount = summary.data?.reviewQueue ?? 0;

  const tabs = [
    { value: 'mine', label: 'Benim işlerim', icon: <ListChecks className="h-4 w-4" />, count: summary.data?.mine.open },
    { value: 'board', label: 'Pano', icon: <KanbanSquare className="h-4 w-4" /> },
    { value: 'list', label: 'Liste', icon: <LayoutList className="h-4 w-4" /> },
    { value: 'calendar', label: 'Takvim', icon: <CalendarDays className="h-4 w-4" /> },
    ...(can.approve ? [{ value: 'review', label: 'Onay kuyruğu', icon: <CheckSquare className="h-4 w-4" />, count: reviewCount || undefined }] : []),
    { value: 'initiatives', label: 'Girişimler', icon: <Flag className="h-4 w-4" /> },
    { value: 'files', label: 'Dosyalar', icon: <FolderOpen className="h-4 w-4" /> },
    ...(can.reports
      ? [
          { value: 'reports', label: 'Rapor', icon: <ClipboardList className="h-4 w-4" /> },
          { value: 'archive', label: 'Arşiv', icon: <Archive className="h-4 w-4" /> },
        ]
      : []),
  ];

  const toolbar = TASK_TABS.includes(tab) ? (
    <FilterBar fields={fields} resetKeys={[]} ariaLabel="Görev filtreleri">
      {tab !== 'calendar' && (
        <Select value={sort} onValueChange={(v) => url.set({ sort: v === 'default' ? null : v })}>
          <SelectTrigger className="h-11 w-[11rem] sm:h-10" aria-label="Sıralama">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="default">Sıra: durum ve öncelik</SelectItem>
            <SelectItem value="priority">Önceliğe göre</SelectItem>
            <SelectItem value="due">Bitiş gününe göre</SelectItem>
            <SelectItem value="updated">Son güncellenen</SelectItem>
            <SelectItem value="created">En yeni</SelectItem>
            <SelectItem value="title">Başlığa göre</SelectItem>
            <SelectItem value="spent">Harcanan süreye göre</SelectItem>
          </SelectContent>
        </Select>
      )}
      {(tab === 'list' || tab === 'archive') && (
        <Select value={group} onValueChange={(v) => url.set({ group: v === 'none' ? null : v })}>
          <SelectTrigger className="h-11 w-[10rem] sm:h-10" aria-label="Gruplama">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="none">Gruplama yok</SelectItem>
            <SelectItem value="status">Duruma göre</SelectItem>
            <SelectItem value="assignee">Kişiye göre</SelectItem>
            <SelectItem value="priority">Önceliğe göre</SelectItem>
            <SelectItem value="department">Departmana göre</SelectItem>
          </SelectContent>
        </Select>
      )}
      <SavedViews current={currentConfig} onApply={applyView} />
      {can.bulk && (tab === 'board' || tab === 'list' || tab === 'archive') && (
        <Button variant={selectMode ? 'secondary' : 'outline'} className="h-11 gap-1.5 sm:h-10" aria-pressed={selectMode} onClick={() => setSelectMode((v) => !v)}>
          <CheckSquare className="h-4 w-4" aria-hidden /> Seç
        </Button>
      )}
    </FilterBar>
  ) : null;

  const moreMenu = (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" className="h-11 gap-1.5 sm:h-10" aria-label="Diğer araçlar">
          <MoreHorizontal className="h-4 w-4" aria-hidden /> <span className="hidden sm:inline">Araçlar</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        <DropdownMenuLabel>Yapay zekâ</DropdownMenuLabel>
        <DropdownMenuItem onSelect={() => setDialog('ask')}>
          <Bot className="mr-2 h-4 w-4" aria-hidden /> AI'ya sor
        </DropdownMenuItem>
        {can.aiSummary && (
          <DropdownMenuItem onSelect={() => setDialog('summary')}>
            <Sparkles className="mr-2 h-4 w-4" aria-hidden /> Haftalık özet
          </DropdownMenuItem>
        )}
        {(can.templates || can.automations || can.tags || can.autotask) && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuLabel>Yönetim</DropdownMenuLabel>
            {can.templates && (
              <DropdownMenuItem onSelect={() => setDialog('templates')}>
                <FileStack className="mr-2 h-4 w-4" aria-hidden /> Şablonlar
              </DropdownMenuItem>
            )}
            {can.automations && (
              <DropdownMenuItem onSelect={() => setDialog('automations')}>
                <Workflow className="mr-2 h-4 w-4" aria-hidden /> Otomasyonlar
              </DropdownMenuItem>
            )}
            {can.tags && (
              <DropdownMenuItem onSelect={() => setDialog('tags')}>
                <Tags className="mr-2 h-4 w-4" aria-hidden /> Etiket havuzu
              </DropdownMenuItem>
            )}
            {can.autotask && (
              <DropdownMenuItem onSelect={() => setDialog('autotask')}>
                <Factory className="mr-2 h-4 w-4" aria-hidden /> İşletme verisinden görev üret
              </DropdownMenuItem>
            )}
          </>
        )}
        <DropdownMenuSeparator />
        {TASK_TABS.includes(tab) && (
          <DropdownMenuItem
            disabled={items.length === 0}
            onSelect={() => {
              downloadCsv(`ekip-gorevleri-${tab === 'archive' ? 'arsiv' : weekKey}.csv`, tasksToCsv(items, departments));
              toast.success(`${items.length} görev dışa aktarıldı`);
            }}
          >
            <Download className="mr-2 h-4 w-4" aria-hidden /> Görünen görevleri CSV indir
          </DropdownMenuItem>
        )}
        <DropdownMenuItem asChild>
          <Link href={`${basePath}/departmanlar`}>
            {can.manageDepartments ? <Building2 className="mr-2 h-4 w-4" aria-hidden /> : <Users2 className="mr-2 h-4 w-4" aria-hidden />}
            {can.manageDepartments ? 'Departmanlar ve üyeler' : 'Ekip rehberi'}
          </Link>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );

  return (
    <WorkspaceProvider value={ctx}>
      <PanelPage
        register="ops"
        width="wide"
        header={
          <PageHeader
            title="Ekip"
            eyebrow={`${roleLabel}${deptNames ? ` · ${deptNames}` : ''}`}
            description={viewer.isManager ? 'Haftalık iş akışı, onay kuyruğu, girişimler ve ekip raporları.' : 'Sana atanan işler, ekibinin haftası ve girişimler.'}
            icon={<Users2 />}
            actions={
              <div className="flex flex-wrap items-center gap-2">
                {can.createTask && (
                  <Button className="h-11 gap-1.5 sm:h-10" onClick={() => setDialog('new')} aria-keyshortcuts="n">
                    <Plus className="h-4 w-4" aria-hidden /> Yeni görev
                  </Button>
                )}
                {moreMenu}
              </div>
            }
            meta={WEEK_TABS.includes(tab) ? <WeekNav weekKey={weekKey} currentWeekKey={currentWeekKey} onChange={(w) => url.set({ week: w === currentWeekKey ? null : w })} /> : undefined}
          />
        }
      >
        {meta.isError && !meta.data && (
          <QueryState query={meta} error={{ title: 'Ekip bilgileri yüklenemedi', description: errorMessage(meta.error) }}>
            {() => null}
          </QueryState>
        )}

        <SectionTabs
          tabs={tabs}
          paramKey="tab"
          defaultValue={defaultTab}
          resetKeys={['task']}
          ariaLabel="Ekip görünümleri"
          touchTarget
        >
          {() => (
            <div className="space-y-4">
              {(tab === 'board' || tab === 'list' || tab === 'calendar') && (
                <SummaryStrip
                  summary={summary.data}
                  loading={summary.isLoading}
                  error={summary.error}
                  showReview={can.approve}
                  onOpenReview={() => url.set({ tab: 'review' })}
                />
              )}
              {toolbar}
              {tab === 'mine' && <MyWork onPickTag={(t) => url.set({ tab: 'board', tag: t })} />}
              {tab === 'review' && <ReviewQueue />}
              {tab === 'initiatives' && <InitiativesView />}
              {tab === 'files' && <FilesView />}
              {TASK_TABS.includes(tab) && (
                <QueryState
                  query={tasks}
                  skeleton={tab === 'board' ? 'cards' : 'list'}
                  showRefreshing
                  isEmpty={(d) => d.items.length === 0}
                  empty={{
                    variant: filters.activeCount > 0 ? 'filtered' : tab === 'archive' ? 'default' : 'first-use',
                    title: filters.activeCount > 0 ? 'Filtreye uyan görev yok' : tab === 'archive' ? 'Arşiv boş' : 'Bu hafta görev yok',
                    description:
                      filters.activeCount > 0
                        ? 'Filtreleri temizleyip tekrar dene.'
                        : tab === 'archive'
                          ? 'Arşivlenen görevler burada geri alınabilir şekilde durur.'
                          : can.createTask
                            ? 'Yeni görev ekle, bir şablon uygula ya da işletme verisinden üret.'
                            : 'Yöneticin görev atadığında burada göreceksin.',
                    action:
                      filters.activeCount > 0 ? (
                        <Button variant="outline" onClick={filters.clear}>
                          Filtreleri temizle
                        </Button>
                      ) : can.createTask && tab !== 'archive' ? (
                        <Button onClick={() => setDialog('new')}>Yeni görev</Button>
                      ) : undefined,
                  }}
                >
                  {() => (
                    <div className="space-y-3">
                      {tasks.data?.truncated && (
                        <p className="qx-caption text-warning">İlk 500 görev gösteriliyor; daraltmak için filtre kullan.</p>
                      )}
                      {tab !== 'archive' && (tasks.data?.carriedCount ?? 0) > 0 && (
                        <p className="qx-caption text-fg-muted">
                          {tasks.data!.carriedCount} açık görev önceki haftalardan devretti (kartta “Devreden” rozetiyle).
                        </p>
                      )}
                      {tab === 'board' && (
                        <KanbanView tasks={items} selectMode={selectMode} selected={selected} onToggleSelect={toggleSelect} onPickTag={pickTag} />
                      )}
                      {(tab === 'list' || tab === 'archive') && (
                        <ListView
                          tasks={items}
                          groupBy={group}
                          selectMode={selectMode}
                          selected={selected}
                          onToggleSelect={toggleSelect}
                          onToggleAll={toggleAll}
                          onPickTag={pickTag}
                        />
                      )}
                      {tab === 'calendar' && <CalendarView tasks={items} />}
                      {tab === 'reports' && <ReportsView tasks={items} />}
                    </div>
                  )}
                </QueryState>
              )}
              {selectMode && selected.size > 0 && (
                <BulkBar
                  ids={[...selected]}
                  archiveView={tab === 'archive'}
                  onDone={() => {
                    setSelected(new Set());
                    setSelectMode(false);
                  }}
                />
              )}
            </div>
          )}
        </SectionTabs>

        <DetailSheet paramKey="task" size="xl" title={(id) => <TaskDetailTitle id={id} />} siblings={TASK_TABS.includes(tab) ? items.map((t) => t.id) : undefined}>
          {(id) => <TaskDetail id={id} onClose={() => url.set({ task: null })} />}
        </DetailSheet>

        {dialog === 'new' && <NewTaskDialog open onOpenChange={(o) => !o && setDialog(null)} />}
        {dialog === 'templates' && <TemplatesDialog open onOpenChange={(o) => !o && setDialog(null)} />}
        {dialog === 'automations' && <AutomationsDialog open onOpenChange={(o) => !o && setDialog(null)} />}
        {dialog === 'tags' && <TagsDialog open onOpenChange={(o) => !o && setDialog(null)} />}
        {dialog === 'ask' && <AiAskDialog open onOpenChange={(o) => !o && setDialog(null)} />}
        {dialog === 'summary' && <AiSummaryDialog open onOpenChange={(o) => !o && setDialog(null)} />}
        <ConfirmAction
          open={dialog === 'autotask'}
          onOpenChange={(o) => !o && setDialog(null)}
          tone="brand"
          title="İşletme verisinden görev üret"
          description="Açık yüksek/kritik olaylar ve bekleyen yüksek öncelikli aksiyon maddeleri görev olur. Daha önce üretilenler atlanır."
          loadImpact={async () => {
            const r = await teamFetch<{ candidates: { incidents: number; actionItems: number } }>(`${API}/autotask`);
            return {
              items: [
                { label: 'Olaydan', value: r.candidates.incidents, emphasis: r.candidates.incidents > 0 },
                { label: 'Aksiyon maddesinden', value: r.candidates.actionItems, emphasis: r.candidates.actionItems > 0 },
              ],
              warning: r.candidates.incidents + r.candidates.actionItems === 0 ? 'Üretilecek yeni görev yok.' : undefined,
            };
          }}
          confirmLabel="Görevleri üret"
          onConfirm={async () => {
            const r = await teamFetch<{ total: number }>(`${API}/autotask`, { method: 'POST', json: { weekKey } });
            toast.success(r.total > 0 ? `${r.total} görev üretildi` : 'Yeni kaynak bulunamadı');
            invalidateTasks(qc);
            setDialog(null);
          }}
        />
      </PanelPage>
    </WorkspaceProvider>
  );
}
