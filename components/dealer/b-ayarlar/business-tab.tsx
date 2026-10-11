'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useFormContext, useWatch } from 'react-hook-form';
import { ExternalLink, ImagePlus, LocateFixed, MapPin, Search, Store, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { SectionCard } from '@/components/ds/page';
import { StatusBadge } from '@/components/ds/data';
import { DirtyBar, Form, FormRootError, NumberField, SwitchField, TextField, TextareaField, useZodForm } from '@/components/ds/form';
import { InlineError } from '@/components/states';
import { ConfirmAction } from '@/components/states';
import { computeOpenState, parseBusinessHours } from '@/lib/places/business-hours';
import { businessFormSchema, type BusinessFormValues, type BusinessSettings, type DealerSettingsSnapshot } from '@/lib/dealer-settings/contract';
import { sameWeek, validateWeek, weekToStored } from '@/lib/dealer-settings/hours';
import { SETTINGS_KEY, SettingsApiError, errorText, fetchSettings, patchBusiness, removeLogo, reverseGeocode, uploadLogo } from './api';
import { HoursEditor } from './hours-editor';
import { useSettingsCopy } from './copy';

function toForm(b: BusinessSettings): BusinessFormValues {
  return {
    businessName: b.businessName,
    businessDesc: b.businessDesc,
    address: b.address,
    latitude: b.latitude,
    longitude: b.longitude,
    hours: b.hours,
    holidayMode: b.holidayMode,
    defaultReplyTemplate: b.defaultReplyTemplate,
  };
}

/** Yalnız değişen alanlar (B1: boş/varsayılan değerler asla toptan yazılmaz). */
function diff(base: BusinessFormValues, next: BusinessFormValues): Partial<BusinessFormValues> {
  const out: Partial<BusinessFormValues> = {};
  (Object.keys(next) as Array<keyof BusinessFormValues>).forEach((k) => {
    if (k === 'hours') {
      if (!sameWeek(base.hours, next.hours)) out.hours = next.hours;
      return;
    }
    const a = base[k] ?? null;
    const b = next[k] ?? null;
    if (JSON.stringify(a) !== JSON.stringify(b)) (out as Record<string, unknown>)[k] = next[k];
  });
  // Konum çift olarak gider.
  if ('latitude' in out || 'longitude' in out) {
    out.latitude = next.latitude;
    out.longitude = next.longitude;
  }
  return out;
}

export function BusinessTab({ data }: { data: BusinessSettings }) {
  const queryClient = useQueryClient();
  const c = useSettingsCopy().business;
  const form = useZodForm(businessFormSchema, { defaultValues: toForm(data) });
  const baseRef = useRef<BusinessFormValues>(toForm(data));
  const versionRef = useRef(data.version);

  // Sunucu sürümü değiştiyse (başka sekme/yeniden yükleme) ve kullanıcı düzenlemiyorsa formu tazele.
  // Düzenleme sürerken ASLA ezmez (B2); kaydetmede 409 çakışma bandı çıkar.
  useEffect(() => {
    if (data.version === versionRef.current) return;
    versionRef.current = data.version;
    if (!form.formState.isDirty) {
      baseRef.current = toForm(data);
      form.reset(baseRef.current);
    }
  }, [data, form]);

  const reloadLatest = async () => {
    const fresh = await queryClient.fetchQuery({ queryKey: SETTINGS_KEY, queryFn: () => fetchSettings(), staleTime: 0 });
    versionRef.current = fresh.business.version;
    baseRef.current = toForm(fresh.business);
    form.reset(baseRef.current);
  };

  const onSubmit = async (values: BusinessFormValues) => {
    const issues = validateWeek(values.hours);
    if (issues.length > 0) {
      throw new SettingsApiError(400, c.hoursError(issues[0].message), 'VALIDATION', undefined, false);
    }
    const changes = diff(baseRef.current, values);
    if (Object.keys(changes).length === 0) return values;
    const res = await patchBusiness({ ...changes, baseVersion: versionRef.current } as Parameters<typeof patchBusiness>[0]);
    versionRef.current = res.version;
    baseRef.current = values;
    queryClient.setQueryData<DealerSettingsSnapshot>(SETTINGS_KEY, (old) =>
      old
        ? {
            ...old,
            business: {
              ...old.business,
              ...values,
              businessDesc: values.businessDesc ?? null,
              address: values.address ?? null,
              defaultReplyTemplate: values.defaultReplyTemplate ?? null,
              hoursLegacy: changes.hours ? null : old.business.hoursLegacy,
              version: res.version,
            } as BusinessSettings,
          }
        : old
    );
    toast.success(c.saved);
    return values;
  };

  return (
    <Form form={form} onSubmit={onSubmit} resetOnSuccess={(_r, submitted) => submitted} className="pb-24">
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="min-w-0 space-y-6">
          <FormRootError />
          <SectionCard title={c.identity} description={c.identityHint}>
            <div className="space-y-4">
              <TextField control={form.control} name="businessName" label={c.name} required maxLength={100} autoComplete="organization" />
              <TextareaField
                control={form.control}
                name="businessDesc"
                label={c.desc}
                description={c.descHint}
                rows={3}
                maxLength={500}
                optional
                emptyAsNull
              />
            </div>
          </SectionCard>

          <LocationCard />

          <SectionCard title={c.hoursTitle}>
            <div className="space-y-5">
              <SwitchField
                control={form.control}
                name="holidayMode"
                variant="card"
                label={c.holiday}
                description={c.holidayHint}
              />
              <HoursEditor control={form.control} />
              {data.hoursLegacy && (
                <InlineError variant="banner" tone={data.hoursLegacy.parsed ? 'info' : 'warning'}>
                  <p className="font-medium text-fg">{c.legacyTitle}</p>
                  <p className="mt-1 break-words text-fg-muted">“{data.hoursLegacy.raw}”</p>
                  <p className="mt-1 text-fg-muted">
                    {data.hoursLegacy.parsed
                      ? c.legacyParsed
                      : c.legacyUnparsed}
                  </p>
                </InlineError>
              )}
            </div>
          </SectionCard>

          <SectionCard title={c.template} description={c.templateHint}>
            <TextareaField
              control={form.control}
              name="defaultReplyTemplate"
              label={c.templateLabel}
              hideLabel
              rows={4}
              maxLength={2000}
              placeholder={c.templatePlaceholder}
              optional
              emptyAsNull
            />
          </SectionCard>
        </div>

        <aside className="min-w-0 space-y-6 lg:sticky lg:top-20 lg:self-start" aria-label={c.asideAria}>
          <CustomerPreview logo={data.logo} />
          <LogoCard logo={data.logo} enabled={data.logoUploadEnabled} name={data.businessName} />
        </aside>
      </div>
      <DirtyBar onReloadLatest={reloadLatest} bottomOffset="var(--qx-tabbar-h, 0px)" message={c.dirty} />
    </Form>
  );
}

// ───────────────────────────── Konum ─────────────────────────────

type Candidate = { lat: number; lng: number; address: string | null; source: 'gps' | 'coords' };

function LocationCard() {
  const { control, setValue, getValues } = useFormContext<BusinessFormValues>();
  const copy = useSettingsCopy();
  const c = copy.business;
  const [busy, setBusy] = useState<'gps' | 'coords' | null>(null);
  const [candidate, setCandidate] = useState<Candidate | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const lat = useWatch({ control, name: 'latitude' });
  const lng = useWatch({ control, name: 'longitude' });

  const lookup = async (la: number, lo: number, source: Candidate['source']) => {
    let address: string | null = null;
    try {
      address = (await reverseGeocode(la, lo, 'tr')).compactAddress || null;
    } catch (e) {
      setProblem(c.addressNotFound(errorText(e)));
    }
    setCandidate({ lat: Number(la.toFixed(6)), lng: Number(lo.toFixed(6)), address, source });
  };

  const useGps = () => {
    setProblem(null);
    if (!('geolocation' in navigator)) {
      setProblem(c.noGeo);
      return;
    }
    setBusy('gps');
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        await lookup(pos.coords.latitude, pos.coords.longitude, 'gps');
        setBusy(null);
      },
      (err) => {
        setBusy(null);
        setProblem(
          err.code === err.PERMISSION_DENIED
            ? c.geoDenied
            : c.geoFailed
        );
      },
      { enableHighAccuracy: true, timeout: 15_000, maximumAge: 60_000 }
    );
  };

  const fromCoords = async () => {
    setProblem(null);
    const la = getValues('latitude');
    const lo = getValues('longitude');
    if (la == null || lo == null) {
      setProblem(c.needCoords);
      return;
    }
    setBusy('coords');
    await lookup(la, lo, 'coords');
    setBusy(null);
  };

  const accept = (withAddress: boolean) => {
    if (!candidate) return;
    setValue('latitude', candidate.lat, { shouldDirty: true, shouldValidate: true });
    setValue('longitude', candidate.lng, { shouldDirty: true, shouldValidate: true });
    if (withAddress && candidate.address) setValue('address', candidate.address, { shouldDirty: true, shouldValidate: true });
    setCandidate(null);
  };

  const mapHref = lat != null && lng != null ? `https://www.openstreetmap.org/?mlat=${lat}&mlon=${lng}#map=17/${lat}/${lng}` : null;

  return (
    <SectionCard
      title={c.location}
      description={c.locationHint}
      actions={
        mapHref ? (
          <Button asChild variant="ghost" size="sm">
            <a href={mapHref} target="_blank" rel="noopener noreferrer">
              <ExternalLink className="h-4 w-4" aria-hidden />
              {c.viewMap}
            </a>
          </Button>
        ) : null
      }
    >
      <div className="space-y-4">
        <TextField control={control} name="address" label={c.address} maxLength={200} autoComplete="street-address" optional emptyAsNull />
        <div className="grid gap-4 sm:grid-cols-2">
          <NumberField control={control} name="latitude" label={c.lat} mode="decimal" precision={6} min={-90} max={90} optional />
          <NumberField control={control} name="longitude" label={c.lng} mode="decimal" precision={6} min={-180} max={180} optional />
        </div>
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" onClick={useGps} disabled={busy !== null}>
            <LocateFixed className="h-4 w-4" aria-hidden />
            {busy === 'gps' ? c.locating : c.useGps}
          </Button>
          <Button type="button" variant="ghost" onClick={() => void fromCoords()} disabled={busy !== null}>
            <Search className="h-4 w-4" aria-hidden />
            {busy === 'coords' ? c.searching : c.fromCoords}
          </Button>
        </div>
        <div aria-live="polite">
          {problem && <InlineError variant="banner" tone="warning">{problem}</InlineError>}
          {candidate && (
            <div className="rounded-card border border-brand-border bg-brand-subtle/40 p-4">
              <p className="qx-small font-semibold text-fg">
                <MapPin className="mr-1 inline h-4 w-4 align-[-2px]" aria-hidden />
                {candidate.source === 'gps' ? c.foundGps : c.foundCoords}
              </p>
              <p className="qx-small mt-1 text-fg">{candidate.address ?? c.noAddress}</p>
              <p className="qx-caption qx-num mt-0.5 text-fg-muted">
                {candidate.lat}, {candidate.lng}
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                {candidate.address && (
                  <Button type="button" size="sm" onClick={() => accept(true)}>
                    {c.useBoth}
                  </Button>
                )}
                <Button type="button" size="sm" variant={candidate.address ? 'outline' : 'default'} onClick={() => accept(false)}>
                  {c.useCoords}
                </Button>
                <Button type="button" size="sm" variant="ghost" onClick={() => setCandidate(null)}>
                  {copy.common.cancel}
                </Button>
              </div>
              <p className="qx-caption mt-2 text-fg-muted">{c.formNote}</p>
            </div>
          )}
        </div>
      </div>
    </SectionCard>
  );
}

// ───────────────────────────── Önizleme ─────────────────────────────

function CustomerPreview({ logo }: { logo: string | null }) {
  const { control } = useFormContext<BusinessFormValues>();
  const c = useSettingsCopy().business;
  const [name, desc, address, hours, holiday] = useWatch({ control, name: ['businessName', 'businessDesc', 'address', 'hours', 'holidayMode'] });
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    setNow(new Date());
    const t = window.setInterval(() => setNow(new Date()), 60_000);
    return () => window.clearInterval(t);
  }, []);

  const state = useMemo(() => {
    if (!now) return null;
    return computeOpenState(parseBusinessHours(weekToStored(hours)), !!holiday, now);
  }, [hours, holiday, now]);

  const initial = (name || '?').trim().charAt(0).toLocaleUpperCase('tr-TR');

  return (
    <SectionCard title={c.previewTitle} description={c.previewHint}>
      <div className="rounded-card border border-subtle bg-surface-0 p-3">
        <div className="flex items-start gap-3">
          {logo ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={logo} alt="" className="h-12 w-12 shrink-0 rounded-control object-cover" />
          ) : (
            <span aria-hidden className="inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-control bg-brand-subtle text-lg font-semibold text-brand">
              {initial}
            </span>
          )}
          <div className="min-w-0 flex-1">
            <p className="qx-body truncate font-semibold text-fg">{name || c.yourName}</p>
            <div className="mt-1 min-h-6">
              {state?.status === 'holiday' && <StatusBadge label={c.onHoliday} tone="warning" size="sm" />}
              {state?.status === 'open' && (
                <StatusBadge label={state.closesAt ? c.openUntil(state.closesAt) : c.allDay} tone={state.closingSoon ? 'warning' : 'success'} size="sm" />
              )}
              {state?.status === 'closed' && (
                <StatusBadge
                  label={
                    state.nextOpen
                      ? c.closedOpens(
                          state.nextOpen.inDays === 0 ? c.today : state.nextOpen.inDays === 1 ? c.tomorrow : (c.weekdayShortByJs[state.nextOpen.weekday] ?? ''),
                          state.nextOpen.time
                        )
                      : c.closed
                  }
                  tone="neutral"
                  size="sm"
                />
              )}
              {now && !state && <span className="qx-caption text-fg-muted">{c.noHours}</span>}
            </div>
          </div>
        </div>
        {desc && <p className="qx-small mt-2 line-clamp-2 text-fg-muted">{desc}</p>}
        <p className="qx-caption mt-2 flex items-center gap-1 text-fg-muted">
          <MapPin className="h-3.5 w-3.5 shrink-0" aria-hidden />
          <span className="truncate">{address || c.noAddressYet}</span>
        </p>
      </div>
    </SectionCard>
  );
}

// ───────────────────────────── Logo ─────────────────────────────

function LogoCard({ logo, enabled, name }: { logo: string | null; enabled: boolean; name: string }) {
  const queryClient = useQueryClient();
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const c = useSettingsCopy().business;

  const setLogo = (next: string | null) =>
    queryClient.setQueryData<DealerSettingsSnapshot>(SETTINGS_KEY, (old) => (old ? { ...old, business: { ...old.business, logo: next } } : old));

  const onPick = async (file: File | undefined) => {
    if (!file) return;
    if (file.size > 4 * 1024 * 1024) {
      toast.error(c.tooBig);
      return;
    }
    setBusy(true);
    try {
      const res = await uploadLogo(file);
      setLogo(res.logo);
      toast.success(c.logoUpdated);
    } catch (e) {
      toast.error(errorText(e, c.logoFailed));
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  return (
    <SectionCard title={c.logo} description={c.logoHint}>
      <div className="flex items-center gap-4">
        {logo ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={logo} alt={c.logoAlt(name)} className="h-16 w-16 rounded-card border border-subtle object-cover" />
        ) : (
          <span className="inline-flex h-16 w-16 items-center justify-center rounded-card border border-dashed border-strong text-fg-muted">
            <Store className="h-6 w-6" aria-hidden />
            <span className="sr-only">{c.noLogo}</span>
          </span>
        )}
        <div className="flex flex-wrap gap-2">
          <input
            ref={inputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp,image/heic,image/heif"
            className="sr-only"
            id="dealer-logo-input"
            // Görünmez dosya girdisi: odak/ekran okuyucu yalnız aşağıdaki düğmeye gider (çift Tab durağı yok).
            tabIndex={-1}
            aria-hidden
            onChange={(e) => void onPick(e.target.files?.[0])}
            disabled={!enabled || busy}
          />
          <Button type="button" variant="outline" size="sm" disabled={!enabled || busy} onClick={() => inputRef.current?.click()}>
            <ImagePlus className="h-4 w-4" aria-hidden />
            {busy ? c.uploading : logo ? c.change : c.upload}
          </Button>
          {logo && (
            <ConfirmAction
              trigger={
                <Button type="button" variant="ghost" size="sm" disabled={busy}>
                  <Trash2 className="h-4 w-4" aria-hidden />
                  {c.remove}
                </Button>
              }
              title={c.removeTitle}
              description={c.removeBody}
              tone="warning"
              confirmLabel={c.remove}
              irreversibleNote={false}
              onConfirm={async () => {
                try {
                  await removeLogo();
                  setLogo(null);
                  toast.success(c.removed);
                } catch (e) {
                  toast.error(errorText(e, c.removeFailed));
                  throw e;
                }
              }}
            />
          )}
        </div>
      </div>
      {!enabled && <p className="qx-caption mt-3 text-fg-muted">{c.storageOff}</p>}
    </SectionCard>
  );
}
