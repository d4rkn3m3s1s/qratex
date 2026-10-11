'use client';

import { StatusBadge } from '@/components/ds/data';
import type { Tone } from '@/components/states';
import { INTERVAL_LABEL, formatMoney, type StripeCheck, type StripeCheckStatus } from '@/lib/admin-pricing/contract';

export const STRIPE_STATUS: Record<StripeCheckStatus, { label: string; tone: Tone }> = {
  match: { label: 'Eşleşiyor', tone: 'success' },
  mismatch: { label: 'Uyuşmuyor', tone: 'danger' },
  inactive: { label: 'Stripe’ta pasif', tone: 'danger' },
  not_found: { label: 'Bulunamadı', tone: 'danger' },
  not_configured: { label: 'Doğrulanamadı', tone: 'warning' },
  unmapped: { label: 'Eşlenmemiş', tone: 'warning' },
  error: { label: 'Stripe hatası', tone: 'warning' },
};

/** Tek bir Stripe doğrulama sonucunun okunur özeti (rozet + metin; yalnız renge dayanmaz). */
export function StripeCheckLine({ check }: { check: StripeCheck }) {
  const meta = STRIPE_STATUS[check.status];
  const s = check.stripe;
  return (
    <div className="space-y-1 text-sm">
      <div className="flex flex-wrap items-center gap-2">
        <StatusBadge label={meta.label} tone={meta.tone} size="sm" srPrefix="Stripe durumu:" />
        {s ? (
          <span className="qx-small text-fg-muted">
            {s.productName ? `${s.productName} · ` : ''}
            {s.amount != null ? formatMoney(s.amount, s.currency) : 'tutar yok'} ·{' '}
            {s.interval === 'other' ? 'desteklenmeyen döngü' : INTERVAL_LABEL[s.interval]} · {s.livemode ? 'canlı mod' : 'test modu'}
          </span>
        ) : null}
      </div>
      {check.mismatches.length ? (
        <ul className="qx-small list-disc space-y-0.5 pl-5 text-danger">
          {check.mismatches.map((m) => (
            <li key={m}>{m}</li>
          ))}
        </ul>
      ) : (
        <p className="qx-small text-fg-muted">{check.message}</p>
      )}
    </div>
  );
}
