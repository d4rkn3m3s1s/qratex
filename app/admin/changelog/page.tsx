import type { Metadata } from 'next';
import data from '@/lib/changelog/data.json';
import type { ChangelogData } from '@/lib/changelog/types';
import { knownCommits, toSummary } from '@/lib/changelog/summary';
import { fetchLiveCommits } from '@/lib/changelog/live.server';
import { ChangelogCenter } from '@/components/admin/a-degisiklik-gunlugu/changelog-center';

/**
 * Admin → Değişiklik Günlüğü (/admin/changelog). Yalnız ADMIN: app/admin/layout.tsx
 * `requireAdminPage()` ile rol + gizli kapı denetimi yapar. Veri `npm run changelog:update`
 * ile üretilen statik JSON'dan gelir (DB yok). İstemciye yalnız hafta özetleri gider;
 * hafta ayrıntısı /changelog/weeks/<hafta>.json'dan kart açılınca yüklenir.
 * Derlemeden sonraki commitler GitHub API'den (saatlik önbellek) "Yeni" bloğunda gösterilir;
 * ağ hatası sayfayı asla bozmaz (boş liste).
 */
export const metadata: Metadata = {
  title: 'Değişiklik Günlüğü',
  description: 'Platformun hafta hafta neler değiştiğinin özeti: özellikler, düzeltmeler, commit listesi.',
};

export default async function AdminChangelogPage() {
  const full = data as unknown as ChangelogData;
  const { last, shorts } = knownCommits(full);
  const live = await fetchLiveCommits(last, shorts);
  return <ChangelogCenter data={toSummary(full)} live={live} />;
}
