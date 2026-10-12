'use client';

import { useEffect, useState } from 'react';
import { PageHeader } from '@/components/ds/page';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from '@/lib/admin-toast';
import { useLocaleSafe } from '@/lib/app-locale';

type ReferralPayload = {
  stats: { totalReferrals: number; totalReferrerPoints: number; totalReferredBonus: number };
  recent: Array<{ id: string; createdAt: string; referrer: { name: string | null; email: string }; referred: { name: string | null; email: string } }>;
  topCodes: Array<{ id: string; code: string; usageCount: number; isActive: boolean; user: { name: string | null; email: string } }>;
  pagination: { page: number; pageSize: number; total: number; totalPages: number };
};

export default function AdminReferralsPage() {
  const en = useLocaleSafe() === 'en';
  const L = (tr: string, enText: string) => (en ? enText : tr);
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<ReferralPayload | null>(null);
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const [sort, setSort] = useState('newest');

  const load = async () => {
    setLoading(true);
    const params = new URLSearchParams({
      q,
      page: String(page),
      pageSize: '20',
      sort,
    });
    const res = await fetch(`/api/admin/referrals?${params.toString()}`, { cache: 'no-store' });
    const json = await res.json();
    if (res.ok && json.success) setData(json);
    setLoading(false);
  };
  useEffect(() => { load(); }, [page, sort]);

  const toggleCode = async (referralCodeId: string, isActive: boolean) => {
    const res = await fetch('/api/admin/referrals', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ referralCodeId, isActive }),
    });
    const json = await res.json();
    if (!res.ok || !json?.success) {
      toast.error(json?.error || L('Kod güncellenemedi', 'Couldn’t update the code'));
      return;
    }
    toast.success(isActive ? L('Kod aktif edildi', 'Code activated') : L('Kod pasife alındı', 'Code deactivated'));
    await load();
  };

  const exportCsv = () => {
    const rows = data?.recent ?? [];
    const header = ['id', 'referrer', 'referred', 'createdAt'];
    const lines = rows.map((r) =>
      [r.id, r.referrer.name || r.referrer.email, r.referred.name || r.referred.email, new Date(r.createdAt).toISOString()]
        .map((v) => `"${String(v).replace(/"/g, '""')}"`)
        .join(',')
    );
    const csv = [header.join(','), ...lines].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `admin-referrals-${Date.now()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={L('Yönetim paneli', 'Admin panel')}
        title={L('Davet / Referral Yönetimi', 'Invites & referrals')}
        description={L('Davet performansı, referans kodları ve son referral logları', 'Invite performance, referral codes and the latest referral log')}
        actions={<div className="flex gap-2"><Button variant="outline" onClick={exportCsv}>CSV</Button><Button variant="outline" onClick={load} loading={loading}>{L('Yenile', 'Refresh')}</Button></div>}
      />
      <Card>
        <CardContent className="p-4 flex flex-col md:flex-row gap-2">
          <Input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder={L('Kod veya e-posta ara...', 'Search by code or email...')} />
          <select
            aria-label={L('Sıralama', 'Sort')}
            className="h-10 rounded-md border bg-background px-3 text-sm"
            value={sort}
            onChange={(e) => { setSort(e.target.value); setPage(1); }}
          >
            <option value="newest">{L('Sıralama: En yeni referral', 'Sort: newest referral')}</option>
            <option value="oldest">{L('Sıralama: En eski referral', 'Sort: oldest referral')}</option>
            <option value="usage_desc">{L('Kod kullanım: Çoktan aza', 'Code usage: most first')}</option>
            <option value="usage_asc">{L('Kod kullanım: Azdan çoğa', 'Code usage: least first')}</option>
          </select>
          <Button onClick={() => { setPage(1); load(); }}>{L('Filtrele', 'Filter')}</Button>
        </CardContent>
      </Card>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">{L('Toplam referral', 'Total referrals')}</p><p className="text-2xl font-semibold">{data?.stats.totalReferrals ?? 0}</p></CardContent></Card>
        <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">{L('Referrer puanı', 'Referrer points')}</p><p className="text-2xl font-semibold">{data?.stats.totalReferrerPoints ?? 0}</p></CardContent></Card>
        <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">{L('Referred bonus', 'Referred bonus')}</p><p className="text-2xl font-semibold">{data?.stats.totalReferredBonus ?? 0}</p></CardContent></Card>
      </div>
      <Card>
        <CardHeader><CardTitle>{L('En Çok Kullanılan Kodlar', 'Most-used codes')}</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          {(data?.topCodes ?? []).map((c) => (
            <div key={c.id} className="rounded border p-3 text-sm flex items-center justify-between">
              <div><p className="font-medium">{c.code}</p><p className="text-xs text-muted-foreground">{c.user.name || c.user.email}</p></div>
              <div className="text-right space-y-1">
                <p>{c.usageCount} {L('kullanım', c.usageCount === 1 ? 'use' : 'uses')}</p>
                <Button size="sm" variant={c.isActive ? 'destructive' : 'outline'} onClick={() => toggleCode(c.id, !c.isActive)}>
                  {c.isActive ? L('Pasife Al', 'Deactivate') : L('Aktifleştir', 'Activate')}
                </Button>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle>{L('Son Davet Logları', 'Latest invites')}</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          {(data?.recent ?? []).map((r) => (
            <div key={r.id} className="rounded border p-3 text-sm">
              <p><strong>{r.referrer.name || r.referrer.email}</strong> {L('davet etti', 'invited')} → <strong>{r.referred.name || r.referred.email}</strong></p>
              <p className="text-xs text-muted-foreground">{new Date(r.createdAt).toLocaleString(en ? 'en-GB' : 'tr-TR')}</p>
            </div>
          ))}
        </CardContent>
      </Card>
      <div className="flex items-center justify-end gap-2">
        <Button
          variant="outline"
          size="sm"
          disabled={!data || data.pagination.page <= 1}
          onClick={() => setPage((p) => Math.max(1, p - 1))}
        >
          {L('Önceki', 'Previous')}
        </Button>
        <span className="text-sm text-muted-foreground">
          {L('Sayfa', 'Page')} {data?.pagination.page ?? 1} / {data?.pagination.totalPages ?? 1}
        </span>
        <Button
          variant="outline"
          size="sm"
          disabled={!data || data.pagination.page >= data.pagination.totalPages}
          onClick={() => setPage((p) => p + 1)}
        >
          {L('Sonraki', 'Next')}
        </Button>
      </div>
    </div>
  );
}
