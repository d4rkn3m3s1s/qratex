'use client';

import { useId, useState } from 'react';
import Link from 'next/link';
import { Archive, ArchiveRestore, MapPin, Pencil, Plus } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ConfirmAction, EmptyState, TONE_CHIP } from '@/components/states';
import { cn } from '@/lib/utils';
import { LOCATION_ADDRESS_MAX, LOCATION_NAME_MAX } from '@/lib/dealer/qr-codes/rules';
import type { LocationDto, LocationsDto } from '@/lib/dealer/qr-codes/types';
import { createLocation, updateLocation } from './api';
import { errorText, fmtInt } from './format';

function LocationForm({
  initial,
  submitLabel,
  onSubmit,
  onCancel,
}: {
  initial: { name: string; address: string };
  submitLabel: string;
  onSubmit: (v: { name: string; address: string | null }) => Promise<void>;
  onCancel?: () => void;
}) {
  const uid = useId();
  const [name, setName] = useState(initial.name);
  const [address, setAddress] = useState(initial.address);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  return (
    <form
      noValidate
      className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)_auto] sm:items-end"
      onSubmit={async (e) => {
        e.preventDefault();
        if (saving) return;
        if (name.trim().length < 2) {
          setError('Şube adı en az 2 karakter olmalı');
          return;
        }
        setSaving(true);
        setError(null);
        try {
          await onSubmit({ name: name.trim(), address: address.trim() || null });
        } catch (err) {
          setError(errorText(err));
        } finally {
          setSaving(false);
        }
      }}
    >
      <div className="space-y-1">
        <label htmlFor={`${uid}-n`} className="qx-small font-medium text-fg">
          Şube adı
        </label>
        <Input id={`${uid}-n`} value={name} maxLength={LOCATION_NAME_MAX} onChange={(e) => setName(e.target.value)} placeholder="Kadıköy" className="min-h-11" aria-invalid={!!error} aria-describedby={error ? `${uid}-e` : undefined} />
      </div>
      <div className="space-y-1">
        <label htmlFor={`${uid}-a`} className="qx-small font-medium text-fg">
          Adres (isteğe bağlı)
        </label>
        <Input id={`${uid}-a`} value={address} maxLength={LOCATION_ADDRESS_MAX} onChange={(e) => setAddress(e.target.value)} className="min-h-11" />
      </div>
      <div className="flex gap-2">
        {onCancel && (
          <Button type="button" variant="ghost" className="min-h-11" onClick={onCancel}>
            Vazgeç
          </Button>
        )}
        <Button type="submit" className="min-h-11" disabled={saving} aria-busy={saving}>
          {saving ? 'Kaydediliyor…' : submitLabel}
        </Button>
      </div>
      {error && (
        <p id={`${uid}-e`} role="alert" className="qx-caption text-danger sm:col-span-3">
          {error}
        </p>
      )}
    </form>
  );
}

function LocationRow({ loc, onChanged, onShowCodes }: { loc: LocationDto; onChanged: () => void; onShowCodes: (id: string) => void }) {
  const [editing, setEditing] = useState(false);
  if (editing) {
    return (
      <li className="rounded-lg border border-brand p-3">
        <LocationForm
          initial={{ name: loc.name, address: loc.address ?? '' }}
          submitLabel="Kaydet"
          onCancel={() => setEditing(false)}
          onSubmit={async (v) => {
            await updateLocation(loc.id, v);
            toast.success('Şube güncellendi');
            setEditing(false);
            onChanged();
          }}
        />
      </li>
    );
  }
  return (
    <li className={cn('flex flex-wrap items-center gap-3 rounded-lg border border-border p-3', !loc.isActive && 'bg-surface-muted')}>
      <MapPin className="h-5 w-5 shrink-0 text-fg-muted" aria-hidden />
      <div className="min-w-0 flex-1">
        <p className="qx-body flex flex-wrap items-center gap-2 font-medium text-fg">
          <span className="truncate">{loc.name}</span>
          {!loc.isActive && <span className={cn('qx-caption rounded-full px-2 py-0.5', TONE_CHIP.neutral)}>Arşivde</span>}
        </p>
        {loc.address && <p className="qx-caption truncate text-fg-muted">{loc.address}</p>}
        <p className="qx-caption text-fg-muted">
          {fmtInt(loc.liveQrCount)} etkin kod · {fmtInt(loc.feedbacks30)} yorum (30 gün)
        </p>
      </div>
      <div className="flex flex-wrap gap-1">
        <Button type="button" variant="ghost" size="sm" className="min-h-11" onClick={() => onShowCodes(loc.id)}>
          Kodları göster
        </Button>
        <Button type="button" variant="ghost" size="sm" className="min-h-11 min-w-11" aria-label={`${loc.name} düzenle`} onClick={() => setEditing(true)}>
          <Pencil className="h-4 w-4" aria-hidden />
        </Button>
        <ConfirmAction
          trigger={
            <Button type="button" variant="ghost" size="sm" className="min-h-11 min-w-11" aria-label={loc.isActive ? `${loc.name} arşivle` : `${loc.name} geri al`}>
              {loc.isActive ? <Archive className="h-4 w-4" aria-hidden /> : <ArchiveRestore className="h-4 w-4" aria-hidden />}
            </Button>
          }
          tone={loc.isActive ? 'warning' : 'brand'}
          title={loc.isActive ? `“${loc.name}” arşivlensin mi?` : `“${loc.name}” geri alınsın mı?`}
          description={
            loc.isActive
              ? 'Şube yeni kodlara atanamaz; bağlı kodlar çalışmaya ve şube bilgisini taşımaya devam eder. Hiçbir veri silinmez.'
              : 'Şube yeniden seçilebilir olur ve şube kotanızdan bir hak kullanır.'
          }
          impact={[{ label: 'Bağlı etkin kod', value: fmtInt(loc.liveQrCount) }]}
          irreversibleNote={false}
          confirmLabel={loc.isActive ? 'Arşivle' : 'Geri al'}
          onConfirm={async () => {
            try {
              await updateLocation(loc.id, { action: loc.isActive ? 'archive' : 'restore' });
              toast.success(loc.isActive ? 'Şube arşivlendi' : 'Şube geri alındı');
              onChanged();
            } catch (e) {
              toast.error(errorText(e));
              throw e;
            }
          }}
        />
      </div>
    </li>
  );
}

export function LocationsPanel({ data, onChanged, onShowCodes }: { data: LocationsDto; onChanged: () => void; onShowCodes: (id: string) => void }) {
  const [adding, setAdding] = useState(false);
  const { quota } = data;
  const full = quota.limit != null && quota.used >= quota.limit;
  return (
    <section aria-labelledby="qr-locations-title" className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 id="qr-locations-title" className="qx-h3 text-fg">
            Şubeler
          </h2>
          <p className="qx-small text-fg-muted">
            {quota.limit == null
              ? `${fmtInt(quota.used)} etkin şube`
              : `${fmtInt(quota.used)}/${fmtInt(quota.limit)} etkin şube · ${quota.planName} planı`}
          </p>
        </div>
        {!adding && (
          <Button type="button" className="min-h-11" disabled={full} onClick={() => setAdding(true)}>
            <Plus className="mr-2 h-4 w-4" aria-hidden /> Şube ekle
          </Button>
        )}
      </div>
      {full && !adding && (
        <p className="qx-small rounded-md border border-warning-border bg-warning-subtle px-3 py-2 text-fg">
          Şube hakkınız doldu. Bir şubeyi arşivleyin ya da{' '}
          <Link href="/dealer/billing" className="font-medium text-brand underline underline-offset-2">
            planınızı yükseltin
          </Link>
          .
        </p>
      )}
      {adding && (
        <div className="rounded-lg border border-brand p-3">
          <LocationForm
            initial={{ name: '', address: '' }}
            submitLabel="Ekle"
            onCancel={() => setAdding(false)}
            onSubmit={async (v) => {
              await createLocation(v);
              toast.success('Şube eklendi');
              setAdding(false);
              onChanged();
            }}
          />
        </div>
      )}
      {data.items.length === 0 ? (
        <EmptyState
          variant="first-use"
          icon={MapPin}
          title="Henüz şube yok"
          description="Birden çok şubeniz varsa kodları şubeye bağlayın; yorumlar ve taramalar şube bazında ayrışır."
        />
      ) : (
        <ul className="space-y-2">
          {data.items.map((l) => (
            <LocationRow key={l.id} loc={l} onChanged={onChanged} onShowCodes={onShowCodes} />
          ))}
        </ul>
      )}
    </section>
  );
}
