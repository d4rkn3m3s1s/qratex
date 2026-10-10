'use client';

import { Eye, EyeOff, ShieldCheck } from 'lucide-react';
import type { CustomerSettingsSnapshot } from '@/lib/customer-settings/contract';
import { patchPreferences, SettingsApiError } from './api';
import { errorText, useSettingsCopy } from './copy';
import { DeleteAccount } from './delete-account';
import { PrivacyCenter } from './privacy-center';
import { Panel, SettingSwitchRow, useSaveState } from './ui';
import { useSettingsCache } from './use-settings';

/**
 * Gizlilik: görünürlük (gerçekten uygulanan tek anahtar: liderlik/lig görünürlüğü — sahte
 * "Profili göster" kaldırıldı), KVKK merkezi (rıza, veri indirme, başvurular — E1) ve hesap silme.
 */
export function PrivacySection({ data }: { data: CustomerSettingsSnapshot }) {
  const { copy } = useSettingsCopy();
  const cache = useSettingsCache();
  const save = useSaveState();
  const visible = data.preferences.showLeaderboard;

  const setVisible = (next: boolean) =>
    cache.patch((prev) => ({ ...prev, preferences: { ...prev.preferences, showLeaderboard: next } }));

  const onChange = (next: boolean) => {
    setVisible(next);
    void save.run(async () => {
      try {
        await patchPreferences({ showLeaderboard: next });
      } catch (e) {
        setVisible(!next);
        throw new Error(errorText(copy, e instanceof SettingsApiError ? e.code : undefined, copy.saveError));
      }
    });
  };

  return (
    <div className="flex flex-col gap-4">
      <Panel title={copy.visibilityTitle} icon={visible ? <Eye /> : <EyeOff />}>
        <SettingSwitchRow
          label={copy.leaderboardLabel}
          description={visible ? copy.leaderboardOn : copy.leaderboardOff}
          checked={visible}
          onCheckedChange={onChange}
          state={save.state}
          error={save.message}
        />
      </Panel>
      <section aria-labelledby="settings-privacy-data" className="flex flex-col gap-3">
        <h2 id="settings-privacy-data" className="qx-h3 flex items-center gap-2 px-1 text-fg">
          <ShieldCheck aria-hidden className="h-4 w-4 text-brand" />
          {copy.dataTitle}
        </h2>
        <PrivacyCenter />
      </section>
      <DeleteAccount />
    </div>
  );
}
