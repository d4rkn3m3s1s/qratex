'use client';

import { useEffect, useState, useCallback } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Loader2, Tag, Plus, Trash2 } from 'lucide-react';
import { toast } from '@/lib/admin-toast';

type TeamTag = { id: string; slug: string; label: string; color: string };

const COLORS = ['#8b5cf6', '#ec4899', '#ef4444', '#f59e0b', '#10b981', '#06b6d4', '#3b82f6', '#64748b'];

/** Yönetilen etiket havuzu — renkli, merkezi (serbest CSV yerine). */
export function TagsDialog({ open, onOpenChange, onChanged }: {
  open: boolean; onOpenChange: (o: boolean) => void; onChanged?: () => void;
}) {
  const [tags, setTags] = useState<TeamTag[]>([]);
  const [loading, setLoading] = useState(false);
  const [label, setLabel] = useState('');
  const [color, setColor] = useState(COLORS[0]);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/team/tags', { cache: 'no-store' });
      const json = await res.json();
      if (json.success) setTags(json.tags);
    } catch { /* sessiz */ }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { if (open) load(); }, [open, load]);

  const create = async () => {
    if (!label.trim()) return;
    setSaving(true);
    try {
      const res = await fetch('/api/admin/team/tags', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ label: label.trim(), color }),
      });
      if (!res.ok) throw new Error();
      toast.success('Etiket eklendi'); setLabel(''); load(); onChanged?.();
    } catch { toast.error('Eklenemedi'); }
    finally { setSaving(false); }
  };
  const remove = async (slug: string) => {
    setTags((p) => p.filter((t) => t.slug !== slug));
    await fetch(`/api/admin/team/tags?slug=${slug}`, { method: 'DELETE' }).catch(() => {});
    onChanged?.();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader className="border-b border-border/50 pb-4">
          <DialogTitle className="flex items-center gap-2 text-lg">
            <span className="grid h-9 w-9 place-items-center rounded-xl bg-primary/15 text-primary"><Tag className="h-5 w-5" /></span>
            Etiket Havuzu
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-3 py-2">
          {loading ? (
            <div className="flex items-center justify-center gap-2 py-6 text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin" /> Yükleniyor…</div>
          ) : tags.length === 0 ? (
            <p className="py-4 text-center text-sm text-muted-foreground">Henüz etiket yok.</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {tags.map((t) => (
                <span key={t.id} className="group flex items-center gap-1.5 rounded-full px-3 py-1 text-sm font-medium text-white" style={{ background: t.color }}>
                  {t.label}
                  <button onClick={() => remove(t.slug)} className="opacity-70 hover:opacity-100" aria-label="Sil"><Trash2 className="h-3 w-3" /></button>
                </span>
              ))}
            </div>
          )}
        </div>

        <div className="space-y-3 rounded-xl border border-dashed border-border/60 p-4">
          <Input placeholder="Yeni etiket adı" value={label} onChange={(e) => setLabel(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && create()} className="h-9" />
          <div className="flex items-center gap-2">
            {COLORS.map((c) => (
              <button key={c} onClick={() => setColor(c)} className={`h-6 w-6 rounded-full transition-transform ${color === c ? 'scale-125 ring-2 ring-offset-2 ring-offset-background' : ''}`} style={{ background: c }} aria-label={c} />
            ))}
          </div>
          <Button onClick={create} disabled={saving || !label.trim()} className="w-full">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <><Plus className="mr-1.5 h-4 w-4" /> Etiket Ekle</>}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
