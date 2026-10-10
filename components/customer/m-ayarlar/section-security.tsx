'use client';

import { CheckCircle2, CircleDashed, LogIn } from 'lucide-react';
import type { CustomerSettingsSnapshot } from '@/lib/customer-settings/contract';
import { useSettingsCopy } from './copy';
import { PasswordForm } from './password-form';
import { SessionsCard } from './sessions-card';
import { TwoFactorCard } from './two-factor-card';
import { Panel } from './ui';

/**
 * Güvenlik: giriş yöntemleri, şifre, 2FA ve oturumlar. Şifre kartının başlığı eskiden ham
 * i18n anahtarı ("customerSettings.passwordTitle") gösteriyordu (B9) — artık yüzeyin kendi metni.
 */
export function SecuritySection({ data }: { data: CustomerSettingsSnapshot }) {
  const { copy } = useSettingsCopy();
  const s = data.security;
  const methods: Array<{ key: string; label: string; on: boolean }> = [
    { key: 'password', label: copy.signInPassword, on: s.hasPassword },
    { key: 'google', label: copy.signInGoogle, on: s.providers.includes('google') },
    ...s.providers
      .filter((p) => p !== 'google')
      .map((p) => ({ key: p, label: p.charAt(0).toLocaleUpperCase('tr-TR') + p.slice(1), on: true })),
  ];

  return (
    <div className="flex flex-col gap-4">
      <Panel title={copy.signInTitle} icon={<LogIn />}>
        <ul className="divide-y divide-[hsl(var(--border-subtle))]">
          {methods.map((m) => (
            <li key={m.key} className="flex min-h-11 items-center justify-between gap-3 py-2">
              <span className="text-sm font-medium text-fg">{m.label}</span>
              <span className={`qx-small inline-flex items-center gap-1.5 ${m.on ? 'text-success' : 'text-fg-muted'}`}>
                {m.on ? <CheckCircle2 aria-hidden className="h-4 w-4" /> : <CircleDashed aria-hidden className="h-4 w-4" />}
                {m.on ? copy.statusOn : copy.statusOff}
              </span>
            </li>
          ))}
        </ul>
      </Panel>
      <PasswordForm hasPassword={s.hasPassword} lastChangedAt={s.lastPasswordChangeAt} />
      <TwoFactorCard twoFactor={s.twoFactor} />
      <SessionsCard security={s} />
    </div>
  );
}
