'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { DashboardPageHero } from '@/components/layout/dashboard-page-hero';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog, DialogContent, DialogHeader, DialogFooter, DialogTitle, DialogDescription,
} from '@/components/ui/dialog';
import {
  Mail, Send, FlaskConical, Save, Trash2, Plus, Loader2, CheckCircle2,
  Clock, Users, AlertTriangle, Eye, XCircle, CalendarClock, SendHorizonal, Search,
} from 'lucide-react';
import { toast } from '@/lib/admin-toast';
import { TW_BRAND_CTA_BUTTON } from '@/lib/tw-brand-classes';
import { INTERN_EMAIL_KINDS, MAIL_VARIABLES, type InternEmailKind } from '@/lib/intern-email-kinds';

interface Template {
  id: string;
  kind?: InternEmailKind;
  department: string;
  recipientName: string;
  email: string;
  subject: string;
  body: string;
  deadline?: string;
}

const kindMeta = (k?: InternEmailKind) => INTERN_EMAIL_KINDS.find((x) => x.value === (k ?? 'task')) ?? INTERN_EMAIL_KINDS[0];
interface Recipient {
  email: string;
  status: string;        // 'sent' | 'error'
  error: string | null;
  openedAt: string | null;
  openCount: number;
  sentAt: string;
}
interface Stat {
  sent: number;          // başarıyla gönderilen alıcı sayısı
  opened: number;        // maili açan alıcı sayısı
  errored: number;       // gönderim hatası alan alıcı sayısı
  lastSentAt: string | null;
  recipients: Recipient[];
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
  const [testStats, setTestStats] = useState<Record<string, Stat>>({});
  const [mailConfigured, setMailConfigured] = useState(true);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [testTo, setTestTo] = useState('');
  const [busy, setBusy] = useState<'save' | 'send' | 'test' | 'bulk' | null>(null);
  const [dirty, setDirty] = useState(false);
  const [query, setQuery] = useState(''); // sol liste arama filtresi
  const [newMenuOpen, setNewMenuOpen] = useState(false); // "Yeni" tür seçim menüsü
  // Onay modalı: tekli ('send') veya toplu ('bulk') gönderim öncesi güzel onay.
  const [confirmModal, setConfirmModal] = useState<null | { mode: 'send' | 'bulk' }>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/intern-emails');
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'Yüklenemedi');
      setTemplates(data.templates ?? []);
      setStats(data.stats ?? {});
      setTestStats(data.testStats ?? {});
      setMailConfigured(!!data.mailConfigured);
      if (!selectedId && data.templates?.[0]) setSelectedId(data.templates[0].id);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Şablonlar yüklenemedi');
    } finally {
      setLoading(false);
    }
     
  }, [selectedId]);

  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const selected = useMemo(() => templates.find((t) => t.id === selectedId) ?? null, [templates, selectedId]);
  // Arama filtresi (isim/email/departman/konu üzerinde) + departmana göre grupla.
  const grouped = useMemo(() => {
    const q = query.trim().toLowerCase();
    const filtered = q
      ? templates.filter((t) =>
          `${t.recipientName} ${t.email} ${t.department} ${t.subject}`.toLowerCase().includes(q))
      : templates;
    const g: Record<string, Template[]> = {};
    for (const t of filtered) (g[t.department] ??= []).push(t);
    return g;
  }, [templates, query]);
  // Aynı ada sahip birden çok şablon var mı (liste satırında email göstermek için).
  const dupNames = useMemo(() => {
    const count: Record<string, number> = {};
    for (const t of templates) { const n = (t.recipientName || '').trim(); if (n) count[n] = (count[n] ?? 0) + 1; }
    return new Set(Object.entries(count).filter(([, c]) => c > 1).map(([n]) => n));
  }, [templates]);
  // Toplu gönderime dahil olacak (alıcısı olan) şablon sayısı.
  const bulkCount = useMemo(
    () => templates.filter((t) => t.email.split(',').some((e) => e.trim())).length,
    [templates],
  );

  const updateSelected = (patch: Partial<Template>) => {
    if (!selectedId) return;
    setTemplates((prev) => prev.map((t) => (t.id === selectedId ? { ...t, ...patch } : t)));
    setDirty(true);
  };

  const saveAll = async () => {
    // Sunucu email/konu BOŞ şablonları sessizce atar (normalizeInternEmails) → veri kaybı.
    // Kaydetmeden önce uyar; kullanıcı emin olmalı.
    const invalid = templates.filter((t) => !t.email.trim() || !t.subject.trim());
    if (invalid.length > 0) {
      const names = invalid.map((t) => t.recipientName || t.department || '(isimsiz)').join(', ');
      toast.error(`Alıcı e-postası veya konusu boş şablon(lar) kaydedilmez: ${names}. Önce doldur.`);
      // Boş olanı seçili yap ki kullanıcı düzeltebilsin.
      setSelectedId(invalid[0].id);
      return;
    }
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

  // TEST gönderimi — modal gerekmez (kendine deneme, zararsız).
  const doTest = async () => {
    if (!selected) return;
    setBusy('test');
    try {
      const res = await fetch('/api/admin/intern-emails', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'test', templateId: selected.id, testTo: testTo.trim() }),
      });
      const data = await res.json();
      if (!data.success && !data.results) throw new Error(data?.error || 'Gönderilemedi');
      const sent = data.sent ?? 0, total = data.total ?? 0;
      if (data.success) toast.success(`Test maili gönderildi ✓ (${sent}/${total})`);
      else toast.error(`Kısmi: ${sent}/${total} gönderildi`);
      load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Gönderilemedi');
    } finally { setBusy(null); }
  };

  // GERÇEK gönderim (tekli veya toplu) — modal onayından sonra çağrılır.
  const confirmSend = async () => {
    const mode = confirmModal?.mode;
    setConfirmModal(null);
    if (mode === 'send') {
      if (!selected) return;
      setBusy('send');
      try {
        const res = await fetch('/api/admin/intern-emails', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'send', templateId: selected.id }),
        });
        const data = await res.json();
        if (!data.success && !data.results) throw new Error(data?.error || 'Gönderilemedi');
        const sent = data.sent ?? 0, total = data.total ?? 0;
        if (data.success) toast.success(`Gönderildi ✓ (${sent}/${total})`);
        else toast.error(`Kısmi: ${sent}/${total} gönderildi`);
        load();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : 'Gönderilemedi');
      } finally { setBusy(null); }
    } else if (mode === 'bulk') {
      setBusy('bulk');
      try {
        const res = await fetch('/api/admin/intern-emails', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'send-bulk' }), // templateIds boş → alıcısı olan tüm şablonlar
        });
        const data = await res.json();
        if (!data.success && !data.results) throw new Error(data?.error || 'Toplu gönderilemedi');
        const sent = data.sent ?? 0, total = data.total ?? 0, tpls = data.templates ?? 0;
        if (data.success) toast.success(`Toplu gönderim tamam ✓ (${tpls} şablon, ${sent}/${total} mail)`);
        else toast.error(`Kısmi toplu: ${sent}/${total} mail gönderildi`);
        load();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : 'Toplu gönderilemedi');
      } finally { setBusy(null); }
    }
  };

  // Tür-özel başlangıç içeriği (yeni şablon oluştururken).
  const kindDefaults = (k: InternEmailKind): Partial<Template> => {
    switch (k) {
      case 'general': return { department: 'Genel', subject: 'QRateX — Mesaj', body: 'Merhaba,\n\n' };
      case 'welcome': return { department: 'Genel', subject: 'QRateX ekibine hoş geldin! 🎉', body: 'Merhaba,\n\nQRateX ekibine katıldığın için çok mutluyuz! Sürecin boyunca yanındayız.\n\n' };
      case 'reminder': return { department: 'Genel', subject: 'QRateX — Hatırlatma', body: 'Merhaba,\n\nKüçük bir hatırlatma:\n\n' };
      case 'minimal': return { department: 'Genel', subject: 'QRateX', body: '' };
      case 'task':
      default: return { department: 'Genel', subject: 'QRateX — Görev', body: 'Selamlar,\n\n' };
    }
  };

  const addTemplate = (kind: InternEmailKind = 'task') => {
    const id = `ozel-${Date.now()}`;
    const t: Template = { id, kind, recipientName: '', email: '', department: 'Genel', subject: '', body: '', ...kindDefaults(kind) };
    setTemplates((prev) => [...prev, t]);
    setSelectedId(id);
    setDirty(true);
    setNewMenuOpen(false);
  };

  const removeSelected = () => {
    if (!selected || !confirm('Bu şablon silinsin mi? (Kaydet dersen kalıcı olur)')) return;
    // Kalan listeden seç (stale `templates` yerine güncel filtreden) — silinen id'ye düşme.
    setTemplates((prev) => {
      const next = prev.filter((t) => t.id !== selectedId);
      setSelectedId(next[0]?.id ?? null);
      return next;
    });
    setDirty(true);
  };

  // CANLI önizleme — o anki (kaydedilmemiş) taslağı POST edip yeni sekmede gösterir.
  // (Önceki bug: önizleme kayıtlı şablonu okuyordu; yeni/düzenlenen taslak boş/404 dönüyordu.)
  const openPreview = async () => {
    if (!selected) return;
    try {
      const res = await fetch('/api/admin/intern-emails/preview', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ template: selected }),
      });
      if (!res.ok) throw new Error('Önizleme oluşturulamadı');
      const html = await res.text();
      const w = window.open('', '_blank');
      if (!w) { toast.error('Açılır pencere engellendi — tarayıcı iznini kontrol et.'); return; }
      w.document.open(); w.document.write(html); w.document.close();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Önizleme açılamadı');
    }
  };

  const stat = selected ? stats[selected.id] : undefined;
  const testStat = selected ? testStats[selected.id] : undefined;

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

      <div className="grid items-start gap-5 lg:grid-cols-[320px_1fr]">
        {/* SOL: şablon listesi — sticky + kendi içinde scroll (uzun liste sağ paneli itmesin) */}
        <div className="space-y-3 lg:sticky lg:top-4 lg:self-start">
          <div className="grid grid-cols-2 gap-2">
            <div className="relative">
              <Button onClick={() => setNewMenuOpen((o) => !o)} variant="outline" className="w-full gap-2"><Plus className="h-4 w-4" /> Yeni</Button>
              {newMenuOpen && (
                <>
                  {/* dışına tıklayınca kapat */}
                  <button className="fixed inset-0 z-10 cursor-default" aria-hidden onClick={() => setNewMenuOpen(false)} />
                  <div className="absolute left-0 top-full z-20 mt-1 w-64 overflow-hidden rounded-xl border border-border bg-popover shadow-xl">
                    <p className="border-b border-border/60 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Şablon türü seç</p>
                    {INTERN_EMAIL_KINDS.map((k) => (
                      <button
                        key={k.value}
                        onClick={() => addTemplate(k.value)}
                        className="flex w-full items-start gap-2.5 px-3 py-2.5 text-left transition-colors hover:bg-muted/60"
                      >
                        <span className="text-lg leading-none">{k.emoji}</span>
                        <span className="min-w-0">
                          <span className="block text-sm font-medium text-foreground">{k.label}</span>
                          <span className="block text-xs text-muted-foreground">{k.hint}</span>
                        </span>
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>
            <Button
              onClick={() => setConfirmModal({ mode: 'bulk' })}
              disabled={busy !== null || bulkCount === 0 || dirty}
              className={`gap-2 ${TW_BRAND_CTA_BUTTON}`}
              title={dirty ? 'Önce değişiklikleri kaydet' : bulkCount === 0 ? 'Alıcısı olan şablon yok' : `${bulkCount} şablonun gerçek alıcılarına gönder`}
            >
              {busy === 'bulk' ? <Loader2 className="h-4 w-4 animate-spin" /> : <SendHorizonal className="h-4 w-4" />} Toplu ({bulkCount})
            </Button>
          </div>

          {/* Arama */}
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Şablon ara (isim, e-posta, departman)…" className="pl-8" />
          </div>

          {dirty && (
            <Button onClick={saveAll} disabled={busy === 'save'} className={`w-full gap-2 ${TW_BRAND_CTA_BUTTON}`}>
              {busy === 'save' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Değişiklikleri kaydet
            </Button>
          )}

          {loading ? (
            <div className="space-y-2">{[...Array(6)].map((_, i) => <div key={i} className="h-12 animate-pulse rounded-lg bg-muted/50" />)}</div>
          ) : Object.keys(grouped).length === 0 ? (
            <p className="rounded-lg border border-dashed border-border px-3 py-6 text-center text-sm text-muted-foreground">Eşleşen şablon yok.</p>
          ) : (
            <div className="max-h-[calc(100vh-15rem)] space-y-4 overflow-y-auto pr-1">
              {Object.entries(grouped).map(([dept, items]) => (
                <div key={dept}>
                  <p className="mb-1.5 px-1 text-xs font-bold uppercase tracking-wider text-muted-foreground">{deptEmoji(dept)} {dept}</p>
                  <div className="space-y-1">
                    {items.map((t) => {
                      const s = stats[t.id];
                      const active = t.id === selectedId;
                      const noEmail = !t.email.trim();
                      // Aynı ada sahip birden çok şablon varsa email'i de göster (ayırt et).
                      const showEmail = t.recipientName && dupNames.has(t.recipientName.trim());
                      return (
                        <button
                          key={t.id}
                          onClick={() => setSelectedId(t.id)}
                          className={`flex w-full items-center gap-2 rounded-lg border px-3 py-2 text-left text-sm transition-colors ${active ? 'border-primary bg-primary/10' : 'border-border hover:bg-muted/50'}`}
                        >
                          {(t.kind ?? 'task') !== 'task' && (
                            <span className="shrink-0 text-base leading-none" title={kindMeta(t.kind).label}>{kindMeta(t.kind).emoji}</span>
                          )}
                          <span className="min-w-0 flex-1">
                            <span className="block truncate font-medium">{t.recipientName || t.email || 'İsimsiz'}</span>
                            {showEmail && <span className="block truncate text-xs text-muted-foreground">{t.email}</span>}
                          </span>
                          {noEmail && (
                            <span title="Alıcı e-postası boş — kaydedilmez" className="shrink-0 text-amber-500"><AlertTriangle className="h-4 w-4" /></span>
                          )}
                          {s && s.errored > 0 && (
                            <span title={`${s.errored} gönderim hatası`} className="shrink-0 text-red-500"><XCircle className="h-4 w-4" /></span>
                          )}
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
        </div>

        {/* SAĞ: düzenleme + gönderim + açılma durumu */}
        {selected ? (
          <div className="space-y-4">
            {/* GÖNDERİM + AÇILMA DURUMU paneli (gitti mi + okundu mu tek yerde) */}
            {stat && (stat.sent > 0 || stat.errored > 0) && (
              <Card className="border-primary/20 bg-gradient-to-br from-primary/5 to-fuchsia-500/5">
                <CardContent className="space-y-3 py-4">
                  {/* Özet rozetleri */}
                  <div className="flex flex-wrap items-center gap-2.5 text-sm">
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/10 px-3 py-1 font-semibold text-emerald-600 dark:text-emerald-400">
                      <CheckCircle2 className="h-4 w-4" /> {stat.sent} gitti
                    </span>
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-3 py-1 font-semibold text-primary">
                      <Eye className="h-4 w-4" /> {stat.opened} açıldı
                    </span>
                    {stat.errored > 0 && (
                      <span className="inline-flex items-center gap-1.5 rounded-full bg-red-500/10 px-3 py-1 font-semibold text-red-600 dark:text-red-400">
                        <XCircle className="h-4 w-4" /> {stat.errored} hata
                      </span>
                    )}
                    {stat.lastSentAt && (
                      <span className="ml-auto text-xs text-muted-foreground">
                        Son gönderim: {new Date(stat.lastSentAt).toLocaleString('tr-TR', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' })}
                      </span>
                    )}
                  </div>
                  {/* Alıcı-bazlı durum listesi */}
                  <div className="space-y-1 border-t border-border/60 pt-2.5">
                    {stat.recipients.map((r) => (
                      <div key={r.email} className="flex items-center gap-2 text-xs">
                        {r.status === 'error' ? (
                          <span className="inline-flex items-center gap-1 font-semibold text-red-500" title={r.error ?? 'Gönderim hatası'}>
                            <XCircle className="h-3.5 w-3.5" /> Hata
                          </span>
                        ) : r.openedAt ? (
                          <span className="inline-flex items-center gap-1 font-semibold text-emerald-600 dark:text-emerald-400">
                            <Eye className="h-3.5 w-3.5" /> Açıldı
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-muted-foreground">
                            <Clock className="h-3.5 w-3.5" /> Bekliyor
                          </span>
                        )}
                        <span className="min-w-0 flex-1 truncate text-foreground">{r.email}</span>
                        {r.status !== 'error' && r.openedAt && (
                          <span className="shrink-0 text-muted-foreground">
                            {new Date(r.openedAt).toLocaleString('tr-TR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                            {r.openCount > 1 && ` · ${r.openCount}×`}
                          </span>
                        )}
                        {r.status === 'error' && r.error && (
                          <span className="shrink-0 max-w-[45%] truncate text-red-400" title={r.error}>{r.error}</span>
                        )}
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}

            <Card>
              <CardContent className="space-y-4 p-5">
                {/* Şablon türü seçici (chip'ler) — mailin görsel kimliğini belirler */}
                <div className="space-y-1.5">
                  <Label className="text-xs">Şablon türü</Label>
                  <div className="flex flex-wrap gap-1.5">
                    {INTERN_EMAIL_KINDS.map((k) => {
                      const active = (selected.kind ?? 'task') === k.value;
                      return (
                        <button
                          key={k.value}
                          onClick={() => updateSelected({ kind: k.value })}
                          title={k.hint}
                          className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${active ? 'border-primary bg-primary/10 text-primary' : 'border-border text-muted-foreground hover:bg-muted/50'}`}
                        >
                          <span>{k.emoji}</span> {k.label}
                        </button>
                      );
                    })}
                  </div>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-1"><Label className="text-xs">Departman</Label>
                    <Input value={selected.department} onChange={(e) => updateSelected({ department: e.target.value })} /></div>
                  <div className="space-y-1"><Label className="text-xs">Alıcı adı</Label>
                    <Input value={selected.recipientName} onChange={(e) => updateSelected({ recipientName: e.target.value })} /></div>
                </div>
                <div className="space-y-1"><Label className="text-xs">E-posta (çoklu için virgül)</Label>
                  <Input value={selected.email} onChange={(e) => updateSelected({ email: e.target.value })} placeholder="ornek@gmail.com" /></div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-1"><Label className="text-xs">Konu</Label>
                    <Input value={selected.subject} onChange={(e) => updateSelected({ subject: e.target.value })} /></div>
                  {(selected.kind ?? 'task') === 'task' && (
                    <div className="space-y-1">
                      <Label className="flex items-center gap-1.5 text-xs"><CalendarClock className="h-3.5 w-3.5" /> Son teslim tarihi</Label>
                      <Input
                        value={selected.deadline ?? ''}
                        onChange={(e) => updateSelected({ deadline: e.target.value })}
                        placeholder="14 Ağustos 17.00"
                      />
                      <p className="text-[11px] leading-tight text-muted-foreground">Bu maile özel bitiş tarihi. Boş bırakırsan varsayılan (14 Ağustos 17.00) kullanılır.</p>
                    </div>
                  )}
                </div>
                <div className="space-y-1">
                  <div className="flex items-center justify-between">
                    <Label className="text-xs">Mail içeriği</Label>
                    <div className="flex flex-wrap items-center gap-1">
                      <span className="text-[10px] text-muted-foreground">Ekle:</span>
                      {MAIL_VARIABLES.map((v) => (
                        <button
                          key={v.token}
                          type="button"
                          onClick={() => updateSelected({ body: (selected.body ?? '') + v.token })}
                          title={`${v.label} — gönderimde otomatik dolar`}
                          className="rounded border border-border bg-muted/40 px-1.5 py-0.5 font-mono text-[10px] text-primary hover:bg-primary/10"
                        >
                          {v.token}
                        </button>
                      ))}
                    </div>
                  </div>
                  <Textarea value={selected.body} onChange={(e) => updateSelected({ body: e.target.value })} rows={14} className="font-mono text-xs leading-relaxed" />
                  <p className="text-[11px] leading-tight text-muted-foreground">{'İpucu: {{isim}}, {{departman}} gibi değişkenler gönderim anında her alıcı için otomatik dolar.'}</p>
                </div>
                <div className="flex items-center justify-between pt-1">
                  <Button onClick={removeSelected} variant="ghost" size="sm" className="gap-1.5 text-destructive hover:bg-destructive/10"><Trash2 className="h-4 w-4" /> Sil</Button>
                  <Button onClick={openPreview} variant="outline" size="sm" className="gap-1.5"><Eye className="h-4 w-4" /> Canlı önizleme</Button>
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
                  <Button onClick={doTest} disabled={busy === 'test' || !testTo.trim()} variant="outline" className="gap-2">
                    {busy === 'test' ? <Loader2 className="h-4 w-4 animate-spin" /> : <FlaskConical className="h-4 w-4" />} Test gönder
                  </Button>
                </div>

                {/* TEST maillerinin gönderim + açılma durumu (kendine attığın denemeleri de izle) */}
                {testStat && (testStat.sent > 0 || testStat.errored > 0) && (
                  <div className="rounded-lg border border-dashed border-primary/30 bg-primary/[0.03] p-3">
                    <div className="mb-2 flex flex-wrap items-center gap-2 text-xs">
                      <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 font-semibold uppercase tracking-wide text-muted-foreground">
                        <FlaskConical className="h-3 w-3" /> Test denemeleri
                      </span>
                      <span className="inline-flex items-center gap-1 font-semibold text-emerald-600 dark:text-emerald-400"><CheckCircle2 className="h-3.5 w-3.5" /> {testStat.sent} gitti</span>
                      <span className="inline-flex items-center gap-1 font-semibold text-primary"><Eye className="h-3.5 w-3.5" /> {testStat.opened} açıldı</span>
                      {testStat.errored > 0 && (
                        <span className="inline-flex items-center gap-1 font-semibold text-red-500"><XCircle className="h-3.5 w-3.5" /> {testStat.errored} hata</span>
                      )}
                      <button onClick={load} className="ml-auto inline-flex items-center gap-1 text-primary underline-offset-2 hover:underline" title="Durumu yenile">
                        <Loader2 className={`h-3 w-3 ${loading ? 'animate-spin' : ''}`} /> Yenile
                      </button>
                    </div>
                    <div className="space-y-1">
                      {testStat.recipients.map((r) => (
                        <div key={r.email} className="flex items-center gap-2 text-xs">
                          {r.status === 'error' ? (
                            <span className="inline-flex items-center gap-1 font-semibold text-red-500" title={r.error ?? 'Gönderim hatası'}><XCircle className="h-3.5 w-3.5" /> Hata</span>
                          ) : r.openedAt ? (
                            <span className="inline-flex items-center gap-1 font-semibold text-emerald-600 dark:text-emerald-400"><Eye className="h-3.5 w-3.5" /> Açıldı</span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-muted-foreground"><Clock className="h-3.5 w-3.5" /> Bekliyor</span>
                          )}
                          <span className="min-w-0 flex-1 truncate text-foreground">{r.email}</span>
                          {r.status !== 'error' && r.openedAt && (
                            <span className="shrink-0 text-muted-foreground">
                              {new Date(r.openedAt).toLocaleString('tr-TR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                              {r.openCount > 1 && ` · ${r.openCount}×`}
                            </span>
                          )}
                        </div>
                      ))}
                    </div>
                    <p className="mt-2 text-[11px] leading-tight text-muted-foreground">
                      Açılma, mail istemcisi görselleri yüklediğinde kaydedilir. Bazı istemciler görselleri engelleyebilir (o zaman &quot;Bekliyor&quot; kalır). &quot;Yenile&quot;ye basıp güncel durumu gör.
                    </p>
                  </div>
                )}

                <div className="h-px bg-border" />
                {dirty && (
                  <div className="flex items-start gap-2 rounded-lg bg-amber-50 p-2.5 text-xs text-amber-700 dark:bg-amber-500/10 dark:text-amber-300">
                    <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                    <span>Kaydedilmemiş değişikliklerin var. Gönderilen içerik son <b>KAYITLI</b> hâldir — önce <b>Kaydet</b>.</span>
                  </div>
                )}
                <div className="flex items-center justify-between">
                  <p className="text-sm text-muted-foreground">Gerçek alıcı: <b className="text-foreground">{selected.email || '—'}</b></p>
                  <Button onClick={() => setConfirmModal({ mode: 'send' })} disabled={busy !== null || !selected.email || dirty} title={dirty ? 'Önce değişiklikleri kaydet' : undefined} className={`gap-2 ${TW_BRAND_CTA_BUTTON}`}>
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

      {/* ── GÜZEL GÖNDERİM ONAY MODALI (tekli + toplu) ── */}
      <Dialog open={confirmModal !== null} onOpenChange={(o) => { if (!o) setConfirmModal(null); }}>
        <DialogContent className="sm:max-w-md overflow-hidden p-0">
          {/* Dekoratif hero şeridi */}
          <div className="relative bg-gradient-to-br from-primary via-fuchsia-500 to-primary px-6 py-7 text-center">
            <div className="mx-auto mb-3 grid h-14 w-14 place-items-center rounded-2xl bg-white/15 backdrop-blur-sm ring-1 ring-white/30">
              {confirmModal?.mode === 'bulk'
                ? <SendHorizonal className="h-7 w-7 text-white" />
                : <Send className="h-7 w-7 text-white" />}
            </div>
            <DialogHeader className="space-y-1">
              <DialogTitle className="text-center text-xl font-extrabold text-white">
                {confirmModal?.mode === 'bulk' ? 'Toplu görev gönderimi' : 'Görev maili gönder'}
              </DialogTitle>
              <DialogDescription className="text-center text-sm text-white/85">
                {confirmModal?.mode === 'bulk'
                  ? 'Bu işlem tüm stajyerlere gerçek mail gönderir.'
                  : 'Bu işlem gerçek alıcıya mail gönderir.'}
              </DialogDescription>
            </DialogHeader>
          </div>

          {/* İçerik */}
          <div className="space-y-4 px-6 py-5">
            {confirmModal?.mode === 'bulk' ? (
              <>
                <div className="rounded-xl border border-primary/20 bg-primary/[0.04] p-4">
                  <div className="flex items-center gap-3">
                    <div className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-primary/10 text-lg font-black text-primary">{bulkCount}</div>
                    <div className="min-w-0 text-sm">
                      <p className="font-semibold text-foreground">şablon gönderilecek</p>
                      <p className="text-muted-foreground">Her şablon kendi gerçek alıcı(lar)ına iletilir.</p>
                    </div>
                  </div>
                </div>
                <div className="flex items-start gap-2 rounded-lg bg-amber-50 p-3 text-xs text-amber-700 dark:bg-amber-500/10 dark:text-amber-300">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                  <span>Gerçek mail gönderimi. Önce bir şablonu <b>Test</b> ile denemeni öneririz. Bu işlem geri alınamaz.</span>
                </div>
              </>
            ) : (
              <>
                <div className="rounded-xl border border-border bg-muted/30 p-4 text-sm">
                  <div className="flex items-center gap-2 text-muted-foreground"><Users className="h-4 w-4" /> Alıcı</div>
                  <p className="mt-1 break-all font-semibold text-foreground">{selected?.email || '—'}</p>
                  {selected?.recipientName && <p className="text-xs text-muted-foreground">{selected.recipientName} · {selected.department}</p>}
                </div>
                <div className="flex items-start gap-2 rounded-lg bg-amber-50 p-3 text-xs text-amber-700 dark:bg-amber-500/10 dark:text-amber-300">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                  <span>Gerçek mail gönderimi, geri alınamaz. Emin değilsen önce <b>Test</b> ile dene.</span>
                </div>
              </>
            )}
          </div>

          <DialogFooter className="gap-2 border-t border-border bg-muted/20 px-6 py-4 sm:justify-between">
            <Button variant="ghost" onClick={() => setConfirmModal(null)} className="gap-1.5">Vazgeç</Button>
            <Button onClick={confirmSend} className={`gap-2 ${TW_BRAND_CTA_BUTTON}`}>
              {confirmModal?.mode === 'bulk'
                ? <><SendHorizonal className="h-4 w-4" /> Evet, {bulkCount} şablonu gönder</>
                : <><Send className="h-4 w-4" /> Evet, gönder</>}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
