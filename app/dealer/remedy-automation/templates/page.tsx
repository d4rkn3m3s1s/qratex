'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { MapPin, Plus, Trash2, Loader2, Tag, ArrowLeft } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { toast } from '@/lib/admin-toast';

type LocationRow = {
  id: string;
  name: string;
  address: string | null;
  _count?: { qrCodes: number; remedyTemplates: number };
};

type TemplateRow = {
  id: string;
  locationId: string | null;
  type: string;
  label: string;
  unit: string;
  values: number[];
  isActive: boolean;
  order: number;
};

const TYPE_PRESETS: Record<string, { label: string; unit: string }> = {
  discount: { label: 'İndirim', unit: '%' },
  points: { label: 'Puan', unit: 'puan' },
  free_item: { label: 'Ücretsiz ürün/içecek', unit: 'adet' },
};

export default function DealerRemedyTemplatesPage() {
  const [locations, setLocations] = useState<LocationRow[]>([]);
  const [templates, setTemplates] = useState<TemplateRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  // Yeni mekan
  const [newLocationName, setNewLocationName] = useState('');

  // Yeni şablon
  const [tplLocation, setTplLocation] = useState<string>('__global__'); // __global__ = işletme geneli
  const [tplType, setTplType] = useState<string>('discount');
  const [tplValues, setTplValues] = useState<string>('10, 15, 20');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [locRes, tplRes] = await Promise.all([
        fetch('/api/dealer/locations'),
        fetch('/api/dealer/remedy-templates'),
      ]);
      const locJson = await locRes.json();
      const tplJson = await tplRes.json();
      if (locJson.success) setLocations(locJson.locations);
      if (tplJson.success) setTemplates(tplJson.templates);
    } catch {
      toast.error('Veriler yüklenemedi');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const createLocation = async () => {
    if (!newLocationName.trim()) {
      toast.error('Mekan adı girin');
      return;
    }
    setBusy(true);
    try {
      const r = await fetch('/api/dealer/locations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newLocationName.trim() }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || 'Oluşturulamadı');
      toast.success('Mekan eklendi');
      setNewLocationName('');
      void load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Hata');
    } finally {
      setBusy(false);
    }
  };

  const deleteLocation = async (id: string) => {
    setBusy(true);
    try {
      const r = await fetch(`/api/dealer/locations/${id}`, { method: 'DELETE' });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || 'Silinemedi');
      toast.success('Mekan silindi');
      void load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Hata');
    } finally {
      setBusy(false);
    }
  };

  const createTemplate = async () => {
    const values = tplValues
      .split(',')
      .map((v) => Number(v.trim()))
      .filter((n) => Number.isFinite(n) && n >= 0);
    if (values.length === 0) {
      toast.error('En az bir geçerli değer girin (örn. 10, 15, 20)');
      return;
    }
    const preset = TYPE_PRESETS[tplType];
    setBusy(true);
    try {
      const r = await fetch('/api/dealer/remedy-templates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          locationId: tplLocation === '__global__' ? null : tplLocation,
          type: tplType,
          label: preset.label,
          unit: preset.unit,
          values,
        }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || 'Oluşturulamadı');
      toast.success('Şablon eklendi');
      setTplValues('10, 15, 20');
      void load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Hata');
    } finally {
      setBusy(false);
    }
  };

  const deleteTemplate = async (id: string) => {
    setBusy(true);
    try {
      const r = await fetch(`/api/dealer/remedy-templates/${id}`, { method: 'DELETE' });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || 'Silinemedi');
      toast.success('Şablon silindi');
      void load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Hata');
    } finally {
      setBusy(false);
    }
  };

  const locationName = (id: string | null) =>
    id === null ? 'İşletme geneli' : locations.find((l) => l.id === id)?.name ?? '—';

  return (
    <div className="space-y-6 pb-8">
      <div className="flex items-center gap-2">
        <Link href="/dealer/remedy-automation">
          <Button variant="ghost" size="icon" className="h-8 w-8">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <div>
          <h1 className="text-xl font-semibold">Telafi Şablonları & Mekanlar</h1>
          <p className="text-sm text-muted-foreground">
            Telafi tekliflerini işletme geneli veya mekana özel yapılandırın. Şablon yoksa
            varsayılan teklifler kullanılır.
          </p>
        </div>
      </div>

      {/* Mekanlar */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <MapPin className="h-4 w-4" /> Mekanlar (Şubeler)
          </CardTitle>
          <CardDescription>
            Birden çok mekanınız varsa ekleyin; teklifleri mekana özel yapabilirsiniz.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap gap-2 items-end">
            <div className="flex-1 min-w-[200px] space-y-2">
              <Label className="text-xs">Mekan adı</Label>
              <Input
                value={newLocationName}
                onChange={(e) => setNewLocationName(e.target.value)}
                placeholder="örn. Kadıköy Şubesi"
              />
            </div>
            <Button onClick={createLocation} disabled={busy}>
              <Plus className="h-4 w-4 mr-2" /> Ekle
            </Button>
          </div>

          {loading ? (
            <p className="text-sm text-muted-foreground">Yükleniyor…</p>
          ) : locations.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Henüz mekan yok. Tek mekanlıysanız "İşletme geneli" şablonlar yeterlidir.
            </p>
          ) : (
            <ul className="divide-y">
              {locations.map((loc) => (
                <li key={loc.id} className="flex items-center justify-between py-2">
                  <div>
                    <p className="font-medium text-sm">{loc.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {loc._count?.qrCodes ?? 0} QR · {loc._count?.remedyTemplates ?? 0} şablon
                    </p>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-destructive"
                    onClick={() => deleteLocation(loc.id)}
                    disabled={busy}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {/* Şablon ekle */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Tag className="h-4 w-4" /> Telafi Şablonu Ekle
          </CardTitle>
          <CardDescription>
            Müşterinin seçebileceği telafi türü ve değerlerini tanımlayın.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="space-y-2">
              <Label className="text-xs">Kapsam</Label>
              <Select value={tplLocation} onValueChange={setTplLocation}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__global__">İşletme geneli</SelectItem>
                  {locations.map((l) => (
                    <SelectItem key={l.id} value={l.id}>
                      {l.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label className="text-xs">Tür</Label>
              <Select value={tplType} onValueChange={setTplType}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="discount">İndirim (%)</SelectItem>
                  <SelectItem value="points">Puan</SelectItem>
                  <SelectItem value="free_item">Ücretsiz ürün</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label className="text-xs">Değerler (virgülle)</Label>
              <Input
                value={tplValues}
                onChange={(e) => setTplValues(e.target.value)}
                placeholder="10, 15, 20"
              />
            </div>
          </div>
          <Button onClick={createTemplate} disabled={busy}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <><Plus className="h-4 w-4 mr-2" /> Şablon ekle</>}
          </Button>
        </CardContent>
      </Card>

      {/* Mevcut şablonlar */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Mevcut Şablonlar</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-sm text-muted-foreground">Yükleniyor…</p>
          ) : templates.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Henüz şablon yok. Şablon eklenene kadar varsayılan teklifler (indirim/puan/ücretsiz
              ürün) kullanılır.
            </p>
          ) : (
            <ul className="divide-y">
              {templates.map((tpl) => (
                <li key={tpl.id} className="flex items-center justify-between py-2 gap-3">
                  <div className="min-w-0">
                    <p className="font-medium text-sm">
                      {tpl.label}{' '}
                      <span className="text-muted-foreground font-normal">
                        ({tpl.values.join(', ')} {tpl.unit})
                      </span>
                    </p>
                    <p className="text-xs text-muted-foreground">{locationName(tpl.locationId)}</p>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-destructive shrink-0"
                    onClick={() => deleteTemplate(tpl.id)}
                    disabled={busy}
                  >
                    <Trash2 className="h-4 w-4" />
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
