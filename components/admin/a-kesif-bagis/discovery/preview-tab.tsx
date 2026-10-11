'use client';

import { useId, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { Clock, Flame, LocateFixed, MapPin, Megaphone, Play, Store, Trophy, Zap } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { StatusBadge } from '@/components/ds/data';
import { ChoiceChips } from '@/components/ds/a11y';
import { SectionCard } from '@/components/ds/page';
import { EmptyState, InlineError } from '@/components/states';
import { discoveryConfigSchema, issuePathLabel, parseCoordinates, type NearbyItem, type PreviewResult } from '@/lib/admin-discovery/contract';
import { errorText, runPreview } from '../api';
import { fmtDateTime, fmtDecimal, fmtNumber } from '../format';
import { useDiscoveryDraft } from './discovery-center';
import { AdminKesifBagisText, useAdminKesifBagisCopy } from '../copy';

function OpenBadge({ item }: { item: NearbyItem }) {
  if (item.holiday) return <StatusBadge size="sm" tone="warning" label="Tatilde" />;
  if (item.isOpenNow === null) return <StatusBadge size="sm" tone="neutral" label="Saat bilinmiyor" />;
  return <StatusBadge size="sm" tone={item.isOpenNow ? 'success' : 'neutral'} label={item.isOpenNow ? 'Açık' : 'Kapalı'} />;
}

/**
 * Önizleme — müşteri keşif hesabının AYNISI, taslak ya da canlı ayarla, müşteri kapılarına
 * takılmadan ve admin adına analitik olayı yazmadan (rapor Bulgu 10). Açık/kapalı İstanbul
 * saatiyle; saat bilinmiyorsa "bilinmiyor" (uydurulmaz).
 */
export default function PreviewTab({ dirty }: { dirty: boolean }) {
  const tx = useAdminKesifBagisCopy();
  const id = useId();
  const { draft } = useDiscoveryDraft();
  const [mode, setMode] = useState<'draft' | 'live'>(dirty ? 'draft' : 'live');
  const [coords, setCoords] = useState('');
  const [radius, setRadius] = useState('5');
  const [category, setCategory] = useState('all');
  const [formError, setFormError] = useState<string | null>(null);
  const [geoBusy, setGeoBusy] = useState(false);
  const run = useMutation({ mutationFn: runPreview });

  const submit = () => {
    const c = parseCoordinates(coords);
    if (!c) return setFormError('Konum çözülemedi. “41.0082, 28.9784” biçiminde girin ya da “Konumumu kullan”a basın.');
    const r = Number(radius.replace(',', '.'));
    if (!Number.isFinite(r) || r < 0.1 || r > 50) return setFormError('Yarıçap 0,1 ile 50 km arasında olmalı.');
    let config;
    if (mode === 'draft') {
      const parsed = discoveryConfigSchema.safeParse(draft);
      if (!parsed.success) {
        const i = parsed.error.issues[0];
        return setFormError(`Taslak geçersiz — ${issuePathLabel(i.path)}: ${i.message}`);
      }
      config = parsed.data;
    }
    setFormError(null);
    run.mutate({ mode, config, lat: c.latitude, lng: c.longitude, radiusKm: r, category });
  };

  const useMyLocation = () => {
    if (!navigator.geolocation) return setFormError('Tarayıcınız konum paylaşımını desteklemiyor.');
    setGeoBusy(true);
    navigator.geolocation.getCurrentPosition(
      (p) => {
        setCoords(`${p.coords.latitude.toFixed(5)}, ${p.coords.longitude.toFixed(5)}`);
        setGeoBusy(false);
        setFormError(null);
      },
      () => {
        setGeoBusy(false);
        setFormError('Konum alınamadı (izin verilmedi ya da zaman aşımı).');
      },
      { timeout: 10_000 }
    );
  };

  const data = run.data;
  return (
    <div className="space-y-4 pt-4">
      <SectionCard title="Müşteri konumu" description="Müşterinin bu noktada göreceği keşif sonuçlarını hesaplar.">
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
        >
          <div className="space-y-1.5">
            <Label id={`${id}-mode`}>Hangi ayarla?</Label>
            <ChoiceChips
              mode="single"
              aria-labelledby={`${id}-mode`}
              value={mode}
              onChange={(v) => setMode((v as 'draft' | 'live') ?? 'live')}
              options={[
                { value: 'draft', label: dirty ? 'Taslak (yayınlanmamış)' : 'Taslak' },
                { value: 'live', label: 'Yayındaki' },
              ]}
            />
          </div>
          <div className="grid gap-4 md:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,1fr)]">
            <div className="space-y-1.5">
              <Label htmlFor={`${id}-coords`}>Konum (enlem, boylam)</Label>
              <div className="flex flex-col gap-2 sm:flex-row">
                <Input id={`${id}-coords`} className="min-h-11" placeholder="41.0082, 28.9784" value={coords} onChange={(e) => setCoords(e.target.value)} />
                <Button type="button" variant="outline" className="min-h-11 shrink-0" onClick={useMyLocation} disabled={geoBusy} aria-busy={geoBusy}>
                  <LocateFixed className="h-4 w-4" aria-hidden />
                  Konumumu kullan
                </Button>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor={`${id}-radius`}><AdminKesifBagisText k="radiusKm" /></Label>
              <Input id={`${id}-radius`} className="min-h-11" inputMode="decimal" value={radius} onChange={(e) => setRadius(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor={`${id}-cat`}>Kategori</Label>
              <select id={`${id}-cat`} className="min-h-11 w-full rounded-md border border-border bg-surface px-3 text-sm" value={category} onChange={(e) => setCategory(e.target.value)}>
                <option value="all">{tx.all}</option>
                <option value="kahve">Kahve</option>
                <option value="tatlı">{tx.dessert}</option>
                <option value="yemek">Yemek</option>
              </select>
            </div>
          </div>
          {formError ? <InlineError>{formError}</InlineError> : null}
          {run.isError ? <InlineError variant="banner">{errorText(run.error)}</InlineError> : null}
          <Button type="submit" className="min-h-11" disabled={run.isPending} aria-busy={run.isPending}>
            <Play className="h-4 w-4" aria-hidden />
            {run.isPending ? 'Hesaplanıyor…' : 'Önizle'}
          </Button>
        </form>
      </SectionCard>

      {data ? <Results data={data} /> : <EmptyState variant="first-use" title="Henüz önizleme yok" description="Bir konum girip “Önizle”ye basın. Trend ve haftalık sinyaller en çok 2 dakika önbellekte tutulur." />}
    </div>
  );
}

function Results({ data }: { data: PreviewResult }) {
  return (
    <div className="space-y-4" aria-live="polite">
      <p className="text-sm text-fg-muted">
        {data.mode === 'draft' ? 'Taslak ayarla' : 'Yayındaki ayarla'} hesaplandı · {fmtDateTime(data.computedAt)}
      </p>
      <SectionCard title={`Yakındakiler (${fmtNumber(data.nearbyTotal)} işletme, ilk ${fmtNumber(data.nearby.length)} gösterilir)`} icon={<MapPin />} density="compact">
        {data.nearby.length === 0 ? (
          <p className="text-sm text-fg-muted"><AdminKesifBagisText k="noneInRadius" /></p>
        ) : (
          <ul className="divide-y divide-border">
            {data.nearby.map((n) => (
              <li key={n.dealerId} className="flex flex-col gap-1 py-2 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <p className="truncate font-medium text-fg">{n.businessName}</p>
                  <p className="truncate text-xs text-fg-muted">
                    {fmtDecimal(n.distanceKm)} km · {n.categories.join(', ') || 'kategori yok'} · konum: {n.locationSource === 'profile' ? 'profil' : 'yedek'}
                    {n.openSource ? ` · saat: ${n.openSource === 'profile' ? 'profil' : 'yedek'}` : ''}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  {n.avgRating > 0 ? <span className="text-sm tabular-nums text-fg-muted">★ {fmtDecimal(n.avgRating)}</span> : null}
                  <OpenBadge item={n} />
                </div>
              </li>
            ))}
          </ul>
        )}
      </SectionCard>
      <div className="grid gap-4 lg:grid-cols-2">
        <SectionCard title={`Sponsorlu (${fmtNumber(data.sponsored.length)})`} icon={<Megaphone />} density="compact">
          {data.sponsored.length === 0 ? (
            <p className="text-sm text-fg-muted"><AdminKesifBagisText k="noSponsored" /></p>
          ) : (
            <ul className="space-y-2">
              {data.sponsored.map((s) => (
                <li key={s.id} className="rounded-md border border-border p-2 text-sm">
                  <span className="font-medium text-fg">{s.title}</span>
                  {s.discountRate ? <span className="ml-2 text-success">%{fmtNumber(s.discountRate)} indirim</span> : null}
                  {s.description ? <p className="text-fg-muted">{s.description}</p> : null}
                </li>
              ))}
            </ul>
          )}
        </SectionCard>
        <SectionCard title="Haftanın enleri" icon={<Trophy />} density="compact">
          <ul className="space-y-1 text-sm">
            {data.weeklyBest.map((w) => (
              <li key={w.key}>
                <span className="font-medium text-fg">{w.label}:</span> {w.winner ? `${w.winner.businessName} (${fmtDecimal(w.winner.score)})` : <span className="text-fg-muted">bu hafta veri yok</span>}
              </li>
            ))}
          </ul>
        </SectionCard>
        <SectionCard title={`Canlı mutlu saatler (${fmtNumber(data.liveBoosts.length)})`} icon={<Zap />} density="compact">
          {data.liveBoosts.length === 0 ? (
            <p className="text-sm text-fg-muted"><AdminKesifBagisText k="noMultiplier" /></p>
          ) : (
            <ul className="space-y-1 text-sm">
              {data.liveBoosts.map((b, i) => (
                <li key={`${b.happyHourName}-${i}`}>
                  {b.happyHourName} · ×{fmtDecimal(b.multiplier)} · {b.businessName}
                </li>
              ))}
            </ul>
          )}
        </SectionCard>
        <SectionCard title="Trend mekânlar (30 gün)" icon={<Flame />} density="compact">
          {data.trendingVenues.length === 0 ? (
            <p className="text-sm text-fg-muted"><AdminKesifBagisText k="noFeedback30d" /></p>
          ) : (
            <ol className="list-decimal space-y-1 pl-5 text-sm">
              {data.trendingVenues.map((v) => (
                <li key={v.dealerId}>
                  {v.businessName} <span className="text-fg-muted">· {fmtNumber(v.feedbackCount)} geri bildirim · ★ {fmtDecimal(v.avgRating)}</span>
                </li>
              ))}
            </ol>
          )}
        </SectionCard>
      </div>
      <p className="flex items-center gap-2 text-xs text-fg-muted">
        <Clock className="h-3.5 w-3.5" aria-hidden />
        Açık/kapalı İstanbul saatiyle hesaplanır.
        <Store className="ml-2 h-3.5 w-3.5" aria-hidden />
        Konumu profilde olan işletmede yedek konum kullanılmaz.
      </p>
    </div>
  );
}
