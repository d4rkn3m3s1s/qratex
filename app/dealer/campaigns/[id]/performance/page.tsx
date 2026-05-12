'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { ArrowLeft, BarChart3, Loader2 } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useAppT } from '@/lib/app-locale';

export default function DealerCampaignPerformancePage() {
  const t = useAppT();
  const params = useParams();
  const id = typeof params?.id === 'string' ? params.id : '';
  const [data, setData] = useState<Record<string, unknown> | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      setErr(null);
      try {
        const r = await fetch(`/api/dealer/campaigns/${id}/performance`);
        const j = await r.json();
        if (!r.ok) throw new Error(j.error || t('dealerCampaignPerformance.loadFailed'));
        if (!cancelled) setData(j);
      } catch (e) {
        if (!cancelled) setErr(e instanceof Error ? e.message : t('dealerCampaignPerformance.genericError'));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [id, t]);

  const attr = data?.attribution as
    | {
        matchToken: string | null;
        matchedFeedbackCount: number;
        avgRatingOnMatched: number | null;
        totalFeedbackDealer30d: number;
        shareOfVoice: number;
      }
    | undefined;

  return (
    <div className="space-y-6 pb-10 max-w-2xl mx-auto">
      <Button variant="ghost" size="sm" asChild className="w-fit -mb-2 touch-manipulation">
        <Link href="/dealer/campaigns">
          <ArrowLeft className="h-4 w-4 shrink-0 mr-2" />
          {t('dealerCampaignPerformance.backToCampaigns')}
        </Link>
      </Button>

      <div className="rounded-2xl border border-border/60 bg-card/40 backdrop-blur-sm p-4 sm:p-6 shadow-sm">
        <h1 className="text-xl sm:text-2xl font-bold tracking-tight flex items-center gap-2 text-balance">
          <BarChart3 className="h-6 w-6 shrink-0 text-primary" />
          {t('dealerCampaignPerformance.title')}
        </h1>
        <p className="text-sm text-muted-foreground mt-2 text-pretty leading-relaxed">{t('dealerCampaignPerformance.subtitle')}</p>
      </div>

      {loading && (
        <div className="flex justify-center py-16">
          <Loader2 className="h-10 w-10 animate-spin text-muted-foreground" />
        </div>
      )}
      {err && !loading && (
        <Card className="border-destructive/40">
          <CardContent className="pt-6 text-sm text-destructive">{err}</CardContent>
        </Card>
      )}

      {!loading && !err && data && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">{(data.campaign as { title?: string })?.title ?? t('dealerCampaignPerformance.fallbackCampaignTitle')}</CardTitle>
            <CardDescription>{(data.note as string) || ''}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 text-sm">
            {attr && (
              <dl className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="rounded-lg border p-3">
                  <dt className="text-xs text-muted-foreground">{t('dealerCampaignPerformance.matchedFeedback30')}</dt>
                  <dd className="text-2xl font-semibold tabular-nums">{attr.matchedFeedbackCount}</dd>
                </div>
                <div className="rounded-lg border p-3">
                  <dt className="text-xs text-muted-foreground">{t('dealerCampaignPerformance.dealerTotalFeedback30')}</dt>
                  <dd className="text-2xl font-semibold tabular-nums">{attr.totalFeedbackDealer30d}</dd>
                </div>
                <div className="rounded-lg border p-3">
                  <dt className="text-xs text-muted-foreground">{t('dealerCampaignPerformance.shareEstimated')}</dt>
                  <dd className="text-2xl font-semibold tabular-nums">{attr.shareOfVoice}%</dd>
                </div>
                <div className="rounded-lg border p-3">
                  <dt className="text-xs text-muted-foreground">{t('dealerCampaignPerformance.matchedAvgRating')}</dt>
                  <dd className="text-2xl font-semibold tabular-nums">
                    {attr.avgRatingOnMatched != null ? attr.avgRatingOnMatched : '—'}
                  </dd>
                </div>
                {attr.matchToken && (
                  <div className="sm:col-span-2 rounded-lg border p-3 font-mono text-xs">
                    {t('dealerCampaignPerformance.utmMatchKey')} {attr.matchToken}
                  </div>
                )}
              </dl>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
