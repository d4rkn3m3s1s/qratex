'use client';

import { useEffect, useId, useMemo, useState } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, ExternalLink, Undo2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ChoiceChips } from '@/components/ds/a11y';
import { KeyValueList, StatusBadge } from '@/components/ds/data';
import { QueryState, InlineError, TONE_CALLOUT } from '@/components/states';
import { cn } from '@/lib/utils';
import type { RemedyDetail as RemedyDetailDto } from '@/lib/dealer-queues/types';
import type { RemedyOption } from '@/lib/remedy-options';
import { fetchJson, queueKeys, errorMessage } from '../shared/api';
import { useQueueLocale, useSharedCopy } from '../shared/copy';
import { QueueTimeline, RatingStars, RelTime } from '../shared/ui';
import { formatDateTime } from '../shared/format';
import { useRemedyCopy } from './copy';
import {
  formatOption,
  formatOptionValue,
  optionsFromSelection,
  sameSelection,
  selectionFromOptions,
  type OptionSelection,
} from './options';

const MESSAGE_MAX = 500;

export function useRemedyDetail(id: string | null) {
  return useQuery({
    queryKey: queueKeys.remedyDetail(id ?? ''),
    queryFn: ({ signal }) => fetchJson<RemedyDetailDto>(`/api/dealer/queues/remedy/${encodeURIComponent(id ?? '')}`, { signal }),
    enabled: Boolean(id),
  });
}

export interface DraftState {
  message: string;
  /** İzin listesine göre normalize edilmiş seçenekler (kaydedilecek biçim). */
  options: RemedyOption[];
  dirty: boolean;
  valid: boolean;
}

/**
 * Taslak inceleme paneli (detay çekmecesinin gövdesi). Karar düğmeleri çekmecenin alt
 * çubuğundadır; düzenlenmiş taslak yayından önce kaydedilir (`onDraftChange`).
 */
export function RemedyDetailBody({
  id,
  readOnly,
  onDraftChange,
  onSaveDraft,
  saving,
}: {
  id: string;
  readOnly: boolean;
  onDraftChange: (draft: DraftState | null) => void;
  onSaveDraft: (payload: { message?: string; options?: unknown[] }) => Promise<unknown>;
  saving: boolean;
}) {
  const copy = useRemedyCopy();
  const shared = useSharedCopy();
  const locale = useQueueLocale();
  const q = useRemedyDetail(id);
  const messageId = useId();
  const optionsLabelId = useId();

  return (
    <QueryState
      query={q}
      skeleton="detail"
      empty={{ title: copy.notFound, description: null }}
      error={{ title: copy.notFound }}
    >
      {(d) => (
        <DetailContent
          key={`${d.id}:${d.status}`}
          d={d}
          readOnly={readOnly}
          copy={copy}
          shared={shared}
          locale={locale}
          messageId={messageId}
          optionsLabelId={optionsLabelId}
          onDraftChange={onDraftChange}
          onSaveDraft={onSaveDraft}
          saving={saving}
        />
      )}
    </QueryState>
  );
}

function DetailContent({
  d,
  readOnly,
  copy,
  shared,
  locale,
  messageId,
  optionsLabelId,
  onDraftChange,
  onSaveDraft,
  saving,
}: {
  d: RemedyDetailDto;
  readOnly: boolean;
  copy: ReturnType<typeof useRemedyCopy>;
  shared: ReturnType<typeof useSharedCopy>;
  locale: ReturnType<typeof useQueueLocale>;
  messageId: string;
  optionsLabelId: string;
  onDraftChange: (draft: DraftState | null) => void;
  onSaveDraft: (payload: { message?: string; options?: unknown[] }) => Promise<unknown>;
  saving: boolean;
}) {
  const editable = d.view === 'awaiting' && !readOnly;
  const initialSel = useMemo(() => selectionFromOptions(d.options), [d.options]);
  const [message, setMessage] = useState(d.message);
  const [selection, setSelection] = useState<OptionSelection>(initialSel);
  const [error, setError] = useState<string | null>(null);

  const nextOptions = optionsFromSelection(selection, d.allowedOptions);
  const dirty = editable && (message.trim() !== d.message.trim() || !sameSelection(selectionFromOptions(nextOptions), initialSel));
  const valid = message.trim().length > 0 && nextOptions.length > 0;

  const optionsKey = JSON.stringify(nextOptions);
  useEffect(() => {
    onDraftChange(editable ? { message, options: JSON.parse(optionsKey) as RemedyOption[], dirty, valid } : null);
  }, [editable, message, optionsKey, dirty, valid, onDraftChange]);

  const save = async () => {
    setError(null);
    try {
      await onSaveDraft({ message: message.trim(), options: nextOptions });
    } catch (err) {
      setError(errorMessage(err, shared.failed));
    }
  };

  const ctx = d.customerContext;

  return (
    <div className="space-y-6">
      {/* Kaynak yorum */}
      <section aria-labelledby={`${messageId}-review`} className="space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 id={`${messageId}-review`} className="qx-small font-semibold text-fg">
            {copy.review}
          </h3>
          {d.source.inboxHref ? (
            <Link
              href={d.source.inboxHref}
              className="qx-small inline-flex min-h-11 items-center gap-1 text-brand underline-offset-4 hover:underline focus-visible:rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {shared.openInInbox}
              <ExternalLink aria-hidden className="h-3.5 w-3.5" />
            </Link>
          ) : null}
        </div>
        <div className="rounded-control border border-subtle bg-surface-2 p-3">
          <div className="qx-caption mb-1.5 flex flex-wrap items-center gap-2 text-fg-muted">
            <RatingStars value={d.source.rating} />
            <span>{copy.sourceKind[d.source.kind]}</span>
            {d.source.placeLabel ? <span>· {d.source.placeLabel}</span> : null}
            {d.source.createdAt ? (
              <span>
                · <RelTime iso={d.source.createdAt} />
              </span>
            ) : null}
          </div>
          <p className="qx-body whitespace-pre-line break-words text-fg">{d.sourceText?.trim() || copy.noReviewText}</p>
        </div>
      </section>

      {/* Müşteri bağlamı */}
      <section aria-labelledby={`${messageId}-customer`} className="space-y-2">
        <h3 id={`${messageId}-customer`} className="qx-small font-semibold text-fg">
          {copy.customer}: {d.customer.name}
        </h3>
        <KeyValueList
          layout="grid"
          columns={2}
          items={[
            { label: copy.visits, value: ctx.visits },
            { label: copy.feedbacks, value: ctx.feedbacks },
            { label: copy.remedies, value: ctx.remedies },
            { label: copy.acceptedRemedies, value: ctx.acceptedRemedies },
          ]}
        />
      </section>

      {/* Teklif */}
      <section aria-labelledby={`${messageId}-offer`} className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <h3 id={`${messageId}-offer`} className="qx-small font-semibold text-fg">
            {copy.offer}
          </h3>
          {d.origin.auto ? (
            <StatusBadge size="sm" tone="info" label={`${copy.auto}${d.origin.trigger ? ` · ${copy.trigger[d.origin.trigger]}` : ''}`} />
          ) : null}
        </div>

        {editable && d.templateDrift ? (
          <div role="status" className={cn('flex flex-wrap items-center gap-2 rounded-control border p-3', TONE_CALLOUT.warning)}>
            <AlertTriangle aria-hidden className="h-4 w-4 shrink-0 text-warning" />
            <p className="qx-small min-w-0 flex-1">{copy.drift}</p>
            <Button type="button" variant="outline" size="sm" className="min-h-11 sm:min-h-9" onClick={() => setSelection(selectionFromOptions(d.allowedOptions))}>
              {copy.applyTemplate}
            </Button>
          </div>
        ) : null}

        {editable ? (
          <>
            <div className="space-y-1.5">
              <label htmlFor={messageId} className="qx-small font-medium text-fg">
                {copy.message}
              </label>
              <textarea
                id={messageId}
                value={message}
                maxLength={MESSAGE_MAX}
                rows={4}
                onChange={(e) => setMessage(e.target.value)}
                aria-describedby={`${messageId}-count`}
                className="w-full rounded-control border border-strong bg-surface-1 px-3 py-2 text-sm text-fg outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
              <p id={`${messageId}-count`} className="qx-caption text-right text-fg-subtle">
                {copy.messageHint(message.length, MESSAGE_MAX)}
              </p>
            </div>
            <div className="space-y-2">
              <p id={optionsLabelId} className="qx-small font-medium text-fg">
                {copy.options}
              </p>
              <p className="qx-caption text-fg-subtle">{copy.optionsHint}</p>
              {d.allowedOptions.map((o) => (
                <div key={o.type} className="space-y-1">
                  <p className="qx-caption font-medium text-fg-muted">{o.label}</p>
                  <ChoiceChips
                    mode="multiple"
                    aria-label={`${copy.options}: ${o.label}`}
                    size="sm"
                    options={o.values.map((v) => ({ value: String(v), label: formatOptionValue(o, v, locale) }))}
                    value={(selection[o.type] ?? []).map(String)}
                    onChange={(vals) => setSelection((prev) => ({ ...prev, [o.type]: vals.map(Number) }))}
                  />
                </div>
              ))}
              {nextOptions.length === 0 ? <InlineError>{copy.noOptionSelected}</InlineError> : null}
            </div>
            {error ? <InlineError variant="banner">{error}</InlineError> : null}
            <div className="flex flex-wrap items-center justify-end gap-2">
              {dirty ? <span className="qx-caption text-warning">{copy.unsaved}</span> : null}
              <Button type="button" variant="outline" onClick={save} disabled={!dirty || !valid || saving} loading={saving}>
                {copy.saveDraft}
              </Button>
            </div>
          </>
        ) : (
          <>
            <blockquote className="qx-body whitespace-pre-line break-words rounded-control border-l-4 border-brand-border bg-surface-2 px-3 py-2 text-fg">
              {d.message}
            </blockquote>
            <ul className="flex flex-wrap gap-1.5" aria-label={copy.options}>
              {d.options.map((o) => (
                <li key={o.type} className="qx-caption rounded-chip bg-brand-subtle px-2 py-0.5 text-brand ring-1 ring-inset ring-brand-border">
                  {formatOption(o, locale)}
                </li>
              ))}
            </ul>
            {d.selection ? <StatusBadge tone="success" label={copy.selection(d.selection.label)} /> : null}
            {d.creditedPoints != null && d.creditedPoints > 0 ? <p className="qx-small text-fg-muted">{copy.credited(d.creditedPoints)}</p> : null}
            {d.reject ? (
              <p className="qx-small text-fg-muted">
                {copy.rejected}
                {d.reject.reason ? ` · ${copy.rejectReason[d.reject.reason]}` : ''}
                {d.reject.note ? ` — “${d.reject.note}”` : ''}
              </p>
            ) : null}
            {d.view !== 'awaiting' && !d.restorableUntil ? <p className="qx-caption text-fg-subtle">{copy.readOnly}</p> : null}
            {d.restorableUntil ? (
              <p className="qx-caption inline-flex items-center gap-1 text-fg-muted" title={formatDateTime(d.restorableUntil, locale)}>
                <Undo2 aria-hidden className="h-3.5 w-3.5" />
                {copy.restoreUntil(new Intl.DateTimeFormat(locale === 'en' ? 'en-GB' : 'tr-TR', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Istanbul' }).format(new Date(d.restorableUntil)))}
              </p>
            ) : null}
          </>
        )}
      </section>

      {/* Geçmiş */}
      <section aria-labelledby={`${messageId}-timeline`} className="space-y-2">
        <h3 id={`${messageId}-timeline`} className="qx-small font-semibold text-fg">
          {copy.timeline}
        </h3>
        <QueueTimeline
          entries={d.timeline}
          labelOf={(e) => {
            if (e.kind === 'rejected') {
              const reason = typeof e.params?.reason === 'string' ? e.params.reason : null;
              return { title: copy.rejected, description: [reason ? copy.rejectReason[reason] : null, e.note].filter(Boolean).join(' — ') || null };
            }
            const map: Record<string, string> = {
              published: copy.views.sent,
              notified: locale === 'en' ? 'Customer notified' : 'Müşteriye bildirim gönderildi',
              queued: locale === 'en' ? 'Queued for approval' : 'Onay kuyruğuna alındı',
              edited: locale === 'en' ? 'Draft edited' : 'Taslak düzenlendi',
              restored: copy.restored,
              expired: copy.expired,
              accepted: copy.views.accepted,
            };
            return { title: map[e.kind] ?? e.label };
          }}
        />
      </section>
    </div>
  );
}
