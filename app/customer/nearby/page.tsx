'use client';

import { useEffect, useMemo, useState } from 'react';
import { DashboardPageHeading } from '@/components/dashboard/page-heading';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Compass, ExternalLink, MapPin, Navigation, Phone, RefreshCw, Star, Store, Zap, Sparkles, ShieldCheck } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { toast } from '@/lib/admin-toast';
import Image from 'next/image';
import { useAppT } from '@/lib/app-locale';

type LiveBoost = {
  dealerId: string | null;
  businessName: string;
  happyHourName: string;
  multiplier: number;
  distanceKm: number;
  scope: 'dealer' | 'global';
};

type NearbyVenue = {
  dealerId: string;
  businessName: string;
  image: string | null;
  phone: string | null;
  address?: string;
  distanceKm: number;
  categories: string[];
  avgRating: number;
  trendScore: number;
  feedbackCount: number;
  isOpenNow: boolean;
};

type InnovationFlashItem = {
  id: string;
  title: string;
  body: string;
  distanceKm: number;
  venueLabel: string;
  validTo: string;
  offerType: string;
};

type DiscoveryCard = {
  kind: string;
  label: string;
  mentions: number;
  blurb: string;
};

type InnovationRadarPayload = {
  topThemes: { label: string; weight: number }[];
  experienceHints: string[];
  discoveryCards?: DiscoveryCard[];
  disclaimer?: string;
};

function formatDistance(distanceKm: number): string {
  if (distanceKm < 1) {
    return `${Math.round(distanceKm * 1000)} m`;
  }
  return `${distanceKm.toFixed(2)} km`;
}

const NEARBY_LOC_STORAGE_KEY = 'qratex-customer-nearby-loc';
const NEARBY_LOC_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

export default function CustomerNearbyPage() {
  const t = useAppT();
  const [loading, setLoading] = useState(true);
  const [locating, setLocating] = useState(false);
  const [latitude, setLatitude] = useState<number | null>(null);
  const [longitude, setLongitude] = useState<number | null>(null);
  const [radiusKm, setRadiusKm] = useState(5);
  const [category, setCategory] = useState('all');
  const [venues, setVenues] = useState<NearbyVenue[]>([]);
  const [liveBoosts, setLiveBoosts] = useState<LiveBoost[]>([]);
  const [innovationFlash, setInnovationFlash] = useState<InnovationFlashItem[]>([]);
  const [innovationRadar, setInnovationRadar] = useState<InnovationRadarPayload | null>(null);
  const [aiRecommendations, setAiRecommendations] = useState<string | null>(null);
  const [aiStats, setAiStats] = useState<any | null>(null);
  const [locationError, setLocationError] = useState<number | null>(null);
  const [showLocationModal, setShowLocationModal] = useState(false);

  const categoryOptions = useMemo(
    () => [
      { value: 'all', label: t('customerNearby.categories.all') },
      { value: 'kahve', label: t('customerNearby.categories.coffee') },
      { value: 'tatlı', label: t('customerNearby.categories.dessert') },
      { value: 'yemek', label: t('customerNearby.categories.food') },
    ],
    [t]
  );

  // Konum izni MODAL'ı: butonlar önce açıklayıcı modalı açar; modaldaki onay
  // gerçek getLocation()'ı çağırır (iOS: kullanıcı jesti içinde tetiklenir).
  const promptLocation = () => setShowLocationModal(true);
  const confirmLocation = () => {
    setShowLocationModal(false);
    getLocation();
  };

  const getLocation = () => {
    if (!navigator.geolocation) {
      toast.error(t('customerNearby.noBrowserLocationSupport'));
      setLocationError(2);
      return;
    }
    setLocating(true);
    setLocationError(null);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const lat = position.coords.latitude;
        const lng = position.coords.longitude;
        setLatitude(lat);
        setLongitude(lng);
        setLocationError(null);
        setLocating(false);
        try {
          localStorage.setItem(
            NEARBY_LOC_STORAGE_KEY,
            JSON.stringify({ lat, lng, ts: Date.now() })
          );
        } catch {
          // private mode / quota
        }
      },
      (err: GeolocationPositionError) => {
        setLocationError(err.code);
        toast.error(
          err.code === 1
            ? t('customerNearby.permissionDenied')
            : t('customerNearby.locationTimeout')
        );
        setLocating(false);
      },
      {
        enableHighAccuracy: false,
        timeout: 15000,
        maximumAge: 120000,
      }
    );
  };

  useEffect(() => {
    try {
      const raw = localStorage.getItem(NEARBY_LOC_STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as { lat?: unknown; lng?: unknown; ts?: unknown };
      const lat = typeof parsed.lat === 'number' ? parsed.lat : Number(parsed.lat);
      const lng = typeof parsed.lng === 'number' ? parsed.lng : Number(parsed.lng);
      const ts = typeof parsed.ts === 'number' ? parsed.ts : Number(parsed.ts);
      if (!Number.isFinite(lat) || !Number.isFinite(lng) || !Number.isFinite(ts)) {
        localStorage.removeItem(NEARBY_LOC_STORAGE_KEY);
        return;
      }
      if (Date.now() - ts > NEARBY_LOC_MAX_AGE_MS) {
        localStorage.removeItem(NEARBY_LOC_STORAGE_KEY);
        return;
      }
      setLatitude(lat);
      setLongitude(lng);
    } catch {
      try {
        localStorage.removeItem(NEARBY_LOC_STORAGE_KEY);
      } catch {
        // ignore
      }
    }
  }, []);

  const fetchNearby = async () => {
    if (latitude === null || longitude === null) {
      setLoading(false);
      return;
    }
    try {
      setLoading(true);
      const query = new URLSearchParams({
        lat: String(latitude),
        lng: String(longitude),
        radiusKm: String(radiusKm),
        category,
      });
      const res = await fetch(`/api/customer/discovery?${query.toString()}`, { cache: 'no-store' });
      const data = await res.json();
      if (!res.ok || !data?.success) {
        throw new Error(data?.error || t('customerNearby.loadError'));
      }
      setVenues(data.data.nearby || []);
      setLiveBoosts(Array.isArray(data.data.liveBoosts) ? data.data.liveBoosts : []);
    } catch (err) {
      console.error('Nearby fetch error:', err);
    } finally {
      setLoading(false);
    }
  };

  const fetchAiRecommendations = async () => {
    try {
      const res = await fetch('/api/customer/ai-recommendations');
      const data = await res.json();
      if (data.success) {
        setAiRecommendations(data.recommendations);
        setAiStats(data.stats);
      }
    } catch (err) {
      console.error('AI recommendations fetch error:', err);
    }
  };

  useEffect(() => {
    if (latitude !== null && longitude !== null) {
      fetchNearby();
      fetchAiRecommendations();
    }
  }, [latitude, longitude, radiusKm, category]);

  useEffect(() => {
    if (latitude === null || longitude === null) return;
    let cancelled = false;
    (async () => {
      try {
        const [nf, nr] = await Promise.all([
          fetch(
            `/api/customer/innovation/nearby?lat=${latitude}&lng=${longitude}&radiusKm=${Math.min(radiusKm, 25)}`,
            { cache: 'no-store' }
          ),
          fetch(
            `/api/customer/innovation/radar?lat=${latitude}&lng=${longitude}&radiusKm=25`,
            { cache: 'no-store' }
          ),
        ]);
        const fj = await nf.json();
        const rj = await nr.json();
        if (!cancelled) {
          setInnovationFlash(Array.isArray(fj.items) ? fj.items : []);
          if (rj.topThemes || rj.experienceHints || (rj.discoveryCards && rj.discoveryCards.length > 0)) {
            setInnovationRadar(rj);
          } else {
            setInnovationRadar(null);
          }
        }
      } catch {
        if (!cancelled) {
          setInnovationFlash([]);
          setInnovationRadar(null);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [latitude, longitude, radiusKm]);

  return (
    <div className="space-y-6">
      {/* Konum izni MODAL'ı — "Konumumu Kullan" tıklanınca çıkar; onay tarayıcı iznini ister */}
      <Dialog open={showLocationModal} onOpenChange={setShowLocationModal}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
              <ShieldCheck className="h-6 w-6 text-primary" />
            </div>
            <DialogTitle className="text-center">{t('customerNearby.shareLocationTitle')}</DialogTitle>
            <DialogDescription className="text-center text-pretty">
              {t('customerNearby.shareLocationBody')}
            </DialogDescription>
          </DialogHeader>
          <div className="rounded-lg bg-muted/50 p-3 text-xs text-muted-foreground leading-relaxed">
            {t('customerNearby.iosLocationNote')}
          </div>
          <DialogFooter className="gap-2 sm:gap-2">
            <Button variant="outline" onClick={() => setShowLocationModal(false)} className="w-full sm:w-auto">
              Vazgeç
            </Button>
            <Button onClick={confirmLocation} disabled={locating} className="w-full gap-2 sm:w-auto">
              <Navigation className={`h-4 w-4 ${locating ? 'animate-spin' : ''}`} />
              {locating ? t('customerNearby.locationFetching') : t('customerNearby.useMyLocation')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Mobil: üstte tek parmakla erişilebilir konum CTA */}
      <div className="sm:hidden space-y-1.5">
        <Button
          type="button"
          variant={latitude === null && longitude === null ? 'default' : 'outline'}
          onClick={promptLocation}
          disabled={locating}
          className="w-full min-h-11 gap-2 touch-manipulation font-medium justify-center"
        >
          <Navigation className={`h-4 w-4 shrink-0 ${locating ? 'animate-spin' : ''}`} />
          {locating
            ? t('customerNearby.locationFetching')
            : latitude === null && longitude === null
              ? t('customerNearby.useMyLocation')
              : t('customerNearby.refreshLocation')}
        </Button>
        {latitude !== null && longitude !== null ? (
          <p className="text-center text-[11px] text-muted-foreground leading-snug px-1">
            {t('customerNearby.mobileTopLocationHint')}
          </p>
        ) : null}
      </div>

      <DashboardPageHeading
        title={t('customerNearby.title')}
        description={t('customerNearby.description')}
        actions={
          <Button variant="outline" onClick={promptLocation} disabled={locating} className="gap-2 touch-manipulation shrink-0">
            <Navigation className={`h-4 w-4 shrink-0 ${locating ? 'animate-spin' : ''}`} />
            {t('customerNearby.refreshLocation')}
          </Button>
        }
      />

      <div className="rounded-2xl border border-border/60 bg-card/40 backdrop-blur-sm p-4 shadow-sm sm:hidden">
        <h1 className="text-xl font-bold tracking-tight text-balance">{t('customerNearby.title')}</h1>
        <p className="text-sm text-muted-foreground mt-1 text-pretty leading-relaxed">
          {t('customerNearby.description')}
        </p>
      </div>

      {latitude === null && longitude === null && (
        <Card className="border-primary/25 bg-primary/5">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">{t('customerNearby.shareLocationTitle')}</CardTitle>
            <CardDescription className="text-pretty">{t('customerNearby.shareLocationBody')}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-xs text-muted-foreground leading-relaxed">{t('customerNearby.iosLocationNote')}</p>
            <Button
              type="button"
              onClick={promptLocation}
              disabled={locating}
              className="w-full gap-2 touch-manipulation sm:w-auto max-sm:hidden min-h-10"
            >
              <Navigation className={`h-4 w-4 shrink-0 ${locating ? 'animate-spin' : ''}`} />
              {locating ? t('customerNearby.locationFetching') : t('customerNearby.useMyLocation')}
            </Button>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>{t('customerNearby.filters.title')}</CardTitle>
          <CardDescription>{t('customerNearby.filters.description')}</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-3">
          <div className="space-y-2">
            <label className="text-sm text-muted-foreground">{t('customerNearby.filters.maxDistanceKm')}</label>
            <Input
              type="number"
              min={1}
              max={50}
              value={radiusKm}
              onChange={(e) => setRadiusKm(Math.max(1, Number(e.target.value) || 1))}
            />
          </div>
          <div className="space-y-2">
            <label className="text-sm text-muted-foreground">{t('customerNearby.filters.category')}</label>
            <select
              className="h-11 min-h-11 w-full rounded-md border bg-background px-3 text-base sm:text-sm touch-manipulation"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
            >
              {categoryOptions.map((item) => (
                <option key={item.value} value={item.value}>
                  {item.label}
                </option>
              ))}
            </select>
          </div>
          <div className="flex items-end">
            <Button variant="outline" onClick={fetchNearby} className="gap-2 w-full min-h-10 touch-manipulation">
              <RefreshCw className="h-4 w-4" />
              {t('customerNearby.filters.refreshList')}
            </Button>
          </div>
        </CardContent>
      </Card>

      {latitude !== null && longitude !== null && innovationFlash.length > 0 && (
        <Card className="border-primary/20 bg-gradient-to-br from-primary/5 to-cyan-500/5">
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <Zap className="h-5 w-5 text-primary" />
              Şimdi yakınımda (flash)
            </CardTitle>
            <CardDescription>Kısa süreli işletme teklifleri — konumunuza göre sıralanır.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-2">
            {innovationFlash.slice(0, 8).map((item) => (
              <div key={item.id} className="rounded-xl border bg-card/80 p-3 text-sm space-y-1">
                <p className="font-semibold line-clamp-2">{item.title}</p>
                <p className="text-xs text-muted-foreground line-clamp-3">{item.body}</p>
                <div className="flex justify-between items-center gap-2 pt-1">
                  <Badge variant="secondary">{item.venueLabel}</Badge>
                  <span className="text-[10px] text-muted-foreground">
                    {formatDistance(item.distanceKm)} · bitiş{' '}
                    {new Date(item.validTo).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {latitude !== null && longitude !== null && innovationRadar && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <Compass className="h-5 w-5 text-cyan-600" />
              Bölge trendleri (anonim)
            </CardTitle>
            <CardDescription>{innovationRadar.disclaimer}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 text-sm">
            {innovationRadar.topThemes?.length ? (
              <div>
                <p className="font-medium mb-2 text-xs uppercase tracking-wide text-muted-foreground">
                  Öne çıkan temalar
                </p>
                <div className="flex flex-wrap gap-2">
                  {innovationRadar.topThemes.slice(0, 8).map((th) => (
                    <Badge key={th.label} variant="outline">
                      {th.label}
                      <span className="ml-1 opacity-60">{th.weight}</span>
                    </Badge>
                  ))}
                </div>
              </div>
            ) : null}
            {innovationRadar.experienceHints?.length ? (
              <div>
                <p className="font-medium mb-2 text-xs uppercase tracking-wide text-muted-foreground">
                  Deneyim ipuçları
                </p>
                <ul className="list-disc pl-5 space-y-1 text-muted-foreground">
                  {innovationRadar.experienceHints.map((h) => (
                    <li key={h}>{h}</li>
                  ))}
                </ul>
              </div>
            ) : null}
            {innovationRadar.discoveryCards && innovationRadar.discoveryCards.length > 0 ? (
              <div>
                <p className="font-medium mb-2 text-xs uppercase tracking-wide text-muted-foreground">
                  Bu bölgede öne çıkan 3 lezzet (anonim özet)
                </p>
                <div className="grid gap-2 sm:grid-cols-3">
                  {innovationRadar.discoveryCards.slice(0, 3).map((d) => (
                    <div key={d.label} className="rounded-lg border bg-muted/30 p-3 text-sm">
                      <p className="font-semibold line-clamp-2">{d.label}</p>
                      <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{d.blurb}</p>
                      <Badge variant="secondary" className="mt-2 text-[10px]">
                        {d.mentions} kez geçti
                      </Badge>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
          </CardContent>
        </Card>
      )}

      {latitude !== null && longitude !== null && aiRecommendations && (
        <Card className="border-purple-500/30 bg-gradient-to-br from-purple-500/10 via-background to-cyan-500/5 shadow-lg shadow-purple-500/5 overflow-hidden relative">
          <div className="absolute top-0 right-0 p-4 opacity-10 pointer-events-none">
            <Sparkles className="h-24 w-24 text-purple-500" />
          </div>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2 text-purple-600 dark:text-purple-400">
              <Sparkles className="h-5 w-5 animate-pulse" />
              Sana Özel AI Keşif Önerileri
            </CardTitle>
            <CardDescription>Geri bildirim geçmişinize dayalı kişiselleştirilmiş analiz.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="prose prose-sm dark:prose-invert max-w-none text-muted-foreground leading-relaxed whitespace-pre-wrap">
              {aiRecommendations}
            </div>
            
            {aiStats && (
              <div className="pt-4 border-t flex flex-wrap gap-4 items-center justify-between">
                <div className="flex gap-4">
                  <div className="text-center">
                    <p className="text-[10px] uppercase text-muted-foreground font-semibold">Genel Puanın</p>
                    <p className="text-sm font-bold">{aiStats.avgRating?.toFixed(1)}</p>
                  </div>
                  <div className="text-center">
                    <p className="text-[10px] uppercase text-muted-foreground font-semibold">Olumlu Oranı</p>
                    <p className="text-sm font-bold text-emerald-500">%{aiStats.sentimentDist?.positive}</p>
                  </div>
                  <div className="text-center">
                    <p className="text-[10px] uppercase text-muted-foreground font-semibold">Aciliyet</p>
                    <p className="text-sm font-bold text-amber-500">{(aiStats.avgUrgency * 10)?.toFixed(1)}/10</p>
                  </div>
                </div>
                <Badge variant="outline" className="bg-purple-500/5 text-purple-500 border-purple-500/20">
                  Cortex 2.0 Analizi
                </Badge>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {liveBoosts.length > 0 && (
        <Card className="border-amber-500/25 bg-gradient-to-r from-amber-500/5 to-orange-500/5">
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <Zap className="h-5 w-5 text-amber-500" />
              {t('customerNearby.liveBoosts.title')}
            </CardTitle>
            <CardDescription>{t('customerNearby.liveBoosts.description')}</CardDescription>
          </CardHeader>
          <CardContent className="flex gap-2 overflow-x-auto pb-1 snap-x snap-mandatory">
            {liveBoosts.map((b, i) => (
              <div
                key={`${b.happyHourName}-${b.dealerId ?? 'g'}-${i}`}
                className="snap-start shrink-0 min-w-[200px] rounded-xl border bg-card/80 px-3 py-2 text-sm"
              >
                <p className="font-medium line-clamp-1">{b.happyHourName}</p>
                <p className="text-xs text-muted-foreground line-clamp-1">{b.businessName}</p>
                <div className="mt-1 flex items-center justify-between gap-2">
                  <Badge variant="secondary" className="text-xs">
                    ×{b.multiplier}
                  </Badge>
                  <span className="text-[10px] text-muted-foreground">{formatDistance(b.distanceKm)}</span>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {latitude !== null && longitude !== null && (
        <Card>
          <CardContent className="py-3 text-sm text-muted-foreground">
            {t('customerNearby.locationPrefix')}: {latitude.toFixed(6)}, {longitude.toFixed(6)}
          </CardContent>
        </Card>
      )}

      {loading ? (
        <div className="grid gap-4 md:grid-cols-2">
          {[...Array(4)].map((_, i) => (
            <Card key={i} className="animate-pulse">
              <CardContent className="h-32" />
            </Card>
          ))}
        </div>
      ) : venues.length === 0 ? (
        <>
          {latitude === null && longitude === null && locationError !== null && (
            <Card className="border-amber-500/30 bg-amber-500/5">
              <CardContent className="p-6">
                <p className="font-medium text-foreground mb-1">{t('customerNearby.locationRequiredTitle')}</p>
                <p className="text-sm text-muted-foreground mb-4">
                  {locationError === 1
                    ? t('customerNearby.locationHelpPermission')
                    : locationError === 3
                      ? t('customerNearby.locationHelpTimeout')
                      : t('customerNearby.locationHelpGeneric')}
                </p>
                <Button onClick={promptLocation} disabled={locating} className="gap-2 max-sm:hidden touch-manipulation min-h-10 w-full sm:w-auto">
                  <Navigation className={`h-4 w-4 ${locating ? 'animate-spin' : ''}`} />
                  {locating ? t('customerNearby.locationFetching') : t('customerNearby.useMyLocation')}
                </Button>
              </CardContent>
            </Card>
          )}
          <Card>
            <CardContent className="p-10 text-center text-muted-foreground">
              <MapPin className="h-10 w-10 mx-auto mb-2 opacity-50" />
              {latitude === null || longitude === null
                ? t('customerNearby.emptyNoLocation')
                : t('customerNearby.emptyFiltered')}
            </CardContent>
          </Card>
        </>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {venues.map((venue) => (
            <Card key={venue.dealerId}>
              <CardContent className="p-4 space-y-3">
                <div className="flex items-center gap-3">
                  {venue.image ? (
                    <div className="w-12 h-12 rounded-full overflow-hidden bg-muted">
                      <Image src={venue.image} alt={venue.businessName} width={48} height={48} className="object-cover" />
                    </div>
                  ) : (
                    <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center">
                      <Store className="h-5 w-5 text-muted-foreground" />
                    </div>
                  )}
                  <div className="min-w-0">
                    <p className="font-semibold truncate">{venue.businessName}</p>
                    <p className="text-xs text-muted-foreground truncate">{venue.address || t('customerNearby.noAddress')}</p>
                  </div>
                </div>
                <div className="flex items-center justify-between">
                  <Badge variant="secondary">{formatDistance(venue.distanceKm)}</Badge>
                  <Badge variant={venue.isOpenNow ? 'default' : 'outline'} className={venue.isOpenNow ? 'bg-emerald-600 text-white' : ''}>
                    {venue.isOpenNow ? t('customerNearby.open') : t('customerNearby.closed')}
                  </Badge>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Star className="h-4 w-4 text-amber-500" />
                    {venue.avgRating > 0 ? `${venue.avgRating.toFixed(1)} (${venue.feedbackCount} ${t('customerNearby.feedback')})` : t('customerNearby.noRating')}
                  </div>
                  <Badge variant="outline">{t('customerNearby.trend')} {venue.trendScore}</Badge>
                </div>
                <div className="flex items-center justify-between">
                  <div className="flex flex-wrap gap-1 justify-end">
                    {venue.categories.slice(0, 3).map((cat) => (
                      <Badge key={cat} variant="outline">
                        {cat}
                      </Badge>
                    ))}
                  </div>
                </div>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  {(latitude !== null && longitude !== null) && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="w-full gap-2 min-h-10 touch-manipulation"
                      asChild
                    >
                      <a
                        href={`https://www.google.com/maps/dir/?api=1&origin=${latitude},${longitude}&destination=${encodeURIComponent(venue.address || venue.businessName)}`}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        {t('customerNearby.route')}
                        <ExternalLink className="h-4 w-4" />
                      </a>
                    </Button>
                  )}
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full gap-2 min-h-10 touch-manipulation"
                    asChild={!!venue.phone}
                    disabled={!venue.phone}
                  >
                    {venue.phone ? (
                      <a href={`tel:${venue.phone.replace(/\s+/g, '')}`}>
                        <Phone className="h-4 w-4" />
                        {t('customerNearby.callNow')}
                      </a>
                    ) : (
                      <span className="inline-flex items-center gap-2">
                        <Phone className="h-4 w-4" />
                        {t('customerNearby.noPhone')}
                      </span>
                    )}
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
