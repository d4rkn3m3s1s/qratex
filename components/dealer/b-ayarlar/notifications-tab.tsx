'use client';

import { useQueryClient } from '@tanstack/react-query';
import { AlertOctagon, BellRing, Flame, Mail, Smartphone, Trash2, UserMinus } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { SectionCard } from '@/components/ds/page';
import { StatusBadge } from '@/components/ds/data';
import { IconButton } from '@/components/ds/a11y';
import { EmptyState, InlineError } from '@/components/states';
import type { AiSection, DealerSettingsSnapshot, PushDevice } from '@/lib/dealer-settings/contract';
import { SETTINGS_KEY, errorText, removePushDevice } from './api';
import { fmtDateTime } from './format';
import { InstantSwitchRow } from './ui';
import { useAiPatch } from './use-ai-patch';
import { usePushDevice } from './use-push-device';
import { useSettingsCopy } from './copy';

/**
 * Bildirimler — YALNIZ gerçekten uygulanan tercihler (denetim B3: eski 5 anahtar hiçbir yere
 * yazılmıyordu). Hücre → onu okuyan gönderici:
 *  - AI uyarıları (toksik/acil/kayıp riski, uygulama içi) → `lib/inngest/feedback-analyze-pipeline`
 *    `policy.alertOn*` (tek kaynak `AISettings`, `lib/ai-policy`).
 *  - Haftalık özet e-postası → `lib/weekly-digest-core` (`weeklyReportEnabled=false` → e-posta yok).
 *  - Bu cihazda anlık bildirim → `PushSubscription` (masa çağrısı, vaka radarı: `lib/push`).
 */
export function NotificationsTab({ ai, pushDevices }: { ai: AiSection; pushDevices: PushDevice[] }) {
  const patch = useAiPatch();
  const c = useSettingsCopy().notifications;
  const s = ai.settings;
  const aiOff = !s.isEnabled || !ai.moduleEnabled;

  return (
    <div className="space-y-6">
      <SectionCard
        title={c.aiTitle}
        description={c.aiHint}
        actions={<StatusBadge label={c.inApp} tone="neutral" size="sm" />}
      >
        {aiOff && (
          <InlineError variant="banner" tone="info" className="mb-2">
            {ai.moduleEnabled
              ? c.aiEngineOff
              : c.aiAdminOff}
          </InlineError>
        )}
        <div className="divide-y divide-subtle">
          <InstantSwitchRow
            icon={<AlertOctagon />}
            label={c.toxic}
            description={c.toxicHint}
            checked={s.alertOnToxic}
            muted={aiOff}
            disabled={!ai.moduleEnabled}
            onSave={(v) => patch({ alertOnToxic: v })}
          />
          <InstantSwitchRow
            icon={<Flame />}
            label={c.urgent}
            description={c.urgentHint}
            checked={s.alertOnUrgent}
            muted={aiOff}
            disabled={!ai.moduleEnabled}
            onSave={(v) => patch({ alertOnUrgent: v })}
          />
          <InstantSwitchRow
            icon={<UserMinus />}
            label={c.churn}
            description={c.churnHint}
            checked={s.alertOnChurnRisk}
            muted={aiOff}
            disabled={!ai.moduleEnabled}
            onSave={(v) => patch({ alertOnChurnRisk: v })}
          />
        </div>
      </SectionCard>

      <SectionCard title={c.email} actions={<StatusBadge label={c.email} tone="neutral" size="sm" />}>
        <InstantSwitchRow
          icon={<Mail />}
          label={c.weekly}
          description={c.weeklyHint}
          checked={s.weeklyReportEnabled}
          disabled={!ai.moduleEnabled}
          onSave={(v) => patch({ weeklyReportEnabled: v })}
        />
      </SectionCard>

      <PushCard devices={pushDevices} />
    </div>
  );
}

function PushCard({ devices }: { devices: PushDevice[] }) {
  const queryClient = useQueryClient();
  const push = usePushDevice();
  const copy = useSettingsCopy();
  const c = copy.notifications;

  const refresh = () => queryClient.invalidateQueries({ queryKey: SETTINGS_KEY });

  const toggle = async () => {
    try {
      if (push.subscribed) {
        await push.disable();
        toast.success(c.pushOff);
      } else {
        await push.enable();
        toast.success(c.pushOn);
      }
      await refresh();
    } catch (e) {
      toast.error(errorText(e, copy.common.actionFailed));
    }
  };

  const remove = async (id: string) => {
    try {
      await removePushDevice(id);
      queryClient.setQueryData<DealerSettingsSnapshot>(SETTINGS_KEY, (old) =>
        old ? { ...old, pushDevices: old.pushDevices.filter((d) => d.id !== id) } : old
      );
      toast.success(c.deviceRemoved);
    } catch (e) {
      toast.error(errorText(e, c.deviceRemoveFailed));
    }
  };

  const supportNote =
    push.support === 'unsupported'
      ? c.unsupported
      : push.support === 'unconfigured'
        ? c.unconfigured
        : push.support === 'denied'
          ? c.denied
          : null;

  return (
    <SectionCard
      title={c.pushTitle}
      description={c.pushHint}
      actions={<StatusBadge label="Push" tone="neutral" size="sm" />}
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <span aria-hidden className="inline-flex shrink-0 text-fg-subtle">
            <BellRing className="h-4 w-4" />
          </span>
          <div className="min-w-0">
            <p className="qx-body font-medium text-fg">{c.thisDevice}</p>
            <p className="qx-small text-fg-muted" aria-live="polite">
              {push.support === 'checking' ? c.checking : push.subscribed ? c.pushIsOn : c.pushIsOff}
            </p>
          </div>
        </div>
        <Button type="button" variant={push.subscribed ? 'outline' : 'default'} onClick={() => void toggle()} disabled={push.support !== 'ready' || push.busy}>
          {push.busy ? c.wait : push.subscribed ? c.disableHere : c.enableHere}
        </Button>
      </div>
      {supportNote && <p className="qx-small mt-3 text-fg-muted">{supportNote}</p>}

      <h3 className="qx-small mt-6 font-semibold text-fg">{c.devices}</h3>
      {devices.length === 0 ? (
        <EmptyState compact icon={Smartphone} title={c.noDevices} description={c.noDevicesHint} headingLevel="p" />
      ) : (
        <ul className="mt-2 divide-y divide-subtle rounded-card border border-subtle">
          {devices.map((d) => (
            <li key={d.id} className="flex items-center gap-3 px-3 py-2">
              <Smartphone className="h-4 w-4 shrink-0 text-fg-muted" aria-hidden />
              <div className="min-w-0 flex-1">
                <p className="qx-small truncate font-medium text-fg">{d.label || c.unknownDevice}</p>
                <p className="qx-caption text-fg-muted">
                  {c.added(fmtDateTime(d.createdAt))}
                  {d.lastUsedAt ? c.lastUsed(fmtDateTime(d.lastUsedAt)) : ''}
                </p>
              </div>
              <IconButton aria-label={c.removeDevice(d.label)} icon={<Trash2 />} variant="ghost" size="sm" onClick={() => void remove(d.id)} />
            </li>
          ))}
        </ul>
      )}
    </SectionCard>
  );
}
