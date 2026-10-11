'use client';

import { useState } from 'react';
import { signOut } from '@/lib/native/sign-out';
import { LogOut, MonitorSmartphone } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { ConfirmAction } from '@/components/states';
import type { SecurityState } from '@/lib/customer-settings/contract';
import { revokeSessions, SettingsApiError } from './api';
import { errorText, useSettingsCopy } from './copy';
import { dateFormatter, Panel } from './ui';
import { useSettingsCache } from './use-settings';

/**
 * Oturumlar — `sessionVersion` ile toplu iptal. JWT tabanlı oturumlarda cihaz başına kayıt
 * tutulmadığı için ayrıntılı liste UYDURULMAZ; bu cihaz + son toplu çıkış zamanı gösterilir.
 */
export function SessionsCard({ security }: { security: SecurityState }) {
  const { copy, locale } = useSettingsCopy();
  const cache = useSettingsCache();
  const [open, setOpen] = useState<null | 'others' | 'all'>(null);
  const fmt = dateFormatter(locale, { dateStyle: 'medium', timeStyle: 'short' });

  const run = async (scope: 'others' | 'all') => {
    try {
      const out = await revokeSessions(scope);
      if (scope === 'all' || !out.reissued) {
        if (scope === 'others') toast.message(copy.reloginNeeded);
        await signOut({ callbackUrl: `/auth/login?callbackUrl=${encodeURIComponent('/customer/me/settings?tab=security')}` });
        return;
      }
      cache.patch((prev) => ({ ...prev, security: { ...prev.security, lastSessionsRevokedAt: out.revokedAt } }));
      toast.success(copy.signOutOthersDone);
    } catch (e) {
      throw new Error(errorText(copy, e instanceof SettingsApiError ? e.code : undefined, e instanceof Error ? e.message : undefined));
    }
  };

  return (
    <Panel title={copy.sessionsTitle} description={copy.sessionsDesc} icon={<MonitorSmartphone />}>
      <div className="rounded-control border border-subtle bg-surface-muted p-3">
        <p className="text-sm font-semibold text-fg">
          {copy.thisDevice}
          {security.currentDevice ? <span className="font-normal text-fg-muted"> · {security.currentDevice}</span> : null}
        </p>
        {security.sessionStartedAt ? (
          <p className="qx-caption text-fg-muted">{copy.thisDeviceSince(fmt.format(new Date(security.sessionStartedAt)))}</p>
        ) : null}
        {security.lastSessionsRevokedAt ? (
          <p className="qx-caption text-fg-muted">{copy.lastRevoked(fmt.format(new Date(security.lastSessionsRevokedAt)))}</p>
        ) : null}
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        <Button type="button" variant="outline" className="gap-2" onClick={() => setOpen('others')}>
          <LogOut aria-hidden className="h-4 w-4" />
          {copy.signOutOthers}
        </Button>
        <Button type="button" variant="ghost" className="gap-2 text-danger" onClick={() => setOpen('all')}>
          <LogOut aria-hidden className="h-4 w-4" />
          {copy.signOutAll}
        </Button>
      </div>
      <ConfirmAction
        open={open !== null}
        onOpenChange={(o) => !o && setOpen(null)}
        tone="warning"
        title={open === 'all' ? copy.signOutAllTitle : copy.signOutOthersTitle}
        description={open === 'all' ? copy.signOutAllBody : copy.signOutOthersBody}
        confirmLabel={copy.signOutConfirm}
        cancelLabel={copy.tfaCancel}
        irreversibleNote={false}
        onConfirm={() => run(open ?? 'others')}
      />
    </Panel>
  );
}
