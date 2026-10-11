'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { HeartHandshake, ListChecks, Plus, Receipt, RefreshCw, Scale, Target, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { DetailSheet, MetricGrid, MetricTile, useDetailSheet } from '@/components/ds/data';
import { PageHeader, PanelPage, SectionTabs } from '@/components/ds/page';
import { ErrorState } from '@/components/states';
import { TONE_CALLOUT } from '@/components/states/tone';
import type { DonationStats, ProjectDetail } from '@/lib/admin-donations/contract';
import { cn } from '@/lib/utils';
import { donationKeys, errorText, fetchDonationStats } from '../api';
import { fmtNumber } from '../format';
import { ProjectDetailBody } from './project-sheet';
import { ProjectEditor } from './project-editor';
import { ProjectsTab, type ProjectsInitial } from './projects-tab';
import { ReceiptBody } from './receipt-body';
import { TransactionsTab } from './transactions-tab';
import { AdminKesifBagisText } from '../copy';

export type DonationsInitial = { stats: DonationStats | null; projects: ProjectsInitial };

/**
 * Admin → Bağışlar (/admin/donations): Kampanyalar · İşlemler.
 * Üç soruya 5 saniyede cevap: modül sağlıklı mı (KPI + modül durumu), hangi kampanya nerede
 * (ilerleme + şeffaf toplam), son ne oldu (işlemler + makbuz).
 */
export function DonationsCenter({ initial }: { initial: DonationsInitial }) {
  const qc = useQueryClient();
  const stats = useQuery({ queryKey: donationKeys.stats(), queryFn: fetchDonationStats, initialData: initial.stats ?? undefined, staleTime: 30_000 });
  const sheet = useDetailSheet('kampanya');
  const [editor, setEditor] = useState<{ open: boolean; project: ProjectDetail | null }>({ open: false, project: null });
  const s = stats.data;
  const ledgerGap = s ? s.totalPoints - s.ledgerPoints : 0;

  return (
    <PanelPage
      register="ops"
      header={
        <PageHeader
          title="Bağışlar"
          description="Bağış kampanyalarını oluşturun ve yönetin, toplanan puanı gerçek bağış kayıtlarıyla doğrulayın, her bağışın makbuzunu inceleyin."
          icon={<HeartHandshake />}
          actions={
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" className="min-h-11 sm:min-h-10" onClick={() => qc.invalidateQueries({ queryKey: donationKeys.all })}>
                <RefreshCw className="h-4 w-4" aria-hidden />
                Yenile
              </Button>
              <Button className="min-h-11 sm:min-h-10" onClick={() => setEditor({ open: true, project: null })}>
                <Plus className="h-4 w-4" aria-hidden />
                Yeni kampanya
              </Button>
            </div>
          }
        />
      }
    >
      {s && !s.moduleEnabled ? (
        <div role="status" className={cn('rounded-lg border p-3 text-sm', TONE_CALLOUT.warning)}>
          Bağış modülü müşteriler için kapalı; kampanyalar açık olsa da müşteri bağış yapamaz.{' '}
          <Link href="/admin/features" className="font-medium underline underline-offset-2">
            Modülü yönet
          </Link>
        </div>
      ) : null}

      {stats.isError && !s ? (
        <ErrorState title="Bağış göstergeleri yüklenemedi" description={errorText(stats.error)} onRetry={() => stats.refetch()} />
      ) : (
        <MetricGrid cols={4}>
          <MetricTile
            label="Toplam bağış puanı"
            metric={{ value: s?.totalPoints ?? null, unit: 'puan', series: s?.series.map((d) => d.points) ?? null }}
            sparklineLabel={s ? `Son 30 günde ${fmtNumber(s.last30Points)} puan` : undefined}
            hint={s ? `Son 30 gün: ${fmtNumber(s.last30Points)} puan · ${fmtNumber(s.last30Donations)} bağış` : undefined}
            icon={<HeartHandshake />}
            tone="brand"
            loading={!s}
          />
          <MetricTile
            label="Bağış sayısı"
            metric={{ value: s?.donations ?? null }}
            hint={s ? `Ortalama ${s.avgDonation != null ? fmtNumber(s.avgDonation) : '—'} puan` : undefined}
            icon={<Receipt />}
            loading={!s}
          />
          <MetricTile label="Bağışçı" metric={{ value: s?.donors ?? null }} hint="Benzersiz kullanıcı" icon={<Users />} loading={!s} />
          <MetricTile
            label="Bağış alan kampanya"
            metric={{ value: s?.projects.live ?? null }}
            hint={s ? `${fmtNumber(s.projects.total - s.projects.archived)} kampanya · ${fmtNumber(s.projects.completed)} hedefe ulaştı · ${fmtNumber(s.projects.scheduled)} planlı` : undefined}
            icon={<Target />}
            tone="success"
            loading={!s}
            href="?tab=kampanyalar&status=live"
          />
        </MetricGrid>
      )}

      {s && (s.mismatchedProjects > 0 || s.unreceiptedDonations > 0 || ledgerGap !== 0) ? (
        <section aria-labelledby="seffaf" className={cn('space-y-1 rounded-lg border p-3 text-sm', TONE_CALLOUT.info)}>
          <h2 id="seffaf" className="flex items-center gap-2 font-medium">
            <Scale className="h-4 w-4" aria-hidden />
            Şeffaf toplam
          </h2>
          <ul className="list-disc space-y-0.5 pl-5">
            <li>
              Bağış kayıtları toplamı {fmtNumber(s.totalPoints)} puan; puan defterinde bağış olarak düşülen {fmtNumber(s.ledgerPoints)} puan
              {ledgerGap !== 0 ? ` (fark ${fmtNumber(ledgerGap)} — defter öncesi kayıtlardan)` : ''}.
            </li>
            {s.unreceiptedDonations > 0 ? <li>{fmtNumber(s.unreceiptedDonations)} bağışın defter satırı yok (eski kayıt; makbuz numarası yine verilir).</li> : null}
            {s.mismatchedProjects > 0 ? (
              <li>
                {fmtNumber(s.mismatchedProjects)} kampanyada müşteriye gösterilen ilerleme gerçek bağış toplamından farklı; kampanya ayrıntısından gerekçeyle uzlaştırabilirsiniz.
              </li>
            ) : null}
          </ul>
        </section>
      ) : null}

      <SectionTabs
        ariaLabel="Bağış bölümleri"
        defaultValue="kampanyalar"
        resetKeys={['page', 'size', 'q', 'status', 'category', 'siralama', 'proje', 'from', 'to', 'gorunurluk', 'min', 'kisi']}
        tabs={[
          { value: 'kampanyalar', label: 'Kampanyalar', icon: <ListChecks />, count: s ? s.projects.total - s.projects.archived : undefined },
          { value: 'islemler', label: 'İşlemler', icon: <Receipt />, count: s?.donations },
        ]}
      >
        {(tab) => (tab === 'islemler' ? <TransactionsTab /> : <ProjectsTab initial={initial.projects} onCreate={() => setEditor({ open: true, project: null })} />)}
      </SectionTabs>

      <DetailSheet
        paramKey="kampanya"
        size="lg"
        title="Kampanya ayrıntısı"
        description="Şeffaf toplam, eğilim, bağışçılar ve değişiklik geçmişi"
        footer={(id: string) => (
          <Button asChild variant="outline" className="min-h-11">
            <Link href={`?tab=islemler&proje=${encodeURIComponent(id)}`}><AdminKesifBagisText k="allDonations" /></Link>
          </Button>
        )}
      >
        {(id: string) => <ProjectDetailBody id={id} onEdit={(p) => setEditor({ open: true, project: p })} />}
      </DetailSheet>

      <DetailSheet paramKey="makbuz" size="md" title="Bağış makbuzu" description="Makbuz numarası ve puan defteri eşleşmesi">
        {(id: string) => <ReceiptBody id={id} />}
      </DetailSheet>

      <ProjectEditor
        open={editor.open}
        project={editor.project}
        onOpenChange={(open) => setEditor((st) => ({ ...st, open }))}
        onSaved={async (id) => {
          await qc.invalidateQueries({ queryKey: donationKeys.all });
          sheet.open(id);
        }}
      />
    </PanelPage>
  );
}
