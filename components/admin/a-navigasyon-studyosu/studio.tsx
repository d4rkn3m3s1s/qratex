'use client';

import { useCallback, useMemo, useState } from 'react';
import Link from 'next/link';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AnimatePresence, m as Motion } from 'framer-motion';
import { toast } from 'sonner';
import { ArrowDown, ArrowUp, Eye, EyeOff, GitCompare, History, Navigation, RotateCcw, Search, Users2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { PageHeader, PanelPage, useUrlState } from '@/components/ds/page';
import { StatusBadge } from '@/components/ds/data';
import { DirtyBar } from '@/components/ds/form';
import { IconButton, announce } from '@/components/ds/a11y';
import { EmptyState, QueryState } from '@/components/states';
import { navIcon } from '@/lib/navigation/icons';
import { groupsForRole, type NavRoute } from '@/lib/navigation/registry';
import {
  STUDIO_ROLES,
  describeRoleDiff,
  effectiveGroup,
  emptyRoleConfig,
  groupLabelDefault,
  pruneRoleConfig,
  sameRoleConfig,
  supportsVisibility,
  type NavHistoryEntry,
  type NavStudioState,
  type RoleConfig,
  type StudioRole,
} from '@/lib/admin-navigation/contract';
import { DURATION, EASE, useMotionPolicy } from '@/lib/motion';
import { cn } from '@/lib/utils';
import { NavApiError, errorText, fetchNavigation, navKeys, saveNavigation } from './api';
import { buildEditorNodes, flattenNodes, moveChild, moveInGroup, moveNode, moveToGroup, type EditorItem, type EditorNode } from './tree';
import { NavPreview } from './preview';
import { NavHistorySheet } from './history-sheet';
import { useNavStudioCopy } from './copy';

type Drafts = Record<StudioRole, RoleConfig>;
const UNGROUPED = '__none__';
const fmt = new Intl.DateTimeFormat('tr-TR', { timeZone: 'Europe/Istanbul', dateStyle: 'medium', timeStyle: 'short' });

/**
 * Navigasyon Stüdyosu (/admin/navigation) — ops kaydı, sakin ve yoğun; 3B yok.
 * Sıra + grup + görünürlük TEK yüzeyde, menünün gerçek yapısında düzenlenir; sağda kabuğun
 * kendi çözücüsüyle canlı önizleme; yayın C2 iyimser kilitli, tek denetim kaydıyla.
 */
export function NavigationStudio({ initial }: { initial: NavStudioState | null }) {
  const query = useQuery({
    queryKey: navKeys.state,
    queryFn: async ({ signal }) => (await fetchNavigation(signal)).state,
    initialData: initial ?? undefined,
    staleTime: 30_000,
  });
  return (
    <QueryState query={query} skeleton="form" className="mx-auto max-w-7xl p-4">
      {(state) => <Studio state={state} reload={() => query.refetch().then((r) => r.data ?? null)} />}
    </QueryState>
  );
}

function toDrafts(state: NavStudioState): Drafts {
  return { admin: { ...state.roles.admin }, dealer: { ...state.roles.dealer }, customer: { ...state.roles.customer } };
}

function Studio({ state, reload }: { state: NavStudioState; reload: () => Promise<NavStudioState | null> }) {
  const fx = useNavStudioCopy().fx;
  const roleLabel = ((cx) => (r: string) => cx.roles[r] ?? r)(useNavStudioCopy().fx);
  const ux = useNavStudioCopy().ui;
  const nx = useNavStudioCopy();
  const qc = useQueryClient();
  const url = useUrlState();
  const [saved, setSaved] = useState<NavStudioState>(state);
  const [drafts, setDrafts] = useState<Drafts>(() => toDrafts(state));
  const [search, setSearch] = useState('');
  const [highlight, setHighlight] = useState<string | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [diffOpen, setDiffOpen] = useState(false);
  const [conflict, setConflict] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const role: StudioRole = (STUDIO_ROLES as readonly string[]).includes(url.get('rol') ?? '') ? (url.get('rol') as StudioRole) : 'dealer';
  const setRole = (r: StudioRole) => url.set({ rol: r === 'dealer' ? null : r });

  const dirtyRoles = useMemo(
    () => STUDIO_ROLES.filter((r) => !sameRoleConfig(r, drafts[r], saved.roles[r])),
    [drafts, saved]
  );
  const dirty = dirtyRoles.length > 0;
  const cfg = drafts[role];
  const modulesOff = supportsVisibility(role) ? saved.modulesOff[role] : [];
  const groups = useMemo(() => groupsForRole(role), [role]);
  const nodes = useMemo(() => buildEditorNodes(role, cfg, groups.map((g) => g.id)), [role, cfg, groups]);

  const update = useCallback(
    (r: StudioRole, fn: (c: RoleConfig) => RoleConfig) => setDrafts((d) => ({ ...d, [r]: fn(d[r]) })),
    []
  );
  const applyNodes = (next: EditorNode[], focusId: string) => {
    update(role, (c) => ({ ...c, order: flattenNodes(next) }));
    setHighlight(focusId);
  };

  const adopt = (next: NavStudioState) => {
    setSaved(next);
    setDrafts(toDrafts(next));
    setConflict(false);
    setSaveError(null);
    qc.setQueryData(navKeys.state, next);
    void qc.invalidateQueries({ queryKey: navKeys.history });
  };

  const persist = useMutation({
    mutationFn: () =>
      saveNavigation({
        roles: Object.fromEntries(dirtyRoles.map((r) => [r, pruneRoleConfig(r, drafts[r])])),
        baseVersions: saved.versions,
      }),
    onSuccess: (r) => {
      adopt(r.state);
      toast.success(ux.navigasyonYayinlandiMenulerKullanicilarda);
      announce(ux.navigasyonYayinlandi);
    },
    onError: (e) => {
      if (e instanceof NavApiError && (e.status === 409 || e.status === 428)) setConflict(true);
      else setSaveError(errorText(e));
    },
  });

  const reloadLatest = async () => {
    const next = await reload();
    if (next) adopt(next);
  };

  const loadFromHistory = (entry: NavHistoryEntry) => {
    setDrafts((d) => {
      const out = { ...d };
      for (const r of STUDIO_ROLES) {
        const part = entry.snapshot[r];
        if (part) out[r] = { ...d[r], ...part };
      }
      return out;
    });
    setHistoryOpen(false);
    toast.info(ux.surumTaslagaYuklendiOnizleyip);
  };

  const q = search.trim().toLocaleLowerCase('tr-TR');
  const matches = (r: NavRoute) =>
    !q ||
    r.label.tr.toLocaleLowerCase('tr-TR').includes(q) ||
    r.label.en.toLowerCase().includes(q) ||
    r.href.toLowerCase().includes(q) ||
    (r.keywords ?? []).some((k) => k.toLocaleLowerCase('tr-TR').includes(q));
  const itemVisible = (it: EditorItem) => matches(it.route) || it.children.some(matches);
  const visibleNodes = nodes
    .map((n, index) => ({ n, index }))
    .filter(({ n }) => {
      if (!q) return true;
      if (n.kind === 'item') return itemVisible(n.item);
      const label = (cfg.groupLabels[n.groupId]?.tr || groupLabelDefault(role, n.groupId)?.tr || '').toLocaleLowerCase('tr-TR');
      return label.includes(q) || n.items.some(itemVisible);
    });

  const roleHasGroups = groups.length > 0;
  const hiddenCount = cfg.hidden.length;

  return (
    <PanelPage
      register="ops"
      width="wide"
      asideWidth="lg"
      header={
        <PageHeader
          eyebrow={ux.icerikVeGorunum}
          title={ux.navigasyonStudyosu}
          description={ux.adminBayiVeMusteri}
          icon={<Navigation />}
          meta={
            saved.lastChange ? (
              <span className="text-xs text-fg-muted">
                {fx.lastPublish} <time dateTime={saved.lastChange.at}>{fmt.format(new Date(saved.lastChange.at))}</time> · {saved.lastChange.actor}
              </span>
            ) : (
              <span className="text-xs text-fg-muted">{nx.notPublished}</span>
            )
          }
          actions={
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" className="min-h-11 sm:min-h-10" onClick={() => setDiffOpen(true)} disabled={!dirty}>
                <GitCompare className="h-4 w-4" aria-hidden /> {ux.farkiGor}
              </Button>
              <Button variant="outline" className="min-h-11 sm:min-h-10" onClick={() => setHistoryOpen(true)}>
                <History className="h-4 w-4" aria-hidden /> {ux.gecmis}
              </Button>
            </div>
          }
        />
      }
      toolbar={
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div role="tablist" aria-label={ux.menuRolu} className="flex w-full rounded-control border border-border bg-surface-1 p-1 sm:w-auto">
            {STUDIO_ROLES.map((r) => (
              <button
                key={r}
                type="button"
                role="tab"
                aria-selected={role === r}
                aria-controls="nav-structure"
                onClick={() => setRole(r)}
                className={cn(
                  'relative flex min-h-11 flex-1 items-center justify-center gap-1.5 rounded-chip px-4 text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:min-h-10 sm:flex-none',
                  role === r ? 'bg-brand text-brand-fg' : 'text-fg-muted hover:text-fg'
                )}
              >
                {roleLabel(r)}
                {dirtyRoles.includes(r) && (
                  <span className="h-2 w-2 rounded-full bg-warning" aria-label={ux.kaydedilmemisDegisiklikVar} role="img" />
                )}
              </button>
            ))}
          </div>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <label className="relative block sm:w-72">
              <span className="sr-only">{nx.searchSr}</span>
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-fg-muted" aria-hidden />
              <Input
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={ux.ogeVeyaGrupAra}
                className="min-h-11 pl-9 sm:min-h-10"
              />
            </label>
            <Button
              variant="ghost"
              className="min-h-11 sm:min-h-10"
              onClick={() => {
                update(role, () => emptyRoleConfig());
                announce(fx.resetAnnounce(roleLabel(role)));
              }}
              disabled={sameRoleConfig(role, cfg, emptyRoleConfig())}
            >
              <RotateCcw className="h-4 w-4" aria-hidden /> {fx.resetRole(roleLabel(role))}
            </Button>
          </div>
        </div>
      }
      aside={
        <div className="space-y-3">
          <NavPreview role={role} config={cfg} modulesOff={modulesOff} highlightId={highlight} />
          <p className="px-1 text-xs text-fg-muted">
            {supportsVisibility(role)
              ? fx.visSummary(hiddenCount, modulesOff.length)
              : ux.adminMenusundeGorunurlukAyari}
            {supportsVisibility(role) && (
              <>
                <Link href="/admin/features" className="underline underline-offset-2 hover:text-fg">
                  {ux.moduller}
                </Link>{' '}
                {ux.sayfasindanYonetilir}
              </>
            )}
          </p>
        </div>
      }
      asideLabel={ux.canliOnizleme}
    >
      <section id="nav-structure" aria-label={fx.structureOf(roleLabel(role))} className="space-y-3">
        {!roleHasGroups && (
          <p className="rounded-card border border-border bg-surface-1 px-3 py-2 text-sm text-fg-muted">
            {fx.flatNote(roleLabel(role))}
          </p>
        )}
        {visibleNodes.length === 0 ? (
          <EmptyState title={ux.eslesenOgeYok} description={fx.noResults(search, roleLabel(role))} compact />
        ) : (
          <ol className="space-y-2">
            <AnimatePresence initial={false}>
              {visibleNodes.map(({ n, index }) =>
                n.kind === 'item' ? (
                  <NodeShell key={n.key}>
                    <ItemRow
                      role={role}
                      cfg={cfg}
                      item={n.item}
                      modulesOff={modulesOff}
                      groupsAvailable={roleHasGroups}
                      canUp={index > 0}
                      canDown={index < nodes.length - 1}
                      onUp={() => applyNodes(moveNode(nodes, index, -1), n.item.route.id)}
                      onDown={() => applyNodes(moveNode(nodes, index, 1), n.item.route.id)}
                      nodes={nodes}
                      applyNodes={applyNodes}
                      update={(fn) => update(role, fn)}
                      matches={matches}
                    />
                  </NodeShell>
                ) : (
                  <NodeShell key={n.key}>
                    <GroupCard
                      role={role}
                      cfg={cfg}
                      node={n}
                      index={index}
                      nodes={nodes}
                      modulesOff={modulesOff}
                      applyNodes={applyNodes}
                      update={(fn) => update(role, fn)}
                      matches={matches}
                      itemVisible={itemVisible}
                    />
                  </NodeShell>
                )
              )}
            </AnimatePresence>
          </ol>
        )}
      </section>

      <DirtyBar
        dirty={dirty}
        saving={persist.isPending}
        onSave={() => {
          setSaveError(null);
          persist.mutate();
        }}
        onDiscard={() => {
          setDrafts(toDrafts(saved));
          setSaveError(null);
        }}
        conflict={conflict ? { onReload: reloadLatest } : null}
        error={saveError}
        message={fx.unpublishedIn(dirtyRoles.map((r) => roleLabel(r)).join(', '))}
        saveLabel={ux.yayinla}
      />

      <NavHistorySheet open={historyOpen} onOpenChange={setHistoryOpen} onLoad={loadFromHistory} />

      <Dialog open={diffOpen} onOpenChange={setDiffOpen}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{nx.publishTitle}</DialogTitle>
            <DialogDescription>{nx.publishDesc}</DialogDescription>
          </DialogHeader>
          {dirtyRoles.length === 0 ? (
            <p className="text-sm text-fg-muted">{nx.noUnpublished}</p>
          ) : (
            <div className="space-y-4">
              {dirtyRoles.map((r) => (
                <div key={r}>
                  <h3 className="text-sm font-semibold text-fg">{roleLabel(r)}</h3>
                  <ul className="mt-1 space-y-0.5 text-sm text-fg-muted">
                    {describeRoleDiff(r, saved.roles[r], drafts[r]).map((line, i) => (
                      <li key={i}>• {line}</li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </PanelPage>
  );
}

// ───────────────────────────── Parçalar ─────────────────────────────

function NodeShell({ children }: { children: React.ReactNode }) {
  const motion = useMotionPolicy();
  return (
    <Motion.li
      layout={motion.reduce ? false : 'position'}
      initial={motion.reduce ? false : { opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={motion.reduce ? undefined : { opacity: 0 }}
      transition={{ duration: motion.reduce ? 0 : DURATION.base, ease: EASE.standard }}
    >
      {children}
    </Motion.li>
  );
}

type UpdateFn = (fn: (c: RoleConfig) => RoleConfig) => void;

function MoveButtons({ label, canUp, canDown, onUp, onDown }: { label: string; canUp: boolean; canDown: boolean; onUp: () => void; onDown: () => void }) {
  const fx = useNavStudioCopy().fx;
  return (
    <div className="flex shrink-0 items-center">
      <IconButton aria-label={fx.moveUp(label)} icon={<ArrowUp />} size="sm" disabled={!canUp} onClick={onUp} />
      <IconButton aria-label={fx.moveDown(label)} icon={<ArrowDown />} size="sm" disabled={!canDown} onClick={onDown} />
    </div>
  );
}

function GroupCard({
  role,
  cfg,
  node,
  index,
  nodes,
  modulesOff,
  applyNodes,
  update,
  matches,
  itemVisible,
}: {
  role: StudioRole;
  cfg: RoleConfig;
  node: Extract<EditorNode, { kind: 'group' }>;
  index: number;
  nodes: EditorNode[];
  modulesOff: string[];
  applyNodes: (next: EditorNode[], focusId: string) => void;
  update: UpdateFn;
  matches: (r: NavRoute) => boolean;
  itemVisible: (it: EditorItem) => boolean;
}) {
  const fx = useNavStudioCopy().fx;
  const ux = useNavStudioCopy().ui;
  const nx = useNavStudioCopy();
  const def = groupsForRole(role).find((g) => g.id === node.groupId);
  const base = def?.label ?? { tr: node.groupId, en: node.groupId };
  const label = cfg.groupLabels[node.groupId] ?? {};
  const customized = !!(label.tr?.trim() && label.tr.trim() !== base.tr) || !!(label.en?.trim() && label.en.trim() !== base.en);
  const Icon = def ? navIcon(def.icon) : Navigation;
  const setLabel = (lang: 'tr' | 'en', v: string) =>
    update((c) => ({ ...c, groupLabels: { ...c.groupLabels, [node.groupId]: { ...(c.groupLabels[node.groupId] ?? {}), [lang]: v } } }));
  const lastIndex = nodes.length - 1;
  const items = node.items.map((it, i) => ({ it, i })).filter(({ it }) => itemVisible(it));
  const headingId = `nav-group-${node.groupId}`;

  return (
    <section aria-labelledby={headingId} className="rounded-card border border-border bg-surface-1">
      <div className="flex flex-wrap items-start gap-3 border-b border-border p-3">
        <Icon className="mt-2.5 h-5 w-5 shrink-0 text-fg-muted" aria-hidden />
        <div className="min-w-0 flex-1 space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <h2 id={headingId} className="text-sm font-semibold text-fg">
              {label.tr?.trim() || base.tr}
            </h2>
            <span className="text-xs text-fg-muted">{fx.itemCount(node.items.length)}</span>
            {customized && <StatusBadge label={ux.ozellestirildi} tone="info" size="sm" />}
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            <label className="block text-xs text-fg-muted">
              {ux.turkceAd}
              <Input
                value={label.tr ?? ''}
                maxLength={60}
                placeholder={base.tr}
                onChange={(e) => setLabel('tr', e.target.value)}
                className="mt-1 min-h-11 sm:min-h-10"
              />
            </label>
            <label className="block text-xs text-fg-muted">
              {ux.ingilizceAd}
              <Input
                value={label.en ?? ''}
                maxLength={60}
                placeholder={base.en}
                lang="en"
                onChange={(e) => setLabel('en', e.target.value)}
                className="mt-1 min-h-11 sm:min-h-10"
              />
            </label>
          </div>
          <p className="text-xs text-fg-muted">{nx.emptyLangHint}</p>
        </div>
        <div className="flex items-center gap-1">
          {customized && (
            <IconButton
              aria-label={fx.resetGroupName(base.tr)}
              icon={<RotateCcw />}
              size="sm"
              onClick={() =>
                update((c) => {
                  const next = { ...c.groupLabels };
                  delete next[node.groupId];
                  return { ...c, groupLabels: next };
                })
              }
            />
          )}
          <MoveButtons
            label={`${base.tr} grubu`}
            canUp={index > 0}
            canDown={index < lastIndex && node.items.length > 0}
            onUp={() => applyNodes(moveNode(nodes, index, -1), node.items[0]?.route.id ?? '')}
            onDown={() => applyNodes(moveNode(nodes, index, 1), node.items[0]?.route.id ?? '')}
          />
        </div>
      </div>
      {node.items.length === 0 ? (
        <p className="p-3 text-sm text-fg-muted">{nx.emptyGroup}</p>
      ) : (
        <ol className="divide-y divide-border">
          {items.map(({ it, i }) => (
            <li key={it.route.id}>
              <ItemRow
                role={role}
                cfg={cfg}
                item={it}
                modulesOff={modulesOff}
                groupsAvailable
                canUp={i > 0}
                canDown={i < node.items.length - 1}
                onUp={() => applyNodes(moveInGroup(nodes, index, i, -1), it.route.id)}
                onDown={() => applyNodes(moveInGroup(nodes, index, i, 1), it.route.id)}
                nodes={nodes}
                applyNodes={applyNodes}
                update={update}
                matches={matches}
                flat
              />
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

function ItemRow({
  role,
  cfg,
  item,
  modulesOff,
  groupsAvailable,
  canUp,
  canDown,
  onUp,
  onDown,
  nodes,
  applyNodes,
  update,
  matches,
  flat = false,
}: {
  role: StudioRole;
  cfg: RoleConfig;
  item: EditorItem;
  modulesOff: string[];
  groupsAvailable: boolean;
  canUp: boolean;
  canDown: boolean;
  onUp: () => void;
  onDown: () => void;
  nodes: EditorNode[];
  applyNodes: (next: EditorNode[], focusId: string) => void;
  update: UpdateFn;
  matches: (r: NavRoute) => boolean;
  flat?: boolean;
}) {
  const fx = useNavStudioCopy().fx;
  const ux = useNavStudioCopy().ui;
  const nx = useNavStudioCopy();
  const r = item.route;
  const gid = effectiveGroup(r, cfg);
  const regrouped = (r.group ?? '') !== gid;
  const groups = groupsForRole(role);
  const groupName = (id: string) => cfg.groupLabels[id]?.tr?.trim() || groupLabelDefault(role, id)?.tr || id;
  const children = item.children.map((c, i) => ({ c, i })).filter(({ c }) => matches(c) || matches(r));

  return (
    <div className={cn(!flat && 'rounded-card border border-border bg-surface-1')}>
      <RouteLine
        role={role}
        cfg={cfg}
        route={r}
        modulesOff={modulesOff}
        update={update}
        badge={regrouped ? <StatusBadge label={ux.grubuDegisti} tone="info" size="sm" /> : null}
        controls={
          <>
            {groupsAvailable && (
              <Select
                value={gid || UNGROUPED}
                onValueChange={(v) => applyNodes(moveToGroup(nodes, r.id, v === UNGROUPED ? '' : v), r.id)}
              >
                <SelectTrigger aria-label={fx.groupOf(r.label.tr)} className="h-11 w-full min-w-0 sm:h-9 sm:w-44">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={UNGROUPED}>{nx.ungrouped}</SelectItem>
                  {groups.map((g) => (
                    <SelectItem key={g.id} value={g.id}>
                      {groupName(g.id)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            <MoveButtons label={r.label.tr} canUp={canUp} canDown={canDown} onUp={onUp} onDown={onDown} />
          </>
        }
      />
      {children.length > 0 && (
        <ol aria-label={fx.subPagesOf(r.label.tr)} className="border-t border-border bg-surface-2/40 pl-6">
          {children.map(({ c, i }) => (
            <li key={c.id} className="border-b border-border last:border-b-0">
              <RouteLine
                role={role}
                cfg={cfg}
                route={c}
                modulesOff={modulesOff}
                update={update}
                compact
                controls={
                  <MoveButtons
                    label={c.label.tr}
                    canUp={i > 0}
                    canDown={i < item.children.length - 1}
                    onUp={() => applyNodes(moveChild(nodes, r.id, i, -1), c.id)}
                    onDown={() => applyNodes(moveChild(nodes, r.id, i, 1), c.id)}
                  />
                }
              />
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

function RouteLine({
  role,
  cfg,
  route,
  modulesOff,
  update,
  controls,
  badge,
  compact = false,
}: {
  role: StudioRole;
  cfg: RoleConfig;
  route: NavRoute;
  modulesOff: string[];
  update: UpdateFn;
  controls: React.ReactNode;
  badge?: React.ReactNode;
  compact?: boolean;
}) {
  const fx = useNavStudioCopy().fx;
  const ux = useNavStudioCopy().ui;
  const nx = useNavStudioCopy();
  const Icon = navIcon(route.icon);
  const canHide = supportsVisibility(role) && !!route.menuKey;
  const hidden = canHide && cfg.hidden.includes(route.menuKey as string);
  const moduleOff = !!route.moduleKey && modulesOff.includes(route.moduleKey);
  const toggle = (on: boolean) =>
    update((c) => {
      const key = route.menuKey as string;
      const set = new Set(c.hidden);
      if (on) set.delete(key);
      else set.add(key);
      return { ...c, hidden: Array.from(set).sort() };
    });

  return (
    <div className={cn('flex flex-wrap items-center gap-x-3 gap-y-2 p-3', compact && 'py-2', (hidden || moduleOff) && 'bg-surface-2/60')}>
      <Icon className={cn('h-5 w-5 shrink-0', hidden || moduleOff ? 'text-fg-muted' : 'text-fg')} aria-hidden />
      <div className="min-w-0 flex-1 basis-40">
        <p className={cn('truncate text-sm font-medium', hidden ? 'text-fg-muted line-through decoration-1' : 'text-fg')}>{route.label.tr}</p>
        <p className="truncate text-xs text-fg-muted">
          <span lang="en">{route.label.en}</span> · <code className="text-[11px]">{route.href}</code>
        </p>
        <div className="mt-1 flex flex-wrap gap-1 empty:hidden">
          {badge}
          {hidden && <StatusBadge label={ux.gizli} tone="warning" size="sm" icon={EyeOff} />}
          {moduleOff && (
            <Link href="/admin/features" className="rounded-chip focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
              <StatusBadge label={ux.modulKapaliModuller} tone="neutral" size="sm" />
            </Link>
          )}
          {route.teamOnly && <StatusBadge label={ux.yalnizEkip} tone="neutral" size="sm" icon={Users2} />}
        </div>
      </div>
      <div className="flex w-full items-center justify-end gap-2 sm:w-auto">
        {canHide && (
          <label className="flex min-h-11 items-center gap-2 text-xs text-fg-muted sm:min-h-9">
            <Eye className="h-4 w-4" aria-hidden />
            <span className="sr-only sm:not-sr-only">{nx.visible}</span>
            <Switch checked={!hidden} onCheckedChange={toggle} aria-label={fx.showInMenu(route.label.tr)} />
          </label>
        )}
        {controls}
      </div>
    </div>
  );
}
