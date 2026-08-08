'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { DashboardPageHero } from '@/components/layout/dashboard-page-hero';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Mail, Send, FlaskConical, Save, Trash2, Plus, Loader2, CheckCircle2,
  Clock, Users, AlertTriangle, Eye,
} from 'lucide-react';
import { toast } from '@/lib/admin-toast';
import { TW_BRAND_CTA_BUTTON } from '@/lib/tw-brand-classes';

interface Template {
  id: string;
  department: string;
  recipientName: string;
  email: string;
  subject: string;
  body: string;
}
interface Stat {
  sent: number;
  opened: number;
  lastSentAt: string | null;
  recipients: { email: string; openedAt: string | null; openCount: number }[];
}

const deptEmoji = (d: string) => {
  const s = d.toLowerCase();
  if (s.includes('hukuk')) return '⚖️';
  if (s.includes('iş gel') || s.includes('is gel')) return '📊';
  if (s.includes('pazarlama')) return '🎯';
  if (s.includes('sosyal')) return '📱';
  if (s.includes('dizayn') || s.includes('deneyim')) return '🎨';
  if (s.includes('üretim') || s.includes('gelişt')) return '⚙️';
  return '✨';
};

export default function InternEmailsPage() {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [stats, setStats] = useState<Record<string, Stat>>({});
  const [mailConfigured, setMailConfigured] = useState(true);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [testTo, setTestTo] = useState('');
  const [busy, setBusy] = useState<'save' | 'send' | 'test' | null>(null);
  const [dirty, setDirty] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/intern-emails');
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'Yüklenemedi');
      setTemplates(data.templates ?? []);
      setStats(data.stats ?? {});
      setMailConfigured(!!data.mailConfigured);
      if (!selectedId && data.templates?.[0]) setSelectedId(data.templates[0].id);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Şablonlar yüklenemedi');
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId]);

  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const selected = useMemo(() => templates.find((t) => t.id === selectedId) ?? null, [templates, selectedId]);
  const grouped = useMemo(() => {
    const g: Record<string, Template[]> = {};
    for (const t of templates) (g[t.department] ??= []).push(t);
    return g;
  }, [templates]);

  const updateSelected = (patch: Partial<Template>) => {
    if (!selectedId) return;
    setTemplates((prev) => prev.map((t) => (t.id === selectedId ? { ...t, ...patch } : t)));
    setDirty(true);
  };

  const saveAll = async () => {
    setBusy('save');
    try {
      const res = await fetch('/api/admin/intern-emails', {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ templates }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'Kaydedilemedi');
      setTemplates(data.templates ?? templates);
      setDirty(false);
      toast.success('Şablonlar kaydedildi ✓');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Kaydedilemedi');
    } finally { setBusy(null); }
  };

  const doSend = async (action: 'send' | 'test') => {
    if (!selected) return;
    if (action === 'send' && !confirm(`"${selected.recipientName || selected.email}" adresine gerçek görev maili gönderilsin mi?`)) return;
    setBusy(action);
    try {
      const res = await fetch('/api/admin/intern-emails', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, templateId: selected.id, testTo: action === 'test' ? testTo.trim() : undefined }),
      });
      const data = await res.json();
      if (!data.success && !data.results) throw new Error(data?.error || 'Gönderilemedi');
      const sent = data.sent ?? 0, total = data.total ?? 0;
      if (data.success) toast.success(action === 'test' ? `Test maili gönderildi ✓ (${sent}/${total})` : `Gönderildi ✓ (${sent}/${total})`);
      else toast.error(`Kısmi: ${sent}/${total} gönderildi`);
      load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Gönderilemedi');
    } finally { setBusy(null); }
  };

  const addTemplate = () => {
    const id = `ozel-${Date.now()}`;
    const t: Template = { id, department: 'Genel', recipientName: '', email: '', subject: 'QRateX — Görev', body: 'Selamlar,\n\n' };
    setTemplates((prev) => [...prev, t]);
    setSelectedId(id);
    setDirty(true);
  };

  const removeSelected = () => {
    if (!selected || !confirm('Bu şablon silinsin mi? (Kaydet dersen kalıcı olur)')) return;
    setTemplates((prev) => prev.filter((t) => t.id !== selectedId));
    setSelectedId(templates[0]?.id ?? null);
    setDirty(true);
  };

  const stat = selected ? stats[selected.id] : undefined;

  return (
    <div className="space-y-6">
      <DashboardPageHero
        icon={<Mail className="text-white" />}
        title="Stajyer Görev Mailleri"
        description="Departman görev maillerini seç, düzenle, test et ve gönder. Her mailde son teslim tarihi + açılma takibi."
      />

      {!mailConfigured && (
        <Card className="border-amber-400/50 bg-amber-50/50 dark:bg-amber-500/5">
          <CardContent className="flex items-center gap-2 py-3 text-sm text-amber-700 dark:text-amber-300">
            <AlertTriangle className="h-4 w-4" /> Mail yapılandırması eksik (SMTP/Resend env). Gönderim çalışmaz — önce env ayarla.
          </CardContent>
        </Card>
      )}

      <div className="grid gap-5 lg:grid-cols-[320px_1fr]">
        {/* SOL: şablon listesi (departmana göre) */}
        <div className="space-y-4">
          <Button onClick={addTemplate} variant="outline" className="w-full gap-2"><Plus className="h-4 w-4" /> Yeni şablon</Button>
          {loading ? (
            <div className="space-y-2">{[...Array(6)].map((_, i) => <div key={i} className="h-12 animate-pulse rounded-lg bg-muted/50" />)}</div>
          ) : (
            <div className="space-y-4">
              {Object.entries(grouped).map(([dept, items]) => (
                <div key={dept}>
                  <p className="mb-1.5 px-1 text-xs font-bold uppercase tracking-wider text-muted-foreground">{deptEmoji(dept)} {dept}</p>
                  <div className="space-y-1">
                    {items.map((t) => {
                      const s = stats[t.id];
                      const active = t.id === selectedId;
                      return (
                        <button
                          key={t.id}
                          onClick={() => setSelectedId(t.id)}
                          className={`flex w-full items-center gap-2 rounded-lg border px-3 py-2 text-left text-sm transition-colors ${active ? 'border-primary bg-primary/10' : 'border-border hover:bg-muted/50'}`}
                        >
                          <span className="min-w-0 flex-1 truncate font-medium">{t.recipientName || t.email || 'İsimsiz'}</span>
                          {s && s.sent > 0 && (
                            s.opened > 0
                              ? <span title={`${s.opened}/${s.sent} açıldı`} className="shrink-0 text-emerald-500"><CheckCircle2 className="h-4 w-4" /></span>
                              : <span title={`${s.sent} gönderildi, açılmadı`} className="shrink-0 text-muted-foreground"><Clock className="h-4 w-4" /></span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}
          {dirty && (
            <Button onClick={saveAll} disabled={busy === 'save'} className={`w-full gap-2 ${TW_BRAND_CTA_BUTTON}`}>
              {busy === 'save' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Tüm değişiklikleri kaydet
            </Button>
          )}
        </div>

        {/* SAĞ: düzenleme + gönderim + açılma durumu */}
        {selected ? (
          <div className="space-y-4">
            {/* Açılma durumu şeridi */}
            {stat && stat.sent > 0 && (
              <Card className="border-primary/20 bg-gradient-to-br from-primary/5 to-fuchsia-500/5">
                <CardContent className="flex flex-wrap items-center gap-4 py-3 text-sm">
                  <span className="flex items-center gap-1.5"><Users className="h-4 w-4 text-primary" /> {stat.sent} gönderildi</span>
                  <span className="flex items-center gap-1.5 font-semibold text-emerald-600 dark:text-emerald-400"><Eye className="h-4 w-4" /> {stat.opened} açıldı</span>
                  {stat.recipients.some((r) => r.openedAt) && (
                    <span className="text-xs text-muted-foreground">
                      Açanlar: {stat.recipients.filter((r) => r.openedAt).map((r) => r.email).join(', ')}
                    </span>
                  )}
                </CardContent>
              </Card>
            )}

            <Card>
              <CardContent className="space-y-4 p-5">
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-1"><Label className="text-xs">Departman</Label>
                    <Input value={selected.department} onChange={(e) => updateSelected({ department: e.target.value })} /></div>
                  <div className="space-y-1"><Label className="text-xs">Alıcı adı</Label>
                    <Input value={selected.recipientName} onChange={(e) => updateSelected({ recipientName: e.target.value })} /></div>
                </div>
                <div className="space-y-1"><Label className="text-xs">E-posta (çoklu için virgül)</Label>
                  <Input value={selected.email} onChange={(e) => updateSelected({ email: e.target.value })} placeholder="ornek@gmail.com" /></div>
                <div className="space-y-1"><Label className="text-xs">Konu</Label>
                  <Input value={selected.subject} onChange={(e) => updateSelected({ subject: e.target.value })} /></div>
                <div className="space-y-1"><Label className="text-xs">Mail içeriği</Label>
                  <Textarea value={selected.body} onChange={(e) => updateSelected({ body: e.target.value })} rows={14} className="font-mono text-xs leading-relaxed" /></div>
                <div className="flex items-center justify-between pt-1">
                  <Button onClick={removeSelected} variant="ghost" size="sm" className="gap-1.5 text-destructive hover:bg-destructive/10"><Trash2 className="h-4 w-4" /> Sil</Button>
                  <a href={`/api/admin/intern-emails/preview?id=${encodeURIComponent(selected.id)}`} target="_blank" rel="noopener noreferrer" className="text-sm text-primary underline">Önizleme (HTML)</a>
                </div>
              </CardContent>
            </Card>

            {/* Gönderim */}
            <Card>
              <CardContent className="space-y-3 p-5">
                <div className="flex flex-wrap items-end gap-3">
                  <div className="flex-1 space-y-1">
                    <Label className="text-xs">Test adresi (kendine dene)</Label>
                    <Input value={testTo} onChange={(e) => setTestTo(e.target.value)} placeholder="senin@mailin.com" />
                  </div>
                  <Button onClick={() => doSend('test')} disabled={busy === 'test' || !testTo.trim()} variant="outline" className="gap-2">
                    {busy === 'test' ? <Loader2 className="h-4 w-4 animate-spin" /> : <FlaskConical className="h-4 w-4" />} Test gönder
                  </Button>
                </div>
                <div className="h-px bg-border" />
                <div className="flex items-center justify-between">
                  <p className="text-sm text-muted-foreground">Gerçek alıcı: <b className="text-foreground">{selected.email || '—'}</b></p>
                  <Button onClick={() => doSend('send')} disabled={busy === 'send' || !selected.email} className={`gap-2 ${TW_BRAND_CTA_BUTTON}`}>
                    {busy === 'send' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />} Görevi gönder
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>
        ) : (
          <Card><CardContent className="grid place-items-center py-20 text-muted-foreground">Bir şablon seç veya yeni oluştur.</CardContent></Card>
        )}
      </div>
    </div>
  );
}
