'use client';

import { useEffect, useState } from 'react';
import { PageHeader } from '@/components/dashboard/page-header';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from '@/lib/admin-toast';

type SquadPayload = {
  stats: { totalSquads: number; totalMembers: number; avgMembersPerSquad: number };
  pagination: { page: number; pageSize: number; total: number; totalPages: number };
  squads: Array<{
    id: string;
    name: string;
    inviteCode: string;
    isFrozen: boolean;
    owner: { name: string | null; email: string };
    members: Array<{ id: string; user: { name: string | null; email: string; points: number } }>;
  }>;
};

export default function AdminSquadsPage() {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<SquadPayload | null>(null);
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const [sort, setSort] = useState('newest');

  const load = async () => {
    setLoading(true);
    const params = new URLSearchParams({ q, page: String(page), pageSize: '20', sort });
    const res = await fetch(`/api/admin/squads?${params.toString()}`, { cache: 'no-store' });
    const json = await res.json();
    if (res.ok && json.success) setData(json);
    setLoading(false);
  };
  useEffect(() => { load(); }, [page, sort]);

  const toggleFreeze = async (squadId: string, freeze: boolean) => {
    const res = await fetch('/api/admin/squads', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ squadId, action: freeze ? 'freeze' : 'unfreeze' }),
    });
    const json = await res.json();
    if (!res.ok || !json?.success) {
      toast.error(json?.error || 'Squad güncellenemedi');
      return;
    }
    toast.success(freeze ? 'Squad donduruldu' : 'Squad çözüldü');
    await load();
  };

  const exportCsv = () => {
    const rows = data?.squads ?? [];
    const header = ['id', 'name', 'inviteCode', 'owner', 'memberCount', 'isFrozen'];
    const lines = rows.map((s) =>
      [s.id, s.name, s.inviteCode, s.owner?.name || s.owner?.email || 'Bilinmeyen', String(s.members?.length || 0), String(s.isFrozen)]
        .map((v) => `"${String(v).replace(/"/g, '""')}"`)
        .join(',')
    );
    const csv = [header.join(','), ...lines].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `admin-squads-${Date.now()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Klan / Squad Yönetimi"
        description="Klanlar, üyeler ve davet kodu görünürlüğü"
        actions={<div className="flex gap-2"><Button variant="outline" onClick={exportCsv}>CSV</Button><Button variant="outline" onClick={load} disabled={loading}>{loading ? 'Yükleniyor...' : 'Yenile'}</Button></div>}
      />
      <Card>
        <CardContent className="p-4 flex flex-col md:flex-row gap-2">
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Squad adı / kod / owner ara..." />
          <select
            className="h-10 rounded-md border bg-background px-3 text-sm"
            value={sort}
            onChange={(e) => { setSort(e.target.value); setPage(1); }}
          >
            <option value="newest">Sıralama: En yeni</option>
            <option value="oldest">Sıralama: En eski</option>
            <option value="members_desc">Sıralama: Üye sayısı (çoktan aza)</option>
            <option value="members_asc">Sıralama: Üye sayısı (azdan çoğa)</option>
          </select>
          <Button onClick={() => { setPage(1); load(); }}>Filtrele</Button>
        </CardContent>
      </Card>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">Toplam squad</p><p className="text-2xl font-semibold">{data?.stats?.totalSquads ?? 0}</p></CardContent></Card>
        <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">Toplam üye</p><p className="text-2xl font-semibold">{data?.stats?.totalMembers ?? 0}</p></CardContent></Card>
        <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">Ort. üye/squad</p><p className="text-2xl font-semibold">{data?.stats?.avgMembersPerSquad ?? 0}</p></CardContent></Card>
      </div>
      <Card>
        <CardHeader><CardTitle>Squad Listesi</CardTitle><CardDescription>Owner + üyeler + davet kodu</CardDescription></CardHeader>
        <CardContent className="space-y-3">
          {(data?.squads ?? []).map((s) => (
            <div key={s.id} className="rounded border p-3 text-sm">
              <p className="font-medium">{s.name}</p>
              <p className="text-xs text-muted-foreground">Owner: {s.owner?.name || s.owner?.email || 'Bilinmeyen'} • Kod: {s.inviteCode}</p>
              <p className="text-xs mt-2">Üyeler: {s.members?.map((m) => m.user?.name || m.user?.email).join(', ') || '-'}</p>
              <div className="mt-2">
                <Button size="sm" variant={s.isFrozen ? 'outline' : 'destructive'} onClick={() => toggleFreeze(s.id, !s.isFrozen)}>
                  {s.isFrozen ? 'Freeze Kaldır' : 'Soft Freeze'}
                </Button>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
      <div className="flex items-center justify-end gap-2">
        <Button
          variant="outline"
          size="sm"
          disabled={!data || (data.pagination?.page ?? 1) <= 1}
          onClick={() => setPage((p) => Math.max(1, p - 1))}
        >
          Önceki
        </Button>
        <span className="text-sm text-muted-foreground">
          Sayfa {data?.pagination?.page ?? 1} / {data?.pagination?.totalPages ?? 1}
        </span>
        <Button
          variant="outline"
          size="sm"
          disabled={!data || (data.pagination?.page ?? 1) >= (data.pagination?.totalPages ?? 1)}
          onClick={() => setPage((p) => p + 1)}
        >
          Sonraki
        </Button>
      </div>
    </div>
  );
}
