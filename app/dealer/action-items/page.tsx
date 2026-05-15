'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useSearchParams } from 'next/navigation';
import { motion } from 'framer-motion';
import {
  ListChecks,
  Clock,
  User,
  MessageSquare,
  Star,
  CheckCircle2,
  Filter,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { InlineLoadingStatus } from '@/components/ui/inline-loading-status';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { toast } from '@/lib/admin-toast';
import { formatRelativeTime } from '@/lib/utils';
import { useAppLocale, useAppT } from '@/lib/app-locale';

interface ActionItemRow {
  id: string;
  suggestionText: string;
  priority: string;
  status: string;
  dueAt: string | null;
  completedAt: string | null;
  createdAt: string;
  sourceModule?: string | null;
  feedback: { id: string; rating: number; text: string | null; createdAt: string } | null;
  assignedTo: { id: string; name: string | null; email: string } | null;
}

export default function DealerActionItemsPage() {
  const t = useAppT();
  const { locale } = useAppLocale();
  const searchParams = useSearchParams();
  const [items, setItems] = useState<ActionItemRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [queryFilter, setQueryFilter] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const itemsFetchRef = useRef<AbortController | null>(null);

  useEffect(() => {
    const id = setTimeout(() => setDebouncedQuery(queryFilter.trim()), 300);
    return () => clearTimeout(id);
  }, [queryFilter]);

  const loadItems = useCallback(async () => {
    itemsFetchRef.current?.abort();
    const ac = new AbortController();
    itemsFetchRef.current = ac;
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (statusFilter !== 'all') params.set('status', statusFilter);
      if (debouncedQuery) params.set('q', debouncedQuery);
      params.set('page', String(page));
      params.set('pageSize', '20');
      const res = await fetch(`/api/dealer/action-items?${params}`, { signal: ac.signal });
      const data = await res.json();
      if (itemsFetchRef.current !== ac) return;
      if (data.items) {
        setItems(data.items);
        setTotal(data.total ?? 0);
        setTotalPages(data.totalPages ?? 1);
      }
    } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') return;
      if (itemsFetchRef.current !== ac) return;
      toast.error(t('dealerActionItems.toastLoadFailed'));
    } finally {
      if (itemsFetchRef.current === ac) {
        itemsFetchRef.current = null;
        setLoading(false);
      }
    }
  }, [page, statusFilter, debouncedQuery, t]);

  useEffect(() => {
    void loadItems();
    return () => {
      itemsFetchRef.current?.abort();
    };
  }, [loadItems]);

  useEffect(() => {
    const q = searchParams.get('q');
    if (q && q !== queryFilter) {
      setQueryFilter(q);
      setDebouncedQuery(q.trim());
      setPage(1);
    }
    // Yalnızca URL değişiminde senkron; queryFilter bağımlılıkta olursa yazarken ?q= eski değere geri sarar.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- searchParams kaynaklı tek yönlü senkron
  }, [searchParams]);

  const updateStatus = async (id: string, status: string) => {
    try {
      const res = await fetch(`/api/dealer/action-items/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status,
          ...(status === 'done' ? { completedAt: new Date().toISOString() } : {}),
        }),
      });
      if (res.ok) {
        toast.success(t('dealerActionItems.toastUpdated'));
        void loadItems();
      } else {
        const data = await res.json();
        toast.error(data.error || t('dealerActionItems.toastUpdateFailed'));
      }
    } catch {
      toast.error(t('dealerActionItems.toastConnectionError'));
    }
  };

  const statusLabels: Record<string, string> = {
    pending: t('dealerActionItems.status.pending'),
    assigned: t('dealerActionItems.status.assigned'),
    in_progress: t('dealerActionItems.status.in_progress'),
    done: t('dealerActionItems.status.done'),
    cancelled: t('dealerActionItems.status.cancelled'),
  };
  const priorityLabels: Record<string, string> = {
    low: t('dealerActionItems.priority.low'),
    medium: t('dealerActionItems.priority.medium'),
    high: t('dealerActionItems.priority.high'),
  };
  const priorityColor: Record<string, string> = {
    low: 'bg-slate-500/20 text-slate-600',
    medium: 'bg-amber-500/20 text-amber-600',
    high: 'bg-red-500/20 text-red-600',
  };

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-border/60 bg-card/40 backdrop-blur-sm p-4 sm:p-6 shadow-sm">
        <h1 className="text-2xl sm:text-3xl font-bold flex items-center gap-2 text-balance">
          <ListChecks className="h-7 w-7 shrink-0 text-primary" aria-hidden />
          {t('dealerActionItems.title')}
        </h1>
        <p className="text-muted-foreground text-sm mt-2 max-w-2xl text-pretty leading-relaxed">
          {t('dealerActionItems.description')}
        </p>
      </div>

      <Card>
        <CardHeader className="pb-2">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <CardTitle className="text-base">{t('dealerActionItems.listTitle')}</CardTitle>
            <div className="flex flex-col gap-2 sm:flex-row">
              <Input
                value={queryFilter}
                onChange={(event) => {
                  setQueryFilter(event.target.value);
                  setPage(1);
                }}
                placeholder={t('dealerActionItems.searchPlaceholder')}
                className="sm:w-[240px]"
              />
              <Select
                value={statusFilter}
                onValueChange={(v) => {
                  setStatusFilter(v);
                  setPage(1);
                }}
              >
                <SelectTrigger className="w-full sm:w-[160px] border-border/70 bg-background/80 text-foreground dark:bg-white/15 dark:border-white/30 dark:text-white">
                  <Filter className="h-4 w-4 mr-2" />
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t('dealerActionItems.filterAll')}</SelectItem>
                  <SelectItem value="pending">{t('dealerActionItems.status.pending')}</SelectItem>
                  <SelectItem value="assigned">{t('dealerActionItems.status.assigned')}</SelectItem>
                  <SelectItem value="in_progress">{t('dealerActionItems.status.in_progress')}</SelectItem>
                  <SelectItem value="done">{t('dealerActionItems.status.done')}</SelectItem>
                  <SelectItem value="cancelled">{t('dealerActionItems.status.cancelled')}</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <InlineLoadingStatus className="py-12" label={t('dealerActionItems.loadingLabel')} />
          ) : items.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <ListChecks className="h-12 w-12 mx-auto mb-3 opacity-50" />
              <p>{t('dealerActionItems.emptyTitle')}</p>
              <p className="text-sm mt-1">{t('dealerActionItems.emptyHint')}</p>
            </div>
          ) : (
            <ul className="space-y-3">
              {items.map((item) => (
                <motion.li
                  key={item.id}
                  initial={{ opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="p-4 rounded-lg border bg-card hover:bg-muted/30 transition-colors"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <p className="font-medium">{item.suggestionText}</p>
                      {item.feedback ? (
                        <p className="text-sm text-muted-foreground mt-1 line-clamp-1">
                          {t('dealerActionItems.feedbackLabel')}:{' '}
                          {item.feedback.text ||
                            t('dealerActionItems.ratingPts').replace('{rating}', String(item.feedback.rating))}{' '}
                          · {formatRelativeTime(item.feedback.createdAt, locale === 'en' ? 'en' : 'tr')}
                        </p>
                      ) : item.sourceModule === 'ai_aggregate' ? (
                        <p className="text-sm text-muted-foreground mt-1">{t('dealerActionItems.sourceAiAggregate')}</p>
                      ) : null}
                      <div className="flex items-center gap-2 mt-2 flex-wrap">
                        <Badge className={priorityColor[item.priority] ?? 'bg-muted'}>
                          {priorityLabels[item.priority] ?? item.priority}
                        </Badge>
                        <Badge variant="secondary">{statusLabels[item.status] ?? item.status}</Badge>
                        {item.assignedTo && (
                          <span className="text-xs text-muted-foreground flex items-center gap-1">
                            <User className="h-3 w-3" />
                            {item.assignedTo.name || item.assignedTo.email}
                          </span>
                        )}
                        {item.dueAt && (
                          <span className="text-xs text-muted-foreground flex items-center gap-1">
                            <Clock className="h-3 w-3" />
                            {new Date(item.dueAt).toLocaleDateString(locale === 'en' ? 'en-US' : 'tr-TR')}
                          </span>
                        )}
                      </div>
                    </div>
                    {item.status !== 'done' && item.status !== 'cancelled' && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="gap-1 text-emerald-600 border-emerald-500/30"
                        onClick={() => updateStatus(item.id, 'done')}
                      >
                        <CheckCircle2 className="h-4 w-4" />
                        {t('dealerActionItems.complete')}
                      </Button>
                    )}
                  </div>
                </motion.li>
              ))}
            </ul>
          )}
          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-2 pt-4">
              <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <span className="text-sm text-muted-foreground">
                {t('dealerActionItems.pageIndicator')
                  .replace('{page}', String(page))
                  .replace('{totalPages}', String(totalPages))
                  .replace('{total}', String(total))}
              </span>
              <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
