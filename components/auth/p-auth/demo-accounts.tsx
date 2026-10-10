'use client';

import { Loader2, ShieldCheck, Store, User } from 'lucide-react';
import { useAppT } from '@/lib/app-locale';
import { cn } from '@/lib/utils';
import { useAuthCopy } from './copy';

export type DemoAccount = {
  role: 'ADMIN' | 'DEALER' | 'CUSTOMER';
  email: string;
  password: string;
  accountKey: 'admin' | 'dealer' | 'customer';
};

/** Demo hesapları proje sahibinin kararıyla KALIR (satış/deneme akışı). */
export const DEMO_ACCOUNTS: readonly DemoAccount[] = [
  { role: 'ADMIN', email: 'admin@qratex.com', password: 'Admin123!', accountKey: 'admin' },
  { role: 'DEALER', email: 'dealer@qratex.com', password: 'Dealer123!', accountKey: 'dealer' },
  { role: 'CUSTOMER', email: 'customer@qratex.com', password: 'Customer123!', accountKey: 'customer' },
];

const ICON = { ADMIN: ShieldCheck, DEALER: Store, CUSTOMER: User } as const;

/**
 * Demo giriş bloğu — tek dokunuşla rol bazlı giriş + görünür demo bilgileri.
 * Formun ALTINDA, ikincil bölüm olarak durur (eskiden tüketicinin ilk gördüğü şeydi).
 */
export function DemoAccounts({
  busy,
  pending,
  onPick,
}: {
  busy?: boolean;
  pending?: DemoAccount['role'] | null;
  onPick: (account: DemoAccount) => void;
}) {
  const t = useAppT();
  const copy = useAuthCopy();
  return (
    <section aria-labelledby="demo-accounts-title" className="space-y-3 rounded-control border border-dashed border-border bg-surface-0 p-4">
      <div>
        <h2 id="demo-accounts-title" className="qx-small font-semibold text-fg">
          {copy.demoTitle}
        </h2>
        <p className="qx-caption text-fg-muted">{copy.demoBody}</p>
      </div>
      <div className="grid grid-cols-3 gap-2">
        {DEMO_ACCOUNTS.map((account) => {
          const Icon = ICON[account.role];
          const label = t(`auth.demo.accounts.${account.accountKey}.label`);
          const isPending = pending === account.role;
          return (
            <button
              key={account.role}
              type="button"
              onClick={() => onPick(account)}
              disabled={busy}
              aria-busy={isPending || undefined}
              aria-label={`${t('auth.demoLoginAriaPrefix')} ${label}`}
              className={cn(
                'flex min-h-[4.5rem] flex-col items-center justify-center gap-1 rounded-control border border-border bg-surface-1 px-2 py-2',
                'transition-colors duration-150 hover:border-brand-border hover:bg-brand-subtle',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-60',
              )}
            >
              {isPending ? (
                <Loader2 className="h-5 w-5 animate-spin text-brand" aria-hidden />
              ) : (
                <Icon className="h-5 w-5 text-brand" aria-hidden />
              )}
              <span className="qx-small font-medium text-fg">{label}</span>
            </button>
          );
        })}
      </div>
      <details className="group">
        <summary className="qx-caption inline-flex min-h-11 cursor-pointer items-center rounded-sm font-medium text-fg-muted hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
          {copy.demoCredentialsTitle}
        </summary>
        <ul className="qx-caption space-y-0.5 pb-1 font-mono text-fg-muted">
          <li>{t('auth.demo.credentialAdmin')}</li>
          <li>{t('auth.demo.credentialDealer')}</li>
          <li>{t('auth.demo.credentialCustomer')}</li>
        </ul>
      </details>
    </section>
  );
}
