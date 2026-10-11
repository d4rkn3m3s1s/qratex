'use client';

import { useRef } from 'react';
import Link from 'next/link';
import { useInfiniteQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowRight, ArrowUpRight, History, Undo2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { ConfirmAction, EmptyState, QueryState, SectionCard } from '@/components/states';
import { StatusBadge } from '@/components/ds';
import { PLATFORM_AUDIT } from '@/lib/platform-settings/registry';
import type { HistoryItem } from '@/lib/platform-settings/server';
import { applyRevert, fetchHistory, formatIstanbul, previewRevert, settingsKeys } from './api';
import { formatSettingValue } from './shared';

export function HistorySection() {
  const query = useInfiniteQuery({
    queryKey: settingsKeys.history,
    queryFn: ({ pageParam, signal }) => fetchHistory(pageParam, signal),
    initialPageParam: null as string | null,
    getNextPageParam: (last) => last.nextCursor,
  });
  const items = query.data?.pages.flatMap((p) => p.items) ?? [];

  return (
    <SectionCard
      title="Değişiklik geçmişi"
      description="Bu ekrandaki her kayıt ayar başına tek satır yazılır: önceki ve yeni değer, kim, ne zaman. Geri alma önce farkı gösterir."
      icon={<History aria-hidden />}
      actions={
        <Button asChild variant="ghost" size="sm" className="min-h-11 gap-1.5">
          <Link href="/admin/audit?varlik=settings">
            Tüm denetim kaydı <ArrowUpRight className="h-4 w-4" aria-hidden />
          </Link>
        </Button>
      }
    >
      <QueryState
        query={{ ...query, data: query.data ? items : undefined }}
        skeleton="list"
        loadingLabel="Geçmiş yükleniyor"
        empty={<EmptyState title="Henüz kayıt yok" description="Bu ekrandan yapılan ilk ayar değişikliği burada görünecek." compact />}
      >
        {(rows) => (
          <>
            <ol className="divide-y divide-border">
              {rows.map((it) => (
                <HistoryRow key={it.id} item={it} />
              ))}
            </ol>
            {query.hasNextPage ? (
              <div className="mt-4 flex justify-center">
                <Button variant="outline" className="min-h-11" loading={query.isFetchingNextPage} onClick={() => void query.fetchNextPage()}>
                  Daha eski kayıtlar
                </Button>
              </div>
            ) : null}
          </>
        )}
      </QueryState>
    </SectionCard>
  );
}

function HistoryRow({ item }: { item: HistoryItem }) {
  const qc = useQueryClient();
  const who = item.actor?.name || item.actor?.email || 'Bilinmeyen hesap';
  const isRevert = item.action === PLATFORM_AUDIT.REVERT;

  const revert = async (baseVersion: string) => {
    const res = await applyRevert(item.id, baseVersion);
    qc.setQueryData(settingsKeys.state, res.state);
    await qc.invalidateQueries({ queryKey: settingsKeys.history });
    toast.success(`“${item.label}” önceki değerine döndürüldü.`);
  };

  // Önizlemede okunan sürüm: geri alma tam olarak gösterilen değerin üzerine yapılır (arada değiştiyse 409).
  const previewVersion = useRef<string | null>(null);

  return (
    <li className="flex flex-col gap-3 py-4 sm:flex-row sm:items-start sm:justify-between">
      <div className="min-w-0 space-y-1">
        <div className="flex flex-wrap items-center gap-2">
          <p className="qx-body font-medium text-fg">{item.label}</p>
          {isRevert ? <StatusBadge size="sm" label="Geri alma" tone="info" icon={null} /> : null}
        </div>
        <p className="qx-small flex flex-wrap items-center gap-1.5 text-fg-muted">
          <span className="line-through decoration-fg-subtle">{formatSettingValue(item.key, item.before)}</span>
          <ArrowRight className="h-3.5 w-3.5" aria-label="yeni değer" />
          <span className="font-medium text-fg">{formatSettingValue(item.key, item.after)}</span>
        </p>
        <p className="qx-caption text-fg-muted">
          {who} · <time dateTime={item.at}>{formatIstanbul(item.at)}</time>
        </p>
      </div>
      {item.revertible ? (
        <ConfirmAction
          trigger={
            <Button variant="outline" size="sm" className="min-h-11 shrink-0 gap-1.5">
              <Undo2 className="h-4 w-4" aria-hidden /> Bu değişikliği geri al
            </Button>
          }
          tone="warning"
          title={`“${item.label}” geri alınsın mı?`}
          description="Ayar bu değişiklikten önceki değerine döner; geri alma da geçmişe yazılır."
          loadImpact={async () => {
            const p = await previewRevert(item.id);
            previewVersion.current = p.currentVersion;
            return [
              { label: 'Şimdiki değer', value: formatSettingValue(p.key, p.current) },
              { label: 'Geri yüklenecek değer', value: formatSettingValue(p.key, p.target), emphasis: true },
            ];
          }}
          irreversibleNote={false}
          confirmLabel="Geri al"
          onConfirm={async () => {
            if (!previewVersion.current) {
              const p = await previewRevert(item.id);
              previewVersion.current = p.currentVersion;
            }
            await revert(previewVersion.current!);
          }}
        />
      ) : null}
    </li>
  );
}
