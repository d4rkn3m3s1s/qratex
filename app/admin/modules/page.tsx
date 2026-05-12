'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { PageHeader } from '@/components/dashboard/page-header';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { RefreshCw, Search, Settings2 } from 'lucide-react';

type ModuleItem = {
  key: string;
  label: string;
  description: string;
  scope: 'customer' | 'dealer' | 'admin' | 'platform';
  severity: 'critical' | 'important' | 'optional';
  detailHref?: string;
  enabled: boolean;
  metric: number | null;
  affectedEndpointCount: number;
  blocked403Last24h: number;
};

type OverviewPayload = {
  roleCounts: {
    admin: number;
    dealer: number;
    customer: number;
    staff: number;
  };
  modules: ModuleItem[];
  endpointBindings: Array<{ moduleKey: string; endpoint: string; methods: string[] }>;
};

export default function AdminModulesPage() {
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [data, setData] = useState<OverviewPayload | null>(null);

  const load = async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/admin/modules/overview', { cache: 'no-store' });
      const json = await res.json();
      if (!res.ok || !json?.success) throw new Error(json?.error || 'Modül verisi yüklenemedi');
      setData({
        roleCounts: json.roleCounts,
        modules: json.modules,
        endpointBindings: json.endpointBindings ?? [],
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const modules = useMemo(() => {
    const all = data?.modules ?? [];
    const q = query.trim().toLowerCase();
    if (!q) return all;
    return all.filter((item) =>
      [item.label, item.key, item.description, item.scope].join(' ').toLowerCase().includes(q)
    );
  }, [data, query]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Modül Detay Merkezi"
        description="Admin/Bayi/Müşteri modüllerinin aktiflik ve veri görünümü"
        actions={
          <div className="flex gap-2">
            <Button variant="outline" onClick={load} disabled={loading}>
              <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
              Yenile
            </Button>
            <Button asChild>
              <Link href="/admin/settings">
                <Settings2 className="h-4 w-4 mr-2" />
                Ayar Merkezi
              </Link>
            </Button>
          </div>
        }
      />

      <Card>
        <CardHeader>
          <CardTitle>Rol Dağılımı</CardTitle>
          <CardDescription>Platformdaki kullanıcı tiplerinin güncel dağılımı.</CardDescription>
        </CardHeader>
        <CardContent className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div className="rounded-lg border p-3"><p className="text-xs text-muted-foreground">Admin</p><p className="text-xl font-semibold">{data?.roleCounts.admin ?? 0}</p></div>
          <div className="rounded-lg border p-3"><p className="text-xs text-muted-foreground">Bayi</p><p className="text-xl font-semibold">{data?.roleCounts.dealer ?? 0}</p></div>
          <div className="rounded-lg border p-3"><p className="text-xs text-muted-foreground">Müşteri</p><p className="text-xl font-semibold">{data?.roleCounts.customer ?? 0}</p></div>
          <div className="rounded-lg border p-3"><p className="text-xs text-muted-foreground">Staff</p><p className="text-xl font-semibold">{data?.roleCounts.staff ?? 0}</p></div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Modül Listesi</CardTitle>
          <CardDescription>Tek ayar yerinden yönetilen modüllerin detay görünümü.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="relative max-w-sm">
            <Search className="h-4 w-4 text-muted-foreground absolute left-3 top-1/2 -translate-y-1/2" />
            <Input className="pl-9" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Modül ara..." />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {modules.map((item) => (
              <div key={item.key} className="rounded-lg border p-3 space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <p className="font-medium">{item.label}</p>
                  <Badge variant={item.enabled ? 'default' : 'destructive'}>
                    {item.enabled ? 'Açık' : 'Kapalı'}
                  </Badge>
                </div>
                <p className="text-xs text-muted-foreground">{item.description}</p>
                <div className="flex items-center gap-2 text-[11px]">
                  <Badge variant="outline">{item.scope}</Badge>
                  <Badge variant="outline">{item.severity}</Badge>
                  <Badge variant="outline">{item.key}</Badge>
                  {typeof item.metric === 'number' ? <Badge variant="secondary">kayıt: {item.metric}</Badge> : null}
                  {!item.enabled ? (
                    <Badge variant="destructive">etkilenen endpoint: {item.affectedEndpointCount}</Badge>
                  ) : null}
                  <Badge variant="outline">24s 403: {item.blocked403Last24h}</Badge>
                </div>
                {item.detailHref ? (
                  <Button asChild size="sm" variant="outline">
                    <Link href={item.detailHref}>Detay sayfasını aç</Link>
                  </Button>
                ) : null}
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Endpoint → Modül Bağlantısı</CardTitle>
          <CardDescription>Hangi API endpoint’in hangi modül toggle’ına bağlı olduğunu gösterir.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {(data?.endpointBindings ?? []).map((row) => (
            <div key={`${row.moduleKey}-${row.endpoint}`} className="rounded border p-3 text-sm flex flex-col md:flex-row md:items-center md:justify-between gap-2">
              <div>
                <p className="font-mono">{row.endpoint}</p>
                <p className="text-xs text-muted-foreground">modül: {row.moduleKey}</p>
              </div>
              <div className="flex gap-1">
                {row.methods.map((m) => (
                  <Badge key={m} variant="outline">{m}</Badge>
                ))}
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
