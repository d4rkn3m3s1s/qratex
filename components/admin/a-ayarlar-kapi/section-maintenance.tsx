'use client';

import { useEffect, useId, useMemo, useState } from 'react';
import { ArrowUpRight, Construction } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { ConfirmAction, InlineError, SectionCard } from '@/components/states';
import { DirtyBar, StatusBadge } from '@/components/ds';
import type { PlatformSettingsState } from '@/lib/platform-settings/server';
import { MAINTENANCE_MESSAGE_MAX, PLATFORM_SETTINGS, SETTINGS_KEYS, type MaintenanceState } from '@/lib/platform-settings/registry';
import { errorText, formatIstanbul, isConflict } from './api';
import { SettingSwitchRow, changeFor, useSaveSettings } from './shared';

/** ISO → `datetime-local` (Europe/Istanbul, UTC+3 sabit). */
function isoToLocal(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const tr = new Date(d.getTime() + 3 * 60 * 60 * 1000);
  return tr.toISOString().slice(0, 16);
}
/** `datetime-local` (İstanbul saati) → ISO. */
function localToIso(local: string): string | null {
  if (!local) return null;
  const d = new Date(`${local}:00+03:00`);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

export function MaintenanceSection({ state }: { state: PlatformSettingsState }) {
  const base = state.values[SETTINGS_KEYS.maintenance];
  const [draft, setDraft] = useState<MaintenanceState>(base);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const save = useSaveSettings();
  const ids = { message: useId(), end: useId(), help: useId() };
  const { redisConfigured, maintenanceEdge } = state.context;

  useEffect(() => setDraft(base), [base]);

  const dirty = useMemo(
    () => draft.enabled !== base.enabled || draft.message.trim() !== base.message || draft.plannedEndAt !== base.plannedEndAt,
    [draft, base]
  );
  const turningOn = !base.enabled && draft.enabled;

  const doSave = async () => {
    await save.mutateAsync([
      changeFor(state, SETTINGS_KEYS.maintenance, { enabled: draft.enabled, message: draft.message.trim(), plannedEndAt: draft.plannedEndAt }),
    ]);
    toast.success(draft.enabled ? 'Bakım modu açıldı. Paneller en geç 10 saniye içinde bakım ekranına geçer.' : 'Bakım ayarı kaydedildi.');
  };

  const onSave = () => {
    if (turningOn) setConfirmOpen(true);
    else void doSave().catch(() => undefined);
  };

  const conflict = save.error && isConflict(save.error);

  return (
    <SectionCard
      title="Bakım modu"
      description={PLATFORM_SETTINGS[SETTINGS_KEYS.maintenance].effect}
      icon={<Construction aria-hidden />}
      tone={base.enabled ? 'danger' : undefined}
      stripe={base.enabled}
      actions={
        <Button asChild variant="ghost" size="sm" className="min-h-11 gap-1.5">
          <a href="/bakim" target="_blank" rel="noreferrer">
            Bakım ekranını gör <ArrowUpRight className="h-4 w-4" aria-hidden />
          </a>
        </Button>
      }
    >
      {!redisConfigured ? (
        <InlineError variant="banner" tone="warning" className="mb-4">
          Bu ortamda Redis (Upstash) yapılandırılmamış. Bakım kontrolü istek yolunda Redis’ten okunduğu için bakım modu burada açılamaz.
        </InlineError>
      ) : maintenanceEdge === 'repaired' ? (
        <InlineError variant="banner" tone="info" className="mb-4">
          Bakım durumu istek katmanına yeniden yayınlandı (önbellek kaydı eksikti ya da farklıydı).
        </InlineError>
      ) : null}

      <div className="divide-y divide-border">
        <SettingSwitchRow
          label="Bakım modu"
          description="Açıkken yöneticiler dışında herkes için müşteri ve bayi panelleri kapanır."
          checked={draft.enabled}
          onChange={(v) => setDraft((d) => ({ ...d, enabled: v }))}
          disabled={!redisConfigured && !base.enabled}
          dirty={draft.enabled !== base.enabled}
          badge={<StatusBadge size="sm" label={base.enabled ? 'AÇIK' : 'Kapalı'} tone={base.enabled ? 'danger' : 'neutral'} />}
        />
        <div className="grid gap-4 py-4 sm:grid-cols-[minmax(0,1fr)_16rem]">
          <div className="space-y-1.5">
            <label htmlFor={ids.message} className="qx-small font-medium text-fg">
              Kullanıcılara gösterilecek mesaj
            </label>
            <Textarea
              id={ids.message}
              rows={3}
              maxLength={MAINTENANCE_MESSAGE_MAX}
              value={draft.message}
              onChange={(e) => setDraft((d) => ({ ...d, message: e.target.value.slice(0, MAINTENANCE_MESSAGE_MAX) }))}
              aria-describedby={ids.help}
              placeholder="Örn: Ödeme altyapısını güncelliyoruz, kısa süre içinde döneceğiz."
            />
            <p id={ids.help} className="qx-caption flex justify-between gap-3 text-fg-muted">
              <span>Boş bırakılırsa genel bir bakım metni gösterilir.</span>
              <span className="tabular-nums">
                {draft.message.length}/{MAINTENANCE_MESSAGE_MAX}
              </span>
            </p>
          </div>
          <div className="space-y-1.5">
            <label htmlFor={ids.end} className="qx-small font-medium text-fg">
              Tahmini bitiş (İstanbul saati)
            </label>
            <Input
              id={ids.end}
              type="datetime-local"
              value={isoToLocal(draft.plannedEndAt)}
              onChange={(e) => setDraft((d) => ({ ...d, plannedEndAt: localToIso(e.target.value) }))}
            />
            <p className="qx-caption text-fg-muted">Yalnız bilgi amaçlı; bakım kendiliğinden kapanmaz.</p>
          </div>
        </div>
      </div>

      {base.enabled ? (
        <p className="qx-small text-fg-muted">
          Bakım şu an açık{base.plannedEndAt ? ` · tahmini bitiş ${formatIstanbul(base.plannedEndAt)}` : ''}.
        </p>
      ) : null}

      {save.error && !conflict ? (
        <InlineError variant="banner" className="mt-4">
          {errorText(save.error)}
        </InlineError>
      ) : null}

      <DirtyBar
        dirty={dirty}
        saving={save.isPending}
        onSave={onSave}
        onDiscard={() => {
          setDraft(base);
          save.reset();
        }}
        message="Bakım ayarı değişti"
        conflict={conflict ? true : null}
        onReloadLatest={() => setDraft(base)}
      />

      <ConfirmAction
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        tone="danger"
        title="Bakım modu açılsın mı?"
        description="Müşteri ve bayi panelleri kullanılamaz hâle gelir; açık oturumlardaki istekler 503 alır."
        impact={[
          { label: 'Müşteri ve bayi panelleri', value: 'Bakım ekranına yönlenir', emphasis: true },
          { label: 'Panel API uçları', value: '503 (yeniden deneyin)' },
          { label: 'Yöneticiler ve herkese açık sayfalar', value: 'Etkilenmez' },
        ]}
        confirmPhrase="BAKIM"
        irreversibleNote="Bakımı aynı ekrandan kapattığınızda paneller en geç 10 saniyede açılır."
        confirmLabel="Bakım modunu aç"
        onConfirm={doSave}
      />
    </SectionCard>
  );
}
