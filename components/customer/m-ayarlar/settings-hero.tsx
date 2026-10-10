'use client';

import { BellRing, BellOff, ShieldCheck, ShieldAlert } from 'lucide-react';
import type { CustomerSettingsSnapshot } from '@/lib/customer-settings/contract';
import { cn } from '@/lib/utils';
import { AvatarView } from './avatar-view';
import { useSettingsCopy } from './copy';
import { dateFormatter } from './ui';

/**
 * Hesap kimlik başlığı (ops kaydı: düz yüzey, glow yok). Durum çipleri ikon + metin taşır,
 * yalnız renge dayanmaz.
 */
export function SettingsHero({ data }: { data: CustomerSettingsSnapshot }) {
  const { copy, locale } = useSettingsCopy();
  const since = dateFormatter(locale, { month: 'long', year: 'numeric' }).format(new Date(data.profile.memberSince));
  const tfa = data.security.twoFactor.enabled;
  const devices = data.notifications.pushDevices.length;

  return (
    <section
      aria-labelledby="settings-hero-name"
      className="flex min-w-0 flex-col gap-4 rounded-card border border-subtle bg-surface-1 p-4 qx-elevation-1 sm:flex-row sm:items-center sm:p-5"
    >
      <AvatarView image={data.profile.image} name={data.profile.name} frame={data.frame.equipped} hue={data.frame.hue} size={64} />
      <div className="min-w-0 flex-1">
        <h2 id="settings-hero-name" className="qx-h2 truncate text-fg">
          {data.profile.name || data.profile.email}
        </h2>
        <p className="qx-small truncate text-fg-muted">{data.profile.email}</p>
        <p className="qx-caption mt-0.5 text-fg-muted">{copy.memberSince(since)}</p>
      </div>
      <ul className="flex flex-wrap gap-2" aria-label={copy.securityChipsAria}>
        <li
          className={cn(
            'qx-caption inline-flex min-h-8 items-center gap-1.5 rounded-chip border px-2.5 font-medium',
            tfa ? 'border-success-border bg-success-subtle text-success' : 'border-warning-border bg-warning-subtle text-warning',
          )}
        >
          {tfa ? <ShieldCheck aria-hidden className="h-3.5 w-3.5" /> : <ShieldAlert aria-hidden className="h-3.5 w-3.5" />}
          {tfa ? copy.chip2faOn : copy.chip2faOff}
        </li>
        <li className="qx-caption inline-flex min-h-8 items-center gap-1.5 rounded-chip border border-subtle bg-surface-muted px-2.5 font-medium text-fg-muted">
          {devices > 0 ? <BellRing aria-hidden className="h-3.5 w-3.5" /> : <BellOff aria-hidden className="h-3.5 w-3.5" />}
          {devices > 0 ? copy.chipPushOn(devices) : copy.chipPushOff}
        </li>
      </ul>
    </section>
  );
}
