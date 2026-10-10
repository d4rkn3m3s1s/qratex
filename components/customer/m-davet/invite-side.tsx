'use client';

import { useId, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { CheckCircle2, Circle, Heart, KeyRound, Loader2, ScanLine, ShieldCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { SectionCard } from '@/components/ds/page';
import { InlineError } from '@/components/states';
import { cn } from '@/lib/utils';
import type { InviteOverview } from './invite-api';
import { formatDay, formatPoints, useInviteCopy } from './copy';

/** Beni davet eden + kendi hoş geldin bonusumun adımları (PENDING → COMPLETED şeffaf). */
export function InviteReferredBy({ referredBy }: { referredBy: NonNullable<InviteOverview['referredBy']> }) {
  const { copy, locale } = useInviteCopy();
  const pts = formatPoints(referredBy.bonusPoints, locale);
  const who = referredBy.name ? copy.referredBy(referredBy.name) : copy.referredByAnon;
  const pending = referredBy.status === 'PENDING';
  return (
    <SectionCard
      title={copy.referredTitle}
      icon={<Heart />}
      tone={referredBy.status === 'COMPLETED' ? 'success' : pending ? 'warning' : 'neutral'}
      stripe
      density="compact"
    >
      <p className="qx-small text-fg">{who}</p>
      {referredBy.status === 'COMPLETED' && <p className="qx-small mt-1 font-medium text-success">{copy.referredCompleted(pts)}</p>}
      {referredBy.status === 'EXPIRED' && <p className="qx-small mt-1 text-fg-muted">{copy.referredExpired}</p>}
      {pending && (
        <>
          <p className="qx-small mt-1 text-fg-muted">{copy.referredPending(pts)}</p>
          <ol className="mt-2 space-y-1">
            {[
              { done: true, label: copy.stepJoined },
              { done: referredBy.steps.verified, label: copy.stepVerified },
              { done: referredBy.steps.firstQr, label: copy.stepFirstQr },
            ].map((s) => {
              const Icon = s.done ? CheckCircle2 : Circle;
              return (
                <li key={s.label} className={cn('qx-small flex items-center gap-1.5', s.done ? 'text-success' : 'text-fg-muted')}>
                  <Icon aria-hidden className="size-4 shrink-0" />
                  {s.label}
                  <span className="sr-only">: {s.done ? copy.stepDone : copy.stepTodo}</span>
                </li>
              );
            })}
          </ol>
          {referredBy.expiresAt && <p className="qx-caption mt-2 text-fg-muted">{copy.expiresOn(formatDay(referredBy.expiresAt, locale))}</p>}
          {!referredBy.steps.firstQr && (
            <Button asChild className="mt-3 min-h-11 w-full">
              <Link href="/customer/scan">
                <ScanLine aria-hidden className="mr-2 size-4" />
                {copy.scanCta}
              </Link>
            </Button>
          )}
        </>
      )}
    </SectionCard>
  );
}

/** Kod uygulama — yalnız kayıttan sonraki pencerede görünür (denetim #2/#12). */
export function InviteApply({
  windowEndsAt,
  onApply,
  pending,
  error,
}: {
  windowEndsAt: string | null;
  onApply: (code: string) => void;
  pending: boolean;
  error: string | null;
}) {
  const { copy, locale } = useInviteCopy();
  const id = useId();
  const [value, setValue] = useState('');

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const code = value.trim();
    if (!code || pending) return;
    onApply(code);
  };

  return (
    <SectionCard title={copy.applyTitle} icon={<KeyRound />} density="compact">
      {windowEndsAt && <p className="qx-small mb-2 text-fg-muted">{copy.applyDesc(formatDay(windowEndsAt, locale))}</p>}
      <form onSubmit={submit} noValidate className="space-y-2">
        <label htmlFor={id} className="qx-small font-medium text-fg">
          {copy.applyLabel}
        </label>
        <div className="flex gap-2">
          <input
            id={id}
            value={value}
            onChange={(e) => setValue(e.target.value.toUpperCase().replace(/\s+/g, ''))}
            placeholder={copy.applyPlaceholder}
            autoComplete="off"
            autoCapitalize="characters"
            spellCheck={false}
            maxLength={32}
            aria-invalid={!!error}
            aria-describedby={error ? `${id}-err` : undefined}
            className="min-h-11 min-w-0 flex-1 rounded-control border border-strong bg-surface-1 px-3 font-mono uppercase tracking-widest text-fg placeholder:normal-case placeholder:tracking-normal placeholder:text-fg-subtle focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
          />
          <Button type="submit" disabled={pending || !value.trim()} className="min-h-11 shrink-0">
            {pending ? (
              <>
                <Loader2 aria-hidden className="mr-1.5 size-4 animate-spin motion-reduce:animate-none" />
                {copy.applying}
              </>
            ) : (
              copy.apply
            )}
          </Button>
        </div>
        {error && <InlineError id={`${id}-err`}>{error}</InlineError>}
      </form>
    </SectionCard>
  );
}

function UsageRow({ label, used, max }: { label: string; used: number; max: number }) {
  const { copy } = useInviteCopy();
  const pct = max > 0 ? Math.min(100, Math.round((used / max) * 100)) : 0;
  const high = pct >= 80;
  return (
    <li className="space-y-1">
      <p className="qx-small text-fg">{label}</p>
      <div
        role="meter"
        aria-label={copy.usageMeter(label)}
        aria-valuemin={0}
        aria-valuemax={max}
        aria-valuenow={Math.min(used, max)}
        className="h-1.5 w-full overflow-hidden rounded-full bg-surface-3"
      >
        <div className={cn('h-full rounded-full', high ? 'bg-warning' : 'bg-brand')} style={{ width: `${pct}%` }} />
      </div>
    </li>
  );
}

/** Kurallar ve sınırlar — limitler sunucudaki GERÇEK değerlerle, kullanılan/kalan şeffaf. */
export function InviteRules({ limits }: { limits: InviteOverview['limits'] }) {
  const { copy, locale } = useInviteCopy();
  const n = (v: number) => formatPoints(v, locale);
  return (
    <SectionCard title={copy.rulesTitle} icon={<ShieldCheck />} density="compact">
      <ul className="space-y-3">
        <UsageRow
          label={copy.ruleMonthly(n(limits.monthly.used), n(limits.monthly.max), formatDay(limits.monthly.resetsAt, locale))}
          used={limits.monthly.used}
          max={limits.monthly.max}
        />
        <UsageRow label={copy.ruleLifetime(n(limits.lifetime.used), n(limits.lifetime.max))} used={limits.lifetime.used} max={limits.lifetime.max} />
        {limits.codeUsage && (
          <UsageRow label={copy.ruleCodeUsage(n(limits.codeUsage.used), n(limits.codeUsage.max))} used={limits.codeUsage.used} max={limits.codeUsage.max} />
        )}
      </ul>
      <ul className="qx-small mt-3 list-disc space-y-1.5 pl-5 text-fg-muted marker:text-fg-subtle">
        <li>{copy.ruleQualify(limits.pendingTtlDays)}</li>
        <li>{copy.ruleApplyWindow(limits.applyWindowDays)}</li>
        <li>{copy.ruleNudge(limits.nudgeCooldownHours)}</li>
        <li>{copy.ruleFair}</li>
      </ul>
    </SectionCard>
  );
}

