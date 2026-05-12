'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { Gift, Loader2, Check, X, ArrowLeft } from 'lucide-react';
import { InlineLoadingStatus } from '@/components/ui/inline-loading-status';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { toast } from '@/lib/admin-toast';
import { formatRelativeTime } from '@/lib/utils';
import { useAppLocale, useAppT } from '@/lib/app-locale';

interface QueueOffer {
  id: string;
  message: string;
  status: string;
  createdAt: string;
  user: { id: string; name: string | null; email: string };
  feedback: { id: string; rating: number; text: string | null; createdAt: string } | null;
  consumptionReview: { id: string; rating: number; text: string | null; createdAt: string } | null;
}

export default function DealerRemedyQueuePage() {
  const t = useAppT();
  const { locale } = useAppLocale();
  const [offers, setOffers] = useState<QueueOffer[]>([]);
  const [loading, setLoading] = useState(true);
  const [actingId, setActingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/dealer/remedy-queue');
      const data = await res.json();
      if (!data.success) throw new Error(data.error || t('dealerRemedyQueue.toastListFailed'));
      setOffers(data.offers);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('dealerRemedyQueue.toastGenericError'));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    void load();
  }, [load]);

  const act = async (id: string, action: 'publish' | 'reject') => {
    setActingId(id);
    try {
      const res = await fetch(`/api/dealer/remedy-offers/${id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || t('dealerRemedyQueue.toastActionFailed'));
      toast.success(action === 'publish' ? t('dealerRemedyQueue.toastPublishSuccess') : t('dealerRemedyQueue.toastRejectSuccess'));
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('dealerRemedyQueue.toastGenericError'));
    } finally {
      setActingId(null);
    }
  };

  return (
    <div className="space-y-6 pb-8">
      <div className="rounded-2xl border border-border/60 bg-card/40 backdrop-blur-sm p-4 sm:p-6 shadow-sm">
        <h1 className="text-2xl font-bold tracking-tight text-balance">{t('dealerRemedyQueue.title')}</h1>
        <p className="text-sm text-muted-foreground mt-2 text-pretty leading-relaxed">{t('dealerRemedyQueue.description')}</p>
      </div>
      <div className="-mt-2 flex flex-wrap items-center gap-2">
        <Button variant="ghost" size="sm" asChild className="w-fit touch-manipulation">
          <Link href="/dealer/feedbacks">
            <ArrowLeft className="h-4 w-4 shrink-0 mr-2" />
            {t('dealerRemedyQueue.backFeedbacks')}
          </Link>
        </Button>
        <Button variant="outline" size="sm" asChild className="w-fit touch-manipulation">
          <Link href="/dealer/remedy-automation">{t('dealerRemedyQueue.automationSettings')}</Link>
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Gift className="h-5 w-5 text-amber-500" />
            {t('dealerRemedyQueue.pendingDrafts')}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <InlineLoadingStatus className="py-12" label={t('dealerRemedyQueue.loadingLabel')} />
          ) : offers.length === 0 ? (
            <p className="text-muted-foreground text-sm py-6 text-center">{t('dealerRemedyQueue.emptyQueue')}</p>
          ) : (
            <ul className="space-y-4">
              {offers.map((o) => (
                <li
                  key={o.id}
                  className="rounded-xl border border-border/60 p-4 flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4"
                >
                  <div className="space-y-2 min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant="secondary">{t('dealerRemedyQueue.badgePending')}</Badge>
                      <span className="text-xs text-muted-foreground">
                        {formatRelativeTime(o.createdAt, locale === 'en' ? 'en' : 'tr')}
                      </span>
                    </div>
                    <p className="text-sm">{o.message}</p>
                    <p className="text-xs text-muted-foreground">
                      {t('dealerRemedyQueue.customerLabel')} {o.user.name || o.user.email}
                    </p>
                    {o.feedback && (
                      <p className="text-xs text-muted-foreground line-clamp-2">
                        {t('dealerRemedyQueue.qrFeedbackLine').replace('{rating}', String(o.feedback.rating))}
                        {o.feedback.text ? ` · ${o.feedback.text}` : ''}
                      </p>
                    )}
                    {o.consumptionReview && (
                      <p className="text-xs text-muted-foreground line-clamp-2">
                        {t('dealerRemedyQueue.consumptionLine').replace('{rating}', String(o.consumptionReview.rating))}
                        {o.consumptionReview.text ? ` · ${o.consumptionReview.text}` : ''}
                      </p>
                    )}
                  </div>
                  <div className="flex gap-2 shrink-0">
                    <Button
                      size="sm"
                      className="gap-1"
                      disabled={!!actingId}
                      onClick={() => void act(o.id, 'publish')}
                    >
                      {actingId === o.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                      {t('dealerRemedyQueue.publish')}
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="gap-1"
                      disabled={!!actingId}
                      onClick={() => void act(o.id, 'reject')}
                    >
                      <X className="h-4 w-4" />
                      {t('dealerRemedyQueue.reject')}
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
