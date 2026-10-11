'use client';

import { useId, useMemo, useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import {
  LINK_KEY_RE,
  QR_DESCRIPTION_MAX,
  QR_LINKS_MAX,
  QR_NAME_MAX,
  QR_WELCOME_MAX,
  istanbulDay,
  qrUpdateSchema,
  type QrLink,
  type QrUpdateBody,
} from '@/lib/dealer/qr-codes/rules';
import type { LocationDto, QrItemDto } from '@/lib/dealer/qr-codes/types';
import { QrApiError, updateQr } from './api';
import { useQrCopy } from './copy';

const inputCls = 'min-h-11';
const labelCls = 'qx-small font-medium text-fg';

interface Draft {
  name: string;
  description: string;
  locationId: string;
  expiresOn: string;
  isActive: boolean;
  links: QrLink[];
}

function draftFrom(item: QrItemDto, links: QrLink[]): Draft {
  return {
    name: item.name,
    description: item.description ?? '',
    locationId: item.location?.id ?? '',
    expiresOn: item.expiresAt ? istanbulDay(item.expiresAt) : '',
    isActive: item.isActive,
    links: links.map((l) => ({ ...l })),
  };
}

/** Yalnız değişen alanlar gönderilir. */
function diff(a: Draft, b: Draft): QrUpdateBody | null {
  const out: Record<string, unknown> = {};
  if (a.name.trim() !== b.name.trim()) out.name = b.name;
  if (a.description.trim() !== b.description.trim()) out.description = b.description.trim() || null;
  if (a.locationId !== b.locationId) out.locationId = b.locationId || null;
  if (a.expiresOn !== b.expiresOn) out.expiresOn = b.expiresOn || null;
  if (a.isActive !== b.isActive) out.isActive = b.isActive;
  if (JSON.stringify(a.links) !== JSON.stringify(b.links)) out.links = b.links;
  return Object.keys(out).length ? (out as QrUpdateBody) : null;
}

function fieldErrors(e: unknown): Record<string, string> {
  const out: Record<string, string> = {};
  if (e instanceof QrApiError && Array.isArray(e.details)) {
    for (const d of e.details as Array<{ path?: string; message?: string }>) {
      if (d.path && d.message && !out[d.path]) out[d.path] = d.message;
    }
  }
  return out;
}

export function SettingsPanel({
  item,
  links,
  locations,
  onSaved,
}: {
  item: QrItemDto;
  links: QrLink[];
  locations: LocationDto[];
  onSaved: () => void;
}) {
  const uid = useId();
  const copy = useQrCopy();
  const c = copy.settings;
  const initial = useMemo(() => draftFrom(item, links), [item, links]);
  const [draft, setDraft] = useState<Draft>(initial);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const patch = diff(initial, draft);
  const readOnly = item.status === 'archived';
  const canToggle = item.status !== 'revoked' && item.status !== 'archived';
  const today = useMemo(() => istanbulDay(new Date()), []);

  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setDraft((d) => ({ ...d, [k]: v }));
  const setLink = (i: number, l: Partial<QrLink>) =>
    setDraft((d) => ({ ...d, links: d.links.map((x, j) => (j === i ? { ...x, ...l } : x)) }));

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!patch || saving) return;
    const parsed = qrUpdateSchema.safeParse(patch);
    if (!parsed.success) {
      const errs: Record<string, string> = {};
      for (const iss of parsed.error.issues) {
        const k = iss.path.join('.') || 'form';
        if (!errs[k]) errs[k] = iss.message;
      }
      setErrors(errs);
      setFormError(c.fixFields);
      return;
    }
    setSaving(true);
    setErrors({});
    setFormError(null);
    try {
      await updateQr(item.id, parsed.data);
      toast.success(c.saved);
      onSaved();
    } catch (err) {
      setErrors(fieldErrors(err));
      setFormError(err instanceof Error ? err.message : c.saveFailed);
    } finally {
      setSaving(false);
    }
  };

  const err = (k: string) =>
    errors[k] ? (
      <p id={`${uid}-${k}-err`} className="qx-caption text-danger">
        {errors[k]}
      </p>
    ) : null;
  const described = (k: string) => (errors[k] ? `${uid}-${k}-err` : undefined);

  if (readOnly) {
    return <p className="qx-small rounded-md border border-border bg-surface-muted p-3 text-fg-muted">{c.archivedReadOnly}</p>;
  }

  return (
    <form onSubmit={save} className="space-y-5" noValidate>
      {canToggle && (
        <label className="flex min-h-11 items-center justify-between gap-3 rounded-lg border border-border p-3">
          <span>
            <span className={cn(labelCls, 'block')}>{c.live}</span>
            <span className="qx-caption text-fg-muted">{c.liveHint}</span>
          </span>
          <Switch checked={draft.isActive} onCheckedChange={(v) => set('isActive', v)} aria-label={c.live} />
        </label>
      )}
      <div className="space-y-1">
        <label htmlFor={`${uid}-name`} className={labelCls}>
          {c.name} <span aria-hidden className="text-danger">*</span>
        </label>
        <Input
          id={`${uid}-name`}
          value={draft.name}
          maxLength={QR_NAME_MAX}
          required
          aria-invalid={!!errors.name}
          aria-describedby={described('name')}
          onChange={(e) => set('name', e.target.value)}
          className={inputCls}
        />
        {err('name')}
      </div>
      <div className="space-y-1">
        <label htmlFor={`${uid}-desc`} className={labelCls}>
          {c.note}
        </label>
        <Textarea
          id={`${uid}-desc`}
          value={draft.description}
          maxLength={QR_DESCRIPTION_MAX}
          rows={2}
          aria-invalid={!!errors.description}
          aria-describedby={described('description')}
          onChange={(e) => set('description', e.target.value)}
        />
        <p className="qx-caption text-fg-muted">
          {draft.description.length}/{QR_DESCRIPTION_MAX}
        </p>
        {err('description')}
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1">
          <label htmlFor={`${uid}-loc`} className={labelCls}>
            {c.location}
          </label>
          <select
            id={`${uid}-loc`}
            value={draft.locationId}
            aria-invalid={!!errors.locationId}
            aria-describedby={described('locationId')}
            onChange={(e) => set('locationId', e.target.value)}
            className="qx-small min-h-11 w-full rounded-md border border-border bg-surface-1 px-3 text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
          >
            <option value="">{copy.common.noLocation}</option>
            {locations
              .filter((l) => l.isActive || l.id === initial.locationId)
              .map((l) => (
                <option key={l.id} value={l.id} disabled={!l.isActive}>
                  {l.name}
                  {!l.isActive ? copy.common.archivedSuffix : ''}
                </option>
              ))}
          </select>
          {err('locationId')}
        </div>
        <div className="space-y-1">
          <label htmlFor={`${uid}-exp`} className={labelCls}>
            {c.expiry}
          </label>
          <div className="flex gap-2">
            <Input
              id={`${uid}-exp`}
              type="date"
              min={today}
              value={draft.expiresOn}
              aria-invalid={!!errors.expiresOn}
              aria-describedby={described('expiresOn')}
              onChange={(e) => set('expiresOn', e.target.value)}
              className={inputCls}
            />
            {draft.expiresOn && (
              <Button type="button" variant="ghost" className="min-h-11" onClick={() => set('expiresOn', '')}>
                {c.remove}
              </Button>
            )}
          </div>
          <p className="qx-caption text-fg-muted">{c.expiryHint}</p>
          {err('expiresOn')}
        </div>
      </div>

      <fieldset className="space-y-3 rounded-lg border border-border p-3">
        <legend className={cn(labelCls, 'px-1')}>{c.links}</legend>
        <p className="qx-caption text-fg-muted">
          {c.linksHint}
        </p>
        {draft.links.map((l, i) => {
          const keyErr = l.key && !LINK_KEY_RE.test(l.key) ? c.keyError : null;
          return (
            <div key={i} className="space-y-2 rounded-md bg-surface-muted p-3">
              <div className="flex items-end gap-2">
                <div className="min-w-0 flex-1 space-y-1">
                  <label htmlFor={`${uid}-lk-${i}`} className="qx-caption text-fg-muted">
                    {c.key}
                  </label>
                  <Input
                    id={`${uid}-lk-${i}`}
                    value={l.key}
                    maxLength={32}
                    aria-invalid={!!keyErr}
                    onChange={(e) => setLink(i, { key: e.target.value.toLowerCase().replace(/\s+/g, '-') })}
                    className={cn(inputCls, 'font-mono')}
                    placeholder={c.keyPlaceholder}
                  />
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  className="min-h-11 min-w-11"
                  aria-label={c.removeLink(l.key)}
                  onClick={() => setDraft((d) => ({ ...d, links: d.links.filter((_, j) => j !== i) }))}
                >
                  <Trash2 className="h-4 w-4" aria-hidden />
                </Button>
              </div>
              {keyErr && <p className="qx-caption text-danger">{keyErr}</p>}
              <div className="space-y-1">
                <label htmlFor={`${uid}-lt-${i}`} className="qx-caption text-fg-muted">
                  {c.welcomeText}
                </label>
                <Textarea
                  id={`${uid}-lt-${i}`}
                  value={l.welcomeText}
                  maxLength={QR_WELCOME_MAX}
                  rows={2}
                  onChange={(e) => setLink(i, { welcomeText: e.target.value })}
                  placeholder={c.welcomePlaceholder}
                />
              </div>
            </div>
          );
        })}
        {err('links')}
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="min-h-11"
          disabled={draft.links.length >= QR_LINKS_MAX}
          onClick={() => setDraft((d) => ({ ...d, links: [...d.links, { key: '', welcomeText: '' }] }))}
        >
          <Plus className="mr-2 h-4 w-4" aria-hidden /> {c.addLink(draft.links.length, QR_LINKS_MAX)}
        </Button>
      </fieldset>

      {formError && (
        <p role="alert" className="qx-small rounded-md border border-danger-border bg-danger-subtle px-3 py-2 text-fg">
          {formError}
        </p>
      )}
      <div className="sticky bottom-0 flex justify-end gap-2 border-t border-border bg-surface-1 py-3">
        <Button type="button" variant="ghost" className="min-h-11" disabled={!patch || saving} onClick={() => { setDraft(initial); setErrors({}); setFormError(null); }}>
          {copy.common.cancel}
        </Button>
        <Button type="submit" className="min-h-11" disabled={!patch || saving} aria-busy={saving}>
          {saving ? copy.common.saving : copy.common.save}
        </Button>
      </div>
    </form>
  );
}
