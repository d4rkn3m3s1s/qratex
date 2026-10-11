'use client';

import { useMemo, useState } from 'react';
import dynamic from 'next/dynamic';
import { useQueryClient } from '@tanstack/react-query';
import { Archive, Flag, MoreHorizontal, Plus } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { IconButton } from '@/components/ds/a11y';
import { DetailSheet, useDetailSheet } from '@/components/ds/data';
import { QueryState } from '@/components/states';
import { cn } from '@/lib/utils';
import { INITIATIVE_BOARD_PHASES, INITIATIVE_PHASES, type InitiativePhase } from '@/lib/team/constants';
import { shortDayLabel } from '@/lib/team/dates';
import { errorMessage, teamFetch } from '../lib/api';
import { API, teamKeys, useInitiatives } from '../lib/queries';
import { useWorkspace } from '../workspace-context';
import { DeptChip, MemberAvatar, displayName } from '../shared';
import type { InitiativeDto } from '../lib/types';
import { InitiativeDetail, InitiativeTitle } from './initiative-detail';
import { useTeamCopy, useTeamLabels } from '../copy';

const InitiativeDialog = dynamic(() => import('./initiative-dialog'), { ssr: false });

/**
 * Girişimler (eski /admin/roadmap) — Sonra · Sırada · Şimdi · Yayında. Statik JSON yerine
 * düzenlenebilir veritabanı kaydı; ilerleme kilometre taşlarından TÜRETİLİR (denetim roadmap
 * SAHTE #15 "yakın plan", BOZUK #17 müşteri/bayi linkleri, EKSİK #28-31). Tüm ekip okur,
 * yönetici düzenler. Aşama değişikliği menüden (klavye) ya da masaüstünde sürükleyerek.
 */
export function InitiativesView() {
  const tm = useTeamLabels();
  const tf = useTeamCopy().fx;
  const tu = useTeamCopy().ui;
  const tx = useTeamCopy();
  const { can, departments } = useWorkspace();
  const qc = useQueryClient();
  const [showArchived, setShowArchived] = useState(false);
  const q = useInitiatives(showArchived);
  const sheet = useDetailSheet('initiative');
  const [createOpen, setCreateOpen] = useState(false);
  const [dragId, setDragId] = useState<string | null>(null);
  const [over, setOver] = useState<InitiativePhase | null>(null);

  const items = useMemo(() => q.data?.items ?? [], [q.data]);
  const dropped = items.filter((i) => i.phase === 'dropped');

  const patch = async (item: InitiativeDto, body: Record<string, unknown>, msg: string) => {
    try {
      await teamFetch(`${API}/initiatives?id=${encodeURIComponent(item.id)}`, { method: 'PATCH', json: body });
      toast.success(msg, { description: item.title });
      void qc.invalidateQueries({ queryKey: ['team', 'initiatives'] });
      void qc.invalidateQueries({ queryKey: teamKeys.initiative(item.id) });
    } catch (err) {
      toast.error(errorMessage(err));
    }
  };

  const card = (i: InitiativeDto) => (
    <li key={i.id}>
      <div
        draggable={can.manageInitiatives && !showArchived}
        onDragStart={(e) => {
          e.dataTransfer.setData('text/plain', i.id);
          setDragId(i.id);
        }}
        onDragEnd={() => {
          setDragId(null);
          setOver(null);
        }}
        className="flex flex-col gap-2 rounded-card border border-subtle bg-surface-1 p-3 transition-colors duration-fast hover:border-strong"
      >
        <div className="flex items-start gap-2">
          <button
            type="button"
            onClick={() => sheet.open(i.id)}
            className="qx-small min-w-0 flex-1 rounded-sm text-left font-semibold text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {i.title}
          </button>
          {can.manageInitiatives && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <IconButton aria-label={tf.actionsFor(i.title)} icon={<MoreHorizontal />} size="sm" />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-52">
                <DropdownMenuLabel>{tx.moveToStage}</DropdownMenuLabel>
                {INITIATIVE_PHASES.filter((p) => p !== i.phase).map((p) => (
                  <DropdownMenuItem key={p} onSelect={() => void patch(i, { phase: p }, tf.stageSet(tm.PHASE_META[p].label))}>
                    {tm.PHASE_META[p].label}
                  </DropdownMenuItem>
                ))}
                <DropdownMenuSeparator />
                <DropdownMenuItem onSelect={() => void patch(i, { archived: !i.archivedAt }, i.archivedAt ? tu.arsivdenCikarildi : tu.arsivlendi)}>
                  <Archive className="mr-2 h-4 w-4" aria-hidden /> {i.archivedAt ? tu.arsivdenCikar : tu.arsivle}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
        {i.description && <p className="qx-caption line-clamp-2 text-fg-muted">{i.description}</p>}
        {i.milestones.total > 0 ? (
          <div className="space-y-1">
            <div className="qx-caption flex justify-between text-fg-muted">
              <span>{tx.milestones}</span>
              <span className="qx-num">
                {i.milestones.done}/{i.milestones.total}
              </span>
            </div>
            <Progress value={i.milestones.pct ?? 0} className="h-1.5" aria-label={tf.progressPct(i.milestones.pct ?? 0)} />
          </div>
        ) : (
          <p className="qx-caption text-fg-subtle">{tx.noMilestones}</p>
        )}
        <div className="flex min-w-0 flex-wrap items-center gap-1.5">
          {i.targetDay && (
            <span className={cn('qx-caption inline-flex items-center gap-1 rounded-chip px-1.5 py-0.5', i.targetOverdue ? 'bg-danger-subtle text-danger' : 'bg-surface-2 text-fg-muted')}>
              <Flag className="h-3 w-3" aria-hidden /> Hedef {shortDayLabel(i.targetDay)}
              {i.targetOverdue ? ' · gecikti' : ''}
            </span>
          )}
          <DeptChip slug={i.department} departments={departments} />
        </div>
        <div className="flex items-center gap-1.5">
          <MemberAvatar user={i.owner} size="xs" />
          <span className="qx-caption truncate text-fg-muted">{i.owner ? displayName(i.owner) : 'Sorumlu yok'}</span>
        </div>
      </div>
    </li>
  );

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="qx-small text-fg-muted">{tx.initiativesIntro}</p>
        <div className="flex flex-wrap gap-2">
          <Button variant={showArchived ? 'secondary' : 'outline'} size="sm" className="h-9 gap-1.5" aria-pressed={showArchived} onClick={() => setShowArchived((v) => !v)}>
            <Archive className="h-3.5 w-3.5" aria-hidden /> {tu.arsiv}
          </Button>
          {can.manageInitiatives && (
            <Button size="sm" className="h-9 gap-1.5" onClick={() => setCreateOpen(true)}>
              <Plus className="h-3.5 w-3.5" aria-hidden /> {tu.girisimEkle}
            </Button>
          )}
        </div>
      </div>
      <QueryState
        query={q}
        skeleton="cards"
        isEmpty={(d) => d.items.length === 0}
        empty={{
          variant: 'first-use',
          title: showArchived ? tu.arsivdeGirisimYok : tu.henuzGirisimYok,
          description: showArchived ? undefined : can.manageInitiatives ? tu.ilkGirisimiEkleBaslik : tu.yoneticilerGirisimEkledigindeBurada,
          action: can.manageInitiatives && !showArchived ? <Button onClick={() => setCreateOpen(true)}>{tx.addInitiative}</Button> : undefined,
        }}
      >
        {() => (
          <>
            <div className="-mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-2 sm:mx-0 sm:px-0 lg:grid lg:grid-cols-4 lg:overflow-visible">
              {INITIATIVE_BOARD_PHASES.map((p) => {
                const list = items.filter((i) => i.phase === p);
                return (
                  <section
                    key={p}
                    aria-labelledby={`phase-${p}`}
                    className={cn(
                      'flex w-[85vw] max-w-[22rem] shrink-0 snap-start flex-col rounded-card border bg-surface-2/60 p-2 sm:w-[20rem] lg:w-auto lg:max-w-none',
                      over === p ? 'border-brand' : 'border-subtle'
                    )}
                    onDragOver={(e) => {
                      if (!dragId) return;
                      e.preventDefault();
                      setOver(p);
                    }}
                    onDragLeave={() => setOver((c) => (c === p ? null : c))}
                    onDrop={(e) => {
                      e.preventDefault();
                      const item = items.find((x) => x.id === dragId);
                      setDragId(null);
                      setOver(null);
                      if (item && item.phase !== p) void patch(item, { phase: p }, tf.stageSet(tm.PHASE_META[p].label));
                    }}
                  >
                    <header className="px-1.5 pb-2 pt-1">
                      <h3 id={`phase-${p}`} className="qx-small flex items-center justify-between font-semibold text-fg">
                        {tm.PHASE_META[p].label}
                        <span className="qx-caption qx-num rounded-chip bg-surface-1 px-1.5 py-0.5 text-fg-muted">{list.length}</span>
                      </h3>
                      <p className="qx-caption text-fg-muted">{tm.PHASE_META[p].description}</p>
                    </header>
                    <ul className="flex min-h-[5rem] flex-col gap-2">
                      {list.map(card)}
                      {list.length === 0 && <li className="qx-caption rounded-control border border-dashed border-subtle px-3 py-5 text-center text-fg-subtle">{tx.empty}</li>}
                    </ul>
                  </section>
                );
              })}
            </div>
            {dropped.length > 0 && (
              <details className="rounded-card border border-subtle">
                <summary className="qx-small flex min-h-11 cursor-pointer items-center px-3 font-semibold text-fg-muted">{tf.dropped(dropped.length)}</summary>
                <ul className="grid gap-2 p-2 sm:grid-cols-2 lg:grid-cols-4">{dropped.map(card)}</ul>
              </details>
            )}
          </>
        )}
      </QueryState>

      <DetailSheet paramKey="initiative" size="lg" title={(id) => <InitiativeTitle id={id} />}>
        {(id) => <InitiativeDetail id={id} onClose={sheet.close} />}
      </DetailSheet>
      {createOpen && <InitiativeDialog open={createOpen} onOpenChange={setCreateOpen} />}
    </div>
  );
}
