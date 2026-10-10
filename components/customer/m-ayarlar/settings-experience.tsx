'use client';

import dynamic from 'next/dynamic';
import { useQuery } from '@tanstack/react-query';
import { Bell, Lock, Palette, ShieldCheck, UserRound } from 'lucide-react';
import { PageHeader, PanelPage, SectionTabs, type SectionTab } from '@/components/ds/page';
import { QueryState, SkeletonForm } from '@/components/states';
import type { CustomerSettingsSnapshot, SettingsSection } from '@/lib/customer-settings/contract';
import { fetchSettings, settingsKeys } from './api';
import { useSettingsCopy } from './copy';
import { SettingsHero } from './settings-hero';
import { SettingsSkeleton } from './settings-skeleton';

// Bölümler ayrı parçalar: yalnız açılan sekmenin kodu yüklenir (2FA'nın QR kütüphanesi,
// KVKK merkezi vb. ilk boyamaya girmez).
const loading = () => <SkeletonForm />;
const ProfileSection = dynamic(() => import('./section-profile').then((m) => m.ProfileSection), { loading });
const NotificationsSection = dynamic(() => import('./section-notifications').then((m) => m.NotificationsSection), { loading });
const PrivacySection = dynamic(() => import('./section-privacy').then((m) => m.PrivacySection), { loading });
const AppearanceSection = dynamic(() => import('./section-appearance').then((m) => m.AppearanceSection), { loading });
const SecuritySection = dynamic(() => import('./section-security').then((m) => m.SecuritySection), { loading });

const ICONS: Record<SettingsSection, React.ReactNode> = {
  profile: <UserRound />,
  notifications: <Bell />,
  privacy: <Lock />,
  appearance: <Palette />,
  security: <ShieldCheck />,
};

/**
 * Ayarlar istemci adası. İlk veri sunucudan gelir (`initial`); pencere odağında yeniden
 * çekilmez (denetim B5: yazılan ad oturum yenilemesiyle silinmiyordu). Sunucu yüklemesi
 * düştüyse ada kendisi dener ve hatayı görünür gösterir — varsayılan değerlerle form açmaz
 * (B7: varsayılanları kaydedip gerçek tercihleri ezme riski yok).
 */
export function SettingsExperience({ initial }: { initial: CustomerSettingsSnapshot | null }) {
  const { copy } = useSettingsCopy();
  const query = useQuery({
    queryKey: settingsKeys.snapshot,
    queryFn: fetchSettings,
    initialData: initial ?? undefined,
    staleTime: 60_000,
    refetchOnWindowFocus: false,
    retry: 1,
  });

  const tabs: SectionTab[] = (['profile', 'notifications', 'privacy', 'appearance', 'security'] as const).map((value) => ({
    value,
    label: copy.sections[value],
    icon: ICONS[value],
  }));

  return (
    <PanelPage
      register="ops"
      width="narrow"
      header={<PageHeader eyebrow={copy.eyebrow} title={copy.title} description={copy.description} />}
    >
      <QueryState
        query={query}
        skeleton={<SettingsSkeleton />}
        error={{ title: copy.loadErrorTitle, description: copy.loadErrorBody }}
      >
        {(data) => (
          <div className="flex min-w-0 flex-col gap-5">
            <SettingsHero data={data} />
            <SectionTabs tabs={tabs} paramKey="tab" ariaLabel={copy.sectionsAria} touchTarget>
              {(active) => {
                switch (active) {
                  case 'notifications':
                    return <NotificationsSection data={data} />;
                  case 'privacy':
                    return <PrivacySection data={data} />;
                  case 'appearance':
                    return <AppearanceSection data={data} />;
                  case 'security':
                    return <SecuritySection data={data} />;
                  default:
                    return <ProfileSection data={data} />;
                }
              }}
            </SectionTabs>
          </div>
        )}
      </QueryState>
    </PanelPage>
  );
}
