'use client';

import dynamic from 'next/dynamic';
import { Accessibility, BookOpen, LayoutTemplate, Palette } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { PageHeader, PanelErrorBoundary, PanelPage, SectionTabs } from '@/components/ds/page';
import { SkeletonForPreset } from '@/components/states/skeletons';
import type { ThemeOverview } from '@/lib/design-system/theme.server';
import type { ChecklistData, PrefsSummary } from '@/lib/design-system/a11y.server';
import type { DriftReport } from '@/lib/design-system/drift-scan';
import { useDesignSystemCopy } from './copy';

export type DesignSystemTab = 'rehber' | 'temalar' | 'erisilebilirlik';

// Yer ayır: sekme parçası gelene kadar iskelet en az bir ekran boyu tutar; altındaki öğeler
// (altbilgi vb.) görünür alanda olmadığından parça gelince kayma (CLS) olmaz.
const Loading = () => (
  <div className="min-h-[100svh]">
    <SkeletonForPreset preset="detail" />
  </div>
);
// Ağır sekmeler yalnız açıldığında yüklenir (istemci adası küçük kalır).
const GuideTab = dynamic(() => import('./guide/guide-tab').then((m) => m.GuideTab), { loading: Loading });
const ThemeStudio = dynamic(() => import('./theme/theme-studio').then((m) => m.ThemeStudio), { loading: Loading });
const A11yTab = dynamic(() => import('./a11y/a11y-tab').then((m) => m.A11yTab), { loading: Loading });

/**
 * Tasarım Sistemi (/admin/design-system): yaşayan rehber + temalar + erişilebilirlik tek alanda.
 * ops kaydı: sakin, yoğun; 3B yok. Etkin sekme URL'de (`?tab=`).
 */
export function DesignSystemShell({
  theme,
  a11y,
  drift,
}: {
  theme: ThemeOverview | null;
  a11y: { prefs: PrefsSummary; checklist: ChecklistData } | null;
  drift: DriftReport | null;
}) {
  const ux = useDesignSystemCopy().ui;
  return (
    <PanelPage
      register="ops"
      header={
        <PageHeader
          eyebrow={ux.yonetimPaneliTasarim}
          title={ux.tasarimSistemi}
          description={ux.qratexTasarimDiliV2}
          icon={<LayoutTemplate />}
          meta={
            <>
              <Badge variant="brand">QDL v2</Badge>
              <Badge variant="outline">WCAG 2.2 AA</Badge>
            </>
          }
        />
      }
    >
      <PanelErrorBoundary>
        <SectionTabs
          defaultValue="rehber"
          ariaLabel={ux.tasarimSistemiBolumleri}
          tabs={[
            { value: 'rehber', label: ux.yasayanRehber, icon: <BookOpen /> },
            { value: 'temalar', label: ux.temalar, icon: <Palette /> },
            { value: 'erisilebilirlik', label: ux.erisilebilirlik, icon: <Accessibility /> },
          ]}
        >
          {(active) =>
            active === 'temalar' ? (
              <ThemeStudio initial={theme} />
            ) : active === 'erisilebilirlik' ? (
              <A11yTab initial={a11y} />
            ) : (
              <GuideTab drift={drift} />
            )
          }
        </SectionTabs>
      </PanelErrorBoundary>
    </PanelPage>
  );
}
