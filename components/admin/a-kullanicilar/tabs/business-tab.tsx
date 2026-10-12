'use client';

import { useEffect, useId, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import { CreditCard, MapPin, Store } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { KeyValueList } from '@/components/ds/data';
import { SectionCard } from '@/components/ds/page';
import { ConfirmAction, InlineError } from '@/components/states';
import type { ProfilePatch, User360 } from '@/lib/admin-users/contract';
import { assignPlan, errorText, fetchPlans, patchProfile } from '../api';
import { fmtDate, fmtNumber } from '../format';
import { FormField, fieldError } from '../parts';
import { AdminKullanicilarText } from '../copy';
import { RemedyBudgetCard } from '@/components/remedy/remedy-budget-card';

const SUB_LABELS: Record<string, string> = {
  active: 'Etkin',
  trialing: 'Deneme',
  past_due: 'Ödeme gecikti',
  canceled: 'İptal',
  incomplete: 'Tamamlanmadı',
};

function parseCoord(s: string): number | null | 'invalid' {
  const t = s.trim().replace(',', '.');
  if (!t) return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : 'invalid';
}

export function BusinessTab({ user: u, onChanged }: { user: User360; onChanged: () => void }) {
  const d = u.dealer!;
  const locked = u.identity.status === 'anonymized';
  return (
    <div className="space-y-6">
      <ProfileForm user={u} locked={locked} onChanged={onChanged} />
      <SectionCard title="Plan ve abonelik" icon={<CreditCard />}>
        <KeyValueList
          items={[
            { label: 'Plan', value: d.plan?.name ?? 'Ücretsiz kademe' },
            { label: 'Abonelik', value: d.subscriptionStatus ? SUB_LABELS[d.subscriptionStatus] ?? d.subscriptionStatus : 'Yok' },
            { label: 'Dönem sonu', value: d.subscriptionCurrentPeriodEnd ? fmtDate(d.subscriptionCurrentPeriodEnd) : null },
            { label: 'Etkin QR kod', value: fmtNumber(d.activeQrCodes) },
            { label: 'Personel', value: fmtNumber(d.staffCount) },
          ]}
        />
        {!locked ? <PlanPicker userId={u.identity.id} currentPlanId={d.plan?.id ?? null} onChanged={onChanged} /> : null}
      </SectionCard>
      {!locked ? <RemedyBudgetCard mode="admin" dealerId={u.identity.id} /> : null}
    </div>
  );
}

function ProfileForm({ user: u, locked, onChanged }: { user: User360; locked: boolean; onChanged: () => void }) {
  const id = useId();
  const d = u.dealer!;
  const init = () => ({
    businessName: d.businessName ?? '',
    businessDesc: d.businessDesc ?? '',
    businessCategory: d.businessCategory ?? '',
    address: d.address ?? '',
    latitude: d.latitude != null ? String(d.latitude) : '',
    longitude: d.longitude != null ? String(d.longitude) : '',
    phone: u.identity.phone ?? '',
  });
  const [f, setF] = useState(init);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  // Sunucu verisi değişince (kayıt sonrası) form yeniden tohumlanır.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => setF(init()), [u.identity.updatedAt]);

  const lat = parseCoord(f.latitude);
  const lng = parseCoord(f.longitude);
  const coordErr = (v: number | null | 'invalid', max: number) =>
    v === 'invalid' || (typeof v === 'number' && Math.abs(v) > max) ? `−${max} ile ${max} arasında bir sayı girin` : undefined;
  const dirty = JSON.stringify(f) !== JSON.stringify(init());
  const valid = dirty && !coordErr(lat, 90) && !coordErr(lng, 180) && f.businessName.trim().length > 0;
  const set = (k: keyof ReturnType<typeof init>) => (e: { target: { value: string } }) => setF((p) => ({ ...p, [k]: e.target.value }));

  return (
    <SectionCard title="İşletme bilgileri" icon={<Store />} description="Değişiklikler denetime alan alan yazılır.">
      <form
        className="space-y-4"
        onSubmit={async (e) => {
          e.preventDefault();
          if (!valid || busy || locked) return;
          setBusy(true);
          setError(null);
          try {
            const body: ProfilePatch = {
              businessName: f.businessName.trim(),
              businessDesc: f.businessDesc.trim() || null,
              businessCategory: f.businessCategory.trim() || null,
              address: f.address.trim() || null,
              latitude: lat === 'invalid' ? null : lat,
              longitude: lng === 'invalid' ? null : lng,
              phone: f.phone.trim() || null,
            };
            const r = await patchProfile(u.identity.id, body);
            toast.success(r.changed.length ? 'İşletme bilgileri kaydedildi.' : 'Değişiklik yoktu.');
            onChanged();
          } catch (err) {
            setError(err);
          } finally {
            setBusy(false);
          }
        }}
      >
        <fieldset disabled={locked || busy} className="grid gap-4 sm:grid-cols-2">
          <FormField htmlFor={`${id}-name`} label="İşletme adı" error={fieldError(error, 'businessName')}>
            <Input id={`${id}-name`} value={f.businessName} maxLength={100} onChange={set('businessName')} />
          </FormField>
          <FormField htmlFor={`${id}-cat`} label="Kategori" hint="Ör. kafe, restoran">
            <Input id={`${id}-cat`} value={f.businessCategory} maxLength={50} onChange={set('businessCategory')} />
          </FormField>
          <div className="sm:col-span-2">
            <FormField htmlFor={`${id}-desc`} label="Açıklama">
              <Textarea id={`${id}-desc`} rows={2} value={f.businessDesc} maxLength={500} onChange={set('businessDesc')} />
            </FormField>
          </div>
          <div className="sm:col-span-2">
            <FormField htmlFor={`${id}-addr`} label="Adres">
              <Input id={`${id}-addr`} value={f.address} maxLength={200} onChange={set('address')} />
            </FormField>
          </div>
          <FormField htmlFor={`${id}-lat`} label="Enlem" error={coordErr(lat, 90) ?? fieldError(error, 'latitude')}>
            <Input id={`${id}-lat`} inputMode="decimal" value={f.latitude} onChange={set('latitude')} />
          </FormField>
          <FormField htmlFor={`${id}-lng`} label="Boylam" error={coordErr(lng, 180) ?? fieldError(error, 'longitude')}>
            <Input id={`${id}-lng`} inputMode="decimal" value={f.longitude} onChange={set('longitude')} />
          </FormField>
          <FormField htmlFor={`${id}-phone`} label="Telefon">
            <Input id={`${id}-phone`} type="tel" value={f.phone} maxLength={30} onChange={set('phone')} />
          </FormField>
        </fieldset>
        {typeof lat === 'number' && typeof lng === 'number' && !coordErr(lat, 90) && !coordErr(lng, 180) ? (
          <a
            href={`https://www.openstreetmap.org/?mlat=${lat}&mlon=${lng}#map=17/${lat}/${lng}`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex min-h-11 items-center gap-1.5 text-sm text-brand underline-offset-4 hover:underline"
          >
            <MapPin className="h-4 w-4" aria-hidden />
            Konumu haritada aç (yeni sekme)
          </a>
        ) : null}
        {error ? <InlineError>{errorText(error)}</InlineError> : null}
        {!locked ? (
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" className="min-h-11" disabled={!dirty || busy} onClick={() => setF(init())}>
              Geri al
            </Button>
            <Button type="submit" className="min-h-11" disabled={!valid || busy} aria-busy={busy}>
              {busy ? 'Kaydediliyor…' : 'Kaydet'}
            </Button>
          </div>
        ) : null}
      </form>
    </SectionCard>
  );
}

function PlanPicker({ userId, currentPlanId, onChanged }: { userId: string; currentPlanId: string | null; onChanged: () => void }) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const plans = useQuery({ queryKey: ['admin-users', 'plans'], queryFn: fetchPlans, enabled: open, staleTime: 5 * 60_000 });
  const [planId, setPlanId] = useState<string>(currentPlanId ?? 'none');
  const selected = plans.data?.find((p) => p.id === planId);
  if (!open) {
    return (
      <Button variant="outline" className="mt-4 min-h-11" onClick={() => setOpen(true)}>
        Planı değiştir
      </Button>
    );
  }
  return (
    <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-end">
      <div className="flex-1">
        <FormField htmlFor={`${id}-plan`} label="Fiyatlandırma planı" hint="Plan QR kotasını belirler. Stripe aboneliği bu işlemle değişmez.">
          <Select value={planId} onValueChange={setPlanId} disabled={plans.isLoading}>
            <SelectTrigger id={`${id}-plan`} className="min-h-11">
              <SelectValue placeholder={plans.isLoading ? 'Yükleniyor…' : 'Seçin'} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none"><AdminKullanicilarText k="noPlan" /></SelectItem>
              {(plans.data ?? []).map((p) => (
                <SelectItem key={p.id} value={p.id} disabled={!p.isActive}>
                  {p.name} · {fmtNumber(p.price)} {p.currency}
                  {!p.isActive ? ' (pasif)' : ''}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </FormField>
        {plans.isError ? <InlineError>{errorText(plans.error)}</InlineError> : null}
      </div>
      <ConfirmAction
        tone="brand"
        trigger={
          <Button className="min-h-11" disabled={planId === (currentPlanId ?? 'none')}>
            Uygula
          </Button>
        }
        title="Plan değiştirilsin mi?"
        description={planId === 'none' ? 'Bayi ücretsiz kademeye düşer; kotayı aşan QR kodları yeni QR oluşturmayı engeller.' : `Yeni plan: ${selected?.name ?? ''}.`}
        confirmLabel="Uygula"
        onConfirm={async () => {
          await assignPlan(userId, planId === 'none' ? null : planId);
          toast.success(planId === 'none' ? 'Plan kaldırıldı.' : `Plan atandı: ${selected?.name ?? ''}`);
          setOpen(false);
          onChanged();
        }}
      />
    </div>
  );
}
