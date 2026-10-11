'use client';

import { useCallback, useEffect, useId, useState } from 'react';
import Link from 'next/link';
import { Lock, ShieldCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { CONSENT_OPEN_EVENT, useConsent } from '@/lib/consent/client';
import { useAppLocale } from '@/lib/app-locale';
import { cn } from '@/lib/utils';
import { getConsentCopy } from './consent-copy';
import { applyConsentDecision, type ConsentSurface } from './consent-record';

/** Tercih merkezini belirli bir yüzeyden açar (footer, ayarlar, politika sayfası). */
export function openConsentCenter(surface: ConsentSurface = 'other'): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(CONSENT_OPEN_EVENT, { detail: { surface } }));
}

function CategoryRow({
  title,
  body,
  checked,
  disabled,
  onChange,
  locked,
  lockedLabel,
  hint,
}: {
  title: string;
  body: string;
  checked: boolean;
  disabled?: boolean;
  onChange?: (v: boolean) => void;
  locked?: boolean;
  lockedLabel?: string;
  hint?: string | null;
}) {
  const id = useId();
  return (
    <div className="flex items-start justify-between gap-4 rounded-xl border border-border bg-surface-muted/40 p-4">
      <div className="min-w-0 space-y-1">
        <label htmlFor={id} className="text-sm font-semibold text-fg">
          {title}
        </label>
        <p id={`${id}-desc`} className="text-sm leading-relaxed text-fg-muted">
          {body}
        </p>
        {hint ? <p className="text-xs text-warning">{hint}</p> : null}
      </div>
      {locked ? (
        <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-surface-muted px-2.5 py-1 text-xs font-medium text-fg-muted ring-1 ring-inset ring-border">
          <Lock className="h-3 w-3" aria-hidden />
          {lockedLabel}
        </span>
      ) : (
        <Switch
          id={id}
          aria-describedby={`${id}-desc`}
          checked={checked}
          disabled={disabled}
          onCheckedChange={(v) => onChange?.(v === true)}
          className="mt-0.5 shrink-0"
        />
      )}
    </div>
  );
}

/**
 * Tercih merkezi (P0-31): kategori bazlı anahtarlar, "Tümünü reddet" ile "Tümünü kabul et"
 * eşit ağırlıkta. Footer, Ayarlar › Gizlilik ve Çerez Politikası'ndan açılır
 * (`openConsentCenter`). Kararın kendisi çerezde, kanıtı sunucuda (`ConsentRecord`).
 */
export function ConsentCenter({ onDecided }: { onDecided?: () => void }) {
  const { locale } = useAppLocale();
  const copy = getConsentCopy(locale);
  const consent = useConsent();
  const [open, setOpen] = useState(false);
  const [surface, setSurface] = useState<ConsentSurface>('other');
  const [analytics, setAnalytics] = useState(false);
  const [replay, setReplay] = useState(false);

  useEffect(() => {
    const onOpen = (e: Event) => {
      const detail = (e as CustomEvent<{ surface?: ConsentSurface } | undefined>).detail;
      setSurface(detail?.surface ?? 'other');
      setOpen(true);
    };
    window.addEventListener(CONSENT_OPEN_EVENT, onOpen);
    return () => window.removeEventListener(CONSENT_OPEN_EVENT, onOpen);
  }, []);

  // Açılışta mevcut kararla doldur.
  useEffect(() => {
    if (!open) return;
    setAnalytics(consent.categories.analytics);
    setReplay(consent.categories.replay);
  }, [open, consent.categories.analytics, consent.categories.replay]);

  const decide = useCallback(
    (choices: { analytics: boolean; replay: boolean }) => {
      applyConsentDecision(choices, surface === 'other' ? 'settings' : surface);
      setOpen(false);
      onDecided?.();
    },
    [surface, onDecided, setOpen]
  );

  const decidedAt = consent.decided && consent.state ? new Date(consent.state.decidedAt) : null;
  const dateText = decidedAt
    ? new Intl.DateTimeFormat(locale === 'en' ? 'en-GB' : 'tr-TR', { dateStyle: 'long', timeStyle: 'short' }).format(decidedAt)
    : null;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <div className="mb-1 inline-flex h-10 w-10 items-center justify-center rounded-xl bg-brand-subtle text-brand ring-1 ring-inset ring-brand-border">
            <ShieldCheck className="h-5 w-5" aria-hidden />
          </div>
          <DialogTitle>{copy.centerTitle}</DialogTitle>
          <DialogDescription>{copy.centerDescription}</DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <CategoryRow title={copy.necessaryTitle} body={copy.necessaryBody} checked locked lockedLabel={copy.alwaysOn} />
          <CategoryRow
            title={copy.analyticsTitle}
            body={copy.analyticsBody}
            checked={analytics}
            onChange={(v) => {
              setAnalytics(v);
              if (!v) setReplay(false);
            }}
          />
          <CategoryRow
            title={copy.replayTitle}
            body={copy.replayBody}
            checked={analytics && replay}
            disabled={!analytics}
            onChange={setReplay}
            hint={!analytics ? copy.replayNeedsAnalytics : null}
          />
          <p className="text-xs leading-relaxed text-fg-muted">{copy.marketingNote}</p>
          <p className="text-xs leading-relaxed text-fg-muted">{copy.providers}</p>
          <p className={cn('text-xs', decidedAt ? 'text-fg-muted' : 'text-warning')} aria-live="polite">
            {dateText ? copy.lastDecision(dateText) : copy.noDecision}
          </p>
        </div>

        <DialogFooter className="flex-col gap-2 sm:flex-row sm:justify-between">
          <Link
            href="/cerez-politikasi"
            className="self-center text-sm text-fg-muted underline underline-offset-4 hover:text-fg sm:self-auto"
            onClick={() => setOpen(false)}
          >
            {copy.policyLink}
          </Link>
          <div className="grid w-full grid-cols-1 gap-2 sm:w-auto sm:grid-cols-3">
            <Button type="button" variant="outline" className="min-h-11 sm:min-h-9" onClick={() => decide({ analytics: false, replay: false })}>
              {copy.rejectAll}
            </Button>
            <Button type="button" variant="outline" className="min-h-11 sm:min-h-9" onClick={() => decide({ analytics: true, replay: true })}>
              {copy.acceptAll}
            </Button>
            <Button type="button" className="min-h-11 sm:min-h-9" onClick={() => decide({ analytics, replay: analytics && replay })}>
              {copy.save}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
