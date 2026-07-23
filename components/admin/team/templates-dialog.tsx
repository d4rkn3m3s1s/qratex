'use client';

import { useEffect, useState, useCallback } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Loader2, Plus, Trash2, FileText, PlayCircle } from 'lucide-react';
import { toast } from '@/lib/admin-toast';

type Template = {
  id: string; name: string; title: string; description: string | null; priority: string;
  department: string | null; tags: string | null; estimateMin: number | null; checklist: string | null;
  createdBy: { name: string | null };
};

/** Görev şablonları: listele, oluştur, şablondan görev üret, sil. */
export function TemplatesDialog({ open, onOpenChange, weekKey, onApplied }: {
  open: boolean; onOpenChange: (o: boolean) => void; weekKey: string; onApplied?: () => void;
}) {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [applyingId, setApplyingId] = useState<string | null>(null);
  const [form, setForm] = useState({ name: '', title: '', description: '', priority: 'medium', tags: '', estimateMin: '', checklist: '' });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/team/templates', { cache: 'no-store' });
      const json = await res.json();
      if (json.success) setTemplates(json.templates);
    } catch { /* sessiz */ }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { if (open) load(); }, [open, load]);

  const create = async () => {
    if (!form.name.trim() || !form.title.trim()) { toast.error('Ad ve başlık gerekli'); return; }
    setCreating(true);
    try {
      const res = await fetch('/api/admin/team/templates', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: form.name, title: form.title, description: form.description || null, priority: form.priority,
          tags: form.tags || null, estimateMin: form.estimateMin ? Number(form.estimateMin) : null,
          checklist: form.checklist || null,
        }),
      });
      if (!res.ok) throw new Error();
      toast.success('Şablon oluşturuldu');
      setForm({ name: '', title: '', description: '', priority: 'medium', tags: '', estimateMin: '', checklist: '' });
      load();
    } catch { toast.error('Şablon oluşturulamadı'); }
    finally { setCreating(false); }
  };

  const apply = async (id: string) => {
    setApplyingId(id);
    try {
      const res = await fetch('/api/admin/team/templates', {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ templateId: id, weekKey }),
      });
      if (!res.ok) throw new Error();
      toast.success('Şablondan görev oluşturuldu');
      onApplied?.();
    } catch { toast.error('Görev oluşturulamadı'); }
    finally { setApplyingId(null); }
  };

  const remove = async (id: string) => {
    await fetch(`/api/admin/team/templates?id=${id}`, { method: 'DELETE' }).catch(() => {});
    load();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader className="border-b border-border/50 pb-4">
          <DialogTitle className="flex items-center gap-2 text-lg">
            <span className="grid h-9 w-9 place-items-center rounded-xl bg-primary/15 text-primary"><FileText className="h-5 w-5" /></span>
            Görev Şablonları
          </DialogTitle>
        </DialogHeader>

        {/* Mevcut şablonlar */}
        <div className="space-y-2 py-2">
          {loading ? (
            <div className="flex items-center justify-center gap-2 py-6 text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin" /> Yükleniyor…</div>
          ) : templates.length === 0 ? (
            <p className="py-4 text-center text-sm text-muted-foreground">Henüz şablon yok. Aşağıdan oluştur.</p>
          ) : templates.map((t) => (
            <div key={t.id} className="flex items-center gap-3 rounded-xl border border-border/60 bg-card/40 p-3">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold">{t.name}</p>
                <p className="truncate text-xs text-muted-foreground">{t.title}{t.checklist ? ` · ${t.checklist.split('\n').filter(Boolean).length} alt görev` : ''}</p>
              </div>
              <Button size="sm" variant="outline" onClick={() => apply(t.id)} disabled={applyingId === t.id}>
                {applyingId === t.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <><PlayCircle className="mr-1 h-4 w-4" /> Kullan</>}
              </Button>
              <button onClick={() => remove(t.id)} aria-label="Sil"><Trash2 className="h-4 w-4 text-muted-foreground hover:text-destructive" /></button>
            </div>
          ))}
        </div>

        {/* Yeni şablon */}
        <div className="space-y-3 rounded-xl border border-dashed border-border/60 p-4">
          <p className="text-sm font-semibold">Yeni Şablon</p>
          <div className="grid grid-cols-2 gap-3">
            <Input placeholder="Şablon adı" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="h-9" />
            <Input placeholder="Görev başlığı" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} className="h-9" />
          </div>
          <Textarea placeholder="Açıklama (opsiyonel)" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} rows={2} className="resize-none" />
          <div className="grid grid-cols-2 gap-3">
            <Input placeholder="Etiketler (virgülle)" value={form.tags} onChange={(e) => setForm({ ...form, tags: e.target.value })} className="h-9" />
            <Input type="number" placeholder="Tahmini (dk)" value={form.estimateMin} onChange={(e) => setForm({ ...form, estimateMin: e.target.value })} className="h-9" />
          </div>
          <Textarea placeholder="Alt görevler (her satır bir madde)" value={form.checklist} onChange={(e) => setForm({ ...form, checklist: e.target.value })} rows={3} className="resize-none font-mono text-xs" />
          <Button onClick={create} disabled={creating} className="w-full">
            {creating ? <><Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> Kaydediliyor…</> : <><Plus className="mr-1.5 h-4 w-4" /> Şablon Oluştur</>}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
