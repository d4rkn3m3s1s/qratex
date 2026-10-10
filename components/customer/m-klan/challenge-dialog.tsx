'use client';

import { useEffect, useId, useMemo, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Check, Search, Swords } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ChoiceChips } from '@/components/ds/a11y';
import { InlineError, SkeletonList } from '@/components/states';
import { cn } from '@/lib/utils';
import { BATTLE_DURATION_OPTIONS, BATTLE_MAX_STAKE, BATTLE_STAKE_PRESETS } from '@/lib/squads/rules';
import type { SquadSearchResult } from '@/lib/squads/dto';
import { newIdempotencyKey, squadApi, squadKeys } from './api';
import { useKlanCopy, useKlanLocale } from './copy';
import { SquadEmblem } from './parts';
import { useErrorText, useRefreshSquad } from './use-klan';

type Step = 1 | 2 | 3;

/**
 * Meydan okuma "bahis fişi" (Bulgu 4): rakip ara → süre + havuz (güncel bakiye, bakiye üstü
 * seçenekler kapalı, "şimdi düşülür / iade koşulları" açıklaması) → özet ve onay.
 * Önceden rakip yalnız top-10'dan seçiliyor, varsayılan 500 puan habersiz düşülüyordu.
 */
export function ChallengeDialog({
  open,
  onOpenChange,
  balance,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  balance: number;
}) {
  const copy = useKlanCopy();
  const { tag } = useKlanLocale();
  const errorText = useErrorText();
  const refresh = useRefreshSquad();
  const searchId = useId();
  const customId = useId();
  const [step, setStep] = useState<Step>(1);
  const [q, setQ] = useState('');
  const [debounced, setDebounced] = useState('');
  const [target, setTarget] = useState<SquadSearchResult | null>(null);
  const [hours, setHours] = useState<number>(24);
  const [stake, setStake] = useState<number>(0);
  const [custom, setCustom] = useState('');
  const [idemKey, setIdemKey] = useState('');

  useEffect(() => {
    const t = setTimeout(() => setDebounced(q.trim()), 300);
    return () => clearTimeout(t);
  }, [q]);

  useEffect(() => {
    if (open) {
      setStep(1);
      setTarget(null);
      setHours(24);
      setStake(0);
      setCustom('');
      setQ('');
      setIdemKey(newIdempotencyKey());
    }
  }, [open]);

  const results = useQuery({
    queryKey: squadKeys.search(debounced),
    queryFn: () => squadApi.search(debounced),
    enabled: open,
    staleTime: 30_000,
  });

  const send = useMutation({
    mutationFn: () => squadApi.challenge({ targetSquadId: target!.id, durationHours: hours, rewardPool: stake }, idemKey),
    onSuccess: async () => {
      toast.success(copy.sent);
      onOpenChange(false);
      await refresh();
    },
  });

  const stakeOptions = useMemo(
    () =>
      BATTLE_STAKE_PRESETS.map((v) => ({
        value: String(v),
        label: v === 0 ? copy.honor : v.toLocaleString(tag),
        disabled: v > balance,
      })),
    [balance, copy.honor, tag]
  );
  const customNumber = custom.trim() === '' ? null : Number.parseInt(custom, 10);
  const customInvalid = customNumber !== null && (!Number.isFinite(customNumber) || customNumber < 0 || customNumber > BATTLE_MAX_STAKE);
  const stakeTooHigh = stake > balance;

  return (
    <Dialog open={open} onOpenChange={(o) => !send.isPending && onOpenChange(o)}>
      <DialogContent className="max-h-[calc(100dvh-2rem)] max-w-lg overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Swords className="h-5 w-5 text-brand" aria-hidden /> {copy.slipTitle}
          </DialogTitle>
          <DialogDescription>
            <span className="sr-only">
              {step}/3:{' '}
            </span>
            {step === 1 ? copy.slipStep1 : step === 2 ? copy.slipStep2 : copy.slipStep3}
          </DialogDescription>
        </DialogHeader>

        <ol className="flex gap-1.5" aria-hidden>
          {[1, 2, 3].map((s) => (
            <li key={s} className={cn('h-1 flex-1 rounded-full', s <= step ? 'bg-brand' : 'bg-surface-3')} />
          ))}
        </ol>

        {step === 1 ? (
          <div className="space-y-3">
            <div className="relative">
              <label htmlFor={searchId} className="sr-only">
                {copy.searchLabel}
              </label>
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-fg-subtle" aria-hidden />
              <Input
                id={searchId}
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder={copy.searchPlaceholder}
                className="pl-9"
                autoComplete="off"
                maxLength={40}
              />
            </div>
            {results.isPending ? (
              <SkeletonList rows={4} />
            ) : results.isError ? (
              <InlineError variant="banner" onRetry={() => results.refetch()}>
                {errorText(results.error)}
              </InlineError>
            ) : results.data.items.length === 0 ? (
              <p className="py-6 text-center text-sm text-fg-muted">{copy.noResults}</p>
            ) : (
              <ul className="max-h-72 space-y-1 overflow-y-auto" role="listbox" aria-label={copy.searchLabel}>
                {results.data.items.map((s) => {
                  const selected = target?.id === s.id;
                  return (
                    <li key={s.id} role="none">
                      <button
                        type="button"
                        role="option"
                        aria-selected={selected}
                        aria-disabled={s.busy}
                        disabled={s.busy}
                        onClick={() => setTarget(s)}
                        className={cn(
                          'flex min-h-12 w-full items-center gap-3 rounded-xl border px-3 py-2 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus',
                          selected ? 'border-brand-border bg-brand-subtle' : 'border-transparent hover:bg-surface-2',
                          s.busy && 'cursor-not-allowed opacity-60'
                        )}
                      >
                        <SquadEmblem id={s.id} name={s.name} size="sm" />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-semibold text-fg">{s.name}</span>
                          <span className="block text-xs text-fg-muted">
                            {copy.level(s.level)} · {copy.memberCount(s.memberCount)} · {copy.pts(s.totalPoints)}
                          </span>
                        </span>
                        {s.busy ? (
                          <span className="shrink-0 rounded-full bg-warning-subtle px-2 py-0.5 text-xs font-medium text-warning">{copy.busy}</span>
                        ) : selected ? (
                          <Check className="h-4 w-4 shrink-0 text-brand" aria-hidden />
                        ) : null}
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        ) : null}

        {step === 2 ? (
          <div className="space-y-5">
            <div className="space-y-2">
              <p id={`${customId}-dur`} className="text-sm font-medium text-fg">
                {copy.durationLabel}
              </p>
              <ChoiceChips
                aria-labelledby={`${customId}-dur`}
                options={BATTLE_DURATION_OPTIONS.map((h) => ({ value: String(h), label: copy.hours(h) }))}
                value={String(hours)}
                onChange={(v) => v && setHours(Number(v))}
                register="play"
              />
            </div>
            <div className="space-y-2">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <p id={`${customId}-stake`} className="text-sm font-medium text-fg">
                  {copy.stakeLabel}
                </p>
                <p className="text-xs text-fg-muted">{copy.balance(balance)}</p>
              </div>
              <ChoiceChips
                aria-labelledby={`${customId}-stake`}
                options={stakeOptions}
                value={custom.trim() === '' ? String(stake) : null}
                onChange={(v) => {
                  if (v == null) return;
                  setCustom('');
                  setStake(Number(v));
                }}
                register="play"
              />
              <div className="space-y-1">
                <label htmlFor={customId} className="text-xs font-medium text-fg-muted">
                  {copy.stakeCustom}
                </label>
                <Input
                  id={customId}
                  inputMode="numeric"
                  pattern="[0-9]*"
                  value={custom}
                  onChange={(e) => {
                    const v = e.target.value.replace(/[^0-9]/g, '').slice(0, 6);
                    setCustom(v);
                    const n = Number.parseInt(v, 10);
                    setStake(Number.isFinite(n) ? n : 0);
                  }}
                  aria-invalid={customInvalid || stakeTooHigh || undefined}
                  className="max-w-[12rem]"
                />
              </div>
              {stakeTooHigh ? <InlineError>{copy.stakeTooHigh}</InlineError> : null}
              <p className="rounded-xl border border-subtle bg-surface-2 p-3 text-sm text-fg-muted">{copy.slipDebitNote(stake)}</p>
            </div>
          </div>
        ) : null}

        {step === 3 && target ? (
          <div className="space-y-3">
            <div className="flex items-center gap-3 rounded-xl border border-brand-border bg-brand-subtle p-3">
              <SquadEmblem id={target.id} name={target.name} />
              <div className="min-w-0">
                <p className="truncate font-semibold text-fg">{target.name}</p>
                <p className="text-sm text-fg-muted">{copy.stake(stake)}</p>
              </div>
            </div>
            <p className="text-sm text-fg">{copy.slipSummary(target.name, copy.hours(hours))}</p>
            <p className="text-sm text-fg-muted">{copy.slipDebitNote(stake)}</p>
            <p className="text-xs text-fg-muted">{copy.stakeNote}</p>
            {send.isError ? <InlineError variant="banner">{errorText(send.error)}</InlineError> : null}
          </div>
        ) : null}

        <DialogFooter className="gap-2 sm:gap-0">
          {step > 1 ? (
            <Button type="button" variant="outline" onClick={() => setStep((s) => (s - 1) as Step)} disabled={send.isPending}>
              {copy.back}
            </Button>
          ) : (
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              {copy.cancel}
            </Button>
          )}
          {step < 3 ? (
            <Button
              type="button"
              onClick={() => setStep((s) => (s + 1) as Step)}
              disabled={step === 1 ? !target || target.busy : stakeTooHigh || customInvalid}
            >
              {copy.next}
            </Button>
          ) : (
            <Button type="button" onClick={() => send.mutate()} loading={send.isPending} disabled={!target || stakeTooHigh}>
              <Swords className="h-4 w-4" aria-hidden /> {copy.send}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
