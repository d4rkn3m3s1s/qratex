'use client';

import { useState } from 'react';
import dynamic from 'next/dynamic';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Award, FlaskConical, Library, Plus, RefreshCw, SlidersHorizontal } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { DetailSheet, useDetailSheet } from '@/components/ds/data';
import { PageHeader, PanelPage, SectionTabs } from '@/components/ds/page';
import { SkeletonCards } from '@/components/states';
import type { BadgeDetail, BadgeStats, ThresholdsState } from '@/lib/admin-badges/contract';
import { badgeKeys, fetchStats } from './api';
import { BadgeDetailBody } from './badge-sheet';
import { BadgeEditor } from './badge-editor';
import { CatalogTab, type CatalogInitial } from './catalog-tab';
import { ThresholdsTab } from './thresholds-tab';

// Test laboratuvarı (sınıflandırıcı, 3B sahne, karakter açılışı) yalnız sekmesi açılınca yüklenir.
const LabTab = dynamic(() => import('./lab-tab'), { ssr: false, loading: () => <SkeletonCards /> });

export type BadgesInitial = {
  stats: BadgeStats | null;
  catalog: CatalogInitial;
  thresholds: ThresholdsState | null;
};

/**
 * Admin → Rozetler (/admin/badges): Katalog · Eşikler · Test lab. Eski /admin/character-thresholds
 * ve /admin/character-test buraya (?tab=esikler / ?tab=test) kalıcı yönlenir.
 */
export function BadgesCenter({ initial }: { initial: BadgesInitial }) {
  const qc = useQueryClient();
  const stats = useQuery({ queryKey: badgeKeys.stats(), queryFn: fetchStats, initialData: initial.stats ?? undefined, staleTime: 30_000 });
  const sheet = useDetailSheet('badge');
  const [editor, setEditor] = useState<{ open: boolean; badge: BadgeDetail | null }>({ open: false, badge: null });

  return (
    <PanelPage
      register="ops"
      header={
        <PageHeader
          title="Rozetler"
          description="Rozet kataloğunu yönetin, karakter rozeti eşiklerini etkisini görerek ayarlayın ve açılışları test laboratuvarında deneyin."
          icon={<Award />}
          actions={
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" className="min-h-11 sm:min-h-10" onClick={() => qc.invalidateQueries({ queryKey: badgeKeys.all })}>
                <RefreshCw className="h-4 w-4" aria-hidden />
                Yenile
              </Button>
              <Button className="min-h-11 sm:min-h-10" onClick={() => setEditor({ open: true, badge: null })}>
                <Plus className="h-4 w-4" aria-hidden />
                Yeni rozet
              </Button>
            </div>
          }
        />
      }
    >
      <SectionTabs
        ariaLabel="Rozetler bölümleri"
        defaultValue="katalog"
        resetKeys={['page', 'size', 'sort', 'q', 'rarity', 'health', 'series', 'set', 'badge', 'user', 'reveal', 'scene']}
        tabs={[
          { value: 'katalog', label: 'Katalog', icon: <Library />, count: stats.data ? stats.data.normal.total + stats.data.series.total : undefined },
          { value: 'esikler', label: 'Eşikler', icon: <SlidersHorizontal /> },
          { value: 'test', label: 'Test lab', icon: <FlaskConical /> },
        ]}
      >
        {(tab) =>
          tab === 'esikler' ? (
            <ThresholdsTab initial={initial.thresholds} />
          ) : tab === 'test' ? (
            <LabTab />
          ) : (
            <CatalogTab initial={initial.catalog} stats={stats.data} statsError={stats.isError ? stats.error : null} onRetryStats={() => stats.refetch()} />
          )
        }
      </SectionTabs>

      <DetailSheet paramKey="badge" size="lg" title="Rozet ayrıntısı" description="Kazanım eğilimi, kazananlar ve değişiklik geçmişi">
        {(id) => <BadgeDetailBody id={id} onEdit={(b) => setEditor({ open: true, badge: b })} onOpenOther={(other) => sheet.open(other)} />}
      </DetailSheet>

      <BadgeEditor
        open={editor.open}
        badge={editor.badge}
        onOpenChange={(open) => setEditor((s) => ({ ...s, open }))}
        onSaved={async (id) => {
          await qc.invalidateQueries({ queryKey: badgeKeys.all });
          sheet.open(id);
        }}
      />
    </PanelPage>
  );
}
