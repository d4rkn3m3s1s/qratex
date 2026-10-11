'use client';

/**
 * 5651 erişim kayıtları — birleşik akış (denetim, kart denetimi, şüpheli olay, erişim engeli).
 * Sunucu tarafı arama + tarih aralığı + kaynaklar arası cursor sayfalama; IP her zaman maskeli.
 * Kanıt dışa aktarımı CSV + SHA-256 özeti ve denetim kaydı ile yapılır.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useInfiniteQuery, useMutation } from '@tanstack/react-query';
import { Download, Loader2, RefreshCw, Search } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { SectionCard } from '@/components/ds/page';
import { EmptyState, QueryState, TONE_CHIP, type Tone } from '@/components/states';
import { cn } from '@/lib/utils';
import {
  LOG_SOURCES,
  LOG_SOURCE_LABELS,
  LOG_SOURCE_RETENTION,
  type LogSource,
  type LogSourceFilter,
  type LogsPage,
  type LogsQuery,
  type UnifiedLogRow,
} from '@/lib/admin-privacy/contract';
import { downloadLogsCsv, fetchLogs } from './api';
import { formatDateTime } from './format';
import { AdminKvkkText } from './copy';

const FILTER_LABELS: Record<LogSourceFilter, string> = {
  all: 'Tümü',
  audit: 'Denetim',
  card: 'Kart',
  suspicious: 'Şüpheli',
  runtime: 'Erişim engeli',
};

const SOURCE_TONE: Record<LogSource, Tone> = {
  AUDIT: 'info',
  CARD_AUDIT: 'brand',
  SUSPICIOUS: 'warning',
  RUNTIME_GUARD: 'neutral',
};

const SEVERITY_TONE: Record<string, Tone> = { LOW: 'neutral', MEDIUM: 'info', HIGH: 'warning', CRITICAL: 'danger' };
const SEVERITY_LABEL: Record<string, string> = { LOW: 'Düşük', MEDIUM: 'Orta', HIGH: 'Yüksek', CRITICAL: 'Kritik' };

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

function useLogsUrl() {
  const sp = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const raw = sp.get('source') as LogSourceFilter | null;
  const query: Partial<LogsQuery> = {
    source: raw && (LOG_SOURCES as readonly string[]).includes(raw) ? raw : 'all',
    q: sp.get('q') || undefined,
    user: sp.get('user') || undefined,
    from: DAY_RE.test(sp.get('from') ?? '') ? (sp.get('from') as string) : undefined,
    to: DAY_RE.test(sp.get('to') ?? '') ? (sp.get('to') as string) : undefined,
  };
  const set = useCallback(
    (patch: Record<string, string | null | undefined>) => {
      const next = new URLSearchParams(sp.toString());
      for (const [k, v] of Object.entries(patch)) {
        if (!v || (k === 'source' && v === 'all')) next.delete(k);
        else next.set(k, v);
      }
      next.set('tab', 'kayitlar');
      router.replace(`${pathname}?${next.toString()}`, { scroll: false });
    },
    [sp, router, pathname]
  );
  return { query, set };
}

function useDebouncedCommit(value: string, current: string | undefined, commit: (v: string) => void) {
  useEffect(() => {
    const t = window.setTimeout(() => {
      if (value.trim() !== (current ?? '')) commit(value.trim());
    }, 350);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);
}

function Chip({ tone, children }: { tone: Tone; children: React.ReactNode }) {
  return <span className={cn('inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium', TONE_CHIP[tone])}>{children}</span>;
}

function SourceChip({ row }: { row: UnifiedLogRow }) {
  return (
    <span className="inline-flex flex-wrap items-center gap-1">
      <Chip tone={SOURCE_TONE[row.source]}>{LOG_SOURCE_LABELS[row.source]}</Chip>
      {LOG_SOURCE_RETENTION[row.source] ? <span className="text-[11px] text-fg-subtle">{LOG_SOURCE_RETENTION[row.source]}</span> : null}
    </span>
  );
}

function Severity({ row }: { row: UnifiedLogRow }) {
  if (row.severity) {
    return <Chip tone={SEVERITY_TONE[row.severity] ?? 'neutral'}>{SEVERITY_LABEL[row.severity] ?? row.severity}</Chip>;
  }
  if (row.reason) return <span className="text-xs text-fg-muted">{row.reason}</span>;
  return <span className="text-fg-subtle">—</span>;
}

export function LogsTab() {
  const { query, set } = useLogsUrl();
  const [text, setText] = useState(query.q ?? '');
  const [user, setUser] = useState(query.user ?? '');
  useDebouncedCommit(text, query.q, (v) => set({ q: v || null }));
  useDebouncedCommit(user, query.user, (v) => set({ user: v || null }));

  const key = useMemo(() => JSON.stringify(query), [query]);
  const list = useInfiniteQuery({
    queryKey: ['admin-privacy', 'logs', key],
    queryFn: ({ pageParam }) => fetchLogs({ ...query, cursor: pageParam ?? undefined }),
    initialPageParam: null as string | null,
    getNextPageParam: (last: LogsPage) => last.nextCursor,
  });
  const rows = useMemo(() => list.data?.pages.flatMap((p) => p.items) ?? [], [list.data]);
  const listLike = { ...list, data: list.data ? { items: rows } : undefined };
  const filtered = Boolean(query.q || query.user || query.from || query.to || query.source !== 'all');

  const exporter = useMutation({
    mutationFn: () => downloadLogsCsv(query),
    onSuccess: (r) =>
      toast.success(
        `${r.rows.toLocaleString('tr-TR')} satır dışa aktarıldı${r.truncated ? ' (5000 satır sınırı; aralığı daraltın)' : ''}. SHA-256: ${(r.sha256 ?? '').slice(0, 16)}…`
      ),
    onError: (e) => toast.error(e instanceof Error ? e.message : 'Dışa aktarma yapılamadı.'),
  });

  return (
    <div className="flex flex-col gap-4">
      <SectionCard
        title="Filtreler"
        description="Arama sunucuda yapılır. IP adresleri her zaman maskelidir; ham IP bu ekrandan alınamaz."
        density="compact"
      >
        <div className="flex flex-col gap-3">
          <div role="radiogroup" aria-label="Kaynak" className="flex gap-1 overflow-x-auto">
            {LOG_SOURCES.map((s) => (
              <button
                key={s}
                type="button"
                role="radio"
                aria-checked={query.source === s}
                onClick={() => set({ source: s })}
                className={cn(
                  'min-h-11 shrink-0 rounded-full px-3 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:min-h-9',
                  query.source === s ? 'bg-brand-subtle font-medium text-brand' : 'text-fg-muted hover:bg-surface-muted hover:text-fg'
                )}
              >
                {FILTER_LABELS[s]}
              </button>
            ))}
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="space-y-1">
              <Label htmlFor="logs-q"><AdminKvkkText k="actionEntity" /></Label>
              <div className="relative">
                <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-fg-muted" aria-hidden />
                <Input id="logs-q" type="search" value={text} onChange={(e) => setText(e.target.value)} className="h-11 pl-8 sm:h-9" placeholder="ör. dsr_, login" />
              </div>
            </div>
            <div className="space-y-1">
              <Label htmlFor="logs-user"><AdminKvkkText k="user" /></Label>
              <Input id="logs-user" type="search" value={user} onChange={(e) => setUser(e.target.value)} className="h-11 sm:h-9" placeholder="Ad ya da e-posta" />
            </div>
            <div className="space-y-1">
              <Label htmlFor="logs-from"><AdminKvkkText k="start" /></Label>
              <Input id="logs-from" type="date" value={query.from ?? ''} max={query.to} onChange={(e) => set({ from: e.target.value || null })} className="h-11 sm:h-9" />
            </div>
            <div className="space-y-1">
              <Label htmlFor="logs-to"><AdminKvkkText k="end" /></Label>
              <Input id="logs-to" type="date" value={query.to ?? ''} min={query.from} onChange={(e) => set({ to: e.target.value || null })} className="h-11 sm:h-9" />
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" className="min-h-11 sm:min-h-9" onClick={() => void list.refetch()} disabled={list.isFetching}>
              <RefreshCw className={cn('h-4 w-4', list.isFetching && 'animate-spin motion-reduce:animate-none')} aria-hidden />
              Yenile
            </Button>
            <Button variant="outline" size="sm" className="min-h-11 sm:min-h-9" onClick={() => exporter.mutate()} disabled={exporter.isPending} aria-busy={exporter.isPending}>
              {exporter.isPending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Download className="h-4 w-4" aria-hidden />}
              Kanıt olarak dışa aktar (CSV)
            </Button>
            {filtered ? (
              <Button
                variant="ghost"
                size="sm"
                className="min-h-11 sm:min-h-9"
                onClick={() => {
                  setText('');
                  setUser('');
                  set({ source: null, q: null, user: null, from: null, to: null });
                }}
              >
                Filtreleri temizle
              </Button>
            ) : null}
          </div>
        </div>
      </SectionCard>

      <SectionCard title="Kayıtlar" description="En yeni önce. Dışa aktarma bu filtrelerle en fazla 5000 satır alır ve denetim günlüğüne yazılır." density="flush">
        <QueryState
          query={listLike}
          skeleton="table"
          isEmpty={(d) => d.items.length === 0}
          empty={
            <EmptyState
              compact
              title={filtered ? 'Bu filtrede kayıt yok' : 'Henüz kayıt yok'}
              description={filtered ? 'Filtreleri genişletin ya da temizleyin.' : 'Yönetim ve güvenlik olayları oluştukça burada görünür.'}
            />
          }
          error={{ title: 'Kayıtlar yüklenemedi' }}
        >
          {() => (
            <>
              <div className="hidden overflow-x-auto md:block" aria-busy={list.isFetching}>
                <table className="w-full text-sm">
                  <caption className="sr-only"><AdminKvkkText k="accessLogs" /></caption>
                  <thead className="border-y border-border bg-surface-muted/50 text-left text-xs text-fg-muted">
                    <tr>
                      <th scope="col" className="px-4 py-2 font-medium">Zaman</th>
                      <th scope="col" className="px-4 py-2 font-medium">Kaynak</th>
                      <th scope="col" className="px-4 py-2 font-medium"><AdminKvkkText k="operation" /></th>
                      <th scope="col" className="px-4 py-2 font-medium"><AdminKvkkText k="user" /></th>
                      <th scope="col" className="px-4 py-2 font-medium">IP</th>
                      <th scope="col" className="px-4 py-2 font-medium"><AdminKvkkText k="browser" /></th>
                      <th scope="col" className="px-4 py-2 font-medium"><AdminKvkkText k="severity" /></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {rows.map((r) => (
                      <tr key={`${r.source}-${r.id}`} className="align-top">
                        <td className="whitespace-nowrap px-4 py-2.5 text-xs text-fg-muted">{formatDateTime(r.createdAt)}</td>
                        <td className="px-4 py-2.5">
                          <SourceChip row={r} />
                        </td>
                        <td className="px-4 py-2.5">
                          <code className="font-mono text-xs text-fg">{r.action}</code>
                          <span className="block text-xs text-fg-muted">
                            {r.entity}
                            {r.entityId ? <span className="font-mono text-fg-subtle"> · {r.entityId}</span> : null}
                          </span>
                        </td>
                        <td className="max-w-[14rem] px-4 py-2.5 text-xs">
                          {r.user ? (
                            <>
                              <span className="block truncate text-fg">{r.user.name ?? '—'}</span>
                              <span className="block truncate text-fg-muted">{r.user.email ?? r.user.id}</span>
                            </>
                          ) : (
                            <span className="text-fg-subtle">Sistem / anonim</span>
                          )}
                        </td>
                        <td className="whitespace-nowrap px-4 py-2.5 font-mono text-xs text-fg">{r.ip ?? '—'}</td>
                        <td className="max-w-[12rem] truncate px-4 py-2.5 text-xs text-fg-muted" title={r.userAgent ?? undefined}>
                          {r.userAgent ?? '—'}
                        </td>
                        <td className="px-4 py-2.5">
                          <Severity row={r} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <ul className="divide-y divide-border md:hidden">
                {rows.map((r) => (
                  <li key={`${r.source}-${r.id}`} className="space-y-1.5 px-4 py-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <SourceChip row={r} />
                      <Severity row={r} />
                    </div>
                    <code className="block break-all font-mono text-xs text-fg">{r.action}</code>
                    <p className="text-xs text-fg-muted">
                      {r.entity} · {formatDateTime(r.createdAt)}
                    </p>
                    <p className="text-xs text-fg-muted">
                      {r.user ? r.user.email ?? r.user.name ?? r.user.id : 'Sistem / anonim'} · IP {r.ip ?? '—'}
                    </p>
                  </li>
                ))}
              </ul>
              {list.hasNextPage ? (
                <div className="flex justify-center border-t border-border p-3">
                  <Button variant="ghost" size="sm" className="min-h-11 sm:min-h-9" onClick={() => void list.fetchNextPage()} disabled={list.isFetchingNextPage}>
                    {list.isFetchingNextPage ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
                    Daha fazla yükle
                  </Button>
                </div>
              ) : null}
            </>
          )}
        </QueryState>
      </SectionCard>
    </div>
  );
}
