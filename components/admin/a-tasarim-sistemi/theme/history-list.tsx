'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import { ArrowRight, History, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ConfirmAction, QueryState, SectionCard } from '@/components/states';
import {
  DEFAULT_MODE_LABEL,
  describeDraft,
  isValidActiveTheme,
  paletteFor,
  type ThemeSnapshot,
} from '@/lib/design-system/theme-model';
import { dsKeys, errorText, fetchHistory, formatIstanbul, rollbackTheme, type PublishResult } from '../api';
import { useDesignSystemCopy } from '../copy';

function Mini({ s }: { s: ThemeSnapshot | null }) {
  if (!s) return <span className="qx-caption text-fg-subtle">—</span>;
  const draft = { activeTheme: s.activeTheme ?? '', customColors: s.customColors };
  const valid = isValidActiveTheme(s);
  const p = paletteFor(draft, 'light');
  const d = paletteFor(draft, 'dark');
  return (
    <span className="inline-flex min-w-0 items-center gap-1.5">
      {valid && (
        <span className="flex h-4 w-12 shrink-0 overflow-hidden rounded-chip border border-strong/30" aria-hidden>
          <span className="flex-1" style={{ background: p.primary }} />
          <span className="flex-1" style={{ background: p.secondary }} />
          <span className="flex-1" style={{ background: d.background ?? '#0b0b14' }} />
        </span>
      )}
      <span className="qx-small truncate text-fg">{describeDraft(s)}</span>
      <span className="qx-caption shrink-0 text-fg-subtle">· {DEFAULT_MODE_LABEL[s.defaultMode]}</span>
    </span>
  );
}

/** Tema sürüm geçmişi: kim, ne zaman, hangi paletten hangisine; tek tıkla (onaylı) geri alma. */
export function HistoryList({
  version,
  onRolledBack,
}: {
  version: string | null;
  onRolledBack: (r: PublishResult) => void | Promise<void>;
}) {
  const dx = useDesignSystemCopy();
  const [page, setPage] = useState(1);
  const q = useQuery({ queryKey: dsKeys.history(page), queryFn: ({ signal }) => fetchHistory(page, signal), staleTime: 15_000 });
  const pages = q.data ? Math.max(1, Math.ceil(q.data.total / q.data.size)) : 1;

  return (
    <SectionCard
      title="Sürüm geçmişi"
      description="Her yayın ve geri alma tek denetim kaydıdır. “Önceki temaya dön”, o yayından hemen önceki hâli yeniden yayınlar."
      icon={<History />}
    >
      <QueryState
        query={q}
        skeleton="list"
        isEmpty={(d) => d.items.length === 0}
        empty={{ variant: 'first-use', title: 'Henüz yayın yok', description: 'Bu ekrandan yapılan ilk yayın burada listelenir.' }}
      >
        {(data) => (
          <div className="space-y-3">
            <ol className="divide-y rounded-control border">
              {data.items.map((h) => {
                const canRollback = !!h.before && isValidActiveTheme(h.before);
                return (
                  <li key={h.id} className="flex flex-col gap-2 p-3 sm:flex-row sm:items-center sm:justify-between">
                    <div className="min-w-0 space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge variant={h.action === 'rollback' ? 'warning' : 'brand'}>{h.action === 'rollback' ? 'Geri alma' : 'Yayın'}</Badge>
                        <span className="qx-caption text-fg-muted">
                          {formatIstanbul(h.at)} · {h.actor ?? 'Bilinmeyen yönetici'}
                        </span>
                      </div>
                      <div className="flex min-w-0 flex-wrap items-center gap-1.5">
                        <Mini s={h.before} />
                        <ArrowRight className="h-3.5 w-3.5 shrink-0 text-fg-subtle" aria-label="yerine" />
                        <Mini s={h.after} />
                      </div>
                      {h.note && <p className="qx-caption text-fg-muted">Not: {h.note}</p>}
                    </div>
                    {canRollback ? (
                      <ConfirmAction
                        tone="warning"
                        trigger={
                          <Button type="button" size="sm" variant="outline" className="min-h-11 shrink-0 sm:min-h-9">
                            <RotateCcw className="h-3.5 w-3.5" aria-hidden />
                            Önceki temaya dön
                          </Button>
                        }
                        title="Önceki tema yeniden yayınlansın mı?"
                        description="Tüm kullanıcıların arayüzü (müşteri, bayi, yönetim, landing) bu temaya geçer."
                        impact={[
                          { label: 'Yayına alınacak', value: h.before ? describeDraft(h.before) : '—', emphasis: true },
                          { label: 'Varsayılan mod', value: h.before ? DEFAULT_MODE_LABEL[h.before.defaultMode] : '—' },
                        ]}
                        confirmLabel="Geri al ve yayınla"
                        onConfirm={async () => {
                          try {
                            const r = await rollbackTheme(h.id, version);
                            await onRolledBack(r);
                            toast.success('Önceki tema yeniden yayınlandı.');
                            setPage(1);
                          } catch (e) {
                            throw new Error(errorText(e));
                          }
                        }}
                      />
                    ) : (
                      <span className="qx-caption text-fg-subtle">{dx.invalidPrev}</span>
                    )}
                  </li>
                );
              })}
            </ol>
            {pages > 1 && (
              <nav aria-label="Geçmiş sayfaları" className="flex items-center justify-between gap-2">
                <Button type="button" size="sm" variant="ghost" className="min-h-11 sm:min-h-9" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
                  Önceki
                </Button>
                <span className="qx-caption qx-num text-fg-muted">
                  Sayfa {page} / {pages}
                </span>
                <Button type="button" size="sm" variant="ghost" className="min-h-11 sm:min-h-9" disabled={page >= pages} onClick={() => setPage((p) => p + 1)}>
                  Sonraki
                </Button>
              </nav>
            )}
          </div>
        )}
      </QueryState>
    </SectionCard>
  );
}
