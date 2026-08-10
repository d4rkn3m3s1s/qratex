'use client';

import { useState, useEffect, useCallback } from 'react';
import { DashboardPageHero } from '@/components/layout/dashboard-page-hero';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Inbox, RefreshCw, Loader2, Search, Mail, User, AlertTriangle, Users, Circle, ArrowLeft,
} from 'lucide-react';
import { toast } from '@/lib/admin-toast';

interface MsgListItem {
  id: string;
  fromEmail: string;
  fromName: string | null;
  subject: string;
  snippet: string;
  sentAt: string;
  seen: boolean;
  isFromIntern: boolean;
  matchedRecipientName: string | null;
  matchedDepartment: string | null;
}
interface MsgFull extends MsgListItem {
  bodyText: string | null;
  bodyHtml: string | null;
  toEmail: string | null;
}

const fmtDate = (s: string) =>
  new Date(s).toLocaleString('tr-TR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

export default function InboxPage() {
  const [messages, setMessages] = useState<MsgListItem[]>([]);
  const [counts, setCounts] = useState({ all: 0, intern: 0, unread: 0 });
  const [inboxConfigured, setInboxConfigured] = useState(true);
  const [filter, setFilter] = useState<'all' | 'intern'>('all');
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const [openMsg, setOpenMsg] = useState<MsgFull | null>(null);
  const [openLoading, setOpenLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ filter });
      if (query.trim()) params.set('q', query.trim());
      const res = await fetch(`/api/admin/inbox?${params}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'Yüklenemedi');
      setMessages(data.messages ?? []);
      setCounts(data.counts ?? { all: 0, intern: 0, unread: 0 });
      setInboxConfigured(!!data.inboxConfigured);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Gelen kutusu yüklenemedi');
    } finally {
      setLoading(false);
    }
  }, [filter, query]);

  useEffect(() => { load(); }, [load]);

  const sync = async () => {
    setSyncing(true);
    try {
      const res = await fetch('/api/admin/inbox', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ limit: 40 }),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data?.error || 'Senkronizasyon başarısız');
      toast.success(`Senkronize edildi ✓ (${data.stored} yeni, ${data.matched} stajyer eşleşti)`);
      load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Senkronizasyon başarısız');
    } finally {
      setSyncing(false);
    }
  };

  const openMessage = async (id: string) => {
    setOpenId(id);
    setOpenMsg(null);
    setOpenLoading(true);
    try {
      const res = await fetch(`/api/admin/inbox/${id}`);
      const data = await res.json();
      if (!data.success) throw new Error(data?.error || 'Mail açılamadı');
      setOpenMsg(data.message);
      // Listede okundu işaretle (yerel).
      setMessages((prev) => prev.map((m) => (m.id === id ? { ...m, seen: true } : m)));
      setCounts((c) => ({ ...c, unread: Math.max(0, c.unread - (messages.find((m) => m.id === id)?.seen ? 0 : 1)) }));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Mail açılamadı');
    } finally {
      setOpenLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <DashboardPageHero
        icon={<Inbox className="text-white" />}
        title="Gelen Kutusu"
        description="qratex.co@gmail.com gelen kutusu. Stajyerlerden (görev alıcıları) gelen mailler otomatik ayrılır."
      />

      {!inboxConfigured && (
        <Card className="border-amber-400/50 bg-amber-50/50 dark:bg-amber-500/5">
          <CardContent className="flex items-center gap-2 py-3 text-sm text-amber-700 dark:text-amber-300">
            <AlertTriangle className="h-4 w-4" /> IMAP yapılandırması eksik. Gmail app-password (SMTP_USER/PASS) yeterli — env kontrol et.
          </CardContent>
        </Card>
      )}

      {/* Özet istatistik kartları */}
      <div className="grid grid-cols-3 gap-3">
        <StatCard icon={<Mail className="h-5 w-5" />} label="Toplam mail" value={counts.all} tone="primary" />
        <StatCard icon={<Users className="h-5 w-5" />} label="Stajyerden" value={counts.intern} tone="emerald" />
        <StatCard icon={<Circle className="h-5 w-5" />} label="Okunmadı" value={counts.unread} tone="fuchsia" />
      </div>

      <div className="grid items-start gap-5 lg:grid-cols-[380px_1fr]">
        {/* SOL: liste + filtre + sync — mobilde mail açıkken gizlenir (sağ panel öne çıksın) */}
        <div className={`space-y-3 lg:sticky lg:top-4 lg:self-start lg:block ${openId ? 'hidden' : 'block'}`}>
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Ara (kişi, konu)…" className="pl-8" />
            </div>
            <Button onClick={sync} disabled={syncing} variant="outline" className="gap-2 shrink-0" title="Yeni mailleri çek">
              {syncing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />} Yenile
            </Button>
          </div>

          {/* Filtre sekmeleri */}
          <div className="flex gap-1.5">
            <FilterChip active={filter === 'all'} onClick={() => setFilter('all')} icon={<Mail className="h-3.5 w-3.5" />} label="Tümü" count={counts.all} />
            <FilterChip active={filter === 'intern'} onClick={() => setFilter('intern')} icon={<Users className="h-3.5 w-3.5" />} label="Stajyerler" count={counts.intern} accent />
            {counts.unread > 0 && (
              <span className="ml-auto inline-flex items-center gap-1 self-center rounded-full bg-primary/10 px-2.5 py-1 text-xs font-semibold text-primary">
                {counts.unread} okunmadı
              </span>
            )}
          </div>

          {loading ? (
            <div className="space-y-2">{[...Array(6)].map((_, i) => <div key={i} className="h-16 animate-pulse rounded-lg bg-muted/50" />)}</div>
          ) : messages.length === 0 ? (
            <div className="rounded-lg border border-dashed border-border px-3 py-10 text-center text-sm text-muted-foreground">
              {counts.all === 0 ? 'Henüz mail çekilmedi. "Yenile"ye bas.' : 'Eşleşen mail yok.'}
            </div>
          ) : (
            <div className="max-h-[calc(100vh-16rem)] space-y-1.5 overflow-y-auto pr-1">
              {messages.map((m) => {
                const active = m.id === openId;
                return (
                  <button
                    key={m.id}
                    onClick={() => openMessage(m.id)}
                    className={`flex w-full flex-col gap-0.5 rounded-lg border px-3 py-2.5 text-left transition-all duration-150 animate-in fade-in slide-in-from-left-1 hover:shadow-sm ${active ? 'border-primary bg-primary/10' : 'border-border hover:bg-muted/50'}`}
                  >
                    <div className="flex items-center gap-2">
                      {!m.seen && <Circle className="h-2 w-2 shrink-0 fill-primary text-primary" />}
                      <span className={`min-w-0 flex-1 truncate text-sm ${m.seen ? 'font-medium' : 'font-bold'}`}>
                        {m.fromName || m.fromEmail}
                      </span>
                      <span className="shrink-0 text-[11px] text-muted-foreground">{fmtDate(m.sentAt)}</span>
                    </div>
                    <span className="truncate text-xs font-medium text-foreground/90">{m.subject || '(konu yok)'}</span>
                    <span className="truncate text-xs text-muted-foreground">{m.snippet}</span>
                    {m.isFromIntern && (
                      <span className="mt-0.5 inline-flex w-fit items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-semibold text-emerald-600 dark:text-emerald-400">
                        <User className="h-2.5 w-2.5" /> {m.matchedRecipientName || 'Stajyer'}{m.matchedDepartment ? ` · ${m.matchedDepartment}` : ''}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* SAĞ: mail görüntüleyici */}
        {openId ? (
          <Card className="animate-in fade-in slide-in-from-bottom-2 duration-200">
            <CardContent className="p-0">
              {openLoading || !openMsg ? (
                <div className="grid place-items-center py-24 text-muted-foreground"><Loader2 className="h-6 w-6 animate-spin" /></div>
              ) : (
                <div>
                  {/* Başlık */}
                  <div className="border-b border-border p-5">
                    <button onClick={() => setOpenId(null)} className="mb-3 inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground lg:hidden">
                      <ArrowLeft className="h-3.5 w-3.5" /> Listeye dön
                    </button>
                    <h2 className="text-lg font-bold text-foreground">{openMsg.subject || '(konu yok)'}</h2>
                    <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
                      <span className="font-medium text-foreground">{openMsg.fromName || openMsg.fromEmail}</span>
                      <span className="text-muted-foreground">&lt;{openMsg.fromEmail}&gt;</span>
                      <span className="ml-auto text-xs text-muted-foreground">{fmtDate(openMsg.sentAt)}</span>
                    </div>
                    {openMsg.isFromIntern && (
                      <span className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-emerald-500/10 px-3 py-1 text-xs font-semibold text-emerald-600 dark:text-emerald-400">
                        <Users className="h-3.5 w-3.5" /> Görev alıcısı: {openMsg.matchedRecipientName}{openMsg.matchedDepartment ? ` · ${openMsg.matchedDepartment}` : ''}
                      </span>
                    )}
                  </div>
                  {/* Gövde */}
                  <div className="p-5">
                    {openMsg.bodyHtml ? (
                      <iframe
                        title="mail"
                        sandbox=""
                        className="h-[60vh] w-full rounded-lg border border-border bg-white"
                        srcDoc={withStrictCsp(openMsg.bodyHtml)}
                      />
                    ) : (
                      <pre className="whitespace-pre-wrap break-words font-sans text-sm leading-relaxed text-foreground">{openMsg.bodyText || '(boş içerik)'}</pre>
                    )}
                  </div>
                  {/* Yanıt kısayolu (mail istemcisinde aç) */}
                  <div className="flex justify-end border-t border-border p-4">
                    <a
                      href={`mailto:${openMsg.fromEmail}?subject=${encodeURIComponent('Re: ' + (openMsg.subject || ''))}`}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-sm font-medium hover:bg-muted/50"
                    >
                      <Mail className="h-4 w-4" /> Yanıtla
                    </a>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        ) : (
          <Card><CardContent className="grid place-items-center py-24 text-center text-muted-foreground">
            <Inbox className="mb-3 h-10 w-10 opacity-40" />
            <p>Okumak için bir mail seç.</p>
            <p className="mt-1 text-xs">Yeni mailleri çekmek için &quot;Yenile&quot;ye bas.</p>
          </CardContent></Card>
        )}
      </div>
    </div>
  );
}

function StatCard({ icon, label, value, tone }: {
  icon: React.ReactNode; label: string; value: number; tone: 'primary' | 'emerald' | 'fuchsia';
}) {
  const tones = {
    primary: 'from-primary/10 to-primary/5 text-primary',
    emerald: 'from-emerald-500/10 to-emerald-500/5 text-emerald-600 dark:text-emerald-400',
    fuchsia: 'from-fuchsia-500/10 to-fuchsia-500/5 text-fuchsia-600 dark:text-fuchsia-400',
  }[tone];
  return (
    <Card className={`overflow-hidden bg-gradient-to-br ${tones} transition-transform hover:-translate-y-0.5`}>
      <CardContent className="flex items-center gap-3 p-4">
        <div className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-background/60 ${tones.split(' ').slice(-1)}`}>{icon}</div>
        <div className="min-w-0">
          <div className="text-2xl font-black leading-none text-foreground tabular-nums">{value}</div>
          <div className="mt-0.5 truncate text-xs text-muted-foreground">{label}</div>
        </div>
      </CardContent>
    </Card>
  );
}

/**
 * HTML mail gövdesine KATI CSP meta enjekte eder. sandbox="" script'i keser ama harici
 * subresource (img/css/font/beacon) isteklerini KESMEZ → beacon ile admin IP/konum/açılma-anı
 * sızıntısı olurdu. Bu CSP ile harici hiçbir kaynak yüklenmez; sadece gömülü data: görseller görünür.
 */
function withStrictCsp(html: string): string {
  const meta = `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data:; style-src 'unsafe-inline' data:; font-src data:; media-src data:; base-uri 'none'; form-action 'none';">`;
  if (/<head[^>]*>/i.test(html)) return html.replace(/<head[^>]*>/i, (m) => m + meta);
  if (/<html[^>]*>/i.test(html)) return html.replace(/<html[^>]*>/i, (m) => `${m}<head>${meta}</head>`);
  return `<!doctype html><html><head>${meta}</head><body>${html}</body></html>`;
}

function FilterChip({ active, onClick, icon, label, count, accent }: {
  active: boolean; onClick: () => void; icon: React.ReactNode; label: string; count: number; accent?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
        active
          ? accent ? 'border-emerald-500 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400' : 'border-primary bg-primary/10 text-primary'
          : 'border-border text-muted-foreground hover:bg-muted/50'
      }`}
    >
      {icon} {label} <span className="opacity-70">({count})</span>
    </button>
  );
}
