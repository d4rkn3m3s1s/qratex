'use client';

import { useInfiniteQuery } from '@tanstack/react-query';
import { ArrowRight, History, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { ConfirmAction, QueryState } from '@/components/states';
import type { SeoHistoryEntry } from '@/lib/admin-seo/contract';
import { fetchSeoHistory, seoKeys } from './api';
import { fmtAbs } from './format';

/**
 * Sürüm geçmişi çekmecesi: her kayıt = bir sürüm; alan bazlı fark (eski → yeni), kim/ne zaman.
 * "Bu sürümü geri yükle" o kayıtla oluşan sürümü (newData) yazar; öncesinde onay + kaydedilmemiş
 * taslağın ezileceği uyarısı (bulgu 7).
 */
export function SeoHistorySheet({
  open,
  onOpenChange,
  dirty,
  onRestore,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  dirty: boolean;
  onRestore: (entry: SeoHistoryEntry) => Promise<unknown>;
}) {
  const history = useInfiniteQuery({
    queryKey: seoKeys.history(),
    queryFn: ({ pageParam, signal }) => fetchSeoHistory(pageParam, signal),
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
          <SheetDescription>Her kayıt bir sürümdür. Geri yükleme yeni bir kayıt olarak eklenir; hiçbir sürüm silinmez.</SheetDescription>
        </SheetHeader>
        <div className="mt-4">
          <QueryState
            query={{ ...history, data: history.data ? entries : undefined }}
            skeleton="list"
            isEmpty={(d) => d.length === 0}
            empty={{ title: 'Henüz kayıt yok', description: 'SEO ayarları ilk kez kaydedildiğinde geçmiş burada başlar.', compact: true }}
          >
            {() => (
              <ol className="space-y-3">
                {entries.map((e, i) => (
                  <li key={e.id} className="rounded-card border border-border bg-surface-1 p-3">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div>
                        <p className="text-sm font-semibold text-fg">
                          {e.actionLabel}
                          {i === 0 ? <span className="ml-2 rounded-chip bg-success-subtle px-1.5 py-0.5 text-xs font-medium text-success">Şu anki</span> : null}
                        </p>
                        <p className="text-xs text-fg-subtle">{fmtAbs(e.createdAt)}{e.actor ? ` · ${e.actor}` : ''}</p>
                      </div>
                      {e.canRestore && i > 0 ? (
                        <ConfirmAction
                          tone="warning"
                          title="Bu sürüm geri yüklensin mi?"
                          description={`${fmtAbs(e.createdAt)} tarihli sürüm yayına alınır. Mevcut ayarlar geçmişte kalır, istenirse tekrar geri yüklenebilir.`}
                          impact={{
                            items: [{ label: 'Değişen alan', value: `${e.changes.length}` }],
                            warning: dirty ? 'Kaydedilmemiş düzenlemeleriniz kaybolacak.' : undefined,
                          }}
                          irreversibleNote={false}
                          confirmLabel="Geri yükle"
                          onConfirm={() => onRestore(e)}
                          trigger={
                            <Button size="sm" variant="outline" className="min-h-11 sm:min-h-9">
                              <RotateCcw className="h-4 w-4" aria-hidden /> Bu sürümü geri yükle
                            </Button>
                          }
                        />
                      ) : null}
                    </div>
                    {e.dangerous.length ? (
                      <ul className="mt-2 space-y-1 rounded-control border border-danger-border bg-danger-subtle p-2 text-xs text-fg">
                        {e.dangerous.map((d) => <li key={d}>{d}</li>)}
                      </ul>
                    ) : null}
                    {e.changes.length ? (
                      <dl className="mt-2 space-y-1.5 text-xs">
                        {e.changes.slice(0, 12).map((c) => (
                          <div key={c.key} className="grid grid-cols-[8rem_minmax(0,1fr)] gap-2">
                            <dt className="font-medium text-fg-muted">{c.label}</dt>
                            <dd className="min-w-0 break-words text-fg">
                              <span className="text-fg-subtle line-through">{c.before}</span>
                              <ArrowRight className="mx-1 inline h-3 w-3" aria-label="yerine" />
                              <span>{c.after}</span>
                            </dd>
                          </div>
                        ))}
                        {e.changes.length > 12 ? <p className="text-fg-subtle">+{e.changes.length - 12} alan daha</p> : null}
                      </dl>
                    ) : (
                      <p className="mt-2 text-xs text-fg-subtle">Alan değişikliği yok.</p>
                    )}
                  </li>
                ))}
              </ol>
            )}
          </QueryState>
          {history.hasNextPage ? (
            <Button variant="outline" className="mt-3 min-h-11 w-full" disabled={history.isFetchingNextPage} onClick={() => void history.fetchNextPage()}>
              Daha eski sürümler
            </Button>
          ) : null}
        </div>
      </SheetContent>
    </Sheet>
  );
}
