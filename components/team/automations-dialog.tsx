'use client';

import { useEffect, useState, useCallback } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';
import { Loader2, Zap, Plus, Trash2, ArrowRight } from 'lucide-react';
import { toast } from '@/lib/admin-toast';
import { cn } from '@/lib/utils';

type Automation = {
  id: string; name: string; enabled: boolean;
  triggerType: string; triggerValue: string | null;
  actionType: string; actionValue: string | null; department: string | null;
  createdBy: { name: string | null };
};
type Dept = { slug: string; name: string };
type Member = { id: string; name: string | null; email: string };

const TRIGGERS = [{ v: 'status_changed', l: 'Durum değişince' }, { v: 'assigned', l: 'Atama yapılınca' }, { v: 'created', l: 'Görev oluşunca' }, { v: 'overdue', l: 'Gecikince' }];
const ACTIONS = [{ v: 'notify', l: 'Yöneticilere bildir' }, { v: 'add_tag', l: 'Etiket ekle' }, { v: 'set_priority', l: 'Öncelik ata' }, { v: 'assign', l: 'Kişiye ata' }, { v: 'set_status', l: 'Durum ata' }];
const STATUSES = [{ v: 'todo', l: 'Yapılacak' }, { v: 'in_progress', l: 'Devam' }, { v: 'done', l: 'Bitti' }];
const PRIORITIES = [{ v: 'high', l: 'Yüksek' }, { v: 'medium', l: 'Orta' }, { v: 'low', l: 'Düşük' }];

/** Otomasyon kuralları — Notion database automation tarzı (tetik → aksiyon). */
export function AutomationsDialog({ open, onOpenChange, departments, members }: {
  open: boolean; onOpenChange: (o: boolean) => void; departments: Dept[]; members: Member[];
}) {
  const [rules, setRules] = useState<Automation[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ name: '', triggerType: 'status_changed', triggerValue: 'done', actionType: 'notify', actionValue: '', department: '' });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/team/automations', { cache: 'no-store' });
      const json = await res.json();
      if (json.success) setRules(json.automations);
    } catch { /* sessiz */ }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { if (open) load(); }, [open, load]);

  const create = async () => {
    if (!form.name.trim()) { toast.error('Kural adı gerekli'); return; }
    setSaving(true);
    try {
      const res = await fetch('/api/admin/team/automations', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: form.name, triggerType: form.triggerType,
          triggerValue: form.triggerValue || undefined, actionType: form.actionType,
          actionValue: form.actionValue || undefined, department: form.department || undefined,
        }),
      });
      if (!res.ok) throw new Error();
      toast.success('Otomasyon eklendi');
      setForm({ name: '', triggerType: 'status_changed', triggerValue: 'done', actionType: 'notify', actionValue: '', department: '' });
      load();
    } catch { toast.error('Eklenemedi'); }
    finally { setSaving(false); }
  };

  const toggle = async (id: string, enabled: boolean) => {
    setRules((p) => p.map((r) => r.id === id ? { ...r, enabled } : r));
    await fetch(`/api/admin/team/automations?id=${id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ enabled }) }).catch(() => {});
  };
  const remove = async (id: string) => {
    setRules((p) => p.filter((r) => r.id !== id));
    await fetch(`/api/admin/team/automations?id=${id}`, { method: 'DELETE' }).catch(() => {});
  };

  const tLabel = (v: string) => TRIGGERS.find((t) => t.v === v)?.l ?? v;
  const aLabel = (v: string) => ACTIONS.find((a) => a.v === v)?.l ?? v;

  // Seçili aksiyona göre değer alanı
  const actionValueField = () => {
    if (form.actionType === 'set_status') return <Select value={form.actionValue} onValueChange={(v) => setForm({ ...form, actionValue: v })}><SelectTrigger className="h-9"><SelectValue placeholder="Durum" /></SelectTrigger><SelectContent>{STATUSES.map((s) => <SelectItem key={s.v} value={s.v}>{s.l}</SelectItem>)}</SelectContent></Select>;
    if (form.actionType === 'set_priority') return <Select value={form.actionValue} onValueChange={(v) => setForm({ ...form, actionValue: v })}><SelectTrigger className="h-9"><SelectValue placeholder="Öncelik" /></SelectTrigger><SelectContent>{PRIORITIES.map((s) => <SelectItem key={s.v} value={s.v}>{s.l}</SelectItem>)}</SelectContent></Select>;
    if (form.actionType === 'assign') return <Select value={form.actionValue} onValueChange={(v) => setForm({ ...form, actionValue: v })}><SelectTrigger className="h-9"><SelectValue placeholder="Kişi" /></SelectTrigger><SelectContent>{members.map((m) => <SelectItem key={m.id} value={m.id}>{m.name || m.email}</SelectItem>)}</SelectContent></Select>;
    if (form.actionType === 'add_tag') return <Input placeholder="Etiket" value={form.actionValue} onChange={(e) => setForm({ ...form, actionValue: e.target.value })} className="h-9" />;
    return null;
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader className="border-b border-border/50 pb-4">
          <DialogTitle className="flex items-center gap-2 text-lg">
            <span className="grid h-9 w-9 place-items-center rounded-xl bg-amber-500/15 text-amber-500"><Zap className="h-5 w-5" /></span>
            Otomasyon Kuralları
          </DialogTitle>
        </DialogHeader>

        {/* Mevcut kurallar */}
        <div className="space-y-2 py-2">
          {loading ? (
            <div className="flex items-center justify-center gap-2 py-6 text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin" /> Yükleniyor…</div>
          ) : rules.length === 0 ? (
            <p className="py-4 text-center text-sm text-muted-foreground">Henüz otomasyon yok. Aşağıdan oluştur.</p>
          ) : rules.map((r) => (
            <div key={r.id} className={cn('flex items-center gap-3 rounded-xl border p-3', r.enabled ? 'border-border/60' : 'border-border/40 opacity-60')}>
              <button onClick={() => toggle(r.id, !r.enabled)} className={cn('relative h-5 w-9 shrink-0 rounded-full transition-colors', r.enabled ? 'bg-primary' : 'bg-muted')}>
                <span className={cn('absolute top-0.5 h-4 w-4 rounded-full bg-white transition-transform', r.enabled ? 'translate-x-4' : 'translate-x-0.5')} />
              </button>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{r.name}</p>
                <p className="flex items-center gap-1 truncate text-xs text-muted-foreground">
                  {tLabel(r.triggerType)}{r.triggerValue && ` (${r.triggerValue})`} <ArrowRight className="h-3 w-3" /> {aLabel(r.actionType)}{r.actionValue && ` (${r.actionValue})`}
                </p>
              </div>
              <button onClick={() => remove(r.id)} aria-label="Sil"><Trash2 className="h-4 w-4 text-muted-foreground hover:text-destructive" /></button>
            </div>
          ))}
        </div>

        {/* Yeni kural */}
        <div className="space-y-3 rounded-xl border border-dashed border-border/60 p-4">
          <Input placeholder="Kural adı (ör. Bitince ekibe haber ver)" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="h-9" />
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <label className="text-[11px] font-semibold text-muted-foreground">TETİK</label>
              <Select value={form.triggerType} onValueChange={(v) => setForm({ ...form, triggerType: v })}><SelectTrigger className="h-9"><SelectValue /></SelectTrigger><SelectContent>{TRIGGERS.map((t) => <SelectItem key={t.v} value={t.v}>{t.l}</SelectItem>)}</SelectContent></Select>
              {form.triggerType === 'status_changed' && <Select value={form.triggerValue} onValueChange={(v) => setForm({ ...form, triggerValue: v })}><SelectTrigger className="h-9"><SelectValue placeholder="Hangi durum" /></SelectTrigger><SelectContent>{STATUSES.map((s) => <SelectItem key={s.v} value={s.v}>{s.l}</SelectItem>)}</SelectContent></Select>}
            </div>
            <div className="space-y-1">
              <label className="text-[11px] font-semibold text-muted-foreground">AKSİYON</label>
              <Select value={form.actionType} onValueChange={(v) => setForm({ ...form, actionType: v, actionValue: '' })}><SelectTrigger className="h-9"><SelectValue /></SelectTrigger><SelectContent>{ACTIONS.map((a) => <SelectItem key={a.v} value={a.v}>{a.l}</SelectItem>)}</SelectContent></Select>
              {actionValueField()}
            </div>
          </div>
          <Select value={form.department || 'all'} onValueChange={(v) => setForm({ ...form, department: v === 'all' ? '' : v })}>
            <SelectTrigger className="h-9"><SelectValue placeholder="Departman (opsiyonel)" /></SelectTrigger>
            <SelectContent><SelectItem value="all">Tüm departmanlar</SelectItem>{departments.map((d) => <SelectItem key={d.slug} value={d.slug}>{d.name}</SelectItem>)}</SelectContent>
          </Select>
          <Button onClick={create} disabled={saving} className="w-full">
            {saving ? <><Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> Kaydediliyor…</> : <><Plus className="mr-1.5 h-4 w-4" /> Kural Oluştur</>}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
