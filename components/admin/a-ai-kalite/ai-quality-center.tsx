'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ClipboardCheck, MessagesSquare, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { PageHeader, PanelPage, SectionTabs, PanelErrorBoundary } from '@/components/ds/page';
import type { ChatListItem, ChatStats, Paged, QualityMetrics, SampleListItem } from '@/lib/ai-quality/contract';
import { fetchMetrics, qualityKeys } from './api';
import { ReviewTab } from './review-tab';
import { ChatsTab } from './chats-tab';

export type QualityInitial = {
  metrics: QualityMetrics | null;
  samples: { qs: string; page: Paged<SampleListItem> } | null;
  chatStats: { period: string; data: ChatStats } | null;
  chats: { qs: string; page: Paged<ChatListItem> } | null;
};

const RESET_KEYS = ['page', 'size', 'status', 'model', 'sentiment', 'intent', 'q', 'id', 'cq', 'role', 'outcome', 'slow', 'period', 'user', 'fp', 'cpage', 'csize', 'chat'];

/**
 * AI Kalite tezgâhı: İnceleme kuyruğu (AI geri bildirim analizinin insan değerlendirmesi) +
 * Sohbet denetimi (QRA asistanı kayıtları). ops kaydı: sakin, yoğun; 3B ve dekoratif hareket yok.
 */
export function AiQualityCenter({ initial }: { initial: QualityInitial }) {
  const qc = useQueryClient();
  const metrics = useQuery({ queryKey: qualityKeys.metrics(), queryFn: ({ signal }) => fetchMetrics(signal), initialData: initial.metrics ?? undefined, staleTime: 30_000 });

  return (
    <PanelPage
      register="ops"
      header={
        <PageHeader
          title="AI Kalite"
          description="AI analizlerinin insan değerlendirmesi ve QRA asistanı sohbet denetimi. Kişisel veriler varsayılan olarak maskelenir."
          icon={<ClipboardCheck />}
          actions={
            <Button variant="outline" className="min-h-11 sm:min-h-10" onClick={() => qc.invalidateQueries({ queryKey: qualityKeys.all })}>
              <RefreshCw className="h-4 w-4" aria-hidden />
              Yenile
            </Button>
          }
        />
      }
    >
      <SectionTabs
        ariaLabel="AI kalite bölümleri"
        defaultValue="inceleme"
        resetKeys={RESET_KEYS}
        tabs={[
          { value: 'inceleme', label: 'İnceleme kuyruğu', icon: <ClipboardCheck />, count: metrics.data?.counts.pending },
          { value: 'sohbet', label: 'Sohbet denetimi', icon: <MessagesSquare /> },
        ]}
      >
        {(t) => (
          <PanelErrorBoundary resetKeys={[t]}>
            {t === 'sohbet' ? (
              <ChatsTab initialStats={initial.chatStats} initialList={initial.chats} />
            ) : (
              <ReviewTab metrics={metrics} initialList={initial.samples} />
            )}
          </PanelErrorBoundary>
        )}
      </SectionTabs>
    </PanelPage>
  );
}
