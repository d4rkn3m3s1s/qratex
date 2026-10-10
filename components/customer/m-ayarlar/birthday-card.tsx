'use client';

import { useId, useState } from 'react';
import Link from 'next/link';
import { Cake, Gift, Lock } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ConfirmAction, InlineError } from '@/components/states';
import type { BirthdayState } from '@/lib/customer-settings/contract';
import { saveBirthday, SettingsApiError } from './api';
import { errorText, useSettingsCopy } from './copy';
import { dateFormatter, Panel } from './ui';
import { useSettingsCache } from './use-settings';

function todayIstanbul(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Istanbul' }).format(new Date());
}

function shiftYears(ymd: string, years: number): string {
  const [y, m, d] = ymd.split('-');
  return `${Number(y) + years}-${m}-${d}`;
}

/**
 * Doğum günü — yalnız tarihi yönetir. Hediyenin talebi tek yerde: Cüzdan › Kartım (ve global
 * doğum günü penceresi). Tarih bir kez kaydedilir; kayıtlıysa kart salt okunurdur (denetim B11),
 * ilk kayıt onay penceresiyle yapılır. Kurallar sunucuda (`lib/birthday`): gelecek tarih ve
 * 120 yaş üstü reddedilir, hediye için kayıt en az 30 gün önce yapılmış olmalı.
 */
export function BirthdayCard({ birthday }: { birthday: BirthdayState }) {
  const { copy, locale } = useSettingsCopy();
  const cache = useSettingsCache();
  const inputId = useId();
  const [value, setValue] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const max = todayIstanbul();
  const min = shiftYears(max, -120);
  const valid = /^\d{4}-\d{2}-\d{2}$/.test(value) && value <= max && value >= min;
  const fmt = dateFormatter(locale, { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
  const display = (ymd: string) => fmt.format(new Date(`${ymd}T00:00:00Z`));

  return (
    <Panel title={copy.birthdayTitle} description={copy.birthdayDesc(birthday.bonusAmount)} icon={<Cake />}>
      {birthday.locked && birthday.date ? (
        <div className="space-y-3">
          <p className="flex items-center gap-2 text-base font-medium text-fg">
            <Lock aria-hidden className="h-4 w-4 text-fg-muted" />
            {display(birthday.date)}
          </p>
          <p className="qx-small text-fg-muted">
            {copy.birthdayLocked}{' '}
            <Link href="/customer/me/settings?tab=privacy" className="font-medium text-brand underline underline-offset-4">
              {copy.emailRequestChange}
            </Link>
          </p>
          {birthday.isToday ? (
            <div className="rounded-control border border-brand-border bg-brand-subtle p-3">
              <p className="font-medium text-fg">{copy.birthdayToday}</p>
              {birthday.canClaim ? (
                <Button asChild className="mt-2 gap-2">
                  <Link href="/customer/wallet/card">
                    <Gift aria-hidden className="h-4 w-4" />
                    {copy.birthdayClaimCta}
                  </Link>
                </Button>
              ) : (
                <p className="qx-small mt-1 text-fg-muted">
                  {birthday.claimReason === 'ALREADY_CLAIMED' ? copy.birthdayClaimed : birthday.claimReason === 'TOO_RECENT' ? copy.birthdayTooRecent : null}
                </p>
              )}
            </div>
          ) : null}
        </div>
      ) : (
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            if (!valid) {
              setError(copy.birthdayInvalid);
              return;
            }
            setError(null);
            setConfirmOpen(true);
          }}
        >
          <div className="space-y-1.5">
            <label htmlFor={inputId} className="text-sm font-medium text-fg">
              {copy.birthdayLabel}
            </label>
            <Input
              id={inputId}
              type="date"
              value={value}
              min={min}
              max={max}
              onChange={(e) => setValue(e.target.value)}
              className="max-w-xs text-base"
              autoComplete="bday"
              aria-invalid={!!error}
              aria-describedby={error ? `${inputId}-err` : undefined}
            />
            {error ? <InlineError id={`${inputId}-err`}>{error}</InlineError> : null}
          </div>
          <Button type="submit" disabled={!value}>
            {copy.birthdaySave}
          </Button>
          <ConfirmAction
            open={confirmOpen}
            onOpenChange={setConfirmOpen}
            tone="warning"
            title={copy.birthdayConfirmTitle}
            description={valid ? copy.birthdayConfirmBody(display(value)) : undefined}
            confirmLabel={copy.birthdayConfirm}
            cancelLabel={copy.birthdayCancel}
            irreversibleNote={false}
            onConfirm={async () => {
              try {
                await saveBirthday(value);
              } catch (e) {
                throw new Error(errorText(copy, e instanceof SettingsApiError ? e.code : undefined, e instanceof Error ? e.message : undefined));
              }
              toast.success(copy.birthdaySaved);
              await cache.refresh();
            }}
          />
        </form>
      )}
    </Panel>
  );
}
