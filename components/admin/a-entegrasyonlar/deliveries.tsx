'use client';

import { useState } from 'react';
import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { ChevronDown, Loader2, RotateCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { StatusBadge } from '@/components/ds/data';
import { QueryState } from '@/components/states';
import { webhookEventLabel, type DeliveryItem } from '@/lib/integrations/contract';
import { cn } from '@/lib/utils';
import { errorText, fetchDeliveries, intKeys, resendDelivery } from './api';
import { ERROR_KIND_LABEL, fmtAbs, fmtRel } from './format';

function prettyJson(s: string | null): string {
  if (!s) return '';
  try {
    return JSON.stringify(JSON.parse(s), null, 2);
  } catch {
    return s;
  }
}

/**
 * Teslim günlüğü (imleçli, "daha fazla yükle"). Satır genişleyince istek gövdesi + yanıt
 * parçası; gövdesi saklanan teslim "Yeniden gönder" ile aynı uca tekrar gönderilir.
 */
export function DeliveryLog({ webhookId, hostOf, canResend = true }: { webhookId?: string; hostOf?: (id: string) => string | null; canResend?: boolean }) {
  const qc = useQueryClient();
  const [status, setStatus] = useState<'all' | 'failed' | 'ok'>(webhookId ? 'all' : 'failed');
  const [open, setOpen] = useState<string | null>(null);
  const q = useInfiniteQuery({
    queryKey: intKeys.deliveries(webhookId ?? '', status),
    queryFn: ({ pageParam, signal }) => fetchDeliveries(webhookId ?? '', status, pageParam, signal),
    initialPageParam: null as string | null,
    getNextPageParam: (last) => last.nextCursor,
    staleTime: 10_000,
  });
  const resend = useMutation({
    mutationFn: resendDelivery,
    onSuccess: (r) => {
      if (r.ok) toast.success(`Yeniden gönderildi · HTTP ${r.status}`);
      else toast.error(`Yeniden gönderim başarısız: ${r.error ?? 'bilinmeyen hata'}`);
      void qc.invalidateQueries({ queryKey: intKeys.all });
    },
    onError: (e) => toast.error(errorText(e)),
  });

  const items = q.data?.pages.flatMap((p) => p.items) ?? [];
  const queryLike = { ...q, data: q.data ? items : undefined };

  return (
    <div className="space-y-3">
      <div role="radiogroup" aria-label="Teslim durumu" className="flex flex-wrap gap-2">
        {(
          [
            ['failed', 'Başarısız'],
            ['ok', 'Başarılı'],
            ['all', 'Tümü'],
          ] as const
        ).map(([v, l]) => (
          <button
            key={v}
            type="button"
            role="radio"
            aria-checked={status === v}
            onClick={() => setStatus(v)}
            className={cn(
              'min-h-11 rounded-full border px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:min-h-9',
              status === v ? 'border-brand bg-brand-subtle text-brand' : 'border-border text-fg-muted hover:text-fg'
            )}
          >
            {l}
          </button>
        ))}
      </div>
      <QueryState
        query={queryLike as never}
        skeleton="list"
        empty={{
          title: status === 'failed' ? 'Başarısız teslim yok' : 'Teslim kaydı yok',
          description: status === 'failed' ? 'Bu görünümde hata kaydı bulunmuyor — her şey yolunda.' : 'Abone olunan bir olay gerçekleştiğinde teslimler burada görünür.',
          tone: status === 'failed' ? 'success' : undefined,
        }}
      >
        <ul className="divide-y divide-border rounded-card border border-border">
          {items.map((d: DeliveryItem) => {
            const expanded = open === d.id;
            const host = !webhookId && hostOf ? hostOf(d.webhookId) : null;
            return (
              <li key={d.id}>
                <button
                  type="button"
                  className="flex min-h-11 w-full flex-wrap items-center gap-2 px-3 py-2 text-left hover:bg-surface-muted focus-visible:bg-surface-muted focus-visible:outline-none"
                  aria-expanded={expanded}
                  aria-controls={`dl-${d.id}`}
                  onClick={() => setOpen(expanded ? null : d.id)}
                >
                  <StatusBadge size="sm" tone={d.ok ? 'success' : 'danger'} label={d.ok ? `HTTP ${d.status}` : d.status ? `HTTP ${d.status}` : ERROR_KIND_LABEL[d.errorKind ?? ''] ?? 'Hata'} />
                  <span className="text-sm text-fg">{webhookEventLabel(d.event)}</span>
                  {d.test ? <span className="text-xs text-fg-muted">(test)</span> : null}
                  {d.resendOf ? <span className="text-xs text-fg-muted">(yeniden gönderim)</span> : null}
                  {host ? <span className="font-mono text-xs text-fg-muted">{host}</span> : !webhookId ? <span className="text-xs text-fg-muted">Silinmiş webhook</span> : null}
                  <span className="ml-auto flex items-center gap-2 text-xs text-fg-muted">
                    {d.durationMs != null ? `${d.durationMs} ms` : null}
                    {d.attempts && d.attempts > 1 ? ` · ${d.attempts} deneme` : null}
                    <time dateTime={d.at} title={fmtAbs(d.at)}>
                      {fmtRel(d.at)}
                    </time>
                    <ChevronDown className={cn('h-4 w-4 transition-transform duration-fast', expanded && 'rotate-180')} aria-hidden />
                  </span>
                </button>
                {expanded ? (
                  <div id={`dl-${d.id}`} className="space-y-3 border-t border-border bg-surface-muted/40 px-3 py-3 text-sm">
                    {d.error ? <p className="text-danger">{d.error}</p> : null}
                    {d.body ? (
                      <div>
                        <p className="mb-1 text-xs font-medium text-fg-muted">İstek gövdesi</p>
                        <pre className="max-h-48 overflow-auto rounded bg-surface-1 p-2 font-mono text-xs text-fg">{prettyJson(d.body)}</pre>
                      </div>
                    ) : (
                      <p className="text-xs text-fg-muted">İstek gövdesi saklanmamış (eski kayıt ya da 16 KB üstü).</p>
                    )}
                    {d.responseSnippet ? (
                      <div>
                        <p className="mb-1 text-xs font-medium text-fg-muted">Yanıt (ilk 500 karakter)</p>
                        <pre className="max-h-32 overflow-auto rounded bg-surface-1 p-2 font-mono text-xs text-fg">{d.responseSnippet}</pre>
                      </div>
                    ) : null}
                    {canResend && d.hasBody ? (
                      <Button size="sm" variant="outline" className="min-h-11 sm:min-h-9" disabled={resend.isPending} onClick={() => resend.mutate(d.id)}>
                        {resend.isPending && resend.variables === d.id ? <Loader2 className="h-4 w-4 motion-safe:animate-spin" aria-hidden /> : <RotateCw className="h-4 w-4" aria-hidden />}
                        Yeniden gönder
                      </Button>
                    ) : null}
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
        {q.hasNextPage ? (
          <div className="mt-3 flex justify-center">
            <Button variant="outline" className="min-h-11" onClick={() => q.fetchNextPage()} disabled={q.isFetchingNextPage}>
              {q.isFetchingNextPage ? <Loader2 className="h-4 w-4 motion-safe:animate-spin" aria-hidden /> : null}
              Daha fazla yükle
            </Button>
          </div>
        ) : null}
      </QueryState>
    </div>
  );
}
