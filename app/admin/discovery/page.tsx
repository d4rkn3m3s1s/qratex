'use client';

import { useEffect, useMemo, useState } from 'react';
import { PageHeader } from '@/components/dashboard/page-header';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Plus, Trash2, Save, RefreshCw, TestTube2, Download, Upload, MapPinned, HelpCircle, ChevronDown, ChevronUp } from 'lucide-react';
import { toast } from '@/lib/admin-toast';

type LocationRow = {
  dealerId: string;
  latitude: number;
  longitude: number;
  address?: string;
  categories: string[];
  opensAt?: string;
  closesAt?: string;
  daysOfWeek?: number[];
};

type SponsoredRow = {
  id: string;
  title: string;
  description?: string;
  discountRate?: number;
  linkUrl?: string;
  dealerId?: string;
  priority: number;
  isActive: boolean;
  startsAt?: string;
  endsAt?: string;
};

type DiscoveryConfigForm = {
  locations: LocationRow[];
  sponsored: SponsoredRow[];
  weeklyHighlights: {
    ambienceLabel: string;
    foodLabel: string;
    serviceLabel: string;
  };
};

type NearbyPreviewItem = {
  dealerId: string;
  businessName: string;
  address?: string;
  distanceKm: number;
  avgRating: number;
  trendScore: number;
  isOpenNow: boolean;
  categories: string[];
};

type DealerOption = {
  id: string;
  businessName: string;
  email: string;
  address?: string;
  latitude?: number;
  longitude?: number;
  phone?: string;
};

type DealerApiItem = {
  id: string;
  businessName?: string | null;
  name?: string | null;
  email: string;
  address?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  phone?: string | null;
};

const EMPTY_CONFIG: DiscoveryConfigForm = {
  locations: [],
  sponsored: [],
  weeklyHighlights: {
    ambienceLabel: 'En Güzel Ambiyans',
    foodLabel: 'En Güzel Yemek',
    serviceLabel: 'En Güzel Hizmet',
  },
};

function normalizeConfig(input: unknown): DiscoveryConfigForm {
  if (!input || typeof input !== 'object') return EMPTY_CONFIG;
  const raw = input as Partial<DiscoveryConfigForm>;
  return {
    locations: Array.isArray(raw.locations)
      ? raw.locations.map((row) => ({
          dealerId: row.dealerId || '',
          latitude: Number(row.latitude || 0),
          longitude: Number(row.longitude || 0),
          address: row.address || '',
          categories: Array.isArray(row.categories) ? row.categories : [],
          opensAt: row.opensAt || '09:00',
          closesAt: row.closesAt || '23:00',
          daysOfWeek: Array.isArray(row.daysOfWeek) ? row.daysOfWeek : [1, 2, 3, 4, 5, 6, 0],
        }))
      : [],
    sponsored: Array.isArray(raw.sponsored)
      ? raw.sponsored.map((row) => ({
          id: row.id || '',
          title: row.title || '',
          description: row.description || '',
          discountRate: Number(row.discountRate || 0),
          linkUrl: row.linkUrl || '',
          dealerId: row.dealerId || '',
          priority: Number(row.priority || 0),
          isActive: row.isActive !== false,
          startsAt: row.startsAt || '',
          endsAt: row.endsAt || '',
        }))
      : [],
    weeklyHighlights: {
      ambienceLabel: raw.weeklyHighlights?.ambienceLabel || EMPTY_CONFIG.weeklyHighlights.ambienceLabel,
      foodLabel: raw.weeklyHighlights?.foodLabel || EMPTY_CONFIG.weeklyHighlights.foodLabel,
      serviceLabel: raw.weeklyHighlights?.serviceLabel || EMPTY_CONFIG.weeklyHighlights.serviceLabel,
    },
  };
}

export default function AdminDiscoveryPage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [config, setConfig] = useState<DiscoveryConfigForm>(EMPTY_CONFIG);
  const [initialSignature, setInitialSignature] = useState('');
  const [dealers, setDealers] = useState<DealerOption[]>([]);
  const [previewLat, setPreviewLat] = useState('41.0082');
  const [previewLng, setPreviewLng] = useState('28.9784');
  const [previewRadius, setPreviewRadius] = useState(5);
  const [previewCategory, setPreviewCategory] = useState('all');
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewNearby, setPreviewNearby] = useState<NearbyPreviewItem[]>([]);
  const [importPayload, setImportPayload] = useState('');
  const [pinSource, setPinSource] = useState('');
  const [pinTargetIndex, setPinTargetIndex] = useState(0);
  const [validationErrors, setValidationErrors] = useState<string[]>([]);
  const [showHelp, setShowHelp] = useState(false);

  const signature = useMemo(() => JSON.stringify(config), [config]);
  const isDirty = signature !== initialSignature;

  useEffect(() => {
    if (validationErrors.length > 0) setValidationErrors([]);
  }, [signature]);

  const validateBeforeSave = (candidate: DiscoveryConfigForm): string[] => {
    const issues: string[] = [];
    const dealerIds = new Set<string>();

    candidate.locations.forEach((row, index) => {
      const label = `Konum satırı ${index + 1}`;
      if (!row.dealerId?.trim()) {
        issues.push(`${label}: bayi seçilmelidir`);
      } else if (dealerIds.has(row.dealerId)) {
        issues.push(`${label}: aynı bayi birden fazla kez eklenmiş`);
      } else {
        dealerIds.add(row.dealerId);
      }

      if (!Number.isFinite(row.latitude) || row.latitude < -90 || row.latitude > 90) {
        issues.push(`${label}: enlem -90 ile 90 arasında olmalı`);
      }
      if (!Number.isFinite(row.longitude) || row.longitude < -180 || row.longitude > 180) {
        issues.push(`${label}: boylam -180 ile 180 arasında olmalı`);
      }
    });

    candidate.sponsored.forEach((row, index) => {
      const label = `Sponsor satırı ${index + 1}`;
      if (!row.id?.trim()) issues.push(`${label}: id zorunlu`);
      if (!row.title?.trim()) issues.push(`${label}: başlık zorunlu`);
      if (!Number.isFinite(row.priority)) issues.push(`${label}: öncelik geçerli sayı olmalı`);
    });

    return issues;
  };

  const fillLocationFromDealerProfile = (rowIndex: number, dealerId: string) => {
    const dealer = dealers.find((item) => item.id === dealerId);
    if (!dealer) return;
    setConfig((prev) => {
      const next = [...prev.locations];
      const current = next[rowIndex];
      next[rowIndex] = {
        ...current,
        address: current.address || dealer.address || '',
        latitude:
          Number.isFinite(current.latitude) && current.latitude !== 0
            ? current.latitude
            : typeof dealer.latitude === 'number'
              ? dealer.latitude
              : current.latitude,
        longitude:
          Number.isFinite(current.longitude) && current.longitude !== 0
            ? current.longitude
            : typeof dealer.longitude === 'number'
              ? dealer.longitude
              : current.longitude,
      };
      return { ...prev, locations: next };
    });
  };

  const fetchConfig = async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/admin/discovery', { cache: 'no-store' });
      const data = await res.json();
      if (!res.ok || !data?.success) throw new Error(data?.error || 'Keşif ayarları alınamadı');
      const normalized = normalizeConfig(data.config);
      setConfig(normalized);
      setInitialSignature(JSON.stringify(normalized));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Keşif ayarları alınamadı');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchConfig();
  }, []);

  useEffect(() => {
    const fetchDealers = async () => {
      try {
        const res = await fetch('/api/admin/users?role=DEALER&page=1&pageSize=200', { cache: 'no-store' });
        const data = await res.json();
        if (!res.ok || !Array.isArray(data?.items)) return;
        const mapped = (data.items as DealerApiItem[]).map((item) => ({
          id: item.id as string,
          businessName: item.businessName || item.name || 'İsimsiz Bayi',
          email: item.email as string,
          address: item.address || '',
          latitude: typeof item.latitude === 'number' ? item.latitude : undefined,
          longitude: typeof item.longitude === 'number' ? item.longitude : undefined,
          phone: item.phone || '',
        }));
        setDealers(mapped);
      } catch {
        // optional helper list
      }
    };
    fetchDealers();
  }, []);

  const saveConfig = async () => {
    try {
      const issues = validateBeforeSave(config);
      if (issues.length > 0) {
        setValidationErrors(issues);
        toast.error(`${issues.length} doğrulama hatası. Lütfen listeyi inceleyin.`);
        return;
      }
      setValidationErrors([]);
      setSaving(true);
      const res = await fetch('/api/admin/discovery', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ config }),
      });
      const data = await res.json();
      if (!res.ok || !data?.success) throw new Error(data?.error || 'Kaydetme başarısız');
      const normalized = normalizeConfig(data.config);
      setConfig(normalized);
      setInitialSignature(JSON.stringify(normalized));
      toast.success('Discovery ayarları güncellendi');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Kaydetme başarısız');
    } finally {
      setSaving(false);
    }
  };

  const runNearbyPreview = async () => {
    const lat = Number(previewLat);
    const lng = Number(previewLng);
    if (Number.isNaN(lat) || Number.isNaN(lng)) {
      toast.error('Geçerli enlem/boylam girin');
      return;
    }
    setPreviewLoading(true);
    try {
      const query = new URLSearchParams({
        lat: String(lat),
        lng: String(lng),
        radiusKm: String(previewRadius),
        category: previewCategory,
      });
      const res = await fetch(`/api/customer/discovery?${query.toString()}`, { cache: 'no-store' });
      const data = await res.json();
      if (!res.ok || !data?.success) {
        throw new Error(data?.error || 'Önizleme alınamadı');
      }
      setPreviewNearby(data.data?.nearby || []);
      toast.success('Yakındaki kartlar önizlemesi güncellendi');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Önizleme alınamadı');
    } finally {
      setPreviewLoading(false);
    }
  };

  const exportConfigAsJson = () => {
    const payload = JSON.stringify(config, null, 2);
    const blob = new Blob([payload], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `discovery-config-${Date.now()}.json`;
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    URL.revokeObjectURL(url);
    toast.success('Discovery JSON dışa aktarıldı');
  };

  const importConfigFromJson = () => {
    try {
      const parsed = JSON.parse(importPayload);
      const normalized = normalizeConfig(parsed);
      setConfig(normalized);
      toast.success('Discovery JSON içe aktarıldı (kaydetmeyi unutmayın)');
    } catch {
      toast.error('Geçerli bir JSON girin');
    }
  };

  const parseCoordinatesFromText = (value: string): { lat: number; lng: number } | null => {
    const normalized = value.trim();
    if (!normalized) return null;

    const rawMatch = normalized.match(/(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)/);
    if (rawMatch) {
      const lat = Number(rawMatch[1]);
      const lng = Number(rawMatch[2]);
      if (!Number.isNaN(lat) && !Number.isNaN(lng)) return { lat, lng };
    }

    const mapMatch = normalized.match(/@(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/);
    if (mapMatch) {
      const lat = Number(mapMatch[1]);
      const lng = Number(mapMatch[2]);
      if (!Number.isNaN(lat) && !Number.isNaN(lng)) return { lat, lng };
    }

    return null;
  };

  const applyPinToLocation = () => {
    const parsed = parseCoordinatesFromText(pinSource);
    if (!parsed) {
      toast.error('Geçerli koordinat veya Google Maps linki girin');
      return;
    }
    if (pinTargetIndex < 0 || pinTargetIndex >= config.locations.length) {
      toast.error('Hedef konum satırını seçin');
      return;
    }
    setConfig((prev) => {
      const next = [...prev.locations];
      next[pinTargetIndex] = {
        ...next[pinTargetIndex],
        latitude: Number(parsed.lat.toFixed(6)),
        longitude: Number(parsed.lng.toFixed(6)),
      };
      return { ...prev, locations: next };
    });
    toast.success('Koordinatlar seçili satıra uygulandı');
  };

  const autofillLocationsFromDealers = () => {
    if (dealers.length === 0) {
      toast.error('Önce bayi listesi yüklenmeli');
      return;
    }
    const generated = dealers.slice(0, 20).map((dealer, index) => ({
      dealerId: dealer.id,
      latitude: typeof dealer.latitude === 'number' ? dealer.latitude : 41.0082 + index * 0.001,
      longitude: typeof dealer.longitude === 'number' ? dealer.longitude : 28.9784 + index * 0.001,
      address: dealer.address || '',
      categories: [],
      opensAt: '09:00',
      closesAt: '23:00',
      daysOfWeek: [1, 2, 3, 4, 5, 6, 0],
    }));
    setConfig((prev) => ({ ...prev, locations: generated }));
    toast.success('Konum satırları bayi profillerinden dolduruldu');
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Discovery Yönetimi"
        description="Trend mekanlar, haftanın enleri, sponsor duyuruları ve yakın mekan konumlarını yönetin"
        actions={
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={fetchConfig} disabled={loading || saving} className="gap-2">
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
              Yenile
            </Button>
            <Button
              variant="outline"
              onClick={autofillLocationsFromDealers}
              disabled={loading || saving || dealers.length === 0}
              className="gap-2"
            >
              <MapPinned className="h-4 w-4" />
              Bayilerden doldur
            </Button>
            <Button onClick={saveConfig} disabled={loading || saving || !isDirty} className="gap-2">
              <Save className="h-4 w-4" />
              Kaydet
            </Button>
          </div>
        }
      />

      <Card className="border-primary/20">
        <CardHeader className="py-3">
          <button
            type="button"
            className="flex w-full items-center justify-between text-left"
            onClick={() => setShowHelp((v) => !v)}
          >
            <span className="flex items-center gap-2 text-sm font-medium">
              <HelpCircle className="h-4 w-4 text-primary" />
              Nasıl kullanılır?
            </span>
            {showHelp ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </button>
        </CardHeader>
        {showHelp && (
          <CardContent className="pt-0 text-sm text-muted-foreground space-y-2">
            <ul className="list-disc list-inside space-y-1">
              <li><strong>Haftanın enleri:</strong> Müşteri trend sayfasındaki kategori başlıklarını düzenleyin.</li>
              <li><strong>Yakın mekan konumları:</strong> Bayi seçin, enlem/boylam girin veya &quot;Bayi Profilinden Doldur&quot; / &quot;Pine Uygula&quot; kullanın. Kategori (kahve, tatlı, yemek) ve açılış/kapanış ekleyin.</li>
              <li><strong>Sponsor duyuruları:</strong> İndirim veya kampanya kartları; id ve başlık zorunlu.</li>
              <li><strong>Konfigürasyon araçları:</strong> JSON dışa aktar / içe aktar; koordinat veya harita linki ile &quot;Pine Uygula&quot; ile satıra koordinat yazın.</li>
              <li><strong>Yakındaki kartları test et:</strong> Örnek enlem/boylam ile müşteri yakınımdakiler çıktısını önizleyin.</li>
            </ul>
          </CardContent>
        )}
      </Card>

      {validationErrors.length > 0 && (
        <Card className="border-destructive/50 bg-destructive/5">
          <CardHeader>
            <CardTitle className="text-destructive text-base">Kaydetmeden önce düzeltin</CardTitle>
            <CardDescription>Aşağıdaki maddeleri giderin, sonra tekrar Kaydet'e basın.</CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="list-disc list-inside space-y-1 text-sm text-muted-foreground">
              {validationErrors.map((msg, i) => (
                <li key={i} className="text-destructive/90">{msg}</li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Haftanın Enleri Etiketleri</CardTitle>
          <CardDescription>Müşteri trend ekranında görünecek başlıkları özelleştirin.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-3">
          <div className="space-y-2">
            <Label>Ambiyans Başlığı</Label>
            <Input
              value={config.weeklyHighlights.ambienceLabel}
              onChange={(e) =>
                setConfig((prev) => ({
                  ...prev,
                  weeklyHighlights: { ...prev.weeklyHighlights, ambienceLabel: e.target.value },
                }))
              }
            />
          </div>
          <div className="space-y-2">
            <Label>Yemek Başlığı</Label>
            <Input
              value={config.weeklyHighlights.foodLabel}
              onChange={(e) =>
                setConfig((prev) => ({
                  ...prev,
                  weeklyHighlights: { ...prev.weeklyHighlights, foodLabel: e.target.value },
                }))
              }
            />
          </div>
          <div className="space-y-2">
            <Label>Hizmet Başlığı</Label>
            <Input
              value={config.weeklyHighlights.serviceLabel}
              onChange={(e) =>
                setConfig((prev) => ({
                  ...prev,
                  weeklyHighlights: { ...prev.weeklyHighlights, serviceLabel: e.target.value },
                }))
              }
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Konfigürasyon Araçları</CardTitle>
          <CardDescription>Discovery ayarlarını dışa/içe aktarın ve harita pin koordinatını satıra uygulayın.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" onClick={exportConfigAsJson} className="gap-2">
              <Download className="h-4 w-4" />
              JSON Dışa Aktar
            </Button>
            <Button type="button" variant="outline" onClick={importConfigFromJson} className="gap-2">
              <Upload className="h-4 w-4" />
              JSON İçe Aktar
            </Button>
          </div>
          <textarea
            className="min-h-28 w-full rounded-md border bg-background p-3 text-sm"
            placeholder="İçe aktarmak için discovery JSON içeriğini buraya yapıştırın..."
            value={importPayload}
            onChange={(e) => setImportPayload(e.target.value)}
          />
          <div className="grid gap-2 md:grid-cols-4">
            <Input
              className="md:col-span-2"
              placeholder="41.0082,28.9784 veya Google Maps linki"
              value={pinSource}
              onChange={(e) => setPinSource(e.target.value)}
            />
            <select
              className="h-10 rounded-md border bg-background px-3 text-sm"
              value={String(pinTargetIndex)}
              onChange={(e) => setPinTargetIndex(Number(e.target.value))}
            >
              {config.locations.map((row, index) => (
                <option key={`${row.dealerId || 'row'}-${index}`} value={index}>
                  Satır {index + 1} - {row.dealerId || 'dealer seçilmedi'}
                </option>
              ))}
            </select>
            <Button
              type="button"
              variant="outline"
              onClick={applyPinToLocation}
              disabled={config.locations.length === 0}
              className="gap-2"
            >
              <MapPinned className="h-4 w-4" />
              Pine Uygula
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Yakın Mekan Konumları</CardTitle>
          {/* CardDescription = <p>; Badge = <div> → blok iç içe geçmez (hydration). */}
          <div className="text-sm text-muted-foreground">
            Dealer kullanıcılarına konum tanımlayın. Kategori örnekleri: <Badge variant="outline">kahve</Badge>{' '}
            <Badge variant="outline">tatlı</Badge> <Badge variant="outline">yemek</Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {config.locations.map((row, index) => (
            <div key={`${row.dealerId}-${index}`} className="grid gap-2 rounded-lg border p-3 md:grid-cols-16">
              <div className="md:col-span-2 space-y-1">
                <select
                  className="h-10 w-full rounded-md border bg-background px-3 text-sm"
                  value={row.dealerId}
                  onChange={(e) =>
                    setConfig((prev) => {
                      const next = [...prev.locations];
                      next[index] = { ...next[index], dealerId: e.target.value };
                      return { ...prev, locations: next };
                    })
                  }
                >
                  <option value="">Bayi seç</option>
                  {dealers.map((dealer) => (
                    <option key={dealer.id} value={dealer.id}>
                      {dealer.businessName}
                    </option>
                  ))}
                </select>
                <p className="text-[11px] text-muted-foreground truncate">
                  {dealers.find((dealer) => dealer.id === row.dealerId)?.email || row.dealerId || 'dealerId'}
                </p>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-7 w-full text-[11px]"
                  disabled={!row.dealerId}
                  onClick={() => fillLocationFromDealerProfile(index, row.dealerId)}
                >
                  Bayi Profilinden Doldur
                </Button>
              </div>
              <Input
                className="md:col-span-2"
                type="number"
                placeholder="latitude"
                value={row.latitude}
                onChange={(e) =>
                  setConfig((prev) => {
                    const next = [...prev.locations];
                    next[index] = { ...next[index], latitude: Number(e.target.value) };
                    return { ...prev, locations: next };
                  })
                }
              />
              <Input
                className="md:col-span-2"
                type="number"
                placeholder="longitude"
                value={row.longitude}
                onChange={(e) =>
                  setConfig((prev) => {
                    const next = [...prev.locations];
                    next[index] = { ...next[index], longitude: Number(e.target.value) };
                    return { ...prev, locations: next };
                  })
                }
              />
              <Input
                className="md:col-span-3"
                placeholder="address"
                value={row.address || ''}
                onChange={(e) =>
                  setConfig((prev) => {
                    const next = [...prev.locations];
                    next[index] = { ...next[index], address: e.target.value };
                    return { ...prev, locations: next };
                  })
                }
              />
              <Input
                className="md:col-span-2"
                placeholder="kahve,tatlı,yemek"
                value={row.categories.join(',')}
                onChange={(e) =>
                  setConfig((prev) => {
                    const next = [...prev.locations];
                    next[index] = {
                      ...next[index],
                      categories: e.target.value
                        .split(',')
                        .map((item) => item.trim().toLowerCase())
                        .filter(Boolean),
                    };
                    return { ...prev, locations: next };
                  })
                }
              />
              <Input
                className="md:col-span-1"
                placeholder="açılış 09:00"
                value={row.opensAt || ''}
                onChange={(e) =>
                  setConfig((prev) => {
                    const next = [...prev.locations];
                    next[index] = { ...next[index], opensAt: e.target.value };
                    return { ...prev, locations: next };
                  })
                }
              />
              <Input
                className="md:col-span-1"
                placeholder="kapanış 23:00"
                value={row.closesAt || ''}
                onChange={(e) =>
                  setConfig((prev) => {
                    const next = [...prev.locations];
                    next[index] = { ...next[index], closesAt: e.target.value };
                    return { ...prev, locations: next };
                  })
                }
              />
              <Input
                className="md:col-span-1"
                placeholder="günler 1,2,3,4,5,6,0"
                value={(row.daysOfWeek || []).join(',')}
                onChange={(e) =>
                  setConfig((prev) => {
                    const next = [...prev.locations];
                    next[index] = {
                      ...next[index],
                      daysOfWeek: e.target.value
                        .split(',')
                        .map((item) => Number(item.trim()))
                        .filter((item) => Number.isFinite(item) && item >= 0 && item <= 6),
                    };
                    return { ...prev, locations: next };
                  })
                }
              />
              <Button
                variant="outline"
                size="icon"
                className="md:col-span-1"
                onClick={() =>
                  setConfig((prev) => ({
                    ...prev,
                    locations: prev.locations.filter((_, i) => i !== index),
                  }))
                }
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          ))}
          <Button
            variant="outline"
            className="gap-2"
            onClick={() =>
              setConfig((prev) => ({
                ...prev,
                locations: [
                  ...prev.locations,
                  {
                    dealerId: '',
                    latitude: 0,
                    longitude: 0,
                    address: '',
                    categories: [],
                    opensAt: '09:00',
                    closesAt: '23:00',
                    daysOfWeek: [1, 2, 3, 4, 5, 6, 0],
                  },
                ],
              }))
            }
          >
            <Plus className="h-4 w-4" />
            Konum Ekle
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Yakındaki Kartları Test Et</CardTitle>
          <CardDescription>Örnek konum ile müşteri tarafındaki nearby çıktısını admin panelinden doğrulayın.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid gap-2 md:grid-cols-5">
            <Input value={previewLat} onChange={(e) => setPreviewLat(e.target.value)} placeholder="enlem" />
            <Input value={previewLng} onChange={(e) => setPreviewLng(e.target.value)} placeholder="boylam" />
            <Input
              type="number"
              min={1}
              max={50}
              value={previewRadius}
              onChange={(e) => setPreviewRadius(Math.max(1, Number(e.target.value) || 1))}
              placeholder="yarıçap km"
            />
            <Input
              value={previewCategory}
              onChange={(e) => setPreviewCategory((e.target.value || 'all').toLowerCase())}
              placeholder="kategori (all/kahve/tatlı/yemek)"
            />
            <Button onClick={runNearbyPreview} disabled={previewLoading} className="gap-2">
              <TestTube2 className={`h-4 w-4 ${previewLoading ? 'animate-spin' : ''}`} />
              {previewLoading ? 'Test ediliyor...' : 'Yakındaki Kartları Test Et'}
            </Button>
          </div>

          {previewNearby.length === 0 ? (
            <p className="text-sm text-muted-foreground">Henüz önizleme sonucu yok veya bu filtrede mekan bulunamadı.</p>
          ) : (
            <div className="space-y-2">
              {previewNearby.slice(0, 8).map((item) => (
                <div key={item.dealerId} className="flex items-center justify-between rounded-lg border p-3">
                  <div>
                    <p className="font-medium">{item.businessName}</p>
                    <p className="text-xs text-muted-foreground">
                      {(item.distanceKm < 1 ? `${Math.round(item.distanceKm * 1000)} m` : `${item.distanceKm.toFixed(2)} km`)} ·
                      {' '}Puan {item.avgRating.toFixed(1)} · Trend {item.trendScore}
                    </p>
                  </div>
                  <div className="text-right">
                    <Badge variant={item.isOpenNow ? 'default' : 'outline'} className={item.isOpenNow ? 'bg-emerald-600 text-white' : ''}>
                      {item.isOpenNow ? 'Açık' : 'Kapalı'}
                    </Badge>
                    <p className="text-xs text-muted-foreground mt-1">{item.categories.slice(0, 2).join(', ') || 'kategori yok'}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Sponsor / İndirim Duyuruları</CardTitle>
          <CardDescription>Müşteri ekranında gösterilecek reklam veya indirim kartlarını yönetin.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {config.sponsored.map((item, index) => (
            <div key={`${item.id}-${index}`} className="rounded-lg border p-3 space-y-2">
              <div className="grid gap-2 md:grid-cols-12">
                <Input
                  className="md:col-span-2"
                  placeholder="id"
                  value={item.id}
                  onChange={(e) =>
                    setConfig((prev) => {
                      const next = [...prev.sponsored];
                      next[index] = { ...next[index], id: e.target.value };
                      return { ...prev, sponsored: next };
                    })
                  }
                />
                <Input
                  className="md:col-span-3"
                  placeholder="başlık"
                  value={item.title}
                  onChange={(e) =>
                    setConfig((prev) => {
                      const next = [...prev.sponsored];
                      next[index] = { ...next[index], title: e.target.value };
                      return { ...prev, sponsored: next };
                    })
                  }
                />
                <Input
                  className="md:col-span-2"
                  type="number"
                  placeholder="indirim %"
                  value={item.discountRate || 0}
                  onChange={(e) =>
                    setConfig((prev) => {
                      const next = [...prev.sponsored];
                      next[index] = { ...next[index], discountRate: Number(e.target.value) };
                      return { ...prev, sponsored: next };
                    })
                  }
                />
                <Input
                  className="md:col-span-2"
                  type="number"
                  placeholder="öncelik"
                  value={item.priority}
                  onChange={(e) =>
                    setConfig((prev) => {
                      const next = [...prev.sponsored];
                      next[index] = { ...next[index], priority: Number(e.target.value) };
                      return { ...prev, sponsored: next };
                    })
                  }
                />
                <Input
                  className="md:col-span-2"
                  placeholder="dealerId"
                  value={item.dealerId || ''}
                  onChange={(e) =>
                    setConfig((prev) => {
                      const next = [...prev.sponsored];
                      next[index] = { ...next[index], dealerId: e.target.value };
                      return { ...prev, sponsored: next };
                    })
                  }
                />
                <Button
                  variant="outline"
                  size="icon"
                  className="md:col-span-1"
                  onClick={() =>
                    setConfig((prev) => ({
                      ...prev,
                      sponsored: prev.sponsored.filter((_, i) => i !== index),
                    }))
                  }
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
              <Input
                placeholder="açıklama"
                value={item.description || ''}
                onChange={(e) =>
                  setConfig((prev) => {
                    const next = [...prev.sponsored];
                    next[index] = { ...next[index], description: e.target.value };
                    return { ...prev, sponsored: next };
                  })
                }
              />
              <div className="grid gap-2 md:grid-cols-3">
                <Input
                  placeholder="link URL"
                  value={item.linkUrl || ''}
                  onChange={(e) =>
                    setConfig((prev) => {
                      const next = [...prev.sponsored];
                      next[index] = { ...next[index], linkUrl: e.target.value };
                      return { ...prev, sponsored: next };
                    })
                  }
                />
                <Input
                  placeholder="başlangıç (ISO)"
                  value={item.startsAt || ''}
                  onChange={(e) =>
                    setConfig((prev) => {
                      const next = [...prev.sponsored];
                      next[index] = { ...next[index], startsAt: e.target.value };
                      return { ...prev, sponsored: next };
                    })
                  }
                />
                <Input
                  placeholder="bitiş (ISO)"
                  value={item.endsAt || ''}
                  onChange={(e) =>
                    setConfig((prev) => {
                      const next = [...prev.sponsored];
                      next[index] = { ...next[index], endsAt: e.target.value };
                      return { ...prev, sponsored: next };
                    })
                  }
                />
              </div>
              <div className="flex items-center gap-2">
                <Switch
                  checked={item.isActive}
                  onCheckedChange={(checked) =>
                    setConfig((prev) => {
                      const next = [...prev.sponsored];
                      next[index] = { ...next[index], isActive: checked };
                      return { ...prev, sponsored: next };
                    })
                  }
                />
                <span className="text-sm text-muted-foreground">Aktif</span>
              </div>
            </div>
          ))}
          <Button
            variant="outline"
            className="gap-2"
            onClick={() =>
              setConfig((prev) => ({
                ...prev,
                sponsored: [
                  ...prev.sponsored,
                  {
                    id: `sponsored_${Date.now()}`,
                    title: '',
                    description: '',
                    discountRate: 0,
                    linkUrl: '',
                    dealerId: '',
                    priority: 0,
                    isActive: true,
                    startsAt: '',
                    endsAt: '',
                  },
                ],
              }))
            }
          >
            <Plus className="h-4 w-4" />
            Sponsor Duyurusu Ekle
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
