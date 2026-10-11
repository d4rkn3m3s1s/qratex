'use client';

import { useQueryClient } from '@tanstack/react-query';
import { Bot, History, MessagesSquare, Settings2 } from 'lucide-react';
import { PageHeader, PanelPage, SectionTabs, useUrlState } from '@/components/ds/page';
import type { CouncilSettingsPayload, SessionDetail, SessionPage } from '@/lib/council/contract';
import { councilKeys } from './api';
import { Composer } from './composer';
import { SessionView } from './session-view';
import { HistoryTab } from './history-tab';
import { SettingsTab } from './settings-tab';

export type CouncilInitial = {
  settings: CouncilSettingsPayload | null;
  session: SessionDetail | null;
  recent: SessionPage | null;
  history: SessionPage | null;
};

/**
 * Ajan Konseyi çalışma alanı: Oturum · Geçmiş · Ayarlar (sekme ve açık oturum URL'de:
 * `?tab=gecmis`, `?oturum=<id>`). Eski /history ve /agents rotaları buraya yönlenir.
 */
export function CouncilWorkspace({ initial }: { initial: CouncilInitial }) {
  const qc = useQueryClient();
  const url = useUrlState();
  const sessionId = url.get('oturum');

  const openSession = (id: string, created?: SessionDetail) => {
    if (created) qc.setQueryData(councilKeys.session(id), created);
    void qc.invalidateQueries({ queryKey: ['admin-council', 'sessions'] });
    url.set({ tab: null, oturum: id, q: null, durum: null }, { history: 'push' });
  };
  const goTab = (tab: 'oturum' | 'gecmis' | 'ayarlar') =>
    url.set({ tab: tab === 'oturum' ? null : tab, oturum: null }, { history: 'push' });

  return (
    <PanelPage
      register="ops"
      header={
        <PageHeader
          title="Ajan Konseyi"
          icon={<Bot aria-hidden />}
          description="Stratejik bir soruyu uzman yapay zekâ ajanlarına tartıştırın; gerçek platform verisiyle beslenen, kaydedilen ve bayilere aksiyon olarak yayınlanabilen bir karar alın."
        />
      }
    >
      <SectionTabs
        ariaLabel="Konsey bölümleri"
        defaultValue="oturum"
        resetKeys={['oturum', 'q', 'durum']}
        tabs={[
          { value: 'oturum', label: 'Oturum', icon: <MessagesSquare aria-hidden /> },
          { value: 'gecmis', label: 'Geçmiş', icon: <History aria-hidden />, count: initial.history?.counts.running || undefined },
          { value: 'ayarlar', label: 'Ayarlar', icon: <Settings2 aria-hidden /> },
        ]}
      >
        {(tab) =>
          tab === 'gecmis' ? (
            <HistoryTab initial={initial.history} onOpenSession={openSession} />
          ) : tab === 'ayarlar' ? (
            <SettingsTab initial={initial.settings} />
          ) : sessionId ? (
            <SessionView
              key={sessionId}
              id={sessionId}
              initial={initial.session?.id === sessionId ? initial.session : null}
              onBack={() => url.set({ oturum: null }, { history: 'push' })}
              onOpenSettings={() => goTab('ayarlar')}
            />
          ) : (
            <Composer
              settings={initial.settings}
              recentInitial={initial.recent}
              onOpenSession={openSession}
              onOpenSettings={() => goTab('ayarlar')}
              onOpenHistory={() => goTab('gecmis')}
            />
          )
        }
      </SectionTabs>
    </PanelPage>
  );
}
