'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Pencil, Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { IconButton } from '@/components/ds/a11y';
import { StatusBadge } from '@/components/ds/data';
import { ConfirmAction, InlineError, QueryState } from '@/components/states';
import { TASK_PRIORITIES, TASK_STATUSES } from '@/lib/team/constants';
import { relativeTeamTime } from '@/lib/team/dates';
import { errorMessage, teamFetch } from '../lib/api';
import { API } from '../lib/queries';
import { useWorkspace } from '../workspace-context';
import { useDisplayName } from '../shared';
import { useTeamCopy, useTeamLabels } from '../copy';

type Rule = {
  id: string;
  name: string;
  enabled: boolean;
  triggerType: string;
  triggerValue: string | null;
  actionType: string;
  actionValue: string | null;
  department: string | null;
  createdByName: string | null;
  runs30d: number;
  errors30d: number;
  lastRunAt: string | null;
  lastError: string | null;
};

const SET_STATUS_TARGETS = ['todo', 'in_progress', 'review'] as const;

const EMPTY = { id: '', name: '', triggerType: 'status_changed', triggerValue: '', actionType: 'notify', actionValue: '', department: '' };

/**
 * Otomasyon kuralları (yönetici). Dört tetik de gerçekten çalışır (denetim SAHTE #12/#15:
 * "Görev oluşunca" ve "Gecikince" kaydediliyor ama hiç tetiklenmiyordu). "Durum değiştir"
 * görevi "Bitti"ye geçiremez — onay yöneticidedir. Son 30 günün çalışma/hata sayısı görünür.
 */
export default function AutomationsDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const dn = useDisplayName();
  const tm = useTeamLabels();
  const tv = useTeamCopy().ui2;
  const tf = useTeamCopy().fx;
  const tu = useTeamCopy().ui;
  const tx = useTeamCopy();
  const { members, departments } = useWorkspace();
  const [form, setForm] = useState(EMPTY);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState<Rule | null>(null);
  const list = useQuery({ queryKey: ['team', 'automations'], queryFn: () => teamFetch<{ items: Rule[] }>(`${API}/automations`), enabled: open });
  const team = members.filter((m) => m.inTeam || m.isAdmin);
  const editing = !!form.id;

  const valueLabel = (type: string, value: string | null) => {
    if (!value) return '';
    if (type === 'status_changed' || type === 'set_status') return tm.STATUS_META[value as keyof typeof tm.STATUS_META]?.label ?? value;
    if (type === 'set_priority') return tm.PRIORITY_META[value as keyof typeof tm.PRIORITY_META]?.label ?? value;
    if (type === 'assign' || type === 'assigned') return dn(members.find((m) => m.id === value) ?? null, tu.ayrilmisUye);
    return value;
  };

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      if (editing) {
        await teamFetch(`${API}/automations?id=${encodeURIComponent(form.id)}`, {
          method: 'PUT',
          json: { name: form.name.trim(), triggerValue: form.triggerValue || null, actionValue: form.actionValue || null, department: form.department || null },
        });
        toast.success(tu.kuralGuncellendi);
      } else {
        await teamFetch(`${API}/automations`, {
          method: 'POST',
          json: {
            name: form.name.trim(),
            triggerType: form.triggerType,
            triggerValue: form.triggerValue || null,
            actionType: form.actionType,
            actionValue: form.actionValue || null,
            department: form.department || null,
          },
        });
        toast.success(tu.kuralOlusturuldu);
      }
      setForm(EMPTY);
      void list.refetch();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  const toggle = async (r: Rule, enabled: boolean) => {
    try {
      await teamFetch(`${API}/automations?id=${encodeURIComponent(r.id)}`, { method: 'PUT', json: { enabled } });
      void list.refetch();
    } catch (err) {
      toast.error(errorMessage(err));
    }
  };

  const triggerValueControl =
    form.triggerType === 'status_changed' ? (
      <Select value={form.triggerValue || '__any'} onValueChange={(v) => setForm({ ...form, triggerValue: v === '__any' ? '' : v })}>
        <SelectTrigger className="h-10" aria-label={tu.hangiDurumaGecince}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="__any">{tv.herhangiBirDuruma}</SelectItem>
          {TASK_STATUSES.map((s) => (
            <SelectItem key={s} value={s}>
              {tm.STATUS_META[s].label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    ) : form.triggerType === 'assigned' ? (
      <Select value={form.triggerValue || '__any'} onValueChange={(v) => setForm({ ...form, triggerValue: v === '__any' ? '' : v })}>
        <SelectTrigger className="h-10" aria-label={tu.kimeAtaninca}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="__any">{tv.herhangiBirine}</SelectItem>
          {team.map((m) => (
            <SelectItem key={m.id} value={m.id}>
              {dn(m)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    ) : null;

  const actionValueControl =
    form.actionType === 'add_tag' ? (
      <Input value={form.actionValue} onChange={(e) => setForm({ ...form, actionValue: e.target.value })} placeholder={tu.etiket} aria-label={tu.eklenecekEtiket} maxLength={40} className="h-10" />
    ) : form.actionType === 'set_priority' ? (
      <Select value={form.actionValue || undefined} onValueChange={(v) => setForm({ ...form, actionValue: v })}>
        <SelectTrigger className="h-10" aria-label={tu.atanacakOncelik}>
          <SelectValue placeholder={tu.oncelikSec} />
        </SelectTrigger>
        <SelectContent>
          {TASK_PRIORITIES.map((p) => (
            <SelectItem key={p} value={p}>
              {tm.PRIORITY_META[p].label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    ) : form.actionType === 'assign' ? (
      <Select value={form.actionValue || undefined} onValueChange={(v) => setForm({ ...form, actionValue: v })}>
        <SelectTrigger className="h-10" aria-label={tu.atanacakKisi}>
          <SelectValue placeholder={tu.kisiSec} />
        </SelectTrigger>
        <SelectContent>
          {team.map((m) => (
            <SelectItem key={m.id} value={m.id}>
              {dn(m)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    ) : form.actionType === 'set_status' ? (
      <Select value={form.actionValue || undefined} onValueChange={(v) => setForm({ ...form, actionValue: v })}>
        <SelectTrigger className="h-10" aria-label={tu.yeniDurum}>
          <SelectValue placeholder={tu.durumSec} />
        </SelectTrigger>
        <SelectContent>
          {SET_STATUS_TARGETS.map((s) => (
            <SelectItem key={s} value={s}>
              {tm.STATUS_META[s].label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    ) : null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>{tx.automations}</DialogTitle>
          <DialogDescription>{tx.automationsDesc}</DialogDescription>
        </DialogHeader>

        <QueryState
          query={list}
          skeleton="list"
          isEmpty={(d) => d.items.length === 0}
          empty={{ compact: true, title: tu.henuzKuralYok, description: tu.asagidanIlkKuraliniOlustur }}
        >
          {(d) => (
            <ul className="space-y-2">
              {d.items.map((r) => (
                <li key={r.id} className="flex flex-wrap items-start gap-3 rounded-card border border-subtle p-3">
                  <Switch checked={r.enabled} onCheckedChange={(v) => void toggle(r, v)} aria-label={tf.ruleToggle(r.name, r.enabled)} className="mt-0.5" />
                  <div className="min-w-0 flex-1 space-y-1">
                    <p className="qx-small font-semibold text-fg">{r.name}</p>
                    <p className="qx-caption text-fg-muted">
                      {tf.triggers[r.triggerType] ?? r.triggerType}
                      {r.triggerValue ? ` (${valueLabel(r.triggerType, r.triggerValue)})` : ''} → {tf.actions[r.actionType] ?? r.actionType}
                      {r.actionValue ? ` (${valueLabel(r.actionType, r.actionValue)})` : ''}
                      {r.department ? ` · ${departments.find((x) => x.slug === r.department)?.name ?? tf.removedDept}` : ''}
                    </p>
                    <div className="flex flex-wrap items-center gap-1.5">
                      <StatusBadge label={tf.runs30d(r.runs30d)} tone="neutral" icon={null} size="sm" />
                      {r.errors30d > 0 && <StatusBadge label={`${r.errors30d} hata`} tone="danger" size="sm" title={r.lastError ?? undefined} />}
                      {r.lastRunAt && <span className="qx-caption text-fg-muted">son: {relativeTeamTime(r.lastRunAt)}</span>}
                    </div>
                  </div>
                  <div className="flex gap-1">
                    <IconButton
                      aria-label={tf.editRule(r.name)}
                      icon={<Pencil />}
                      size="sm"
                      onClick={() =>
                        setForm({
                          id: r.id,
                          name: r.name,
                          triggerType: r.triggerType,
                          triggerValue: r.triggerValue ?? '',
                          actionType: r.actionType,
                          actionValue: r.actionValue ?? '',
                          department: r.department ?? '',
                        })
                      }
                    />
                    <IconButton aria-label={tf.deleteRule(r.name)} icon={<Trash2 />} size="sm" onClick={() => setDeleting(r)} />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </QueryState>

        <form
          className="space-y-3 rounded-card border border-subtle bg-surface-2 p-3"
          onSubmit={(e) => {
            e.preventDefault();
            void save();
          }}
        >
          <p className="qx-small font-semibold text-fg">{editing ? tu.kuraliDuzenle : 'Yeni kural'}</p>
          <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder={tu.kuralAdi} aria-label={tu.kuralAdi} maxLength={80} required />
          <div className="grid gap-2 sm:grid-cols-2">
            <Select value={form.triggerType} disabled={editing} onValueChange={(v) => setForm({ ...form, triggerType: v, triggerValue: '' })}>
              <SelectTrigger className="h-10" aria-label={tu.tetik}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(tf.triggers).map(([k, v]) => (
                  <SelectItem key={k} value={k}>
                    {v}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {triggerValueControl ?? <span className="qx-caption self-center text-fg-muted">{tx.triggerNoValue}</span>}
            <Select value={form.actionType} disabled={editing} onValueChange={(v) => setForm({ ...form, actionType: v, actionValue: '' })}>
              <SelectTrigger className="h-10" aria-label={tu.aksiyon}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(tf.actions).map(([k, v]) => (
                  <SelectItem key={k} value={k}>
                    {v}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {actionValueControl ?? <span className="qx-caption self-center text-fg-muted">{tx.notifyAllManagers}</span>}
            <Select value={form.department || '__all'} onValueChange={(v) => setForm({ ...form, department: v === '__all' ? '' : v })}>
              <SelectTrigger className="h-10" aria-label={tu.departmanKapsami}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all">{tx.allDepartments}</SelectItem>
                {departments
                  .filter((d) => d.isActive)
                  .map((d) => (
                    <SelectItem key={d.slug} value={d.slug}>
                      {d.name}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
          </div>
          {error && <InlineError variant="banner">{error}</InlineError>}
          <div className="flex flex-wrap gap-2">
            <Button type="submit" className="gap-1.5" disabled={saving || !form.name.trim()}>
              <Plus className="h-4 w-4" aria-hidden /> {editing ? tu.degisiklikleriKaydet : tu.kuraliOlustur}
            </Button>
            {editing && (
              <Button type="button" variant="ghost" onClick={() => setForm(EMPTY)}>
                {tu.vazgec}
              </Button>
            )}
          </div>
        </form>

        <ConfirmAction
          open={!!deleting}
          onOpenChange={(o) => !o && setDeleting(null)}
          title={tu.kuralSilinsinMi}
          tone="warning"
          confirmLabel={tu.sil}
          onConfirm={async () => {
            if (!deleting) return;
            await teamFetch(`${API}/automations?id=${encodeURIComponent(deleting.id)}`, { method: 'DELETE' });
            toast.success('Kural silindi');
            setDeleting(null);
            void list.refetch();
          }}
        />
      </DialogContent>
    </Dialog>
  );
}
