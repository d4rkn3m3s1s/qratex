'use client';

import { useEffect, useState } from 'react';
import { AdminPremiumHero } from '@/components/admin/admin-premium-hero';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { InlineLoadingStatus } from '@/components/ui/inline-loading-status';
import { Badge } from '@/components/ui/badge';
import { Bot, ChevronLeft, ChevronRight, MessageSquare, Search } from 'lucide-react';
import { useAppLocale, useAppT } from '@/lib/app-locale';

type LogRow = {
  id: string;
  userId: string | null;
  ipFingerprint: string | null;
  userRoleSnapshot: string | null;
  userMessage: string;
  assistantMessage: string;
  model: string;
  latencyMs: number | null;
  createdAt: string;
  user: {
    id: string;
    email: string | null;
    name: string | null;
    role: string;
  } | null;
};

export default function AdminQraChatLogsPage() {
  const t = useAppT();
  const { locale } = useAppLocale();
  const dateLocale = locale === 'en' ? 'en-US' : 'tr-TR';
  const [items, setItems] = useState<LogRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(0);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');
  const [queryDraft, setQueryDraft] = useState('');
  const [detail, setDetail] = useState<LogRow | null>(null);

  const fetchLogs = () => {
    setLoading(true);
    const params = new URLSearchParams();
    params.set('page', String(page));
    params.set('limit', '25');
    if (q.trim()) params.set('q', q.trim());
    fetch(`/api/admin/qra-chat-logs?${params}`)
      .then((r) => r.json())
      .then((data) => {
        setItems(data.items ?? []);
        setTotal(data.total ?? 0);
        setTotalPages(data.totalPages ?? 0);
      })
      .catch(() => {
        setItems([]);
        setTotal(0);
        setTotalPages(0);
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchLogs();
  }, [page, q]);

  const submitSearch = () => {
    setPage(1);
    setQ(queryDraft);
  };

  return (
    <div className="flex flex-1 flex-col gap-6 p-6">
      <AdminPremiumHero
        title={t('adminQraChatLogs.heroTitle')}
        description={t('adminQraChatLogs.heroDescription')}
        icon={<Bot className="text-white" />}
      />

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Search className="h-4 w-4" />
            {t('adminQraChatLogs.searchTitle')}
          </CardTitle>
          <CardDescription>{t('adminQraChatLogs.searchDescription')}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          <Input
            value={queryDraft}
            onChange={(e) => setQueryDraft(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && submitSearch()}
            placeholder={t('adminQraChatLogs.searchPlaceholder')}
            className="max-w-md"
          />
          <Button type="button" onClick={submitSearch}>
            {t('adminQraChatLogs.search')}
          </Button>
          {q ? (
            <Button type="button" variant="outline" onClick={() => { setQueryDraft(''); setQ(''); setPage(1); }}>
              {t('adminQraChatLogs.clear')}
            </Button>
          ) : null}
        </CardContent>
      </Card>

      {loading ? (
        <InlineLoadingStatus className="py-16" description={t('adminQraChatLogs.loadingRecords')} />
      ) : (
        <Card>
          <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2">
            <div>
              <CardTitle className="flex items-center gap-2">
                <MessageSquare className="h-4 w-4" />
                {t('adminQraChatLogs.recordsTitle')}
              </CardTitle>
              <CardDescription>
                {t('adminQraChatLogs.recordsDescription').replace('{{total}}', String(total))}
              </CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <span className="text-sm text-muted-foreground tabular-nums">
                {page} / {Math.max(1, totalPages)}
              </span>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={page >= totalPages}
                onClick={() => setPage((p) => p + 1)}
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-muted-foreground">
                  <th className="pb-2 pr-3 font-medium">{t('adminQraChatLogs.colTime')}</th>
                  <th className="pb-2 pr-3 font-medium">{t('adminQraChatLogs.colUser')}</th>
                  <th className="pb-2 pr-3 font-medium">{t('adminQraChatLogs.colRole')}</th>
                  <th className="pb-2 pr-3 font-medium">{t('adminQraChatLogs.colUserSummary')}</th>
                  <th className="pb-2 pr-3 font-medium">{t('adminQraChatLogs.colAssistantSummary')}</th>
                  <th className="pb-2 pr-3 font-medium">{t('adminQraChatLogs.colMs')}</th>
                  <th className="pb-2 font-medium" />
                </tr>
              </thead>
              <tbody>
                {items.map((row) => (
                  <tr key={row.id} className="border-b border-border/60 hover:bg-muted/30">
                    <td className="py-2 pr-3 align-top text-muted-foreground whitespace-nowrap">
                      {new Date(row.createdAt).toLocaleString(dateLocale)}
                    </td>
                    <td className="py-2 pr-3 align-top">
                      {row.user ? (
                        <span className="font-medium">{row.user.email || row.user.name || row.user.id.slice(0, 8)}</span>
                      ) : (
                        <span className="text-muted-foreground" title={row.ipFingerprint || ''}>
                          {t('adminQraChatLogs.anon')} ({row.ipFingerprint?.slice(0, 8)}…)
                        </span>
                      )}
                    </td>
                    <td className="py-2 pr-3 align-top">
                      <Badge variant="secondary" className="font-normal">
                        {row.userRoleSnapshot || '—'}
                      </Badge>
                    </td>
                    <td className="py-2 pr-3 align-top max-w-[220px]">
                      <span className="line-clamp-2">{row.userMessage}</span>
                    </td>
                    <td className="py-2 pr-3 align-top max-w-[240px]">
                      <span className="line-clamp-2">{row.assistantMessage}</span>
                    </td>
                    <td className="py-2 pr-3 align-top tabular-nums">{row.latencyMs ?? '—'}</td>
                    <td className="py-2 align-top">
                      <Button type="button" variant="ghost" size="sm" className="h-8" onClick={() => setDetail(row)}>
                        {t('adminQraChatLogs.detail')}
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {items.length === 0 && (
              <p className="py-10 text-center text-muted-foreground">{t('adminQraChatLogs.emptyRecords')}</p>
            )}
          </CardContent>
        </Card>
      )}

      <Dialog open={!!detail} onOpenChange={(o) => !o && setDetail(null)}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{t('adminQraChatLogs.dialogTitle')}</DialogTitle>
          </DialogHeader>
          {detail && (
            <div className="space-y-4 text-sm">
              <div>
                <p className="text-xs font-medium text-muted-foreground">{t('adminQraChatLogs.detailTime')}</p>
                <p>{new Date(detail.createdAt).toLocaleString(dateLocale)}</p>
              </div>
              <div>
                <p className="text-xs font-medium text-muted-foreground">{t('adminQraChatLogs.detailUser')}</p>
                <p>
                  {detail.user
                    ? `${detail.user.email || ''} (${detail.user.role})`
                    : `${t('adminQraChatLogs.anonFingerprint')} ${detail.ipFingerprint}`}
                </p>
              </div>
              <div>
                <p className="text-xs font-medium text-muted-foreground">{t('adminQraChatLogs.detailModelLatency')}</p>
                <p>
                  {detail.model} · {detail.latencyMs ?? '—'} ms
                </p>
              </div>
              <div>
                <p className="text-xs font-medium text-muted-foreground">{t('adminQraChatLogs.detailUserMessage')}</p>
                <p className="mt-1 whitespace-pre-wrap rounded-lg bg-muted/50 p-3">{detail.userMessage}</p>
              </div>
              <div>
                <p className="text-xs font-medium text-muted-foreground">{t('adminQraChatLogs.detailAssistant')}</p>
                <p className="mt-1 whitespace-pre-wrap rounded-lg bg-muted/50 p-3">{detail.assistantMessage}</p>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
