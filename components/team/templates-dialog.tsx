'use client';

import { useEffect, useState, useCallback } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Loader2, Plus, Trash2, FileText, PlayCircle, Sparkles, ListChecks, BookmarkPlus, Clock } from 'lucide-react';
import { toast } from '@/lib/admin-toast';
import { cn } from '@/lib/utils';
import {
  TEAM_TASK_PRESETS,
  PRESET_CATEGORY_META,
  type TeamTaskPreset,
  type TeamTaskPresetCategory,
} from '@/lib/team-task-presets';

type Template = {
  id: string; name: string; title: string; description: string | null; priority: string;
  department: string | null; tags: string | null; estimateMin: number | null; checklist: string | null;
  createdBy: { name: string | null };
};

type Tab = 'presets' | 'mine';

const PRIO_LABEL: Record<string, string> = { low: 'Düşük', medium: 'Orta', high: 'Yüksek' };

function fmtMin(min: number): string {
  if (!min) return '';
  const h = min / 60;
  return h < 1 ? `${min}dk` : `${Math.round(h * 10) / 10}s`;
}

/** Görev şablonları: HAZIR galeri + kendi şablonların (listele, oluştur, uygula, sil). */
export function TemplatesDialog({ open, onOpenChange, weekKey, onApplied }: {
  open: boolean; onOpenChange: (o: boolean) => void; weekKey: string; onApplied?: () => void;
}) {
  const [tab, setTab] = useState<Tab>('presets');
  const [templates, setTemplates] = useState<Template[]>([]);
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [applyingId, setApplyingId] = useState<string | null>(null);
  const [presetBusy, setPresetBusy] = useState<string | null>(null); // key + '-use' | '-save'
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

  /** Bir preseti TaskTemplate'e (POST) çevirir; oluşturulan şablon id'sini döndürür. */
  const presetToTemplate = async (p: TeamTaskPreset): Promise<string | null> => {
    const res = await fetch('/api/admin/team/templates', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: p.name, title: p.title, description: p.description, priority: p.priority,
        tags: p.tags, estimateMin: p.estimateMin, checklist: p.checklist.join('\n'),
      }),
    });
    if (!res.ok) return null;
    const json = await res.json().catch(() => null);
    return json?.template?.id ?? null;
  };

  /**
   * Hazır preset → görev. Mevcut API'leri bozmadan: preseti önce geçici bir
   * TaskTemplate yap (POST), sonra şablondan görev üret (PUT — checklist iskeleti
   * dahil), ardından geçici şablonu sil (DELETE). Böylece checklist desteği korunur.
   */
  const applyPreset = async (p: TeamTaskPreset) => {
    setPresetBusy(`${p.key}-use`);
    try {
      const tplId = await presetToTemplate(p);
      if (!tplId) throw new Error();
      const res = await fetch('/api/admin/team/templates', {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ templateId: tplId, weekKey }),
      });
      // Geçici şablonu temizle (kalıcı olarak "şablonlarıma kaydet" ayrı buton).
      fetch(`/api/admin/team/templates?id=${tplId}`, { method: 'DELETE' }).catch(() => {});
      if (!res.ok) throw new Error();
      toast.success(`"${p.name}" görevi oluşturuldu`);
      onApplied?.();
    } catch { toast.error('Görev oluşturulamadı'); }
    finally { setPresetBusy(null); }
  };

  /** Preseti kalıcı olarak "Şablonlarım"a kaydet (POST). */
  const savePreset = async (p: TeamTaskPreset) => {
    setPresetBusy(`${p.key}-save`);
    try {
      const tplId = await presetToTemplate(p);
      if (!tplId) throw new Error();
      toast.success(`"${p.name}" şablonlarına eklendi`);
      load();
    } catch { toast.error('Şablon kaydedilemedi'); }
    finally { setPresetBusy(null); }
  };

  // Presetleri kategoriye göre grupla.
  const grouped = TEAM_TASK_PRESETS.reduce<Record<TeamTaskPresetCategory, TeamTaskPreset[]>>((acc, p) => {
    (acc[p.category] ??= []).push(p);
    return acc;
  }, {} as Record<TeamTaskPresetCategory, TeamTaskPreset[]>);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader className="border-b border-border/50 pb-4">
          <DialogTitle className="flex items-center gap-2 text-lg">
            <span className="grid h-9 w-9 place-items-center rounded-xl bg-primary/15 text-primary"><FileText className="h-5 w-5" /></span>
            Görev Şablonları
          </DialogTitle>
        </DialogHeader>

        {/* Sekmeler */}
        <div className="flex gap-1 rounded-xl bg-muted/50 p-1">
          <button
            onClick={() => setTab('presets')}
            className={cn('flex flex-1 items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium transition',
              tab === 'presets' ? 'bg-background shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground')}
          >
            <Sparkles className="h-4 w-4" /> Hazır Şablonlar
          </button>
          <button
            onClick={() => setTab('mine')}
            className={cn('flex flex-1 items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium transition',
              tab === 'mine' ? 'bg-background shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground')}
          >
            <FileText className="h-4 w-4" /> Şablonlarım{templates.length > 0 ? ` (${templates.length})` : ''}
          </button>
        </div>

        {/* ── HAZIR ŞABLON GALERİSİ ─────────────────────────────────── */}
        {tab === 'presets' && (
          <div className="space-y-5 py-1">
            <p className="text-xs text-muted-foreground">
              Sık kullanılan görevleri tek tıkla oluştur. Karta tıkla → görev + alt görev iskeleti hazır.
            </p>
            {(Object.keys(grouped) as TeamTaskPresetCategory[]).map((cat) => {
              const meta = PRESET_CATEGORY_META[cat];
              return (
                <div key={cat} className="space-y-2">
                  <div className="flex items-center gap-2">
                    <span className={cn('rounded-full px-2 py-0.5 text-[10px] font-semibold', meta.badgeClass)}>{meta.label}</span>
                    <div className="h-px flex-1 bg-border/50" />
                  </div>
                  <div className="grid gap-2 sm:grid-cols-2">
                    {grouped[cat].map((p) => (
                      <div
                        key={p.key}
                        className={cn(
                          'group flex flex-col gap-2 rounded-2xl border border-border/60 bg-gradient-to-br from-card/60 to-card/20 p-3 ring-1 ring-transparent transition',
                          meta.ringClass,
                        )}
                      >
                        <div className="flex items-start gap-2.5">
                          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-muted/60 text-lg">{p.emoji}</span>
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-semibold">{p.name}</p>
                            <p className="line-clamp-2 text-[11px] leading-snug text-muted-foreground">{p.description}</p>
                          </div>
                        </div>
                        <div className="flex flex-wrap items-center gap-1.5 text-[10px] text-muted-foreground">
                          <span className="inline-flex items-center gap-1 rounded-md bg-muted/50 px-1.5 py-0.5">
                            <ListChecks className="h-3 w-3" /> {p.checklist.length} adım
                          </span>
                          {p.estimateMin > 0 && (
                            <span className="inline-flex items-center gap-1 rounded-md bg-muted/50 px-1.5 py-0.5">
                              <Clock className="h-3 w-3" /> {fmtMin(p.estimateMin)}
                            </span>
                          )}
                          <span className={cn('rounded-md px-1.5 py-0.5 font-medium',
                            p.priority === 'high' ? 'bg-red-500/15 text-red-600 dark:text-red-400'
                              : p.priority === 'medium' ? 'bg-amber-500/15 text-amber-600 dark:text-amber-400'
                                : 'bg-slate-500/15 text-slate-600 dark:text-slate-400')}>
                            {PRIO_LABEL[p.priority]}
                          </span>
                        </div>
                        <div className="mt-auto flex items-center gap-1.5 pt-1">
                          <Button
                            size="sm"
                            className="h-8 flex-1"
                            onClick={() => applyPreset(p)}
                            disabled={presetBusy !== null}
                          >
                            {presetBusy === `${p.key}-use`
                              ? <Loader2 className="h-4 w-4 animate-spin" />
                              : <><PlayCircle className="mr-1 h-4 w-4" /> Görev Oluştur</>}
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-8 px-2.5"
                            onClick={() => savePreset(p)}
                            disabled={presetBusy !== null}
                            title="Şablonlarıma kaydet"
                            aria-label="Şablonlarıma kaydet"
                          >
                            {presetBusy === `${p.key}-save`
                              ? <Loader2 className="h-4 w-4 animate-spin" />
                              : <BookmarkPlus className="h-4 w-4" />}
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* ── ŞABLONLARIM (kendi şablonların) ───────────────────────── */}
        {tab === 'mine' && (
          <>
            <div className="space-y-2 py-2">
              {loading ? (
                <div className="flex items-center justify-center gap-2 py-6 text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin" /> Yükleniyor…</div>
              ) : templates.length === 0 ? (
                <p className="py-4 text-center text-sm text-muted-foreground">Henüz şablon yok. Aşağıdan oluştur veya Hazır Şablonlar’dan kaydet.</p>
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
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
