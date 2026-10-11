'use client';

import dynamic from 'next/dynamic';
import { Accessibility, BookOpen, LayoutTemplate, Palette } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { PageHeader, PanelErrorBoundary, PanelPage, SectionTabs } from '@/components/ds/page';
import { SkeletonForPreset } from '@/components/states/skeletons';
import type { ThemeOverview } from '@/lib/design-system/theme.server';
import type { ChecklistData, PrefsSummary } from '@/lib/design-system/a11y.server';
import type { DriftReport } from '@/lib/design-system/drift-scan';

export type DesignSystemTab = 'rehber' | 'temalar' | 'erisilebilirlik';

const Loading = () => <SkeletonForPreset preset="detail" />;
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
  return (
    <PanelPage
      register="ops"
      header={
        <PageHeader
          eyebrow="Yönetim paneli · Tasarım"
          title="Tasarım Sistemi"
          description="Qratex Tasarım Dili v2'nin yaşayan rehberi, platform teması ve erişilebilirlik sağlığı. Rehberdeki her örnek gerçek koddan canlı çizilir; tema yalnız onaylı yayınla değişir."
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
          ariaLabel="Tasarım sistemi bölümleri"
          tabs={[
            { value: 'rehber', label: 'Yaşayan rehber', icon: <BookOpen /> },
            { value: 'temalar', label: 'Temalar', icon: <Palette /> },
            { value: 'erisilebilirlik', label: 'Erişilebilirlik', icon: <Accessibility /> },
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
