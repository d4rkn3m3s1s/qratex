'use client';

import { useId, useMemo, useRef, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { X } from 'lucide-react';
import { IconButton, RatingInput } from '@/components/ds/a11y';
import { InlineError } from '@/components/states';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import type { ReviewRewardPreview } from '@/lib/customer-voices/types';
import { useVoicesCopy } from './copy';
import { fetchJson, voicesKeys } from './lib';

const TEXT_MAX = 2000;
const DIMENSIONS = ['taste', 'service', 'ambiance', 'value', 'cleanliness'] as const;
type Dim = (typeof DIMENSIONS)[number];

function newIdempotencyKey(): string {
  try {
    return globalThis.crypto.randomUUID();
  } catch {
    return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
  }
}

type CreateResponse = { rewards?: { points: number; xp: number; capped: boolean } };

/**
 * Tüketim yorumu yazma/düzenleme. Ödül vaadi SUNUCUDAN (admin matrisi + bugünkü kalan tavan);
 * istemci eşik ya da miktar uydurmaz. Eski regex "AI yardımcısı" (metni şikâyet şablonuna
 * sarıp bonus eşiğini yapay aşırıyordu) kaldırıldı. Düzenlemede yalnız değişen alanlar
 * gönderilir; metni silmek gerçekten siler (KVKK).
 */
export function ReviewComposer({
  consumptionId,
  mode,
  reward,
  initial,
  onDone,
  onCancel,
}: {
  consumptionId: string;
  mode: 'create' | 'edit';
  reward: ReviewRewardPreview | null;
  initial?: { rating: number; text: string | null; dimensions: Record<string, number> | null };
  onDone?: () => void;
  onCancel?: () => void;
}) {
  const copy = useVoicesCopy();
  const qc = useQueryClient();
  const ids = { rating: useId(), text: useId(), counter: useId(), dims: useId() };
  const [rating, setRating] = useState<number | null>(initial?.rating ?? null);
  const [text, setText] = useState(initial?.text ?? '');
  const [dims, setDims] = useState<Partial<Record<Dim, number>>>(() => {
    const out: Partial<Record<Dim, number>> = {};
    for (const d of DIMENSIONS) if (initial?.dimensions?.[d]) out[d] = initial.dimensions[d];
    return out;
  });
  const [touched, setTouched] = useState(false);
  const idemKey = useRef(newIdempotencyKey());

  const trimmed = text.trim();
  const detailed = reward ? trimmed.length >= reward.threshold : false;
  const willEarn = reward ? Math.min(detailed ? reward.detailed.points : reward.base.points, reward.remainingToday) : 0;
  const fullEarn = reward ? (detailed ? reward.detailed.points : reward.base.points) : 0;

  const dimsPayload = useMemo(() => {
    const out: Record<string, number> = {};
    for (const [k, v] of Object.entries(dims)) if (typeof v === 'number') out[k] = v;
    return out;
  }, [dims]);

  const mutation = useMutation({
    mutationFn: async () => {
      if (mode === 'create') {
        return fetchJson<CreateResponse>(`/api/customer/consumptions/${encodeURIComponent(consumptionId)}/review`, {
          method: 'POST',
          headers: { 'content-type': 'application/json', 'Idempotency-Key': idemKey.current },
          body: JSON.stringify({
            rating,
            ...(trimmed ? { text: trimmed } : {}),
            ...(Object.keys(dimsPayload).length ? { dimensions: dimsPayload } : {}),
          }),
        });
      }
      const body: Record<string, unknown> = {};
      if (rating !== initial?.rating) body.rating = rating;
      if (trimmed !== (initial?.text?.trim() ?? '')) body.text = trimmed ? trimmed : null;
      const before = JSON.stringify(initial?.dimensions ?? {});
      if (JSON.stringify(dimsPayload) !== before) body.dimensions = Object.keys(dimsPayload).length ? dimsPayload : null;
      if (Object.keys(body).length === 0) return {} as CreateResponse;
      return fetchJson<CreateResponse>(`/api/customer/consumptions/${encodeURIComponent(consumptionId)}/review`, {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
    },
    onSuccess: (res) => {
      if (mode === 'create') {
        const p = res.rewards?.points ?? 0;
        toast.success(p > 0 ? copy.submittedPoints(p) : copy.submitted);
        idemKey.current = newIdempotencyKey();
      } else {
        toast.success(copy.saved);
      }
      void qc.invalidateQueries({ queryKey: voicesKeys.all });
      onDone?.();
    },
  });

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setTouched(true);
    if (!rating || mutation.isPending) return;
    mutation.mutate();
  };

  return (
    <form onSubmit={submit} className="space-y-5" noValidate>
      <div className="space-y-2">
        <p id={ids.rating} className="qx-small font-medium text-fg">
          {copy.ratingQuestion}
        </p>
        <RatingInput
          aria-labelledby={ids.rating}
          value={rating}
          onChange={setRating}
          size="lg"
          register="play"
          required
          invalid={touched && !rating}
          disabled={mutation.isPending}
        />
        {touched && !rating ? <InlineError>{copy.ratingRequired}</InlineError> : null}
      </div>

      <fieldset className="space-y-2" aria-describedby={ids.dims}>
        <legend className="qx-small font-medium text-fg">{copy.dimensionQuestion}</legend>
        <ul className="grid gap-2">
          {DIMENSIONS.map((d) => {
            const label = copy.dimensions[d];
            const labelId = `${ids.dims}-${d}`;
            return (
              <li key={d} className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1 rounded-control border border-subtle px-3 py-1.5">
                <span id={labelId} className="qx-small text-fg">{label}</span>
                <span className="flex items-center gap-1">
                  <RatingInput
                    aria-labelledby={labelId}
                    value={dims[d] ?? null}
                    onChange={(v) => setDims((s) => ({ ...s, [d]: v }))}
                    disabled={mutation.isPending}
                  />
                  {dims[d] ? (
                    <IconButton
                      aria-label={copy.clearDimension(label)}
                      icon={<X />}
                      variant="ghost"
                      size="sm"
                      onClick={() => setDims((s) => ({ ...s, [d]: undefined }))}
                    />
                  ) : null}
                </span>
              </li>
            );
          })}
        </ul>
      </fieldset>

      <div className="space-y-2">
        <label htmlFor={ids.text} className="qx-small font-medium text-fg">
          {copy.textLabel}
        </label>
        <Textarea
          id={ids.text}
          value={text}
          onChange={(e) => setText(e.target.value.slice(0, TEXT_MAX))}
          maxLength={TEXT_MAX}
          rows={4}
          placeholder={copy.textPlaceholder}
          aria-describedby={ids.counter}
          disabled={mutation.isPending}
        />
        <div id={ids.counter} className="qx-caption flex flex-wrap items-center justify-between gap-2 text-fg-muted">
          {mode === 'create' && reward ? (
            <span className={cn(detailed ? 'text-success' : undefined)}>
              {detailed ? copy.detailedReached : copy.detailedProgress(Math.max(0, reward.threshold - trimmed.length))}
            </span>
          ) : (
            <span />
          )}
          <span className="qx-num">{copy.textCounter(text.length, TEXT_MAX)}</span>
        </div>
        {mode === 'create' && reward ? (
          <div aria-hidden className="h-1.5 overflow-hidden rounded-full bg-surface-muted">
            <div
              className={cn('h-full rounded-full transition-[width] duration-base ease-standard', detailed ? 'bg-success' : 'bg-brand')}
              style={{ width: `${Math.min(100, (trimmed.length / Math.max(1, reward.threshold)) * 100)}%` }}
            />
          </div>
        ) : null}
      </div>

      {mode === 'create' && reward ? (
        <p className="qx-small rounded-control bg-brand-subtle/60 px-3 py-2 text-fg">
          {reward.remainingToday <= 0
            ? copy.rewardNone
            : willEarn < fullEarn
              ? copy.rewardCapped(willEarn)
              : copy.rewardPreview(willEarn)}
        </p>
      ) : null}
      {mode === 'edit' ? <p className="qx-caption text-fg-muted">{copy.editedHint}</p> : null}

      {mutation.isError ? <InlineError variant="banner">{(mutation.error as Error).message}</InlineError> : null}

      <div className="flex flex-wrap items-center gap-2">
        <Button type="submit" loading={mutation.isPending} className="min-w-[8rem]">
          {mode === 'create' ? copy.submit : copy.save}
        </Button>
        {mode === 'edit' && initial?.text ? (
          <Button type="button" variant="ghost" disabled={mutation.isPending} onClick={() => setText('')}>
            {copy.deleteText}
          </Button>
        ) : null}
        {onCancel ? (
          <Button type="button" variant="ghost" disabled={mutation.isPending} onClick={onCancel}>
            {copy.cancel}
          </Button>
        ) : null}
      </div>
    </form>
  );
}
