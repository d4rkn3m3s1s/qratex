'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { BarChart3, Megaphone, MessageSquareQuote, Pin, Smile, Star } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ChoiceChips } from '@/components/ds/a11y';
import { PanelPage, PageHeader, SectionCard } from '@/components/ds/page';
import { MetricGrid, MetricTile } from '@/components/ds/data';
import { QueryState } from '@/components/states';
import { cn } from '@/lib/utils';
import type { WallOverviewDto, WallRange } from '@/lib/dealer/voc-wall/config';
import { fetchOverview, fetchPreview, overviewKey, previewKey, setActAsDealer } from './api';
import { CurationList } from './curation-list';
import { RulesPanel } from './rules-panel';
import { WallDisplay } from './wall-display';

// Ekran bağlantıları paneli yalnız sahip için ve gerektiğinde yüklenir.
const DisplaysPanel = dynamic(() => import('./displays-panel').then((m) => m.DisplaysPanel), { ssr: false });

const RANGE_OPTIONS: Array<{ value: '7' | '30' | '90'; label: string }> = [
  { value: '7', label: '7 gün' },
  { value: '30', label: '30 gün' },
  { value: '90', label: '90 gün' },
];

export interface VocWallScreenProps {
  role: 'DEALER' | 'STAFF' | 'ADMIN';
  /** ADMIN bayi adına görüntülüyorsa hedef bayi. */
  actAsDealerId: string | null;
  initialRange: WallRange;
}

function Themes({ overview }: { overview: WallOverviewDto }) {
  if (overview.themes.length === 0) {
    return <p className="qx-small text-fg-muted">Bu dönemde AI ile analiz edilmiş tema yok.</p>;
  }
  const max = Math.max(...overview.themes.map((t) => t.total));
  return (
    <ul className="space-y-3">
      {overview.themes.map((t) => (
        <li key={t.theme}>
          <div className="qx-small flex items-baseline justify-between gap-2">
            <span className="truncate font-medium text-fg">{t.theme}</span>
            <span className="qx-num shrink-0 text-fg-muted">
              {t.total} · <span className="text-success">{t.positive} olumlu</span> · <span className="text-danger">{t.negative} olumsuz</span>
            </span>
          </div>
          <div className="mt-1 flex h-1.5 overflow-hidden rounded-full bg-surface-muted" aria-hidden style={{ width: `${Math.max(12, (t.total / max) * 100)}%` }}>
            <span className="bg-success" style={{ width: `${(t.positive / t.total) * 100}%` }} />
            <span className="bg-fg-subtle" style={{ width: `${((t.total - t.positive - t.negative) / t.total) * 100}%` }} />
            <span className="bg-danger" style={{ width: `${(t.negative / t.total) * 100}%` }} />
          </div>
        </li>
      ))}
    </ul>
  );
}

/**
 * Bayi › Müşteri sesi duvarı — iki yüzlü ürünün YÖNETİM yüzü: hangi yorumun mağaza ekranında
 * yayınlanacağını belirle (sabitle/gizle + kurallar), ekranı önizle, TV için güvenli bağlantı
 * üret. Analitik derinlik burada tekrarlanmaz; mini KPI + Analitik bağlantısı.
 */
export function VocWallScreen({ role, actAsDealerId, initialRange }: VocWallScreenProps) {
  setActAsDealer(actAsDealerId);
  useEffect(() => () => setActAsDealer(null), []);
  const [range, setRange] = useState<WallRange>(initialRange);
  const [qrCodeId, setQrCodeId] = useState<string | null>(null);
  const isOwner = role === 'DEALER';
  const canModerate = role !== 'ADMIN';

  const overview = useQuery({
    queryKey: overviewKey(range, qrCodeId),
    queryFn: () => fetchOverview(range, qrCodeId),
    placeholderData: keepPreviousData,
  });
  const preview = useQuery({ queryKey: previewKey, queryFn: fetchPreview, refetchInterval: 60_000 });

  const rangeLabel = `önceki ${range} güne göre`;
  const o = overview.data;
  const delta = (cur: number | null | undefined, prev: number | null | undefined) =>
    cur != null && prev != null ? cur - prev : null;

  return (
    <PanelPage
      register="ops"
      header={
        <PageHeader
          title="Müşteri sesi duvarı"
          description="Mağaza ekranında hangi yorumların görüneceğini belirleyin ve ekranı güvenli bir bağlantıyla TV'ye aktarın."
          icon={<MessageSquareQuote aria-hidden className="h-5 w-5" />}
          actions={
            <Button asChild variant="outline" className="min-h-11">
              <Link href="/dealer/analytics">
                <BarChart3 aria-hidden className="mr-2 h-4 w-4" /> Ayrıntılı analiz
              </Link>
            </Button>
          }
        />
      }
      toolbar={
        <div className="flex flex-wrap items-center gap-3">
          <ChoiceChips
            aria-label="Dönem"
            size="sm"
            options={RANGE_OPTIONS}
            value={String(range) as '7'}
            onChange={(v) => v && setRange(Number(v) as WallRange)}
          />
          <label className="sr-only" htmlFor="voc-qr-filter">
            QR / şube süzgeci
          </label>
          <select
            id="voc-qr-filter"
            value={qrCodeId ?? ''}
            onChange={(e) => setQrCodeId(e.target.value || null)}
            className="min-h-11 rounded-control border border-input bg-background px-3 text-sm text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
          >
            <option value="">Tüm QR kodlar</option>
            {o?.qrCodes.map((q) => (
              <option key={q.id} value={q.id}>
                {q.location ? `${q.location} · ${q.name}` : q.name}
              </option>
            ))}
          </select>
          {role === 'ADMIN' && <span className="qx-caption text-fg-muted">Yönetici görünümü · salt-okunur</span>}
        </div>
      }
      aside={
        <div className="space-y-6">
          <SectionCard title="Ekran önizlemesi" description="TV'de görünen akışın aynısı." density="compact">
            <QueryState query={preview} skeleton="block">
              {(feed) => <WallDisplay feed={feed} variant="preview" />}
            </QueryState>
          </SectionCard>
          {o && <RulesPanel overview={o} canEdit={isOwner} />}
          {o && isOwner && <DisplaysPanel overview={o} />}
        </div>
      }
      asideWidth="lg"
      asideOnMobile="after"
    >
      <QueryState query={overview} skeleton="stats" showRefreshing>
        {(ov) => (
          <div className={cn('space-y-6', overview.isPlaceholderData && 'opacity-70 transition-opacity')}>
            <MetricGrid cols={4}>
              <MetricTile
                label="Ortalama puan"
                icon={<Star aria-hidden className="h-4 w-4" />}
                metric={{
                  value: ov.stats.avgRating,
                  fractionDigits: 1,
                  unit: '/ 5',
                  n: ov.stats.count,
                  delta: delta(ov.stats.avgRating, ov.stats.avgRatingPrev) != null ? { value: delta(ov.stats.avgRating, ov.stats.avgRatingPrev)!, kind: 'absolute', goodDirection: 'up', label: rangeLabel } : null,
                }}
              />
              <MetricTile
                label="Geri bildirim"
                icon={<Megaphone aria-hidden className="h-4 w-4" />}
                metric={{
                  value: ov.stats.count,
                  delta: ov.stats.countPrev > 0 ? { value: ((ov.stats.count - ov.stats.countPrev) / ov.stats.countPrev) * 100, kind: 'percent', goodDirection: 'neutral', label: rangeLabel } : null,
                }}
              />
              <MetricTile
                label="Olumlu oran"
                icon={<Smile aria-hidden className="h-4 w-4" />}
                metric={{
                  value: ov.stats.positivePct,
                  format: 'percent',
                  delta: delta(ov.stats.positivePct, ov.stats.positivePctPrev) != null ? { value: delta(ov.stats.positivePct, ov.stats.positivePctPrev)!, kind: 'points', goodDirection: 'up', label: rangeLabel } : null,
                }}
                hint="AI duygu analizi yapılmış yorumlar içinde"
              />
              <MetricTile
                label="Ekranda yayında"
                icon={<Pin aria-hidden className="h-4 w-4" />}
                metric={{ value: ov.stats.liveCount }}
                hint={`${ov.pinnedCount} sabit · ${ov.hiddenCount} gizli`}
              />
            </MetricGrid>
            <SectionCard title="En çok konuşulan temalar" description={`Son ${ov.range} gün, AI tema analizi.`} density="compact">
              <Themes overview={ov} />
            </SectionCard>
            <CurationList qrCodeId={qrCodeId} canModerate={canModerate} />
          </div>
        )}
      </QueryState>
    </PanelPage>
  );
}
