'use client';

import { useState, useEffect, useCallback } from 'react';
import { DashboardPageHero } from '@/components/layout/dashboard-page-hero';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Users, TrendingUp, AlertTriangle } from 'lucide-react';
import { toast } from '@/lib/admin-toast';

type CustomerRow = {
  ref: string;
  name: string | null;
  email: string | null;
  image: string | null;
  totalSpent: number;
  totalVisits: number;
  avgOrderValue: number;
  lastPurchaseAt: string | null;
  predictedChurn: number | null;
  churnRisk: string | null;
  segment: { name: string; color: string } | null;
  calculatedAt: string;
};

const churnColor = (risk: string | null) =>
  risk === 'HIGH' ? 'text-red-600' : risk === 'MEDIUM' ? 'text-amber-600' : 'text-green-600';

export default function DealerCustomersPage() {
  const [list, setList] = useState<CustomerRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [sort, setSort] = useState<'spend' | 'churn'>('spend');

  const fetchList = useCallback(() => {
    setLoading(true);
    fetch(`/api/dealer/customers?sort=${sort}&limit=100`)
      .then((r) => r.json())
      .then((data) => setList(Array.isArray(data.customers) ? data.customers : []))
      .catch(() => toast.error('Müşteriler yüklenemedi'))
      .finally(() => setLoading(false));
  }, [sort]);

  useEffect(() => {
    fetchList();
  }, [fetchList]);

  return (
    <div className="flex flex-1 flex-col gap-6 p-6">
      <DashboardPageHero
        title="Müşteriler"
        description="Yaşam boyu değer, ziyaret, harcama ve kayıp riski — segmentlere göre"
        icon={<Users className="text-white" />}
      />
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle>Müşteri portföyü</CardTitle>
            <CardDescription>CLV günlük olarak hesaplanır (gece 02:00).</CardDescription>
          </div>
          <div className="flex gap-2">
            <Button
              variant={sort === 'spend' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setSort('spend')}
            >
              <TrendingUp className="h-4 w-4" />
              Harcama
            </Button>
            <Button
              variant={sort === 'churn' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setSort('churn')}
            >
              <AlertTriangle className="h-4 w-4" />
              Kayıp riski
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-sm text-muted-foreground">Yükleniyor...</p>
          ) : list.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Henüz hesaplanmış müşteri verisi yok. Tüketim kaydı oluştukça günlük cron CLV üretir.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-xs text-muted-foreground">
                    <th className="py-2 pr-4">Müşteri</th>
                    <th className="py-2 pr-4">Segment</th>
                    <th className="py-2 pr-4 text-right">Toplam harcama</th>
                    <th className="py-2 pr-4 text-right">Ziyaret</th>
                    <th className="py-2 pr-4 text-right">Ort. sepet</th>
                    <th className="py-2 pr-4 text-right">Kayıp riski</th>
                    <th className="py-2 text-right">Son ziyaret</th>
                  </tr>
                </thead>
                <tbody>
                  {list.map((c) => (
                    <tr key={c.ref} className="border-b last:border-0">
                      <td className="py-2 pr-4">
                        <p className="font-medium">{c.name || 'İsimsiz'}</p>
                        <p className="text-xs text-muted-foreground">{c.email}</p>
                      </td>
                      <td className="py-2 pr-4">
                        {c.segment ? (
                          <span
                            className="rounded-full px-2 py-0.5 text-xs font-medium text-white"
                            style={{ backgroundColor: c.segment.color }}
                          >
                            {c.segment.name}
                          </span>
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </td>
                      <td className="py-2 pr-4 text-right font-mono">{c.totalSpent.toLocaleString('tr-TR')}</td>
                      <td className="py-2 pr-4 text-right">{c.totalVisits}</td>
                      <td className="py-2 pr-4 text-right font-mono">{c.avgOrderValue.toLocaleString('tr-TR')}</td>
                      <td className={`py-2 pr-4 text-right font-medium ${churnColor(c.churnRisk)}`}>
                        {c.churnRisk ?? '—'}
                        {c.predictedChurn != null ? ` (${Math.round(c.predictedChurn * 100)}%)` : ''}
                      </td>
                      <td className="py-2 text-right text-xs text-muted-foreground">
                        {c.lastPurchaseAt ? new Date(c.lastPurchaseAt).toLocaleDateString('tr-TR') : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
