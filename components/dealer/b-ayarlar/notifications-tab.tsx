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
  const s = ai.settings;
  const aiOff = !s.isEnabled || !ai.moduleEnabled;

  return (
    <div className="space-y-6">
      <SectionCard
        title="AI uyarıları"
        description="Bir yorum analiz edildiğinde bu durumlar tespit edilirse bildirim zilinize düşer."
        actions={<StatusBadge label="Uygulama içi" tone="neutral" size="sm" />}
      >
        {aiOff && (
          <InlineError variant="banner" tone="info" className="mb-2">
            {ai.moduleEnabled
              ? 'AI motoru kapalı olduğu için yorumlar analiz edilmiyor; bu uyarılar şu an üretilmez. Tercihleriniz korunur.'
              : 'AI özellikleri yönetici tarafından kapatıldı; bu uyarılar şu an üretilmez.'}
          </InlineError>
        )}
        <div className="divide-y divide-subtle">
          <InstantSwitchRow
            icon={<AlertOctagon />}
            label="Toksik / hakaret içeren yorum"
            description="Küfür, hakaret ya da tehdit içeren yorumlar."
            checked={s.alertOnToxic}
            muted={aiOff}
            disabled={!ai.moduleEnabled}
            onSave={(v) => patch({ alertOnToxic: v })}
          />
          <InstantSwitchRow
            icon={<Flame />}
            label="Acil durum"
            description="Hijyen, güvenlik ya da hemen müdahale gerektiren şikâyetler."
            checked={s.alertOnUrgent}
            muted={aiOff}
            disabled={!ai.moduleEnabled}
            onSave={(v) => patch({ alertOnUrgent: v })}
          />
          <InstantSwitchRow
            icon={<UserMinus />}
            label="Kayıp riski yüksek müşteri"
            description="Bir daha gelmeyeceğini ima eden yorumlar."
            checked={s.alertOnChurnRisk}
            muted={aiOff}
            disabled={!ai.moduleEnabled}
            onSave={(v) => patch({ alertOnChurnRisk: v })}
          />
        </div>
      </SectionCard>

      <SectionCard title="E-posta" actions={<StatusBadge label="E-posta" tone="neutral" size="sm" />}>
        <InstantSwitchRow
          icon={<Mail />}
          label="Haftalık özet e-postası"
          description="Her pazartesi geçen haftanın yorum sayısı, puan eğilimi ve öne çıkan konular. Kapatsanız da özet panelde görünür."
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

  const refresh = () => queryClient.invalidateQueries({ queryKey: SETTINGS_KEY });

  const toggle = async () => {
    try {
      if (push.subscribed) {
        await push.disable();
        toast.success('Bu cihazda anlık bildirimler kapatıldı.');
      } else {
        await push.enable();
        toast.success('Bu cihazda anlık bildirimler açıldı.');
      }
      await refresh();
    } catch (e) {
      toast.error(errorText(e, 'İşlem tamamlanamadı.'));
    }
  };

  const remove = async (id: string) => {
    try {
      await removePushDevice(id);
      queryClient.setQueryData<DealerSettingsSnapshot>(SETTINGS_KEY, (old) =>
        old ? { ...old, pushDevices: old.pushDevices.filter((d) => d.id !== id) } : old
      );
      toast.success('Cihaz kaldırıldı.');
    } catch (e) {
      toast.error(errorText(e, 'Cihaz kaldırılamadı.'));
    }
  };

  const supportNote =
    push.support === 'unsupported'
      ? 'Bu tarayıcı anlık bildirimleri desteklemiyor. iPhone’da Qratex’i ana ekrana ekleyip oradan açın.'
      : push.support === 'unconfigured'
        ? 'Anlık bildirim bu ortamda yapılandırılmamış.'
        : push.support === 'denied'
          ? 'Bildirim izni bu tarayıcıda engellenmiş. Adres çubuğundaki site ayarlarından izin verin.'
          : null;

  return (
    <SectionCard
      title="Anlık bildirimler"
      description="Masa çağrıları ve vaka radarı uyarıları, uygulama kapalıyken de telefonunuza/bilgisayarınıza gelir."
      actions={<StatusBadge label="Push" tone="neutral" size="sm" />}
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <span aria-hidden className="inline-flex h-8 w-8 items-center justify-center rounded-control bg-surface-muted text-fg-muted">
            <BellRing className="h-4 w-4" />
          </span>
          <div className="min-w-0">
            <p className="qx-body font-medium text-fg">Bu cihaz</p>
            <p className="qx-small text-fg-muted" aria-live="polite">
              {push.support === 'checking' ? 'Denetleniyor…' : push.subscribed ? 'Anlık bildirim açık' : 'Anlık bildirim kapalı'}
            </p>
          </div>
        </div>
        <Button type="button" variant={push.subscribed ? 'outline' : 'default'} onClick={() => void toggle()} disabled={push.support !== 'ready' || push.busy}>
          {push.busy ? 'Bekleyin…' : push.subscribed ? 'Bu cihazda kapat' : 'Bu cihazda aç'}
        </Button>
      </div>
      {supportNote && <p className="qx-small mt-3 text-fg-muted">{supportNote}</p>}

      <h3 className="qx-small mt-6 font-semibold text-fg">Kayıtlı cihazlar</h3>
      {devices.length === 0 ? (
        <EmptyState compact icon={Smartphone} title="Kayıtlı cihaz yok" description="Bu cihazda açtığınızda burada listelenir." headingLevel="p" />
      ) : (
        <ul className="mt-2 divide-y divide-subtle rounded-card border border-subtle">
          {devices.map((d) => (
            <li key={d.id} className="flex items-center gap-3 px-3 py-2">
              <Smartphone className="h-4 w-4 shrink-0 text-fg-muted" aria-hidden />
              <div className="min-w-0 flex-1">
                <p className="qx-small truncate font-medium text-fg">{d.label || 'Bilinmeyen cihaz'}</p>
                <p className="qx-caption text-fg-muted">
                  Eklendi {fmtDateTime(d.createdAt)}
                  {d.lastUsedAt ? ` · son kullanım ${fmtDateTime(d.lastUsedAt)}` : ''}
                </p>
              </div>
              <IconButton aria-label={`${d.label || 'Cihazı'} kaldır`} icon={<Trash2 />} variant="ghost" size="sm" onClick={() => void remove(d.id)} />
            </li>
          ))}
        </ul>
      )}
    </SectionCard>
  );
}
