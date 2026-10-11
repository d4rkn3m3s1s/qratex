'use client';

import { useState } from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { History, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { SectionCard } from '@/components/ds/page';
import { ConfirmAction, QueryState } from '@/components/states';
import type { DiscoveryConfigValue, HistoryPage } from '@/lib/admin-discovery/contract';
import { discoveryKeys, fetchHistory } from '../api';
import { fmtDateTime, fmtNumber } from '../format';
import { AdminKesifBagisText } from '../copy';

/**
 * Geçmiş — denetim kaydından keşif ayarı sürümleri. "Taslağa yükle" yalnız taslağı değiştirir;
 * yayın yine `baseVersion` kilitli "Yayınla" adımıdır ve geri yükleme denetim kaydında iz bırakır.
 */
export default function HistoryTab({ dirty, onLoad }: { currentVersion: string; dirty: boolean; onLoad: (c: DiscoveryConfigValue, fromAuditId: string) => void }) {
  const [page, setPage] = useState(1);
  const q = useQuery({ queryKey: discoveryKeys.history(page), queryFn: () => fetchHistory(page), placeholderData: keepPreviousData, staleTime: 30_000 });

  return (
    <div className="space-y-4 pt-4">
      <SectionCard title="Yayın geçmişi" description="Her yayın kim tarafından ve ne zaman yapıldı; önceki bir sürümü taslağa alıp yeniden yayınlayabilirsiniz." icon={<History />} density="compact">
        <QueryState
          query={q}
          skeleton="list"
          isEmpty={(d: HistoryPage) => d.items.length === 0}
          empty={{ title: 'Henüz yayın yok', description: 'İlk yayından sonra sürümler burada listelenir.' }}
        >
          {(d: HistoryPage) => (
            <div className="space-y-3">
              <ol className="divide-y divide-border">
                {d.items.map((h, i) => (
                  <li key={h.id} className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between">
                    <div className="min-w-0 text-sm">
                      <p className="font-medium text-fg">
                        <time dateTime={h.at}>{fmtDateTime(h.at)}</time>
                        {page === 1 && i === 0 ? <span className="ml-2 text-xs font-normal text-success"><AdminKesifBagisText k="liveVersion" /></span> : null}
                        {h.restoredFrom ? <span className="ml-2 text-xs font-normal text-fg-muted"><AdminKesifBagisText k="restored" /></span> : null}
                      </p>
                      <p className="text-fg-muted">
                        {h.actor ?? 'Bilinmeyen yönetici'} · {fmtNumber(h.summary.locations)} yedek konum · {fmtNumber(h.summary.sponsored)} duyuru ({fmtNumber(h.summary.liveSponsored)} şu an yayında olurdu)
                      </p>
                    </div>
                    {h.config && !(page === 1 && i === 0) ? (
                      dirty ? (
                        <ConfirmAction
                          tone="warning"
                          title="Taslak bu sürümle değiştirilsin mi?"
                          description="Kaydedilmemiş değişiklikleriniz silinir. Yayınlamak için ardından “Yayınla”ya basmanız gerekir."
                          irreversibleNote={false}
                          confirmLabel="Taslağa yükle"
                          trigger={
                            <Button variant="outline" size="sm" className="min-h-11 shrink-0 sm:min-h-9">
                              <RotateCcw className="h-4 w-4" aria-hidden />
                              Taslağa yükle
                            </Button>
                          }
                          onConfirm={() => onLoad(h.config as DiscoveryConfigValue, h.id)}
                        />
                      ) : (
                        <Button variant="outline" size="sm" className="min-h-11 shrink-0 sm:min-h-9" onClick={() => onLoad(h.config as DiscoveryConfigValue, h.id)}>
                          <RotateCcw className="h-4 w-4" aria-hidden />
                          Taslağa yükle
                        </Button>
                      )
                    ) : null}
                  </li>
                ))}
              </ol>
              {d.total > d.size ? (
                <div className="flex items-center justify-between gap-2">
                  <Button variant="outline" size="sm" className="min-h-11 sm:min-h-9" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
                    Önceki
                  </Button>
                  <span className="text-sm text-fg-muted">
                    Sayfa {page} / {Math.ceil(d.total / d.size)}
                  </span>
                  <Button variant="outline" size="sm" className="min-h-11 sm:min-h-9" disabled={page * d.size >= d.total} onClick={() => setPage((p) => p + 1)}>
                    Sonraki
                  </Button>
                </div>
              ) : null}
            </div>
          )}
        </QueryState>
      </SectionCard>
    </div>
  );
}
