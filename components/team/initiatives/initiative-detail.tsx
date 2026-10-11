'use client';

import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Progress } from '@/components/ui/progress';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { IconButton } from '@/components/ds/a11y';
import { Timeline } from '@/components/ds/data';
import { QueryState } from '@/components/states';
import { cn } from '@/lib/utils';
import { INITIATIVE_PHASES, PHASE_META } from '@/lib/team/constants';
import { relativeTeamTime } from '@/lib/team/dates';
import { errorMessage, teamFetch } from '../lib/api';
import { API, teamKeys } from '../lib/queries';
import { useWorkspace } from '../workspace-context';
import { MemberAvatar, PhaseBadge, displayName } from '../shared';
import type { InitiativeDto } from '../lib/types';
import { useTeamCopy } from '../copy';

type Detail = {
  item: InitiativeDto;
  milestones: Array<{ id: string; text: string; done: boolean }>;
  notes: Array<{ id: string; text: string; createdAt: string; author: { id: string; name: string | null; image: string | null } | null; canDelete: boolean }>;
  history: Array<{ id: string; detail: string | null; createdAt: string; actorName: string }>;
};

function useInitiative(id: string) {
  return useQuery({
    queryKey: teamKeys.initiative(id),
    queryFn: () => teamFetch<Detail>(`${API}/initiatives/${encodeURIComponent(id)}`),
    enabled: !!id,
  });
}

export function InitiativeTitle({ id }: { id: string }) {
  const q = useInitiative(id);
  return <>{q.data?.item.title ?? (q.isError ? 'Girişim açılamadı' : 'Girişim')}</>;
}

/** Girişim detayı: düzenleme (yönetici), kilometre taşları, karar notları, değişiklik geçmişi. */
export function InitiativeDetail({ id, onClose }: { id: string; onClose: () => void }) {
  const q = useInitiative(id);
  return (
    <QueryState
      query={q}
      skeleton="detail"
      error={{ title: 'Girişim açılamadı', description: 'Silinmiş olabilir.', action: <Button variant="outline" onClick={onClose}>Kapat</Button> }}
    >
      {(d) => <Body d={d} />}
    </QueryState>
  );
}

function Body({ d }: { d: Detail }) {
  const tx = useTeamCopy();
  const { can, members, departments } = useWorkspace();
  const qc = useQueryClient();
  const item = d.item;
  const edit = can.manageInitiatives && !item.archivedAt;
  const [title, setTitle] = useState(item.title);
  const [desc, setDesc] = useState(item.description ?? '');
  const [milestone, setMilestone] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => setTitle(item.title), [item.title]);
  useEffect(() => setDesc(item.description ?? ''), [item.description]);

  const refresh = (data?: Detail) => {
    if (data) qc.setQueryData(teamKeys.initiative(item.id), data);
    else void qc.invalidateQueries({ queryKey: teamKeys.initiative(item.id) });
    void qc.invalidateQueries({ queryKey: ['team', 'initiatives'] });
  };
  const patch = async (body: Record<string, unknown>) => {
    try {
      await teamFetch(`${API}/initiatives?id=${encodeURIComponent(item.id)}`, { method: 'PATCH', json: body });
      refresh();
    } catch (err) {
      toast.error(errorMessage(err));
    }
  };
  const op = async (body: Record<string, unknown>) => {
    try {
      const data = await teamFetch<Detail>(`${API}/initiatives/${encodeURIComponent(item.id)}`, { method: 'POST', json: body });
      refresh(data);
      return true;
    } catch (err) {
      toast.error(errorMessage(err));
      return false;
    }
  };

  return (
    <div className="space-y-5">
      {edit ? (
        <Input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onBlur={() => {
            const v = title.trim();
            if (v.length >= 2 && v !== item.title) void patch({ title: v });
            else setTitle(item.title);
          }}
          aria-label="Girişim başlığı"
          className="qx-body h-11 font-semibold"
          maxLength={200}
        />
      ) : null}

      <section className="grid gap-3 rounded-card border border-subtle p-3 sm:grid-cols-2" aria-label="Girişim özellikleri">
        <div className="space-y-1">
          <span className="qx-caption text-fg-muted">{tx.stage}</span>
          {edit ? (
            <Select value={item.phase} onValueChange={(v) => void patch({ phase: v })}>
              <SelectTrigger className="h-9" aria-label="Aşama">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {INITIATIVE_PHASES.map((p) => (
                  <SelectItem key={p} value={p}>
                    {PHASE_META[p].label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : (
            <div>
              <PhaseBadge phase={item.phase} size="md" />
            </div>
          )}
        </div>
        <div className="space-y-1">
          <span className="qx-caption text-fg-muted">Sorumlu</span>
          {edit ? (
            <Select value={item.owner?.id ?? '__none'} onValueChange={(v) => void patch({ ownerId: v === '__none' ? null : v })}>
              <SelectTrigger className="h-9" aria-label="Sorumlu">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none">Sorumlu yok</SelectItem>
                {members
                  .filter((m) => m.inTeam || m.isAdmin)
                  .map((m) => (
                    <SelectItem key={m.id} value={m.id}>
                      {displayName(m)}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
          ) : (
            <span className="qx-small flex items-center gap-1.5 text-fg">
              <MemberAvatar user={item.owner} size="xs" /> {item.owner ? displayName(item.owner) : 'Sorumlu yok'}
            </span>
          )}
        </div>
        <div className="space-y-1">
          <label htmlFor={`target-${item.id}`} className="qx-caption text-fg-muted">
            Hedef tarih
          </label>
          {edit ? (
            <Input id={`target-${item.id}`} type="date" className="h-9" value={item.targetDay ?? ''} onChange={(e) => void patch({ targetDate: e.target.value || null })} />
          ) : (
            <p className="qx-small text-fg">{item.targetDay ?? 'Belirlenmedi'}</p>
          )}
        </div>
        <div className="space-y-1">
          <span className="qx-caption text-fg-muted">Tema (departman)</span>
          {edit ? (
            <Select value={item.department ?? '__none'} onValueChange={(v) => void patch({ department: v === '__none' ? null : v })}>
              <SelectTrigger className="h-9" aria-label="Tema departmanı">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none">Genel</SelectItem>
                {departments
                  .filter((x) => x.isActive)
                  .map((x) => (
                    <SelectItem key={x.slug} value={x.slug}>
                      {x.name}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
          ) : (
            <p className="qx-small text-fg">{departments.find((x) => x.slug === item.department)?.name ?? 'Genel'}</p>
          )}
        </div>
        {item.shippedAt && <p className="qx-caption text-success sm:col-span-2">Yayına çıktı: {relativeTeamTime(item.shippedAt)}</p>}
      </section>

      <section aria-label="Açıklama" className="space-y-2">
        {edit ? (
          <Textarea
            value={desc}
            onChange={(e) => setDesc(e.target.value)}
            onBlur={() => {
              if ((desc.trim() || '') !== (item.description ?? '')) void patch({ description: desc.trim() || null });
            }}
            rows={4}
            placeholder="Neden önemli, başarı nasıl ölçülecek?"
            aria-label="Açıklama"
          />
        ) : (
          <p className="qx-body whitespace-pre-wrap text-fg">{item.description || 'Açıklama yok.'}</p>
        )}
      </section>

      <section aria-labelledby={`ms-${item.id}`} className="space-y-2">
        <h3 id={`ms-${item.id}`} className="qx-small font-semibold text-fg">
          Kilometre taşları{' '}
          <span className="qx-num font-normal text-fg-muted">
            {item.milestones.done}/{item.milestones.total}
          </span>
        </h3>
        {item.milestones.total > 0 && <Progress value={item.milestones.pct ?? 0} className="h-1.5" aria-label={`İlerleme %${item.milestones.pct ?? 0}`} />}
        <ul className="space-y-1">
          {d.milestones.map((m) => (
            <li key={m.id} className="flex items-center gap-2 rounded-control px-1 py-1 hover:bg-surface-2">
              <Checkbox id={`m-${m.id}`} checked={m.done} disabled={!edit} onCheckedChange={(v) => void op({ op: 'toggle_milestone', itemId: m.id, done: v === true })} className="h-5 w-5" />
              <label htmlFor={`m-${m.id}`} className={cn('qx-small flex-1', m.done ? 'text-fg-muted line-through' : 'text-fg')}>
                {m.text}
              </label>
              {edit && <IconButton aria-label={`"${m.text}" kilometre taşını sil`} icon={<Trash2 />} size="sm" onClick={() => void op({ op: 'delete_milestone', itemId: m.id })} />}
            </li>
          ))}
        </ul>
        {edit && (
          <form
            className="flex gap-2"
            onSubmit={async (e) => {
              e.preventDefault();
              if (!milestone.trim()) return;
              setBusy(true);
              if (await op({ op: 'add_milestone', text: milestone.trim() })) setMilestone('');
              setBusy(false);
            }}
          >
            <Input value={milestone} onChange={(e) => setMilestone(e.target.value)} placeholder="Kilometre taşı ekle" aria-label="Yeni kilometre taşı" maxLength={300} />
            <Button type="submit" variant="outline" className="shrink-0 gap-1.5" disabled={busy || !milestone.trim()}>
              <Plus className="h-4 w-4" aria-hidden /> Ekle
            </Button>
          </form>
        )}
      </section>

      <section aria-labelledby={`nt-${item.id}`} className="space-y-2">
        <h3 id={`nt-${item.id}`} className="qx-small font-semibold text-fg">
          Karar notları <span className="qx-num font-normal text-fg-muted">{d.notes.length}</span>
        </h3>
        <form
          className="space-y-2"
          onSubmit={async (e) => {
            e.preventDefault();
            if (!note.trim()) return;
            setBusy(true);
            if (await op({ op: 'add_note', text: note.trim() })) setNote('');
            setBusy(false);
          }}
        >
          <Textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} placeholder="Karar, risk ya da bağlam notu" aria-label="Not" maxLength={4000} />
          <Button type="submit" size="sm" className="h-9" disabled={busy || !note.trim()}>
            Not ekle
          </Button>
        </form>
        <ul className="space-y-3">
          {d.notes.map((n) => (
            <li key={n.id} className="flex gap-2">
              <MemberAvatar user={n.author} size="sm" />
              <div className="min-w-0 flex-1">
                <p className="qx-caption text-fg-muted">
                  <span className="font-semibold text-fg">{displayName(n.author, 'Silinmiş kullanıcı')}</span> · {relativeTeamTime(n.createdAt)}
                </p>
                <p className="qx-small whitespace-pre-wrap text-fg">{n.text}</p>
              </div>
              {n.canDelete && <IconButton aria-label="Notu sil" icon={<Trash2 />} size="sm" onClick={() => void op({ op: 'delete_note', noteId: n.id })} />}
            </li>
          ))}
        </ul>
      </section>

      <details className="rounded-card border border-subtle">
        <summary className="qx-small flex min-h-11 cursor-pointer items-center px-3 font-semibold text-fg">Değişiklik geçmişi ({d.history.length})</summary>
        <div className="border-t border-subtle px-3 py-2">
          <Timeline dense groupByDay ariaLabel="Girişim geçmişi" events={d.history.map((h) => ({ id: h.id, at: h.createdAt, title: h.detail ?? '', actor: h.actorName }))} />
        </div>
      </details>
    </div>
  );
}
