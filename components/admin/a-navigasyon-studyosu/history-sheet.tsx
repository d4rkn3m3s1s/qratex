'use client';

import { useInfiniteQuery } from '@tanstack/react-query';
import { History, Undo2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { QueryState } from '@/components/states';
import type { NavHistoryEntry } from '@/lib/admin-navigation/contract';
import { fetchNavHistory, navKeys } from './api';

const fmt = new Intl.DateTimeFormat('tr-TR', { timeZone: 'Europe/Istanbul', dateStyle: 'medium', timeStyle: 'short' });

/**
 * Sürüm geçmişi: navigasyon yayınları + eski sayfaların ve Ayarlar'daki görünürlüğün yazdığı
 * kayıtlar. "Taslağa yükle" o sürümün değerlerini TASLAĞA koyar; yayınlamak ayrı bir adımdır
 * (önizlenip fark incelenebilsin). Hiçbir sürüm silinmez.
 */
export function NavHistorySheet({
  open,
  onOpenChange,
  onLoad,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onLoad: (entry: NavHistoryEntry) => void;
}) {
  const history = useInfiniteQuery({
    queryKey: navKeys.history,
    queryFn: ({ pageParam, signal }) => fetchNavHistory(pageParam, signal),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
    enabled: open,
  });
  const entries = history.data?.pages.flatMap((p) => p.entries) ?? [];
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-lg">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <History className="h-5 w-5" aria-hidden /> Sürüm geçmişi
          </SheetTitle>
          <SheetDescription>
            Her yayın bir sürümdür. Bir sürümü taslağa yükleyip önizledikten sonra yayınlayabilirsiniz.
          </SheetDescription>
        </SheetHeader>
        <div className="mt-4">
          <QueryState
            query={{ ...history, data: history.data ? entries : undefined }}
            skeleton="list"
            isEmpty={(d) => d.length === 0}
            empty={{ title: 'Henüz kayıt yok', description: 'Menü ilk kez yayınlandığında geçmiş burada başlar.', compact: true }}
          >
            {() => (
              <ol className="space-y-3">
                {entries.map((e, i) => (
                  <li key={e.id} className="rounded-card border border-border bg-surface-1 p-3">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-fg">
                          {e.actionLabel}
                          {i === 0 ? (
                            <span className="ml-2 rounded-chip bg-success-subtle px-1.5 py-0.5 text-xs font-medium text-success">Son</span>
                          ) : null}
                        </p>
                        <p className="text-xs text-fg-muted">
                          <time dateTime={e.at}>{fmt.format(new Date(e.at))}</time> · {e.actor}
                        </p>
                      </div>
                      {Object.keys(e.snapshot).length > 0 && (
                        <Button
                          variant="outline"
                          size="sm"
                          className="min-h-11 sm:min-h-9"
                          onClick={() => onLoad(e)}
                          aria-label={`${fmt.format(new Date(e.at))} sürümünü taslağa yükle`}
                        >
                          <Undo2 className="h-4 w-4" aria-hidden /> Taslağa yükle
                        </Button>
                      )}
                    </div>
                    {e.changes.length > 0 ? (
                      <ul className="mt-2 space-y-0.5 text-xs text-fg-muted">
                        {e.changes.slice(0, 8).map((c, k) => (
                          <li key={k}>• {c}</li>
                        ))}
                        {e.changes.length > 8 && <li>… ve {e.changes.length - 8} değişiklik daha</li>}
                      </ul>
                    ) : (
                      <p className="mt-2 text-xs text-fg-muted">Görünür bir fark yok (ör. varsayılanla aynı değer yeniden kaydedildi).</p>
                    )}
                  </li>
                ))}
                {history.hasNextPage && (
                  <li>
                    <Button
                      variant="ghost"
                      className="min-h-11 w-full"
                      disabled={history.isFetchingNextPage}
                      onClick={() => void history.fetchNextPage()}
                    >
                      {history.isFetchingNextPage ? 'Yükleniyor…' : 'Daha eski sürümler'}
                    </Button>
                  </li>
                )}
              </ol>
            )}
          </QueryState>
        </div>
      </SheetContent>
    </Sheet>
  );
}
