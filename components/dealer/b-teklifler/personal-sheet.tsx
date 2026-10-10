'use client';

import { useEffect, useId, useState } from 'react';
import { Controller } from 'react-hook-form';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { BellOff, Check, Search, UserRound } from 'lucide-react';
import { EntityEditorSheet, Field, TextareaField, useZodForm, errorMessageOf } from '@/components/ds/form';
import { ChoiceChips } from '@/components/ds/a11y';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { PERSONAL_MESSAGE_MAX, personalOfferSchema, type PersonalOfferInput, type PersonalOfferType } from '@/lib/dealer/offers/rules';
import type { PersonalCandidateDto } from '@/lib/dealer/offers/types';
import { searchCandidates, sendPersonal } from './api';
import { useOffersCopy, useOffersLocale } from './context';
import { formatRelative } from './format';

function useDebounced<T>(value: T, ms: number): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setV(value), ms);
    return () => clearTimeout(id);
  }, [value, ms]);
  return v;
}

function CandidatePicker({
  value,
  onChange,
  invalid,
  describedBy,
  labelledBy,
  enabled,
}: {
  value: string;
  onChange: (ref: string, c: PersonalCandidateDto | null) => void;
  invalid: boolean;
  describedBy?: string;
  labelledBy: string;
  enabled: boolean;
}) {
  const copy = useOffersCopy();
  const locale = useOffersLocale();
  const [q, setQ] = useState('');
  const [picked, setPicked] = useState<PersonalCandidateDto | null>(null);
  const debounced = useDebounced(q, 300);
  const searchId = useId();
  const query = useQuery({
    queryKey: ['dealer', 'offers', 'personal-candidates', debounced],
    queryFn: ({ signal }) => searchCandidates(debounced, signal),
    enabled: enabled && !value,
    placeholderData: keepPreviousData,
    staleTime: 30_000,
  });

  if (value && picked) {
    return (
      <div className="flex items-center gap-3 rounded-lg border border-brand-border bg-brand-subtle p-3">
        <UserRound className="h-5 w-5 shrink-0 text-brand" aria-hidden />
        <div className="min-w-0 flex-1">
          <p className="qx-body truncate font-semibold text-fg">{picked.name}</p>
          <p className="qx-caption text-fg-muted">
            {copy.personalForm.visits(picked.visitCount)}
            {picked.lastVisitAt ? ` · ${copy.personalForm.lastVisit(formatRelative(picked.lastVisitAt, locale))}` : ''}
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="min-h-11"
          onClick={() => {
            setPicked(null);
            onChange('', null);
          }}
        >
          {copy.personalForm.change}
        </Button>
      </div>
    );
  }

  const items = query.data?.candidates ?? [];
  return (
    <div className="space-y-2">
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-fg-muted" aria-hidden />
        <Input
          id={searchId}
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={copy.personalForm.searchPlaceholder}
          aria-label={copy.personalForm.searchPlaceholder}
          aria-describedby={describedBy}
          aria-invalid={invalid || undefined}
          className="min-h-11 pl-9"
          autoComplete="off"
        />
      </div>
      <div aria-live="polite" className="qx-caption text-fg-muted">
        {query.isFetching ? copy.personalForm.searching : null}
      </div>
      {query.isError ? (
        <div role="alert" className="qx-small flex items-center justify-between gap-2 rounded-md border border-danger-border bg-danger-subtle px-3 py-2 text-fg">
          {copy.personalForm.searchError}
          <Button type="button" variant="outline" size="sm" className="min-h-11" onClick={() => void query.refetch()}>
            {copy.personalForm.retry}
          </Button>
        </div>
      ) : query.data && items.length === 0 ? (
        <p className="qx-small rounded-md border border-subtle bg-surface-0 px-3 py-2 text-fg-muted">
          {debounced.trim() ? copy.personalForm.noResults : copy.personalForm.noCustomers}
        </p>
      ) : (
        <ul role="radiogroup" aria-labelledby={labelledBy} className="max-h-72 space-y-1 overflow-y-auto overscroll-contain">
          {items.map((c) => {
            const blocked = !c.reachable || c.hasOpenOffer;
            const reason = !c.reachable ? copy.personalForm.optedOut : c.hasOpenOffer ? copy.personalForm.hasOpen : null;
            return (
              <li key={c.ref}>
                <button
                  type="button"
                  role="radio"
                  aria-checked={value === c.ref}
                  aria-disabled={blocked || undefined}
                  disabled={blocked}
                  onClick={() => {
                    setPicked(c);
                    onChange(c.ref, c);
                  }}
                  className={cn(
                    'flex min-h-11 w-full items-center gap-3 rounded-md border border-subtle px-3 py-2 text-left transition-colors duration-fast',
                    'hover:bg-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus',
                    'disabled:cursor-not-allowed disabled:opacity-70 disabled:hover:bg-transparent',
                  )}
                >
                  <UserRound className="h-4 w-4 shrink-0 text-fg-muted" aria-hidden />
                  <span className="min-w-0 flex-1">
                    <span className="qx-small block truncate font-medium text-fg">{c.name}</span>
                    <span className="qx-caption block text-fg-muted">
                      {copy.personalForm.visits(c.visitCount)}
                      {c.lastVisitAt ? ` · ${copy.personalForm.lastVisit(formatRelative(c.lastVisitAt, locale))}` : ''}
                    </span>
                  </span>
                  {reason && (
                    <span className="qx-caption inline-flex shrink-0 items-center gap-1 text-warning">
                      <BellOff className="h-3.5 w-3.5" aria-hidden />
                      {reason}
                    </span>
                  )}
                  {value === c.ref && <Check className="h-4 w-4 text-brand" aria-hidden />}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

export function PersonalSheet({
  open,
  onOpenChange,
  availableTypes,
  onSent,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  availableTypes: Array<{ type: string; label: string; summary: string }>;
  onSent: () => void;
}) {
  const copy = useOffersCopy();
  const defaults: PersonalOfferInput = {
    ref: '',
    message: '',
    types: availableTypes.map((t) => t.type as PersonalOfferType),
  };
  const form = useZodForm(personalOfferSchema, { defaultValues: defaults });

  useEffect(() => {
    if (open) form.reset(defaults);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const typeOptions = availableTypes.map((t) => ({
    value: t.type as PersonalOfferType,
    label: (
      <span className="flex flex-col items-start leading-tight">
        <span>{t.label}</span>
        <span className="qx-caption text-fg-muted">{t.summary}</span>
      </span>
    ),
    textLabel: `${t.label}: ${t.summary}`,
  }));

  return (
    <EntityEditorSheet
      open={open}
      onOpenChange={onOpenChange}
      mode="create"
      title={copy.personalForm.title}
      description={copy.personalForm.description}
      form={form}
      width="lg"
      submitLabel={copy.personalForm.submit}
      successToast={copy.personalForm.sent}
      onSubmit={(v) => sendPersonal(v)}
      onSaved={onSent}
    >
      <Controller
        control={form.control}
        name="ref"
        render={({ field, fieldState }) => (
          <Field kind="labelledby" label={copy.personalForm.customerLabel} required error={errorMessageOf(fieldState.error)}>
            {(p) => (
              <CandidatePicker
                value={field.value}
                onChange={(ref) => {
                  field.onChange(ref);
                  void form.trigger('ref');
                }}
                invalid={!!fieldState.error}
                describedBy={p['aria-describedby']}
                labelledBy={p['aria-labelledby'] as string}
                enabled={open}
              />
            )}
          </Field>
        )}
      />
      <TextareaField
        control={form.control}
        name="message"
        label={copy.personalForm.messageLabel}
        required
        rows={4}
        maxLength={PERSONAL_MESSAGE_MAX}
        placeholder={copy.personalForm.messagePlaceholder}
      />
      <Controller
        control={form.control}
        name="types"
        render={({ field, fieldState }) => (
          <Field
            kind="labelledby"
            label={copy.personalForm.typesLabel}
            description={copy.personalForm.typesHint}
            required
            error={errorMessageOf(fieldState.error)}
          >
            {(p) => (
              <ChoiceChips
                mode="multiple"
                aria-labelledby={p['aria-labelledby'] as string}
                aria-describedby={p['aria-describedby']}
                options={typeOptions}
                value={field.value}
                onChange={(next) => field.onChange(next)}
                onBlur={field.onBlur}
              />
            )}
          </Field>
        )}
      />
    </EntityEditorSheet>
  );
}
