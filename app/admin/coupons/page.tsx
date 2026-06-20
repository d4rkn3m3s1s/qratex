'use client';

import { useState, useEffect } from 'react';
import { AdminPremiumHero } from '@/components/admin/admin-premium-hero';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Loader2, Plus, Power, Ticket } from 'lucide-react';
import { toast } from '@/lib/admin-toast';

type CouponRow = {
  id: string;
  code: string;
  type: 'percentage' | 'fixed';
  value: number;
  minPurchase: number | null;
  maxUses: number;
  usedCount: number;
  expiresAt: string | null;
  isActive: boolean;
  createdAt: string;
};

export default function AdminCouponsPage() {
  const [list, setList] = useState<CouponRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [code, setCode] = useState('');
  const [type, setType] = useState<'percentage' | 'fixed'>('percentage');
  const [value, setValue] = useState('');
  const [minPurchase, setMinPurchase] = useState('');
  const [maxUses, setMaxUses] = useState('');
  const [expiresAt, setExpiresAt] = useState('');

  const fetchList = () => {
    fetch('/api/admin/coupons')
      .then((r) => r.json())
      .then((data) => setList(Array.isArray(data) ? data : []))
      .catch(() => toast.error('Liste yüklenemedi'))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchList();
  }, []);

  const add = () => {
    const c = code.trim();
    const v = Number(value);
    if (!c || !Number.isFinite(v) || v <= 0) {
      toast.error('Geçerli kod ve değer girin');
      return;
    }
    setSaving(true);
    fetch('/api/admin/coupons', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        code: c,
        type,
        value: v,
        minPurchase: minPurchase ? Number(minPurchase) : null,
        maxUses: maxUses ? Number(maxUses) : -1,
        expiresAt: expiresAt ? new Date(expiresAt).toISOString() : null,
      }),
    })
      .then((r) => r.json())
      .then((data) => {
        if (data.error) throw new Error(data.error);
        toast.success('Kupon oluşturuldu');
        setCode('');
        setValue('');
        setMinPurchase('');
        setMaxUses('');
        setExpiresAt('');
        fetchList();
      })
      .catch((e) => toast.error(e instanceof Error ? e.message : 'Oluşturulamadı'))
      .finally(() => setSaving(false));
  };

  const deactivate = (id: string) => {
    if (!confirm('Bu kupon pasifleştirilsin mi?')) return;
    fetch(`/api/admin/coupons?id=${id}`, { method: 'DELETE' })
      .then((r) => r.json())
      .then((data) => {
        if (data.error) throw new Error(data.error);
        toast.success('Kupon pasifleştirildi');
        fetchList();
      })
      .catch((e) => toast.error(e instanceof Error ? e.message : 'İşlem başarısız'));
  };

  return (
    <div className="flex flex-1 flex-col gap-6 p-6">
      <AdminPremiumHero
        title="Kuponlar"
        description="İndirim kuponları oluşturun; müşteriler kodu uygulamadan kullanır"
        icon={<Ticket className="text-white" />}
      />
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Ticket className="h-5 w-5" />
            Yeni kupon
          </CardTitle>
          <CardDescription>Yüzde veya sabit indirim. Kullanım limiti boş = sınırsız.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Kod</Label>
              <Input value={code} onChange={(e) => setCode(e.target.value)} placeholder="YAZ2026" />
            </div>
            <div className="space-y-2">
              <Label>Tür</Label>
              <select
                className="h-10 w-full rounded-md border bg-background px-3 text-sm"
                value={type}
                onChange={(e) => setType(e.target.value as 'percentage' | 'fixed')}
              >
                <option value="percentage">Yüzde (%)</option>
                <option value="fixed">Sabit</option>
              </select>
            </div>
            <div className="space-y-2">
              <Label>Değer {type === 'percentage' ? '(%)' : ''}</Label>
              <Input type="number" value={value} onChange={(e) => setValue(e.target.value)} placeholder="20" />
            </div>
            <div className="space-y-2">
              <Label>Min. tutar (opsiyonel)</Label>
              <Input type="number" value={minPurchase} onChange={(e) => setMinPurchase(e.target.value)} placeholder="—" />
            </div>
            <div className="space-y-2">
              <Label>Maks. kullanım (boş = sınırsız)</Label>
              <Input type="number" value={maxUses} onChange={(e) => setMaxUses(e.target.value)} placeholder="∞" />
            </div>
            <div className="space-y-2">
              <Label>Son kullanım (opsiyonel)</Label>
              <Input type="datetime-local" value={expiresAt} onChange={(e) => setExpiresAt(e.target.value)} />
            </div>
          </div>
          <Button onClick={add} disabled={saving}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
            Oluştur
          </Button>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Kuponlar</CardTitle>
          <CardDescription>Pasifleştirme kullanım geçmişini korur.</CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-sm text-muted-foreground">Yükleniyor...</p>
          ) : list.length === 0 ? (
            <p className="text-sm text-muted-foreground">Henüz kupon yok.</p>
          ) : (
            <ul className="space-y-3">
              {list.map((c) => (
                <li
                  key={c.id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-lg border p-3"
                >
                  <div>
                    <p className="font-mono text-sm font-semibold">
                      {c.code}{' '}
                      <span className="font-sans font-normal text-muted-foreground">
                        · {c.type === 'percentage' ? `%${c.value}` : c.value} indirim
                        {!c.isActive && ' · PASİF'}
                      </span>
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Kullanım: {c.usedCount}/{c.maxUses === -1 ? '∞' : c.maxUses}
                      {c.minPurchase ? ` · min ${c.minPurchase}` : ''}
                      {c.expiresAt ? ` · son ${new Date(c.expiresAt).toLocaleDateString('tr-TR')}` : ''}
                    </p>
                  </div>
                  {c.isActive && (
                    <Button variant="ghost" size="icon" onClick={() => deactivate(c.id)}>
                      <Power className="h-4 w-4 text-destructive" />
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
