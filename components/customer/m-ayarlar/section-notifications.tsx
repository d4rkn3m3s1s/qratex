'use client';

import { useState } from 'react';
import { Bell, BellRing, Info, Smartphone, X } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { IconButton } from '@/components/ds/a11y';
import { InlineError } from '@/components/states';
import type { CustomerSettingsSnapshot, NotificationRow } from '@/lib/customer-settings/contract';
import type { NotificationChannel } from '@/lib/notification-prefs';
import { patchNotificationCell, removePushDevice, SettingsApiError } from './api';
import { errorText, useSettingsCopy } from './copy';
import { dateFormatter, Panel, SettingSwitchRow, useSaveState } from './ui';
import { usePushDevice } from './use-push-device';
import { useSettingsCache } from './use-settings';

/**
 * Bildirimler: (1) bu cihazda push aç/kapat, (2) tür × kanal matrisi — yalnız gerçekten
 * gönderilen hücreler (lib/customer-settings/notification-catalog), anında kayıt, hata olursa
 * değer geri alınır; (3) bildirim alan cihazlar. Eski "Bildirim Tercihleri" kartı (5 sahte
 * anahtar) kaldırıldı.
 */
export function NotificationsSection({ data }: { data: CustomerSettingsSnapshot }) {
  const { copy } = useSettingsCopy();
  return (
    <div className="flex flex-col gap-4">
      <PushThisDevice />
      <Panel title={copy.matrixTitle} description={copy.matrixDesc} icon={<Bell />}>
        <ul className="divide-y divide-[hsl(var(--border-subtle))]">
          {data.notifications.rows.map((row) => (
            <li key={row.key} className="py-3 first:pt-0 last:pb-0">
              <MatrixRow row={row} />
            </li>
          ))}
        </ul>
        <div className="mt-4 flex gap-3 rounded-control bg-surface-muted p-3">
          <Info aria-hidden className="mt-0.5 h-4 w-4 shrink-0 text-fg-muted" />
          <div>
            <p className="text-sm font-medium text-fg">{copy.alwaysOnTitle}</p>
            <p className="qx-small text-fg-muted">{copy.alwaysOnDesc}</p>
          </div>
        </div>
      </Panel>
      <PushDevices devices={data.notifications.pushDevices} />
    </div>
  );
}

function MatrixRow({ row }: { row: NotificationRow }) {
  const { copy } = useSettingsCopy();
  const meta = copy.rows[row.key] ?? { label: row.key, desc: '' };
  return (
    <div>
      <p className="text-base font-semibold text-fg">{meta.label}</p>
      <p className="qx-small text-fg-muted">{meta.desc}</p>
      <div className="mt-1">
        {row.cells.map((cell) => (
          <MatrixCell key={cell.channel} rowKey={row.key} rowLabel={meta.label} channel={cell.channel} enabled={cell.enabled} />
        ))}
      </div>
    </div>
  );
}

function MatrixCell({
  rowKey,
  rowLabel,
  channel,
  enabled,
}: {
  rowKey: string;
  rowLabel: string;
  channel: NotificationChannel;
  enabled: boolean;
}) {
  const { copy } = useSettingsCopy();
  const cache = useSettingsCache();
  const save = useSaveState();

  const setCell = (value: boolean) =>
    cache.patch((prev) => ({
      ...prev,
      notifications: {
        ...prev.notifications,
        rows: prev.notifications.rows.map((r) =>
          r.key === rowKey ? { ...r, cells: r.cells.map((c) => (c.channel === channel ? { ...c, enabled: value } : c)) } : r,
        ),
      },
    }));

  const onChange = (next: boolean) => {
    setCell(next); // iyimser
    void save.run(async () => {
      try {
        await patchNotificationCell(rowKey, channel, next);
      } catch (e) {
        setCell(!next); // geri al
        throw new Error(errorText(copy, e instanceof SettingsApiError ? e.code : undefined, copy.saveError));
      }
    });
  };

  return (
    <SettingSwitchRow
      label={copy.channel[channel]}
      description={channel === 'push' ? copy.pushCellHint : undefined}
      checked={enabled}
      onCheckedChange={onChange}
      state={save.state}
      error={save.message}
      icon={channelIcon(channel)}
      ariaLabel={copy.cellAria(rowLabel, copy.channel[channel])}
    />
  );
}

function channelIcon(channel: NotificationChannel) {
  if (channel === 'push') return <Smartphone />;
  if (channel === 'email') return <span className="text-[0.7rem] font-bold">@</span>;
  return <Bell />;
}

function PushThisDevice() {
  const { copy } = useSettingsCopy();
  const cache = useSettingsCache();
  const push = usePushDevice();
  const [error, setError] = useState<string | null>(null);

  const message: Record<string, string> = {
    unsupported: copy.pushUnsupported,
    unconfigured: copy.pushUnconfigured,
    denied: copy.pushDenied,
  };

  const toggle = async () => {
    setError(null);
    try {
      if (push.subscribed) {
        await push.disable();
        toast.success(copy.pushDisabled);
      } else {
        await push.enable();
        toast.success(copy.pushEnabled);
      }
      await cache.refresh();
    } catch (e) {
      const code = e instanceof SettingsApiError ? e.code : undefined;
      if (code === 'PUSH_DENIED') setError(copy.pushDenied);
      else if (code === 'PUSH_OTHER_ACCOUNT') setError(copy.pushOtherAccount);
      else setError(copy.pushError);
    }
  };

  return (
    <Panel title={copy.pushTitle} description={copy.pushDesc} icon={<BellRing />}>
      {push.support === 'checking' ? (
        <div className="h-11 w-48 rounded-control bg-surface-muted" aria-hidden />
      ) : push.support !== 'ready' ? (
        <p className="qx-small text-fg-muted" role="status">
          {message[push.support]}
        </p>
      ) : (
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-fg" role="status">
            {push.subscribed ? copy.pushOn : copy.pushOff}
          </p>
          <Button type="button" variant={push.subscribed ? 'outline' : 'default'} onClick={() => void toggle()} loading={push.busy} disabled={push.busy}>
            {push.subscribed ? copy.pushDisable : copy.pushEnable}
          </Button>
        </div>
      )}
      {error ? <InlineError className="mt-3">{error}</InlineError> : null}
    </Panel>
  );
}

function PushDevices({ devices }: { devices: CustomerSettingsSnapshot['notifications']['pushDevices'] }) {
  const { copy, locale } = useSettingsCopy();
  const cache = useSettingsCache();
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fmt = dateFormatter(locale);

  const remove = async (id: string) => {
    setPending(id);
    setError(null);
    try {
      await removePushDevice(id);
      cache.patch((prev) => ({
        ...prev,
        notifications: { ...prev.notifications, pushDevices: prev.notifications.pushDevices.filter((d) => d.id !== id) },
      }));
      toast.success(copy.deviceRemoved);
    } catch (e) {
      setError(errorText(copy, e instanceof SettingsApiError ? e.code : undefined, e instanceof Error ? e.message : undefined));
    } finally {
      setPending(null);
    }
  };

  return (
    <Panel title={copy.devicesTitle} icon={<Smartphone />}>
      {devices.length === 0 ? (
        <p className="qx-small text-fg-muted">{copy.devicesEmpty}</p>
      ) : (
        <ul className="divide-y divide-[hsl(var(--border-subtle))]">
          {devices.map((d) => {
            const label = d.label || copy.deviceUnknown;
            return (
              <li key={d.id} className="flex min-h-11 items-center gap-3 py-2.5">
                <Smartphone aria-hidden className="h-4 w-4 shrink-0 text-fg-muted" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-fg">{label}</p>
                  <p className="qx-caption text-fg-muted">
                    {d.lastUsedAt ? copy.deviceLastUsed(fmt.format(new Date(d.lastUsedAt))) : copy.deviceAdded(fmt.format(new Date(d.createdAt)))}
                  </p>
                </div>
                <IconButton
                  aria-label={copy.deviceRemove(label)}
                  icon={<X />}
                  variant="ghost"
                  disabled={pending === d.id}
                  onClick={() => void remove(d.id)}
                />
              </li>
            );
          })}
        </ul>
      )}
      {error ? <InlineError className="mt-3">{error}</InlineError> : null}
    </Panel>
  );
}

