'use client';

import { useEffect, useState } from 'react';
import { PageHeader } from '@/components/dashboard/page-header';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { toast } from '@/lib/admin-toast';

type DonationProjectItem = {
  id: string;
  name: string;
  description: string;
  icon: string;
  category: string;
  current: number;
  target: number;
  impact: { unit?: string; perPoint?: number; label?: string } | null;
  tags: string[] | null;
  isActive: boolean;
};

type DonationPayload = {
  stats: { totalDonations: number; totalPointsDonated: number; activeProjects: number };
  projects: DonationProjectItem[];
  recent: Array<{
    id: string;
    points: number;
    message?: string | null;
    isPublic?: boolean;
    createdAt: string;
    user: { name: string | null; email: string };
    project: { name: string };
  }>;
  pagination: { page: number; pageSize: number; total: number; totalPages: number };
};

export default function AdminDonationsPage() {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<DonationPayload | null>(null);
  const [q, setQ] = useState('');
  const [onlyActive, setOnlyActive] = useState(false);
  const [page, setPage] = useState(1);
  const [sort, setSort] = useState('newest');
  const [drafts, setDrafts] = useState<Record<string, DonationProjectItem>>({});
  const [ratioBasePoints, setRatioBasePoints] = useState<Record<string, number>>({});
  const [ratioBaseUnits, setRatioBaseUnits] = useState<Record<string, number>>({});
  const [ratioPerPointInput, setRatioPerPointInput] = useState<Record<string, number>>({});
  const [ratioErrors, setRatioErrors] = useState<Record<string, string>>({});

  const load = async () => {
    setLoading(true);
    const params = new URLSearchParams({
      q,
      onlyActive: String(onlyActive),
      page: String(page),
      pageSize: '20',
      sort,
    });
    const res = await fetch(`/api/admin/donations?${params.toString()}`, { cache: 'no-store' });
    const json = await res.json();
    if (res.ok && json.success) {
      setData(json);
      const nextDrafts: Record<string, DonationProjectItem> = {};
      const nextPoints: Record<string, number> = {};
      const nextUnits: Record<string, number> = {};
      const nextPerPoint: Record<string, number> = {};
      for (const p of (json.projects || []) as DonationProjectItem[]) {
        nextDrafts[p.id] = { ...p };
        const basePoints = 100;
        const perPoint = Number(p.impact?.perPoint || 0);
        nextPoints[p.id] = basePoints;
        nextUnits[p.id] = Number((perPoint * basePoints).toFixed(2));
        nextPerPoint[p.id] = perPoint;
      }
      setDrafts(nextDrafts);
      setRatioBasePoints(nextPoints);
      setRatioBaseUnits(nextUnits);
      setRatioPerPointInput(nextPerPoint);
    }
    setLoading(false);
  };
  useEffect(() => { load(); }, [page, onlyActive, sort]);

  const updateProjectStatus = async (projectId: string, action: 'activate' | 'deactivate' | 'freeze') => {
    const res = await fetch('/api/admin/donations', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ projectId, action }),
    });
    const json = await res.json();
    if (!res.ok || !json?.success) {
      toast.error(json?.error || 'İşlem başarısız');
      return;
    }
    toast.success(action === 'activate' ? 'Proje aktifleştirildi' : 'Proje pasifleştirildi');
    await load();
  };

  const updateDraft = (projectId: string, patch: Partial<DonationProjectItem>) => {
    setDrafts((prev) => ({ ...prev, [projectId]: { ...(prev[projectId] || ({} as DonationProjectItem)), ...patch } }));
  };

  const saveProjectDetails = async (projectId: string) => {
    const draft = drafts[projectId];
    if (!draft) return;
    const res = await fetch('/api/admin/donations', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        projectId,
        name: draft.name,
        description: draft.description,
        icon: draft.icon,
        category: draft.category,
        goal: Number(draft.target || 0),
        impact: draft.impact || null,
        tags: Array.isArray(draft.tags) ? draft.tags : [],
      }),
    });
    const json = await res.json();
    if (!res.ok || !json?.success) {
      toast.error(json?.error || 'Proje ayarları kaydedilemedi');
      return;
    }
    toast.success('Proje ayarları kaydedildi');
    await load();
  };

  const applyImpactRatio = (projectId: string) => {
    const pointBase = Number(ratioBasePoints[projectId] || 0);
    const unitBase = Number(ratioBaseUnits[projectId] || 0);
    if (!Number.isFinite(pointBase) || pointBase <= 0) {
      setRatioErrors((prev) => ({ ...prev, [projectId]: 'Puan 0’dan büyük olmalı.' }));
      return;
    }
    if (!Number.isFinite(unitBase) || unitBase < 0) {
      setRatioErrors((prev) => ({ ...prev, [projectId]: 'Birim negatif olamaz.' }));
      return;
    }
    setRatioErrors((prev) => ({ ...prev, [projectId]: '' }));
    const nextPerPoint = unitBase / pointBase;
    setRatioPerPointInput((prev) => ({ ...prev, [projectId]: Number(nextPerPoint.toFixed(4)) }));
    updateDraft(projectId, {
      impact: {
        ...(drafts[projectId]?.impact || {}),
        perPoint: Number(nextPerPoint.toFixed(4)),
      },
    });
    toast.success(`Oran uygulandı: ${pointBase} puan = ${unitBase} ${drafts[projectId]?.impact?.unit || 'etki birimi'}`);
  };

  const setRatioPreset = (projectId: string, points: number, units: number) => {
    setRatioBasePoints((prev) => ({ ...prev, [projectId]: points }));
    setRatioBaseUnits((prev) => ({ ...prev, [projectId]: units }));
    setRatioErrors((prev) => ({ ...prev, [projectId]: '' }));
    const perPoint = units / points;
    updateDraft(projectId, {
      impact: {
        ...(drafts[projectId]?.impact || {}),
        perPoint: Number(perPoint.toFixed(4)),
      },
    });
    setRatioPerPointInput((prev) => ({ ...prev, [projectId]: Number(perPoint.toFixed(4)) }));
  };

  const applyPerPointDirect = (projectId: string) => {
    const perPoint = Number(ratioPerPointInput[projectId] || 0);
    if (!Number.isFinite(perPoint) || perPoint < 0) {
      setRatioErrors((prev) => ({ ...prev, [projectId]: '1 puan karşılığı değer negatif olamaz.' }));
      return;
    }
    const pointBase = Math.max(1, Number(ratioBasePoints[projectId] || 100));
    const unitBase = Number((pointBase * perPoint).toFixed(4));
    setRatioBaseUnits((prev) => ({ ...prev, [projectId]: unitBase }));
    setRatioErrors((prev) => ({ ...prev, [projectId]: '' }));
    updateDraft(projectId, {
      impact: {
        ...(drafts[projectId]?.impact || {}),
        perPoint: Number(perPoint.toFixed(4)),
      },
    });
    toast.success(`Oran uygulandı: 1 puan = ${Number(perPoint.toFixed(4))} ${drafts[projectId]?.impact?.unit || 'etki birimi'}`);
  };

  const exportCsv = () => {
    const rows = data?.recent ?? [];
    const header = ['id', 'user', 'project', 'points', 'createdAt'];
    const lines = rows.map((r) =>
      [r.id, r.user.name || r.user.email, r.project.name, String(r.points), new Date(r.createdAt).toISOString()]
        .map((v) => `"${String(v).replace(/"/g, '""')}"`)
        .join(',')
    );
    const csv = [header.join(','), ...lines].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `admin-donations-${Date.now()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Bağış Yönetimi"
        description="Bağış ayarları, proje performansı ve işlem logları"
        actions={
          <div className="flex gap-2">
            <Button variant="outline" onClick={exportCsv}>CSV</Button>
            <Button variant="outline" onClick={load} disabled={loading}>{loading ? 'Yükleniyor...' : 'Yenile'}</Button>
          </div>
        }
      />
      <Card>
        <CardContent className="p-4 flex flex-wrap items-stretch gap-2">
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Proje ara..."
            className="w-full min-w-0 lg:flex-1"
          />
          <select
            className="h-10 w-full sm:w-auto min-w-[220px] rounded-md border bg-background px-3 text-sm"
            value={sort}
            onChange={(e) => { setSort(e.target.value); setPage(1); }}
          >
            <option value="newest">Sıralama: En yeni</option>
            <option value="points_desc">Sıralama: En çok puan</option>
            <option value="goal_desc">Sıralama: En yüksek hedef</option>
          </select>
          <Button
            className="w-full sm:w-auto whitespace-nowrap"
            variant={onlyActive ? 'default' : 'outline'}
            onClick={() => { setOnlyActive((v) => !v); setPage(1); }}
          >
            {onlyActive ? 'Sadece aktif: Açık' : 'Sadece aktif: Kapalı'}
          </Button>
          <Button
            className="w-full sm:w-auto whitespace-nowrap"
            onClick={() => { setPage(1); load(); }}
          >
            Filtreyi uygula
          </Button>
        </CardContent>
      </Card>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">Toplam bağış</p><p className="text-2xl font-semibold">{data?.stats.totalDonations ?? 0}</p></CardContent></Card>
        <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">Toplam puan</p><p className="text-2xl font-semibold">{data?.stats.totalPointsDonated ?? 0}</p></CardContent></Card>
        <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">Aktif proje</p><p className="text-2xl font-semibold">{data?.stats.activeProjects ?? 0}</p></CardContent></Card>
      </div>
      <Card>
        <CardHeader><CardTitle>Projeler</CardTitle><CardDescription>Bağış projelerinin hedef/ilerleme görünümü</CardDescription></CardHeader>
        <CardContent className="space-y-2">
          {(data?.projects ?? []).map((p) => {
            const draft = drafts[p.id] || p;
            return (
              <div key={p.id} className="rounded border p-3 text-sm space-y-3">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                  <Input value={draft.icon || ''} onChange={(e) => updateDraft(p.id, { icon: e.target.value })} placeholder="Emoji (örn: 🌱)" />
                  <Input value={draft.name || ''} onChange={(e) => updateDraft(p.id, { name: e.target.value })} placeholder="Proje adı" />
                  <Input value={draft.category || ''} onChange={(e) => updateDraft(p.id, { category: e.target.value })} placeholder="Kategori" />
                </div>
                <Textarea
                  value={draft.description || ''}
                  onChange={(e) => updateDraft(p.id, { description: e.target.value })}
                  placeholder="Bağış kartı açıklaması"
                />
                <div className="grid grid-cols-1 md:grid-cols-4 gap-2">
                  <Input
                    type="number"
                    value={draft.target ?? 0}
                    onChange={(e) => updateDraft(p.id, { target: Number(e.target.value || 0) })}
                    placeholder="Hedef puan"
                  />
                  <Input
                    type="number"
                      value={ratioPerPointInput[p.id] ?? Number(draft.impact?.perPoint || 0)}
                      onChange={(e) =>
                        setRatioPerPointInput((prev) => ({
                          ...prev,
                          [p.id]: Number(e.target.value || 0),
                        }))
                      }
                    placeholder="1 puan = ? etki"
                  />
                  <Input
                    value={draft.impact?.unit || ''}
                    onChange={(e) => updateDraft(p.id, { impact: { ...(draft.impact || {}), unit: e.target.value } })}
                    placeholder="Etki birimi (adet, litre, kg, paket...)"
                  />
                  <Input
                    value={draft.impact?.label || ''}
                    onChange={(e) => updateDraft(p.id, { impact: { ...(draft.impact || {}), label: e.target.value } })}
                    placeholder="Etki etiketi"
                  />
                </div>
                <div className="rounded-md border p-2 space-y-2">
                  <p className="text-xs font-medium">Dönüşüm oranı: X puan = Y {draft.impact?.unit || 'etki birimi'}</p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 gap-2 items-start">
                    <Input
                      type="number"
                      value={ratioBasePoints[p.id] ?? 100}
                      onChange={(e) =>
                        setRatioBasePoints((prev) => ({
                          ...prev,
                          [p.id]: Number(e.target.value || 0),
                        }))
                      }
                      placeholder="Puan"
                    />
                    <Input
                      type="number"
                      value={ratioBaseUnits[p.id] ?? 0}
                      onChange={(e) =>
                        setRatioBaseUnits((prev) => ({
                          ...prev,
                          [p.id]: Number(e.target.value || 0),
                        }))
                      }
                      placeholder={draft.impact?.unit || 'Etki birimi'}
                    />
                    <Button
                      type="button"
                      variant="outline"
                      className="w-full xl:w-auto"
                      onClick={() => applyImpactRatio(p.id)}
                    >
                      Oranı Uygula
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      className="w-full xl:w-auto"
                      onClick={() => applyPerPointDirect(p.id)}
                    >
                      1 Puan Değerini Uygula
                    </Button>
                    <p className="text-xs text-muted-foreground flex items-center sm:col-span-2 xl:col-span-1 min-w-0 break-words">
                      Aktif oran: 1 puan = {Number((ratioPerPointInput[p.id] ?? draft.impact?.perPoint) || 0).toFixed(4)} {draft.impact?.unit || 'etki birimi'}
                    </p>
                  </div>
                  {ratioErrors[p.id] ? (
                    <p className="text-xs text-destructive">{ratioErrors[p.id]}</p>
                  ) : null}
                  <div className="flex flex-wrap gap-1">
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => setRatioPreset(p.id, 100, 1)}
                    >
                      Düşük etki: 100 puan = 1 birim
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => setRatioPreset(p.id, 50, 1)}
                    >
                      Orta etki: 50 puan = 1 birim
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => setRatioPreset(p.id, 10, 1)}
                    >
                      Yüksek etki: 10 puan = 1 birim
                    </Button>
                  </div>
                </div>
                <Input
                  value={Array.isArray(draft.tags) ? draft.tags.join(', ') : ''}
                  onChange={(e) =>
                    updateDraft(p.id, {
                      tags: e.target.value
                        .split(',')
                        .map((x) => x.trim())
                        .filter(Boolean),
                    })
                  }
                  placeholder="Etiketler (virgül ile)"
                />
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-xs text-muted-foreground">
                    Durum: {p.isActive ? 'Aktif' : 'Pasif'} • İlerleme: {p.current}/{p.target}
                  </p>
                  <div className="flex gap-1">
                    <Button size="sm" variant="secondary" onClick={() => saveProjectDetails(p.id)}>Ayarları Kaydet</Button>
                    {p.isActive ? (
                      <>
                        <Button size="sm" variant="outline" onClick={() => updateProjectStatus(p.id, 'deactivate')}>Pasife Al</Button>
                        <Button size="sm" variant="destructive" onClick={() => updateProjectStatus(p.id, 'freeze')}>Soft Freeze</Button>
                      </>
                    ) : (
                      <Button size="sm" onClick={() => updateProjectStatus(p.id, 'activate')}>Aktifleştir</Button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle>Son Bağış Logları</CardTitle></CardHeader>
        <CardContent className="space-y-2 max-h-[420px] overflow-y-auto pr-1">
          {(data?.recent ?? []).map((r) => (
            <div key={r.id} className="rounded border p-3 text-sm">
              <p><strong>{r.user.name || r.user.email}</strong> → <strong>{r.project.name}</strong> ({r.points} puan)</p>
              {r.message ? <p className="mt-1 text-xs">Mesaj: {r.message}</p> : <p className="mt-1 text-xs text-muted-foreground">Mesaj yok</p>}
              <p className="text-xs text-muted-foreground">Görünürlük: {r.isPublic ? 'Herkese açık' : 'Gizli'}</p>
              <p className="text-xs text-muted-foreground">{new Date(r.createdAt).toLocaleString('tr-TR')}</p>
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
          Önceki
        </Button>
        <span className="text-sm text-muted-foreground">
          Sayfa {data?.pagination.page ?? 1} / {data?.pagination.totalPages ?? 1}
        </span>
        <Button
          variant="outline"
          size="sm"
          disabled={!data || data.pagination.page >= data.pagination.totalPages}
          onClick={() => setPage((p) => p + 1)}
        >
          Sonraki
        </Button>
      </div>
    </div>
  );
}
