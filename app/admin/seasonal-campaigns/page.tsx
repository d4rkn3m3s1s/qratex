'use client';

import { useState, useEffect } from 'react';
import { AdminPremiumHero } from '@/components/admin/admin-premium-hero';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Loader2, Plus, Power, Sparkles } from 'lucide-react';
import { toast } from '@/lib/admin-toast';

type CampaignRow = {
  id: string;
  name: string;
  description: string;
  type: 'BIRTHDAY' | 'ANNIVERSARY' | 'SEASONAL' | 'SPECIAL';
  multiplier: number;
  bonusPoints: number;
  isActive: boolean;
  startDate: string;
  endDate: string;
};

const TYPES = ['SEASONAL', 'SPECIAL', 'BIRTHDAY', 'ANNIVERSARY'] as const;

export default function AdminSeasonalCampaignsPage() {
  const [list, setList] = useState<CampaignRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [type, setType] = useState<(typeof TYPES)[number]>('SEASONAL');
  const [multiplier, setMultiplier] = useState('1.5');
  const [bonusPoints, setBonusPoints] = useState('0');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  const fetchList = () => {
    fetch('/api/admin/seasonal-campaigns')
      .then((r) => r.json())
      .then((data) => setList(Array.isArray(data) ? data : []))
      .catch(() => toast.error('Liste yüklenemedi'))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchList();
  }, []);

  const add = () => {
    if (!name.trim() || !description.trim() || !startDate || !endDate) {
      toast.error('Ad, açıklama ve tarihler zorunlu');
      return;
    }
    setSaving(true);
    fetch('/api/admin/seasonal-campaigns', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: name.trim(),
        description: description.trim(),
        type,
        multiplier: Number(multiplier) || 1.5,
        bonusPoints: Number(bonusPoints) || 0,
        startDate: new Date(startDate).toISOString(),
        endDate: new Date(endDate).toISOString(),
      }),
    })
      .then((r) => r.json())
      .then((data) => {
        if (data.error) throw new Error(data.error);
        toast.success('Kampanya oluşturuldu');
        setName('');
        setDescription('');
        setMultiplier('1.5');
        setBonusPoints('0');
        setStartDate('');
        setEndDate('');
        fetchList();
      })
      .catch((e) => toast.error(e instanceof Error ? e.message : 'Oluşturulamadı'))
      .finally(() => setSaving(false));
  };

  const toggle = (c: CampaignRow) => {
    fetch('/api/admin/seasonal-campaigns', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: c.id, isActive: !c.isActive }),
    })
      .then((r) => r.json())
      .then((data) => {
        if (data.error) throw new Error(data.error);
        toast.success(c.isActive ? 'Kampanya pasifleştirildi' : 'Kampanya aktifleştirildi');
        fetchList();
      })
      .catch((e) => toast.error(e instanceof Error ? e.message : 'İşlem başarısız'));
  };

  return (
    <div className="flex flex-1 flex-col gap-6 p-6">
      <AdminPremiumHero
        title="Sezonsal Kampanyalar"
        description="Zaman kutulu puan çarpanı/bonus kampanyaları — feedback ve tüketim kazanımına uygulanır"
        icon={<Sparkles className="text-white" />}
      />
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5" />
            Yeni kampanya
          </CardTitle>
          <CardDescription>
            Aktif penceredeyken kazanılan puana çarpan + bonus uygulanır (günlük tavan yine geçerli).
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Ad</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Yaz Festivali 2x" />
            </div>
            <div className="space-y-2">
              <Label>Tür</Label>
              <select
                className="h-10 w-full rounded-md border bg-background px-3 text-sm"
                value={type}
                onChange={(e) => setType(e.target.value as (typeof TYPES)[number])}
              >
                {TYPES.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label>Açıklama</Label>
              <Textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Kampanya açıklaması"
              />
            </div>
            <div className="space-y-2">
              <Label>Çarpan (≥1)</Label>
              <Input type="number" step="0.1" value={multiplier} onChange={(e) => setMultiplier(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Bonus puan</Label>
              <Input type="number" value={bonusPoints} onChange={(e) => setBonusPoints(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Başlangıç</Label>
              <Input type="datetime-local" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Bitiş</Label>
              <Input type="datetime-local" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
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
          <CardTitle>Kampanyalar</CardTitle>
          <CardDescription>En yüksek çarpanlı aktif kampanya uygulanır.</CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-sm text-muted-foreground">Yükleniyor...</p>
          ) : list.length === 0 ? (
            <p className="text-sm text-muted-foreground">Henüz kampanya yok.</p>
          ) : (
            <ul className="space-y-3">
              {list.map((c) => (
                <li
                  key={c.id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-lg border p-3"
                >
                  <div>
                    <p className="text-sm font-semibold">
                      {c.name}{' '}
                      <span className="font-normal text-muted-foreground">
                        · {c.type} · {c.multiplier}x{c.bonusPoints > 0 ? ` +${c.bonusPoints}p` : ''}
                        {!c.isActive && ' · PASİF'}
                      </span>
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {new Date(c.startDate).toLocaleDateString('tr-TR')} –{' '}
                      {new Date(c.endDate).toLocaleDateString('tr-TR')}
                    </p>
                  </div>
                  <Button variant="ghost" size="icon" onClick={() => toggle(c)} title={c.isActive ? 'Pasifleştir' : 'Aktifleştir'}>
                    <Power className={`h-4 w-4 ${c.isActive ? 'text-destructive' : 'text-green-600'}`} />
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
