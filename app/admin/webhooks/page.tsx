'use client';

import { useState, useEffect } from 'react';
import { AdminPremiumHero } from '@/components/admin/admin-premium-hero';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Loader2, Plus, Trash2, Link2 } from 'lucide-react';
import { toast } from '@/lib/admin-toast';

type WebhookRow = {
  id: string;
  url: string;
  secret: string | null;
  events: string[];
  isActive: boolean;
  createdAt: string;
  createdBy: { name: string | null; email: string | null };
};

// Dispatcher'ın (lib/webhook-dispatch) gerçekten fire ettiği olaylarla hizalı.
const EVENT_OPTIONS = [
  'feedback.created',
  'feedback.replied',
  'remedy.created',
  'incident.created',
  'badge.earned',
];

type DeliverySummary = {
  webhookId: string;
  total: number;
  success: number;
  failed: number;
  lastStatus: number | null;
  lastError: string | null;
  lastAt: string | null;
};
type RecentDelivery = {
  webhookId: string;
  targetEvent: string | null;
  ok: boolean;
  status: number | null;
  error: string | null;
  at: string;
};

export default function AdminWebhooksPage() {
  const [list, setList] = useState<WebhookRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [url, setUrl] = useState('');
  const [secret, setSecret] = useState('');
  const [events, setEvents] = useState<string[]>(['feedback.created']);
  const [summaries, setSummaries] = useState<DeliverySummary[]>([]);
  const [recent, setRecent] = useState<RecentDelivery[]>([]);

  const fetchList = () => {
    fetch('/api/admin/webhooks')
      .then((r) => r.json())
      .then((data) => setList(Array.isArray(data) ? data : []))
      .catch(() => toast.error('Liste yüklenemedi'))
      .finally(() => setLoading(false));
  };

  const fetchDeliveries = () => {
    fetch('/api/admin/webhooks/deliveries')
      .then((r) => r.json())
      .then((data) => {
        setSummaries(Array.isArray(data.summaries) ? data.summaries : []);
        setRecent(Array.isArray(data.recent) ? data.recent : []);
      })
      .catch(() => {/* teslim geçmişi opsiyonel; sessizce geç */});
  };

  useEffect(() => {
    fetchList();
    fetchDeliveries();
  }, []);

  const summaryFor = (id: string) => summaries.find((s) => s.webhookId === id);

  const add = () => {
    const u = url.trim();
    if (!u) {
      toast.error('URL girin');
      return;
    }
    setSaving(true);
    fetch('/api/admin/webhooks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: u, secret: secret.trim() || undefined, events }),
    })
      .then((r) => r.json())
      .then((data) => {
        if (data.error) throw new Error(data.error);
        toast.success('Webhook eklendi');
        setUrl('');
        setSecret('');
        setEvents(['feedback.created']);
        fetchList();
      })
      .catch((e) => toast.error(e instanceof Error ? e.message : 'Eklenemedi'))
      .finally(() => setSaving(false));
  };

  const remove = (id: string) => {
    if (!confirm('Bu webhook silinsin mi?')) return;
    fetch(`/api/admin/webhooks?id=${id}`, { method: 'DELETE' })
      .then((r) => r.json())
      .then((data) => {
        if (data.error) throw new Error(data.error);
        toast.success('Webhook silindi');
        fetchList();
      })
      .catch((e) => toast.error(e instanceof Error ? e.message : 'Silinemedi'));
  };

  return (
    <div className="flex flex-1 flex-col gap-6 p-6">
      <AdminPremiumHero
        title="Webhook'lar"
        description="Geri bildirim, rozet, görev vb. olayları dış sistemlere POST ile bildirin"
        icon={<Link2 className="text-white" />}
      />
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Link2 className="h-5 w-5" />
            Yeni webhook
          </CardTitle>
          <CardDescription>Olay gerçekleştiğinde isteğin URL’ine POST atılır (payload JSON).</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>URL</Label>
            <Input
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://..."
            />
          </div>
          <div className="space-y-2">
            <Label>Secret (opsiyonel, HMAC imza için)</Label>
            <Input
              type="password"
              value={secret}
              onChange={(e) => setSecret(e.target.value)}
              placeholder="Boş bırakılabilir"
            />
          </div>
          <div className="flex flex-wrap gap-2">
            {EVENT_OPTIONS.map((ev) => (
              <label key={ev} className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={events.includes(ev)}
                  onChange={(e) =>
                    setEvents((prev) =>
                      e.target.checked ? [...prev, ev] : prev.filter((x) => x !== ev)
                    )
                  }
                />
                {ev}
              </label>
            ))}
          </div>
          <Button onClick={add} disabled={saving}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
            Ekle
          </Button>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Kayıtlı webhook'lar</CardTitle>
          <CardDescription>Silme işlemi geri alınamaz.</CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-sm text-muted-foreground">Yükleniyor...</p>
          ) : list.length === 0 ? (
            <p className="text-sm text-muted-foreground">Henüz webhook yok.</p>
          ) : (
            <ul className="space-y-3">
              {list.map((w) => {
                const s = summaryFor(w.id);
                const rate = s && s.total > 0 ? Math.round((s.success / s.total) * 100) : null;
                const healthClass =
                  rate == null
                    ? 'bg-muted text-muted-foreground'
                    : rate >= 95
                    ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300'
                    : rate >= 70
                    ? 'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300'
                    : 'bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-300';
                return (
                  <li key={w.id} className="rounded-lg border p-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="min-w-0">
                        <p className="font-mono text-sm break-all">{w.url}</p>
                        <p className="text-xs text-muted-foreground">
                          Olaylar: {(w.events || []).join(', ')} · {new Date(w.createdAt).toLocaleString('tr-TR')}
                        </p>
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        <span className={`rounded px-1.5 py-0.5 text-xs ${healthClass}`}>
                          {rate == null ? 'Teslim yok' : `%${rate} başarı`}
                        </span>
                        <Button variant="ghost" size="icon" onClick={() => remove(w.id)}>
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </div>
                    </div>
                    {s && (
                      <p className="mt-2 text-xs text-muted-foreground">
                        {s.total} teslim · {s.success} başarılı · {s.failed} başarısız
                        {s.lastAt && ` · Son: ${new Date(s.lastAt).toLocaleString('tr-TR')}`}
                        {s.lastError && (
                          <span className="text-rose-600 dark:text-rose-400"> · Hata: {s.lastError}</span>
                        )}
                        {s.lastStatus != null && !s.lastError && ` · HTTP ${s.lastStatus}`}
                      </p>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>

      {/* Son başarısız teslimler — entegrasyon hatalarını tek bakışta gör */}
      {recent.some((r) => !r.ok) && (
        <Card>
          <CardHeader>
            <CardTitle>Son başarısız teslimler</CardTitle>
            <CardDescription>Başarısız webhook denemeleri (en yeni 100 içinden).</CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2">
              {recent
                .filter((r) => !r.ok)
                .slice(0, 20)
                .map((r, i) => (
                  <li key={i} className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-rose-500/20 bg-rose-500/5 px-3 py-2 text-xs">
                    <span className="font-mono">{r.targetEvent ?? 'olay?'}</span>
                    <span className="text-rose-600 dark:text-rose-400">
                      {r.error ? r.error : r.status != null ? `HTTP ${r.status}` : 'bilinmeyen hata'}
                    </span>
                    <span className="text-muted-foreground">{new Date(r.at).toLocaleString('tr-TR')}</span>
                  </li>
                ))}
            </ul>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
