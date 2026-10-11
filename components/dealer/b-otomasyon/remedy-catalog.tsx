'use client';

import { useEffect, useId, useMemo, useState } from 'react';
import Link from 'next/link';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, ArrowDown, ArrowUp, Gift, MapPin, Percent, Plus, Star, Trash2, X } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { ChoiceChips, IconButton } from '@/components/ds/a11y';
import { Field } from '@/components/ds/form';
import { ConfirmAction } from '@/components/states';
import { cn } from '@/lib/utils';
import { REMEDY_TYPES, REMEDY_TYPE_META, parseValueInput, type RemedyType } from '@/lib/dealer-automation/remedy-catalog';
import { AUTOMATION_KEYS, type RemedyCatalogDto, type RemedyScopeDto, type RemedyTemplateDto } from '@/lib/dealer-automation/types';
import { createRemedyTemplate, deleteRemedyTemplate, errorText, updateRemedyTemplate } from './api';
import { useAutomationCopy, type AutomationCopy } from './copy';

const TYPE_ICON: Record<RemedyType, typeof Percent> = { discount: Percent, points: Star, free_item: Gift };

function fmtValue(copy: AutomationCopy, type: string, v: number): string {
  return type in REMEDY_TYPE_META ? copy.remedyType[type as RemedyType].format(v) : String(v);
}

export function RemedyCatalog({ catalog }: { catalog: RemedyCatalogDto }) {
  const [scopeId, setScopeId] = useState<string>('all');
  const c = useAutomationCopy().catalog;
  const scope = catalog.scopes.find((s) => (s.locationId ?? 'all') === scopeId) ?? catalog.scopes[0];
  if (!scope) return null;
  const hasLocations = catalog.scopes.length > 1;

  return (
    <div className="space-y-4 rounded-card border border-subtle bg-surface-1 p-3 sm:p-4">
      {hasLocations ? (
        <Field kind="labelledby" label={c.scope} description={c.scopeHint}>
          {(p) => (
            <ChoiceChips
              aria-labelledby={p['aria-labelledby'] as string}
              scroll
              options={catalog.scopes.map((s) => ({
                value: s.locationId ?? 'all',
                label: s.name,
                icon: s.locationId ? <MapPin className="h-4 w-4" aria-hidden /> : undefined,
              }))}
              value={scopeId}
              onChange={(v) => v && setScopeId(v)}
            />
          )}
        </Field>
      ) : (
        <p className="qx-small text-fg-muted">
          {c.noLocationsBefore}{' '}
          <Link href="/dealer/qr-codes?tab=locations" className="font-medium text-brand underline underline-offset-2">
            {c.noLocationsLink}
          </Link>{' '}
          {c.noLocationsAfter}
        </p>
      )}

      {scope.locationId && scope.qrCount === 0 && (
        <p role="status" className="flex gap-2 rounded-control border border-warning-border bg-warning-subtle p-3 qx-small text-fg">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          <span>
            {c.noQr}{' '}
            <Link href="/dealer/qr-codes?tab=locations" className="font-medium underline underline-offset-2">
              {c.noQrLink}
            </Link>
            .
          </span>
        </p>
      )}
      {scope.locationId && !scope.isActive && <p className="qx-small text-fg-muted">{c.inactive}</p>}

      <EffectiveSet scope={scope} />

      <ul className="grid gap-3 lg:grid-cols-3">
        {REMEDY_TYPES.map((type) => {
          const own = scope.templates.filter((t) => t.type === type);
          const primary = own.find((t) => !scope.duplicateIds.includes(t.id));
          const dups = own.filter((t) => scope.duplicateIds.includes(t.id));
          return (
            <li key={`${scope.locationId ?? 'all'}-${type}`}>
              <TypeCard
                type={type}
                scope={scope}
                template={primary ?? null}
                duplicates={dups}
                limits={catalog.limits[type] ?? { min: 1, max: 100, integer: true }}
                maxValues={catalog.maxValues}
                index={primary ? scope.templates.findIndex((t) => t.id === primary.id) : -1}
                count={scope.templates.length}
              />
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function EffectiveSet({ scope }: { scope: RemedyScopeDto }) {
  const copy = useAutomationCopy();
  const c = copy.catalog;
  return (
    <div className="rounded-control bg-surface-2 p-3">
      <p className="qx-caption text-fg-muted">
        {c.effective(scope.name)}<strong className="text-fg">{c.source[scope.effective.source]}</strong>
      </p>
      <ul className="mt-2 flex flex-wrap gap-2">
        {scope.effective.options.map((o) => (
          <li key={o.type} className="rounded-chip border border-subtle bg-surface-1 px-2 py-1 qx-caption text-fg">
            {o.label}: {o.values.map((v) => fmtValue(copy, o.type, v)).join(' · ')}
          </li>
        ))}
      </ul>
      <p className="mt-2 qx-caption text-fg-muted">{c.effectiveNote}</p>
    </div>
  );
}

function ValuesEditor({
  type,
  values,
  onChange,
  limits,
  maxValues,
}: {
  type: RemedyType;
  values: number[];
  onChange: (v: number[]) => void;
  limits: { min: number; max: number; integer: boolean };
  maxValues: number;
}) {
  const copy = useAutomationCopy();
  const c = copy.catalog;
  const [draft, setDraft] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const add = () => {
    if (!draft.trim()) return;
    const { values: nums, invalid } = parseValueInput(draft);
    const bad = [...invalid, ...nums.filter((n) => n < limits.min || n > limits.max || (limits.integer && !Number.isInteger(n))).map(String)];
    const next = [...values];
    for (const n of nums) if (!bad.includes(String(n)) && !next.includes(n) && next.length < maxValues) next.push(n);
    next.sort((a, b) => a - b);
    onChange(next);
    setDraft('');
    setErr(bad.length ? c.rejected(bad.join(', '), limits.min, limits.max, limits.integer) : null);
  };
  return (
    <div className="space-y-2">
      {values.length > 0 && (
        <ul className="flex flex-wrap gap-1.5" aria-label={c.values}>
          {values.map((v) => (
            <li key={v} className="inline-flex items-center gap-0.5 rounded-chip border border-subtle bg-surface-2 py-0.5 pl-2 pr-0.5 text-sm text-fg">
              {fmtValue(copy, type, v)}
              <button
                type="button"
                onClick={() => onChange(values.filter((x) => x !== v))}
                className="inline-flex h-9 w-9 items-center justify-center rounded-chip text-fg-muted hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
                aria-label={c.removeValue(fmtValue(copy, type, v))}
              >
                <X className="h-3.5 w-3.5" aria-hidden />
              </button>
            </li>
          ))}
        </ul>
      )}
      <Field
        label={c.addValue}
        hideLabel
        error={err ?? undefined}
        description={c.addValueHint(limits.min, limits.max, maxValues)}
      >
        {(p) => (
          <Input
            {...p}
            inputMode="numeric"
            value={draft}
            disabled={values.length >= maxValues}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ',') {
                e.preventDefault();
                add();
              }
            }}
            onBlur={add}
            placeholder={type === 'discount' ? '10, 15, 20' : type === 'points' ? '50, 100' : '1'}
            className="min-h-11"
          />
        )}
      </Field>
    </div>
  );
}

function TypeCard({
  type,
  scope,
  template,
  duplicates,
  limits,
  maxValues,
  index,
  count,
}: {
  type: RemedyType;
  scope: RemedyScopeDto;
  template: RemedyTemplateDto | null;
  duplicates: RemedyTemplateDto[];
  limits: { min: number; max: number; integer: boolean };
  maxValues: number;
  index: number;
  count: number;
}) {
  const qc = useQueryClient();
  const meta = REMEDY_TYPE_META[type];
  const copy = useAutomationCopy();
  const c = copy.catalog;
  const typeText = copy.remedyType[type];
  const Icon = TYPE_ICON[type];
  const labelId = useId();
  const [creating, setCreating] = useState(false);
  const [label, setLabel] = useState(template?.label ?? meta.label);
  const [values, setValues] = useState<number[]>(template?.values ?? []);
  const baseKey = JSON.stringify([template?.label ?? meta.label, template?.values ?? []]);
  useEffect(() => {
    setLabel(template?.label ?? meta.label);
    setValues(template?.values ?? []);
  }, [baseKey]); // eslint-disable-line react-hooks/exhaustive-deps
  const dirty = useMemo(() => JSON.stringify([label.trim(), values]) !== baseKey, [label, values, baseKey]);

  const invalidate = () => qc.invalidateQueries({ queryKey: AUTOMATION_KEYS.remedy });
  const save = useMutation({
    mutationFn: async () =>
      template
        ? updateRemedyTemplate(template.id, { label: label.trim() || null, values })
        : createRemedyTemplate({ locationId: scope.locationId, type, label: label.trim() || null, values, isActive: true }),
    onSuccess: async () => {
      toast.success(template ? c.updated(typeText.label) : c.created(typeText.label));
      setCreating(false);
      await invalidate();
    },
    onError: (e) => toast.error(errorText(e)),
  });
  const patch = useMutation({
    mutationFn: (body: { isActive?: boolean; move?: 'up' | 'down' }) => updateRemedyTemplate(template!.id, body),
    onSuccess: invalidate,
    onError: (e) => toast.error(errorText(e)),
  });

  const editing = !!template || creating;
  return (
    <article
      aria-labelledby={labelId}
      className={cn('flex h-full flex-col gap-3 rounded-card border p-3', template && !template.isActive ? 'border-subtle opacity-80' : 'border-subtle')}
    >
      <header className="flex items-start gap-2">
        <span className="rounded-control bg-brand-subtle p-2 text-brand" aria-hidden>
          <Icon className="h-4 w-4" />
        </span>
        <div className="min-w-0 flex-1">
          <h3 id={labelId} className="text-sm font-semibold text-fg">
            {typeText.label}
          </h3>
          <p className="qx-caption text-fg-muted">{typeText.hint}</p>
        </div>
        {template && (
          <Switch
            checked={template.isActive}
            disabled={patch.isPending}
            onCheckedChange={(v) => patch.mutate({ isActive: v })}
            aria-label={c.toggle(typeText.label, template.isActive)}
          />
        )}
      </header>

      {!editing ? (
        <div className="flex flex-1 flex-col justify-between gap-2">
          <p className="qx-small text-fg-muted">{c.notDefined}</p>
          <Button variant="outline" className="min-h-11" onClick={() => setCreating(true)}>
            <Plus className="mr-2 h-4 w-4" aria-hidden /> {c.add(typeText.label)}
          </Button>
        </div>
      ) : (
        <>
          <Field label={c.nameLabel} description={type === 'free_item' ? c.nameHint : undefined}>
            {(p) => <Input {...p} value={label} maxLength={60} onChange={(e) => setLabel(e.target.value)} className="min-h-11" />}
          </Field>
          <ValuesEditor type={type} values={values} onChange={setValues} limits={limits} maxValues={maxValues} />
          <div className="mt-auto flex flex-wrap items-center gap-1 border-t border-subtle pt-2">
            <Button size="sm" className="min-h-11" disabled={!dirty || values.length === 0 || save.isPending} onClick={() => save.mutate()}>
              {template ? c.save : c.create}
            </Button>
            {!template && (
              <Button size="sm" variant="ghost" className="min-h-11" onClick={() => setCreating(false)}>
                {c.cancel}
              </Button>
            )}
            {template && (
              <>
                <IconButton
                  aria-label={c.moveUp(typeText.label)}
                  icon={<ArrowUp />}
                  tooltip
                  disabled={patch.isPending || index <= 0}
                  onClick={() => patch.mutate({ move: 'up' })}
                />
                <IconButton
                  aria-label={c.moveDown(typeText.label)}
                  icon={<ArrowDown />}
                  tooltip
                  disabled={patch.isPending || index < 0 || index >= count - 1}
                  onClick={() => patch.mutate({ move: 'down' })}
                />
                <span className="flex-1" />
                <ConfirmAction
                  trigger={<IconButton aria-label={c.deleteAria(typeText.label)} icon={<Trash2 />} variant="danger" tooltip />}
                  title={c.deleteTitle(typeText.label)}
                  description={c.deleteBody(scope.name)}
                  tone="warning"
                  confirmLabel={c.delete}
                  onConfirm={async () => {
                    await deleteRemedyTemplate(template.id);
                    toast.success(c.deleted(typeText.label));
                    await invalidate();
                  }}
                />
              </>
            )}
          </div>
        </>
      )}

      {duplicates.length > 0 && (
        <div className="rounded-control border border-warning-border bg-warning-subtle p-2 qx-small text-fg">
          <p>{c.duplicates(duplicates.length)}</p>
          <ul className="mt-1 space-y-1">
            {duplicates.map((d) => (
              <li key={d.id} className="flex items-center justify-between gap-2">
                <span>
                  {d.label}: {d.values.map((v) => fmtValue(copy, type, v)).join(', ')}
                </span>
                <ConfirmAction
                  trigger={<IconButton aria-label={c.duplicateDeleteAria(d.label)} icon={<Trash2 />} variant="danger" size="sm" />}
                  title={c.duplicateDeleteTitle}
                  tone="warning"
                  confirmLabel={c.delete}
                  onConfirm={async () => {
                    await deleteRemedyTemplate(d.id);
                    await invalidate();
                  }}
                />
              </li>
            ))}
          </ul>
        </div>
      )}
    </article>
  );
}
