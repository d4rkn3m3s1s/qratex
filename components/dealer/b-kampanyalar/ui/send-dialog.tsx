'use client';

import { useEffect, useId, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { CalendarClock, Loader2, Send, ShieldAlert } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { InlineError } from '@/components/states';
import { addDays, istanbulDay } from '@/components/ds/page/date-range';
import { cn } from '@/lib/utils';
import {
  HOLDOUT_MIN_POOL,
  HOLDOUT_OPTIONS,
  SCHEDULE_MAX_DAYS_AHEAD,
  SCHEDULE_MIN_DAYS_AHEAD,
  type HoldoutPct,
} from '../domain';
import type { CampaignDto, SendPreview } from '../types';
import { campaignApi, campaignKeys } from '../client/api';
import { useCampaignCopy } from '../client/use-copy';
import { fmtDay, fmtNumber } from '../copy';
import { SegmentChip } from './badges';

export type SendDialogProps = {
  campaign: CampaignDto | null;
  /** İlk açılış modu (satırdaki "Planla" → schedule). */
  initialMode?: 'now' | 'schedule';
  dealerId: string | null;
  onClose: () => void;
  onDone: (result: { mode: 'now'; recipients: number } | { mode: 'schedule'; day: string }) => void;
};

/**
 * Gönder / planla onayı (denetim Bulgu 9: 500 kişiye geri alınamaz gönderim tek tıkla ve
 * onaysızdı). Sunucudan etki önizlemesi: kitle, izin, frekans tavanı, 1000 sınırı, kontrol grubu
 * — gönderimle AYNI hesap.
 */
export function SendDialog({ campaign, initialMode = 'now', dealerId, onClose, onDone }: SendDialogProps) {
  const { c, locale } = useCampaignCopy();
  const open = campaign !== null;
  const [mode, setMode] = useState<'now' | 'schedule'>(initialMode);
  const [holdout, setHoldout] = useState<HoldoutPct>(0);
  const bounds = useMemo(() => {
    const today = istanbulDay();
    return { min: addDays(today, SCHEDULE_MIN_DAYS_AHEAD), max: addDays(today, SCHEDULE_MAX_DAYS_AHEAD) };
  }, []);
  const [day, setDay] = useState(bounds.min);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const ids = { mode: useId(), day: useId(), dayHelp: useId(), holdout: useId(), holdoutHelp: useId() };

  useEffect(() => {
    if (!campaign) return;
    setMode(initialMode);
    setHoldout(0);
    setDay(bounds.min);
    setError(null);
    setPending(false);
  }, [campaign, initialMode, bounds.min]);

  const preview = useQuery({
    queryKey: campaignKeys.preview(dealerId, campaign?.id ?? '', holdout),
    queryFn: ({ signal }) => campaignApi.preview(dealerId, campaign!.id, holdout, signal),
    enabled: open,
    staleTime: 15_000,
  });
  const p: SendPreview | undefined = preview.data;
  const recipients = p?.recipientCount ?? 0;
  const dayValid = mode === 'now' || (day >= bounds.min && day <= bounds.max);
  const canConfirm = open && !pending && !!p && recipients > 0 && dayValid;

  async function confirm() {
    if (!campaign || !canConfirm) return;
    setPending(true);
    setError(null);
    try {
      if (mode === 'now') {
        const r = await campaignApi.send(campaign.id, holdout);
        onDone({ mode: 'now', recipients: r.recipientCount });
      } else {
        await campaignApi.schedule(campaign.id, day, holdout);
        onDone({ mode: 'schedule', day });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : c.errors.generic);
      void preview.refetch();
    } finally {
      setPending(false);
    }
  }

  const rows: Array<{ label: string; value: number; emphasis?: boolean; muted?: boolean }> = p
    ? [
        { label: c.send.candidates, value: p.candidateCount },
        { label: c.send.optedOut, value: p.optedOutCount, muted: true },
        { label: c.send.ineligible, value: p.ineligibleCount, muted: true },
        { label: c.send.capped, value: p.frequencyCappedCount, muted: true },
        { label: c.send.truncated, value: p.truncatedCount, muted: true },
        { label: c.send.holdoutCount, value: p.holdoutCount, muted: true },
      ].filter((r) => r.value > 0 || r.label === c.send.candidates)
    : [];

  return (
    <Dialog open={open} onOpenChange={(v) => (!v && !pending ? onClose() : undefined)}>
      <DialogContent className="max-h-[calc(100dvh-2rem)] w-[calc(100vw-2rem)] max-w-lg overflow-y-auto rounded-sheet p-5 sm:p-6">
        <DialogHeader className="space-y-2 text-left">
          <DialogTitle className="qx-h3 text-fg">{c.send.title}</DialogTitle>
          <DialogDescription asChild>
            <div className="space-y-2">
              <p className="qx-small font-medium text-fg">{campaign?.title}</p>
              {campaign && <SegmentChip segment={campaign.segment} />}
            </div>
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5">
          {/* Ne zaman */}
          <fieldset className="space-y-2">
            <legend className="qx-small font-semibold text-fg">{c.send.when}</legend>
            <div role="radiogroup" aria-label={c.send.when} className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {(['now', 'schedule'] as const).map((m) => (
                <label
                  key={m}
                  className={cn(
                    'flex min-h-[44px] cursor-pointer items-center gap-2 rounded-control border px-3 py-2 qx-small font-medium transition-colors duration-fast',
                    'focus-within:ring-2 focus-within:ring-focus focus-within:ring-offset-2 focus-within:ring-offset-background',
                    mode === m ? 'border-brand bg-brand-subtle text-brand' : 'border-subtle bg-surface-1 text-fg hover:bg-surface-3'
                  )}
                >
                  <input type="radio" name={ids.mode} value={m} checked={mode === m} onChange={() => setMode(m)} className="sr-only" />
                  {m === 'now' ? <Send aria-hidden className="h-4 w-4" /> : <CalendarClock aria-hidden className="h-4 w-4" />}
                  {m === 'now' ? c.send.modeNow : c.send.modeSchedule}
                </label>
              ))}
            </div>
            {mode === 'schedule' && (
              <div className="space-y-1.5 pt-1">
                <Label htmlFor={ids.day} className="qx-small font-medium text-fg">
                  {c.send.dayLabel}
                </Label>
                <Input
                  id={ids.day}
                  type="date"
                  value={day}
                  min={bounds.min}
                  max={bounds.max}
                  onChange={(e) => setDay(e.target.value)}
                  aria-describedby={ids.dayHelp}
                  error={!dayValid}
                  className="max-w-[14rem]"
                />
                <p id={ids.dayHelp} className="qx-caption text-fg-muted">
                  {c.send.dayHelp}
                </p>
              </div>
            )}
          </fieldset>

          {/* Kontrol grubu */}
          <fieldset className="space-y-2" aria-describedby={ids.holdoutHelp}>
            <legend className="qx-small font-semibold text-fg">{c.send.holdout}</legend>
            <p id={ids.holdoutHelp} className="qx-caption text-fg-muted">
              {c.send.holdoutHelp}
            </p>
            <div role="radiogroup" aria-label={c.send.holdout} className="flex flex-wrap gap-2">
              {HOLDOUT_OPTIONS.map((h) => (
                <label
                  key={h}
                  className={cn(
                    'inline-flex min-h-[44px] min-w-[64px] cursor-pointer items-center justify-center rounded-chip border px-3 qx-small font-medium transition-colors duration-fast',
                    'focus-within:ring-2 focus-within:ring-focus focus-within:ring-offset-2 focus-within:ring-offset-background',
                    holdout === h ? 'border-brand bg-brand-subtle text-brand' : 'border-subtle bg-surface-1 text-fg hover:bg-surface-3'
                  )}
                >
                  <input type="radio" name={ids.holdout} value={h} checked={holdout === h} onChange={() => setHoldout(h)} className="sr-only" />
                  {h === 0 ? c.send.holdoutOff : c.send.holdoutPct(h)}
                </label>
              ))}
            </div>
            {p && holdout > 0 && !p.holdoutApplied && (
              <p className="qx-caption text-warning">{c.send.holdoutTooSmall(HOLDOUT_MIN_POOL)}</p>
            )}
          </fieldset>

          {/* Etki önizlemesi */}
          <section aria-labelledby={`${ids.mode}-impact`} aria-busy={preview.isFetching || undefined} className="space-y-2">
            <h3 id={`${ids.mode}-impact`} className="qx-small font-semibold text-fg">
              {c.send.impactTitle}
            </h3>
            {preview.isLoading ? (
              <p role="status" className="flex items-center gap-2 qx-small text-fg-muted">
                <Loader2 aria-hidden className="h-4 w-4 animate-spin" /> {c.send.loading}
              </p>
            ) : preview.isError ? (
              <InlineError variant="banner" onRetry={() => void preview.refetch()}>
                {preview.error instanceof Error ? preview.error.message : c.send.previewError}
              </InlineError>
            ) : p ? (
              <div className="rounded-card border border-subtle bg-surface-1">
                <dl className="divide-y divide-[hsl(var(--border-subtle))]">
                  {rows.map((r) => (
                    <div key={r.label} className="flex items-center justify-between gap-3 px-3 py-2">
                      <dt className={cn('qx-small', r.muted ? 'text-fg-muted' : 'text-fg')}>{r.label}</dt>
                      <dd className="qx-small qx-num text-fg">{r.muted ? `−${fmtNumber(r.value, locale)}` : fmtNumber(r.value, locale)}</dd>
                    </div>
                  ))}
                  <div className="flex items-center justify-between gap-3 bg-brand-subtle px-3 py-2.5">
                    <dt className="qx-small font-semibold text-fg">{c.send.recipients}</dt>
                    <dd className="text-right">
                      <span className="qx-h3 qx-num block text-brand">{fmtNumber(recipients, locale)}</span>
                      <span className="qx-caption text-fg-muted">
                        {c.send.channels(fmtNumber(p.inAppCount, locale), fmtNumber(p.pushCount, locale))}
                      </span>
                    </dd>
                  </div>
                </dl>
              </div>
            ) : null}
            {p && recipients === 0 && <InlineError variant="banner" tone="warning">{c.send.nobody}</InlineError>}
            {mode === 'schedule' && p && recipients > 0 && <p className="qx-caption text-fg-muted">{c.send.estimateNote}</p>}
          </section>

          {mode === 'now' && (
            <p className="flex items-center gap-2 qx-caption text-fg-muted">
              <ShieldAlert aria-hidden className="h-4 w-4 shrink-0 text-warning" />
              {c.send.irreversible}
            </p>
          )}

          {error && <InlineError variant="banner">{error}</InlineError>}

          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button type="button" variant="ghost" onClick={onClose} disabled={pending}>
              {c.send.cancel}
            </Button>
            <Button type="button" onClick={() => void confirm()} disabled={!canConfirm} aria-busy={pending || undefined} className="shadow-none">
              {pending ? (
                <Loader2 aria-hidden className="h-4 w-4 animate-spin" />
              ) : mode === 'now' ? (
                <Send aria-hidden className="h-4 w-4" />
              ) : (
                <CalendarClock aria-hidden className="h-4 w-4" />
              )}
              {pending
                ? c.send.sending
                : mode === 'now'
                  ? c.send.confirmNow(fmtNumber(recipients, locale))
                  : `${c.send.confirmSchedule} · ${dayValid ? fmtDay(day, locale) : ''}`}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
