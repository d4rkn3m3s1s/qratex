'use client';

/**
 * Statü (eski /customer/lounge içeriği, gerçek veriyle):
 *  - Puan bakiyesi + seviye + lig ve bir sonraki lige kalan puan (lig kuralları sunucudan).
 *  - VIP yalnız GERÇEKTEN atanmışsa (çarpanın fiilen uygulandığı koşul) ve somut avantajıyla
 *    ("Geri bildirim puanların ×1.25"). Uydurma ayrıcalık listesi ve "otomatik yükselirsin"
 *    vaadi kaldırıldı.
 *  - Doğum günü bir "an": bugünse talep, değilse tek satır geri sayım, tarih yoksa davet.
 *    "Ayarlarda düzenle" çıkmazı yok (tarih kilitli; kilit bilgisi gösterilir).
 */
import { useState } from 'react';
import Link from 'next/link';
import { Cake, Crown, Lock, Trophy } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { SectionCard, TONE_CALLOUT } from '@/components/states';
import { LeagueEmblem, PointsChip } from '@/components/ds/play';
import { moments } from '@/lib/moments/client';
import { cn, formatDate } from '@/lib/utils';
import type { WalletBirthday, WalletStatus } from '@/lib/wallet-card/dto';
import type { CardCopy, CardLocale } from './copy';

function useNf(locale: CardLocale) {
  return new Intl.NumberFormat(locale === 'en' ? 'en-US' : 'tr-TR');
}

function LeagueProgress({ status, copy, locale }: { status: WalletStatus; copy: CardCopy; locale: CardLocale }) {
  const nf = useNf(locale);
  const next = status.nextLeague;
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-3">
        <p className="qx-small font-medium text-fg">
          {next && status.toNextLeague !== null ? copy.toNext(nf.format(status.toNextLeague), next.name) : copy.topLeague}
        </p>
        <span className="qx-caption qx-num text-fg-muted">%{status.leagueProgress}</span>
      </div>
      <div
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={status.leagueProgress}
        aria-valuetext={next && status.toNextLeague !== null ? copy.toNext(nf.format(status.toNextLeague), next.name) : copy.topLeague}
        aria-label={copy.league(status.league.name)}
        className="h-2 w-full overflow-hidden rounded-full bg-surface-muted"
      >
        <div
          className="h-full rounded-full bg-brand transition-[width] duration-slow ease-standard"
          style={{ width: `${Math.max(2, status.leagueProgress)}%` }}
        />
      </div>
      <p className="qx-caption text-fg-muted">{copy.leagueNote}</p>
    </div>
  );
}

function BirthdayMoment({
  birthday,
  copy,
  locale,
  onClaimed,
}: {
  birthday: WalletBirthday;
  copy: CardCopy;
  locale: CardLocale;
  onClaimed: () => void;
}) {
  const nf = useNf(locale);
  const [busy, setBusy] = useState(false);
  const amount = nf.format(birthday.bonusAmount);

  const claim = async () => {
    setBusy(true);
    try {
      const res = await fetch('/api/birthday', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'claim' }),
      });
      const body = (await res.json().catch(() => ({}))) as { error?: string; pointsEarned?: number };
      if (!res.ok) throw new Error(typeof body.error === 'string' ? body.error : copy.birthdayFailed);
      const earned = typeof body.pointsEarned === 'number' ? body.pointsEarned : birthday.bonusAmount;
      // An Motoru puan kapsülü; Host yoksa yedek bildirim (ikilenmez).
      if (!moments.points({ points: earned })) toast.success(copy.birthdaySuccess(nf.format(earned)));
      moments.refresh();
      onClaimed();
    } catch (error) {
      toast.error(error instanceof Error && error.message ? error.message : copy.birthdayFailed);
      onClaimed(); // durum (ör. popup'tan zaten alındı) sunucudan tazelensin
    } finally {
      setBusy(false);
    }
  };

  if (birthday.state === 'unset') {
    return (
      <div className="flex flex-col gap-3 rounded-control border border-subtle bg-surface-muted/60 p-3 sm:flex-row sm:items-center">
        <p className="qx-small flex min-w-0 flex-1 items-start gap-2 text-fg">
          <Cake className="mt-0.5 h-4 w-4 shrink-0 text-brand" aria-hidden />
          {copy.birthdayUnset(amount)}
        </p>
        <Button asChild variant="outline" size="sm" className="min-h-11 sm:min-h-9">
          <Link href="/customer/me/settings">{copy.birthdayUnsetCta}</Link>
        </Button>
      </div>
    );
  }

  if (birthday.state === 'today' && birthday.claim === 'OK') {
    return (
      <div className={cn('flex flex-col gap-3 rounded-card border p-4 sm:flex-row sm:items-center', TONE_CALLOUT.brand)}>
        <div className="flex min-w-0 flex-1 items-start gap-3">
          <span aria-hidden className="mt-0.5 shrink-0 text-brand">
            <Cake className="h-5 w-5" />
          </span>
          <div className="min-w-0">
            <p className="qx-body font-semibold text-fg">{copy.birthdayToday}</p>
            <p className="qx-small text-fg-muted">{copy.birthdayClaimBody(amount)}</p>
          </div>
        </div>
        <Button type="button" onClick={claim} loading={busy} className="min-h-11 w-full sm:w-auto">
          {copy.birthdayClaim(amount)}
        </Button>
      </div>
    );
  }

  const line =
    birthday.claim === 'ALREADY_CLAIMED'
      ? copy.birthdayClaimed
      : birthday.claim === 'TOO_RECENT'
        ? copy.birthdayTooRecent
        : birthday.daysUntil !== null
          ? copy.birthdayIn(birthday.daysUntil, amount)
          : null;
  const dateLabel =
    birthday.month && birthday.day
      ? formatDate(new Date(Date.UTC(2000, birthday.month - 1, birthday.day, 12)), { day: 'numeric', month: 'long', year: undefined, timeZone: 'UTC' }, locale)
      : null;

  return (
    <div className="space-y-1.5 rounded-control border border-subtle bg-surface-muted/60 p-3">
      <p className="qx-small flex items-start gap-2 text-fg">
        <Cake className="mt-0.5 h-4 w-4 shrink-0 text-brand" aria-hidden />
        <span className="min-w-0">
          {line}
          {dateLabel && <span className="text-fg-muted"> · {dateLabel}</span>}
        </span>
      </p>
      <p className="qx-caption flex items-start gap-2 text-fg-muted">
        <Lock className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
        {copy.birthdayLocked}
      </p>
    </div>
  );
}

export function StatusPanel({
  status,
  birthday,
  copy,
  locale,
  onBirthdayClaimed,
}: {
  status: WalletStatus;
  birthday: WalletBirthday;
  copy: CardCopy;
  locale: CardLocale;
  onBirthdayClaimed: () => void;
}) {
  const vip = status.vip;
  return (
    <SectionCard
      title={copy.statusTitle}
      icon={<Trophy />}
      actions={
        <Button asChild variant="ghost" size="sm" className="min-h-11 sm:min-h-9">
          <Link href="/customer/leaderboard">{copy.leagueLink}</Link>
        </Button>
      }
    >
      <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-3">
          <LeagueEmblem leagueKey={status.league.key} name={status.league.name} size="md" aria-hidden />
          <div className="min-w-0 flex-1">
            <p className="qx-body font-semibold text-fg">{copy.league(status.league.name)}</p>
            <p className="qx-caption text-fg-muted">{copy.level(status.level)}</p>
          </div>
          <PointsChip value={status.points} size="md" />
        </div>

        <LeagueProgress status={status} copy={copy} locale={locale} />

        {vip && (
          <div className="flex items-start gap-3 rounded-control border border-subtle p-3">
            <span
              aria-hidden
              className="grid h-9 w-9 shrink-0 place-items-center rounded-control bg-warning-subtle text-warning ring-1 ring-inset ring-warning-border"
              style={vip.color ? { color: vip.color } : undefined}
            >
              {vip.icon && !/^[a-z]/i.test(vip.icon) ? <span className="text-base leading-none">{vip.icon}</span> : <Crown className="h-4 w-4" />}
            </span>
            <div className="min-w-0">
              <p className="qx-small font-semibold text-fg">{copy.vipTitle(vip.name)}</p>
              {vip.multiplier > 1 && <p className="qx-small text-fg-muted">{copy.vipMultiplier(String(vip.multiplier).replace('.', locale === 'en' ? '.' : ','))}</p>}
              {vip.expiresAt && (
                <p className="qx-caption text-fg-muted">
                  {copy.vipUntil(formatDate(vip.expiresAt, { day: 'numeric', month: 'long', year: 'numeric' }, locale))}
                </p>
              )}
            </div>
          </div>
        )}

        <BirthdayMoment birthday={birthday} copy={copy} locale={locale} onClaimed={onBirthdayClaimed} />
      </div>
    </SectionCard>
  );
}
