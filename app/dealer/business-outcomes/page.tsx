'use client';

import { useState, useEffect } from 'react';
import { Target, TrendingDown, DollarSign, Repeat, MessageSquare } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { InlineLoadingStatus } from '@/components/ui/inline-loading-status';
import { toast } from '@/lib/admin-toast';
import { useAppT } from '@/lib/app-locale';

type BusinessOutcomesData = {
  repeatVisitRate: number;
  complaintReduction: number;
  remedyAcceptRate: number;
  negativeRateThisMonth: number;
};

export default function DealerBusinessOutcomesPage() {
  const t = useAppT();
  const [data, setData] = useState<BusinessOutcomesData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/dealer/business-outcomes')
      .then((r) => r.json())
      .then((j) => {
        if (j.businessOutcomes) setData(j.businessOutcomes);
      })
      .catch(() => toast.error(t('dealerBusinessOutcomes.toastLoadFailed')))
      .finally(() => setLoading(false));
  }, [t]);

  if (loading) {
    return (
      <InlineLoadingStatus className="min-h-[200px]" label={t('dealerBusinessOutcomes.loadingLabel')} />
    );
  }

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-border/60 bg-card/40 backdrop-blur-sm p-4 sm:p-6 shadow-sm">
        <h1 className="text-2xl font-bold flex items-center gap-2 text-balance">
          <Target className="h-7 w-7 shrink-0 text-primary" />
          {t('dealerBusinessOutcomes.title')}
        </h1>
        <p className="text-muted-foreground text-sm mt-2 text-pretty leading-relaxed max-w-2xl">
          {t('dealerBusinessOutcomes.description')}
        </p>
      </div>
      {!data ? (
        <Card><CardContent className="py-12 text-center text-muted-foreground">{t('dealerBusinessOutcomes.noData')}</CardContent></Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-3">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                <Repeat className="h-4 w-4" /> {t('dealerBusinessOutcomes.repeatVisitTitle')}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{data.repeatVisitRate.toFixed(2)}</div>
              <p className="text-xs text-muted-foreground mt-1">
                {t('dealerBusinessOutcomes.repeatVisitHint')}
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                <MessageSquare className="h-4 w-4" /> {t('dealerBusinessOutcomes.complaintTitle')}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className={`text-2xl font-bold ${data.complaintReduction >= 0 ? 'text-emerald-500' : 'text-red-500'}`}>
                {data.complaintReduction >= 0 ? '+' : ''}{data.complaintReduction} {t('dealerBusinessOutcomes.complaintPoints')}
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                {t('dealerBusinessOutcomes.negativeRateLine').replace('{pct}', String(data.negativeRateThisMonth))}
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                <DollarSign className="h-4 w-4" /> {t('dealerBusinessOutcomes.remedyTitle')}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">%{data.remedyAcceptRate}</div>
              <p className="text-xs text-muted-foreground mt-1">
                {t('dealerBusinessOutcomes.remedyHint')}
              </p>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
