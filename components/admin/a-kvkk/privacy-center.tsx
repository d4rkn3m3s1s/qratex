'use client';

/**
 * /admin/privacy — KVKK ve 5651 uyum merkezi (eski /admin/privacy-requests + /admin/compliance).
 *
 * Sekmeler (?tab=): Genel bakış · Talepler · Envanter · Saklama · Rıza · Kayıtlar.
 * Genel bakış sunucuda ön yüklenir; diğer sekmeler yalnız açıldığında yüklenir (lazy).
 * ops kaydı: sakin, yoğun; hareket yalnız sekme içerik girişi ve panel kaydırması.
 */
import dynamic from 'next/dynamic';
import { Activity, ClipboardList, Cookie, Database, FileClock, LayoutDashboard, Lock } from 'lucide-react';
import { PanelErrorBoundary, PanelPage, PageHeader, SectionTabs } from '@/components/ds/page';
import { SkeletonTable } from '@/components/states';
import type { PrivacyOverview } from '@/lib/admin-privacy/contract';
import { OverviewTab } from './overview-tab';

const loading = () => <SkeletonTable />;
const RequestsPanel = dynamic(() => import('./requests/requests-panel').then((m) => m.RequestsPanel), { loading });
const InventoryTab = dynamic(() => import('./inventory-tab').then((m) => m.InventoryTab), { loading });
const RetentionTab = dynamic(() => import('./retention-tab').then((m) => m.RetentionTab), { loading });
const ConsentTab = dynamic(() => import('./consent-tab').then((m) => m.ConsentTab), { loading });
const LogsTab = dynamic(() => import('./logs-tab').then((m) => m.LogsTab), { loading });

const TAB_PARAMS = ['status', 'type', 'q', 'id', 'source', 'user', 'from', 'to', 'days'] as const;

export function PrivacyCenter({ initialOverview, openCount }: { initialOverview: PrivacyOverview | null; openCount?: number }) {
  return (
    <PanelPage
      register="ops"
      header={
        <PageHeader
          eyebrow="Güven ve uyum"
          title="KVKK merkezi"
          description="Veri sahibi talepleri, kişisel veri envanteri, saklama süreleri, rıza kanıtı ve 5651 erişim kayıtları tek yerde. Durumlar gerçek veriden ölçülür."
          icon={<Lock />}
        />
      }
    >
      <SectionTabs
        ariaLabel="KVKK merkezi bölümleri"
        defaultValue="genel"
        resetKeys={TAB_PARAMS}
        touchTarget
        tabs={[
          { value: 'genel', label: 'Genel bakış', icon: <LayoutDashboard className="h-4 w-4" aria-hidden /> },
          {
            value: 'talepler',
            label: 'Talepler',
            icon: <ClipboardList className="h-4 w-4" aria-hidden />,
            count: openCount,
          },
          { value: 'envanter', label: 'Envanter', icon: <Database className="h-4 w-4" aria-hidden /> },
          { value: 'saklama', label: 'Saklama', icon: <FileClock className="h-4 w-4" aria-hidden /> },
          { value: 'riza', label: 'Rıza', icon: <Cookie className="h-4 w-4" aria-hidden /> },
          { value: 'kayitlar', label: '5651 kayıtları', icon: <Activity className="h-4 w-4" aria-hidden /> },
        ]}
      >
        {(tab) => (
          <PanelErrorBoundary resetKeys={[tab]}>
            <div className="pt-4">
              {tab === 'talepler' ? (
                <RequestsPanel />
              ) : tab === 'envanter' ? (
                <InventoryTab />
              ) : tab === 'saklama' ? (
                <RetentionTab />
              ) : tab === 'riza' ? (
                <ConsentTab />
              ) : tab === 'kayitlar' ? (
                <LogsTab />
              ) : (
                <OverviewTab initial={initialOverview} />
              )}
            </div>
          </PanelErrorBoundary>
        )}
      </SectionTabs>
    </PanelPage>
  );
}
