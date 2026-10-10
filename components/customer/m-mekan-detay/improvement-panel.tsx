'use client';

import { useState } from 'react';
import { CheckCheck, Clock3, Lightbulb, Loader2, Send } from 'lucide-react';
import { SectionCard } from '@/components/ds/page';
import { ChoiceChips, announce } from '@/components/ds/a11y';
import { Field } from '@/components/ds/form';
import { InlineError, TONE_CALLOUT } from '@/components/states';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import {
  IMPROVEMENT_MESSAGE_MAX,
  IMPROVEMENT_MESSAGE_MIN,
  IMPROVEMENT_TEMPLATE_KEYS,
  type ImprovementTemplateKey,
  type VenueDetail,
  type VenueImprovementRequest,
} from '@/lib/venue-detail/types';
import { getVenueCopy, type VenueCopy, type VenueLocale } from './copy';

function RequestRow({ r, copy }: { r: VenueImprovementRequest; copy: VenueCopy }) {
  return (
    <li className="rounded-control border border-border bg-surface-2 px-3 py-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-medium text-fg">{copy.improveTopics[r.templateKey] ?? copy.improveTopics.other}</p>
        <span
          className={cn(
            'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset',
            r.seen ? 'bg-success-subtle text-success ring-success-border' : 'bg-surface-muted text-fg-muted ring-border'
          )}
        >
          {r.seen ? <CheckCheck aria-hidden className="h-3.5 w-3.5" /> : <Clock3 aria-hidden className="h-3.5 w-3.5" />}
          {r.seen ? (r.seenAt ? copy.requestSeenAt(copy.dateTime(new Date(r.seenAt))) : copy.requestSeen) : copy.requestSent}
        </span>
      </div>
      <p className="qx-small mt-1 line-clamp-3 text-fg">{r.message}</p>
      <time dateTime={r.createdAt} className="qx-caption text-fg-muted">
        {copy.dateTime(new Date(r.createdAt))}
      </time>
    </li>
  );
}

/**
 * "Daha iyi olabilirdi" — şikâyet değil, iyileştirme isteği. Uygunluk ve tavanlar sunucuda
 * (POST /api/customer/improvement-request); müşteri SLA seçmez, işletmenin gerçek medyan yanıt
 * süresi gösterilir. Gönderilen istekler "İşletme gördü" durumuyla listelenir.
 */
export function ImprovementPanel({
  dealerId,
  improvement,
  responseTime,
  locale,
}: {
  dealerId: string;
  improvement: VenueDetail['improvement'];
  responseTime: VenueDetail['responseTime'];
  locale: VenueLocale;
}) {
  const copy = getVenueCopy(locale);
  const [topic, setTopic] = useState<ImprovementTemplateKey | null>(null);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldError, setFieldError] = useState<{ topic?: string; message?: string }>({});
  const [sentNote, setSentNote] = useState<string | null>(null);
  const [requests, setRequests] = useState<VenueImprovementRequest[]>(improvement.requests);

  const length = message.trim().length;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const fe: typeof fieldError = {};
    if (!topic) fe.topic = copy.improveTopicRequired;
    if (length < IMPROVEMENT_MESSAGE_MIN) fe.message = copy.improveTooShort(IMPROVEMENT_MESSAGE_MIN);
    setFieldError(fe);
    if (fe.topic || fe.message) {
      announce(fe.topic ?? fe.message ?? '', { politeness: 'assertive' });
      return;
    }
    setBusy(true);
    setError(null);
    setSentNote(null);
    try {
      const res = await fetch('/api/customer/improvement-request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dealerId, templateKey: topic, message: message.trim() }),
      });
      const json = (await res.json().catch(() => ({}))) as {
        data?: { request: VenueImprovementRequest };
        error?: string;
        details?: Array<{ path: string; message: string }>;
      };
      if (!res.ok || !json.data?.request) {
        const detail = Array.isArray(json.details) ? json.details[0]?.message : undefined;
        throw new Error(detail || json.error || copy.improveFailed);
      }
      setRequests((prev) => [json.data!.request, ...prev].slice(0, 10));
      setMessage('');
      setTopic(null);
      setSentNote(copy.improveSent);
      announce(copy.improveSent);
    } catch (err) {
      const msg = err instanceof Error && err.message ? err.message : copy.improveFailed;
      setError(msg);
      announce(msg, { politeness: 'assertive' });
    } finally {
      setBusy(false);
    }
  };

  const responseLine = responseTime
    ? copy.responseTime(copy.hours(responseTime.hours), responseTime.sample)
    : copy.responseTimeUnknown;

  return (
    <SectionCard title={copy.improveTitle} description={copy.improveDesc} icon={<Lightbulb />} id="iyilestirme">
      {!improvement.enabled ? (
        <p className={cn('qx-small rounded-control border px-3 py-2', TONE_CALLOUT.neutral)}>{copy.improveDisabled}</p>
      ) : (
        <div className="space-y-4">
          <p className="qx-small flex items-start gap-2 text-fg-muted">
            <Clock3 aria-hidden className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{responseLine}</span>
          </p>

          {improvement.eligible ? (
            <form onSubmit={(e) => void submit(e)} noValidate className="space-y-4">
              <Field label={copy.improveTopic} kind="labelledby" required error={fieldError.topic}>
                {(p) => (
                  <ChoiceChips
                    aria-labelledby={p['aria-labelledby'] as string}
                    options={IMPROVEMENT_TEMPLATE_KEYS.map((k) => ({ value: k, label: copy.improveTopics[k] }))}
                    value={topic}
                    onChange={(v) => {
                      setTopic(v);
                      setFieldError((f) => ({ ...f, topic: undefined }));
                    }}
                    invalid={Boolean(fieldError.topic)}
                    disabled={busy}
                  />
                )}
              </Field>
              <Field
                label={copy.improveMessage}
                required
                error={fieldError.message}
                footer={
                  <span className="qx-caption tabular-nums text-fg-muted">
                    {copy.improveCounter(message.length, IMPROVEMENT_MESSAGE_MAX)}
                  </span>
                }
              >
                {(p) => (
                  <Textarea
                    {...p}
                    value={message}
                    onChange={(e) => {
                      setMessage(e.target.value.slice(0, IMPROVEMENT_MESSAGE_MAX));
                      if (fieldError.message) setFieldError((f) => ({ ...f, message: undefined }));
                    }}
                    maxLength={IMPROVEMENT_MESSAGE_MAX}
                    rows={4}
                    placeholder={copy.improvePlaceholder}
                    disabled={busy}
                    className="text-base sm:text-sm"
                  />
                )}
              </Field>
              {error && <InlineError variant="banner">{error}</InlineError>}
              {sentNote && (
                <p role="status" className="qx-small font-medium text-success">
                  {sentNote}
                </p>
              )}
              <Button type="submit" className="w-full gap-2 sm:w-auto" disabled={busy}>
                {busy ? <Loader2 aria-hidden className="h-4 w-4 animate-spin" /> : <Send aria-hidden className="h-4 w-4" />}
                {busy ? copy.improveSubmitting : copy.improveSubmit}
              </Button>
            </form>
          ) : (
            <p className={cn('qx-small rounded-control border px-3 py-2', TONE_CALLOUT.info)}>{copy.improveNotEligible}</p>
          )}

          {requests.length > 0 && (
            <div className="border-t border-border pt-4">
              <h3 className="qx-small font-semibold text-fg">{copy.myRequestsTitle}</h3>
              <p className="qx-caption mt-0.5 text-fg-muted">{copy.requestSeenNote}</p>
              <ul className="mt-2 space-y-2">
                {requests.map((r) => (
                  <RequestRow key={r.id} r={r} copy={copy} />
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </SectionCard>
  );
}
