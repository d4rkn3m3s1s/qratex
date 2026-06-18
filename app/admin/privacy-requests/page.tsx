'use client';

import { useEffect, useState } from 'react';
import { AdminPremiumHero } from '@/components/admin/admin-premium-hero';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Loader2, Download, ShieldAlert, ShieldCheck, Mail } from 'lucide-react';
import { toast } from '@/lib/admin-toast';

type DsrType = 'access' | 'deletion' | 'rectification';
type DsrStatus = 'received' | 'in_review' | 'completed' | 'rejected';

type Request = {
  id: string;
  email: string;
  type: DsrType;
  status: DsrStatus;
  message: string | null;
  receiptSentAt: string | null;
  createdAt: string;
  processedAt: string | null;
  userId: string | null;
};

const TYPE_LABEL: Record<DsrType, string> = {
  access: 'Erişim / Veri talebi',
  deletion: 'Silme talebi',
  rectification: 'Düzeltme talebi',
};

const STATUS_LABEL: Record<DsrStatus, string> = {
  received: 'Alındı',
  in_review: 'İncelemede',
  completed: 'Tamamlandı',
  rejected: 'Reddedildi',
};

const STATUS_CLASS: Record<DsrStatus, string> = {
  received: 'bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300',
  in_review: 'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300',
  completed: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300',
  rejected: 'bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-300',
};

export default function AdminPrivacyRequestsPage() {
  const [requests, setRequests] = useState<Request[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);

  const fetchList = () => {
    setLoading(true);
    fetch('/api/admin/privacy-requests')
      .then((r) => r.json())
      .then((d) => setRequests(Array.isArray(d.requests) ? d.requests : []))
      .catch(() => toast.error('Talepler yüklenemedi'))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchList();
  }, []);

  const setStatus = (id: string, status: DsrStatus) => {
    setBusy(id);
    fetch(`/api/admin/privacy-requests/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    })
      .then((r) => r.json())
      .then((d) => {
        if (d.error) throw new Error(d.error);
        toast.success('Durum güncellendi');
        setRequests((prev) => prev.map((r) => (r.id === id ? { ...r, status } : r)));
      })
      .catch((e) => toast.error(e instanceof Error ? e.message : 'İşlem başarısız'))
      .finally(() => setBusy(null));
  };

  const exportData = (id: string, email: string) => {
    setBusy(id);
    fetch(`/api/admin/privacy-requests/${id}?action=export`, { method: 'POST' })
      .then((r) => r.json())
      .then((d) => {
        if (d.error) throw new Error(d.error);
        // JSON'u tarayıcıdan indir.
        const blob = new Blob([JSON.stringify(d.export, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `kvkk-export-${email}-${id}.json`;
        a.click();
        URL.revokeObjectURL(url);
        toast.success('Veri paketi indirildi');
      })
      .catch((e) => toast.error(e instanceof Error ? e.message : 'Export başarısız'))
      .finally(() => setBusy(null));
  };

  const anonymize = (id: string) => {
    if (
      !window.confirm(
        'Bu kullanıcının tüm kişisel verisi geri döndürülemez biçimde anonimleştirilecek (ad, e-posta, telefon, yorum metinleri). Devam edilsin mi?'
      )
    ) {
      return;
    }
    setBusy(id);
    fetch(`/api/admin/privacy-requests/${id}?action=anonymize`, { method: 'POST' })
      .then((r) => r.json())
      .then((d) => {
        if (d.error) throw new Error(d.error);
        toast.success('Kullanıcı anonimleştirildi');
        setRequests((prev) =>
          prev.map((r) => (r.id === id ? { ...r, status: 'completed', processedAt: new Date().toISOString() } : r))
        );
      })
      .catch((e) => toast.error(e instanceof Error ? e.message : 'Anonimleştirme başarısız'))
      .finally(() => setBusy(null));
  };

  return (
    <div className="flex flex-1 flex-col gap-6 p-6">
      <AdminPremiumHero
        title="KVKK / Gizlilik Talepleri"
        description="Veri sahibi erişim, silme ve düzeltme taleplerini görüntüleyin ve yürütün"
        icon={<ShieldCheck className="text-white" />}
      />
      <Card>
        <CardHeader>
          <CardTitle>Talep kuyruğu</CardTitle>
          <CardDescription>
            Erişim taleplerinde veri paketini indirin; silme taleplerinde kullanıcıyı anonimleştirin. Tüm işlemler
            denetim günlüğüne yazılır.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="space-y-3">
              {[0, 1, 2].map((i) => (
                <div key={i} className="h-20 animate-pulse rounded-lg bg-muted" />
              ))}
            </div>
          ) : requests.length === 0 ? (
            <p className="text-sm text-muted-foreground">Bekleyen talep yok.</p>
          ) : (
            <ul className="space-y-3">
              {requests.map((r) => (
                <li key={r.id} className="rounded-lg border p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-medium">{TYPE_LABEL[r.type]}</span>
                        <span className={`rounded px-1.5 py-0.5 text-xs ${STATUS_CLASS[r.status]}`}>
                          {STATUS_LABEL[r.status]}
                        </span>
                        {r.receiptSentAt && (
                          <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                            <Mail className="h-3 w-3" /> Makbuz gönderildi
                          </span>
                        )}
                      </div>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {r.email} · {new Date(r.createdAt).toLocaleString('tr-TR')}
                        {r.processedAt && ` · İşlendi: ${new Date(r.processedAt).toLocaleDateString('tr-TR')}`}
                      </p>
                      {r.message && (
                        <p className="mt-2 whitespace-pre-wrap text-sm text-muted-foreground">{r.message}</p>
                      )}
                    </div>
                    <div className="flex shrink-0 flex-wrap items-center gap-2">
                      {r.status !== 'in_review' && r.status !== 'completed' && (
                        <Button size="sm" variant="ghost" disabled={busy === r.id} onClick={() => setStatus(r.id, 'in_review')}>
                          İncelemeye al
                        </Button>
                      )}
                      {(r.type === 'access' || r.type === 'rectification') && r.userId && (
                        <Button size="sm" variant="outline" disabled={busy === r.id} onClick={() => exportData(r.id, r.email)}>
                          {busy === r.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
                          Veri paketi
                        </Button>
                      )}
                      {r.type === 'deletion' && r.userId && r.status !== 'completed' && (
                        <Button
                          size="sm"
                          variant="outline"
                          className="border-destructive/40 text-destructive hover:bg-destructive/10"
                          disabled={busy === r.id}
                          onClick={() => anonymize(r.id)}
                        >
                          {busy === r.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldAlert className="h-4 w-4" />}
                          Anonimleştir
                        </Button>
                      )}
                      {r.status !== 'completed' && r.status !== 'rejected' && (
                        <Button size="sm" variant="ghost" disabled={busy === r.id} onClick={() => setStatus(r.id, 'rejected')}>
                          Reddet
                        </Button>
                      )}
                      {r.status !== 'completed' && (
                        <Button size="sm" variant="ghost" disabled={busy === r.id} onClick={() => setStatus(r.id, 'completed')}>
                          Tamamlandı
                        </Button>
                      )}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
