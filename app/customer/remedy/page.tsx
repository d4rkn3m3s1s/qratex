'use client';

import { Suspense, useState, useEffect } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { LazyMotion, domAnimation, m, AnimatePresence } from 'framer-motion';
import {
  Gift,
  ChevronRight,
  CheckCircle2,
  Clock,
  Store,
  MessageSquare,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { InlineLoadingStatus } from '@/components/ui/inline-loading-status';
import { Badge } from '@/components/ui/badge';
import { toast } from '@/lib/admin-toast';
import { formatRelativeTime } from '@/lib/utils';
import { cn } from '@/lib/utils';
import { DashboardPageHero } from '@/components/layout/dashboard-page-hero';
import { useAppT } from '@/lib/app-locale';

type RemedyOption = { type: string; label: string; unit?: string; values: (number | string)[] };
type Offer = {
  id: string;
  message: string;
  status: string;
  options: RemedyOption[] | null;
  selectedType: string | null;
  selectedValue: string | null;
  acceptedAt: string | null;
  createdAt: string;
  dealer: { id: string; name: string | null; businessName: string | null };
  feedback: { id: string; rating: number; text: string | null; createdAt: string } | null;
};

type TabFilter = 'all' | 'pending' | 'accepted';

function CustomerRemedyContent() {
  const t = useAppT();
  const searchParams = useSearchParams();
  const highlightId = searchParams.get('offerId') || searchParams.get('id');
  const [filter, setFilter] = useState<TabFilter>('all');

  const { data, isLoading, isError } = useQuery({
    queryKey: ['customer', 'remedy'],
    queryFn: async () => {
      const r = await fetch('/api/customer/remedy', { credentials: 'same-origin' });
      const j = r.ok ? await r.json() : { offers: [] };
      return (j.offers || []) as Offer[];
    },
    staleTime: 60_000,
    retry: 1,
  });
  const offers = data ?? [];
  const loading = isLoading;
  useEffect(() => {
    if (isError) toast.error(t('customerRemedy.loadError'));
  }, [isError, t]);

  const pending = offers.filter((o) => o.status === 'pending');
  const accepted = offers.filter((o) => o.status === 'accepted');
  const filteredOffers =
    filter === 'pending' ? pending : filter === 'accepted' ? accepted : offers;
  const hasPending = pending.length > 0;
  const hasAccepted = accepted.length > 0;

  if (loading) {
    return (
      <InlineLoadingStatus
        className="min-h-[280px]"
        spinnerClassName="h-10 w-10 text-amber-500"
          description={t('customerRemedy.loading')}
      />
    );
  }

  return (
    <LazyMotion features={domAnimation} strict>
    <div className="space-y-6 max-w-3xl mx-auto">
      <DashboardPageHero
        eyebrow={t('customerRemedy.eyebrow')}
        title={t('customerRemedy.title')}
        description={t('customerRemedy.description')}
        icon={<Gift className="h-7 w-7" aria-hidden />}
        tone="auto"
        chips={
          hasPending ? (
            <Badge variant="secondary" className="bg-amber-500/20 text-amber-700 dark:text-amber-300">
              {pending.length} {t('customerRemedy.pending')}
            </Badge>
          ) : null
        }
      />

      {/* Tabs */}
      {(hasPending || hasAccepted) && (
        <m.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="flex gap-1 p-1 rounded-lg bg-muted/50 w-fit"
        >
          {[
            { key: 'all' as TabFilter, label: t('customerRemedy.tabAll'), count: offers.length },
            { key: 'pending' as TabFilter, label: t('customerRemedy.tabPending'), count: pending.length },
            { key: 'accepted' as TabFilter, label: t('customerRemedy.tabAccepted'), count: accepted.length },
          ].map(({ key, label, count }) => (
            <button
              key={key}
              type="button"
              onClick={() => setFilter(key)}
              className={cn(
                'px-4 py-2 rounded-md text-sm font-medium transition-colors',
                filter === key
                  ? 'bg-background shadow-sm text-foreground'
                  : 'text-muted-foreground hover:text-foreground'
              )}
            >
              {label}
              <span className="ml-1.5 text-muted-foreground">({count})</span>
            </button>
          ))}
        </m.div>
      )}

      {/* Pending list */}
      {filter !== 'accepted' && pending.length > 0 && (
        <m.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.05 }}
        >
          <Card className="overflow-hidden border-amber-500/20 shadow-sm">
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                <Clock className="h-5 w-5 text-amber-500" />
                {t('customerRemedy.pendingOffers')}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <AnimatePresence mode="popLayout">
                {pending.map((o, i) => (
                  <m.div
                    key={o.id}
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0 }}
                    transition={{ delay: Math.min(i, 10) * 0.03 }}
                  >
                    <Link href={`/customer/remedy/${o.id}`}>
                      <div
                        className={cn(
                          'p-4 rounded-xl border bg-card hover:bg-muted/30 transition-all hover:border-amber-500/40 hover:shadow-sm',
                          highlightId === o.id && 'ring-2 ring-amber-500 border-amber-500/50'
                        )}
                      >
                        <div className="flex items-center justify-between gap-3">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <Store className="h-4 w-4 text-muted-foreground shrink-0" />
                              <p className="font-semibold truncate">
                                {o.dealer.businessName || o.dealer.name || t('customerRemedy.business')}
                              </p>
                            </div>
                            <p className="text-sm text-muted-foreground line-clamp-2 mt-1 flex items-start gap-1.5">
                              <MessageSquare className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                              {o.message}
                            </p>
                            <p className="text-xs text-muted-foreground mt-2">
                              {formatRelativeTime(o.createdAt)}
                            </p>
                          </div>
                          <ChevronRight className="h-5 w-5 text-muted-foreground shrink-0" />
                        </div>
                      </div>
                    </Link>
                  </m.div>
                ))}
              </AnimatePresence>
            </CardContent>
          </Card>
        </m.div>
      )}

      {/* Accepted list */}
      {filter !== 'pending' && accepted.length > 0 && (
        <m.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.08 }}
        >
          <Card className="overflow-hidden border-emerald-500/20 shadow-sm">
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                <CheckCircle2 className="h-5 w-5 text-emerald-500" />
                {t('customerRemedy.acceptedOffers')}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <AnimatePresence mode="popLayout">
                {accepted.map((o, i) => (
                  <m.div
                    key={o.id}
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0 }}
                    transition={{ delay: Math.min(i, 10) * 0.03 }}
                    className="p-4 rounded-xl border bg-muted/20 border-emerald-500/10"
                  >
                    <div className="flex items-center gap-2">
                      <Store className="h-4 w-4 text-muted-foreground shrink-0" />
                      <p className="font-semibold">
                        {o.dealer.businessName || o.dealer.name || t('customerRemedy.business')}
                      </p>
                    </div>
                    <p className="text-sm text-muted-foreground mt-1">{o.message}</p>
                    <div className="flex items-center gap-2 mt-3 flex-wrap">
                      <Badge className="bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 border-0">
                        {o.selectedType} / {o.selectedValue}
                      </Badge>
                      {o.acceptedAt && (
                        <span className="text-xs text-muted-foreground">
                          {formatRelativeTime(o.acceptedAt)} {t('customerRemedy.accepted')}
                        </span>
                      )}
                    </div>
                  </m.div>
                ))}
              </AnimatePresence>
            </CardContent>
          </Card>
        </m.div>
      )}

      {/* Empty / no results */}
      {(offers.length === 0 || filteredOffers.length === 0) && (
        <m.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="flex flex-col items-center justify-center py-16 px-4"
        >
          <div className="rounded-full bg-muted/50 p-6 mb-4">
            <Gift className="h-14 w-14 text-muted-foreground/60" />
          </div>
          <h2 className="text-lg font-semibold text-center">
            {filter !== 'all' ? t('customerRemedy.emptyFiltered') : t('customerRemedy.empty')}
          </h2>
          <p className="text-sm text-muted-foreground text-center mt-1 max-w-sm">
            {filter !== 'all'
              ? t('customerRemedy.emptyFilteredDesc')
              : t('customerRemedy.emptyDesc')}
          </p>
          {filter !== 'all' && (
            <button
              type="button"
              onClick={() => setFilter('all')}
              className="mt-4 text-sm font-medium text-amber-600 dark:text-amber-400 hover:underline"
            >
              {t('customerRemedy.backAll')}
            </button>
          )}
        </m.div>
      )}
    </div>
    </LazyMotion>
  );
}

export default function CustomerRemedyPage() {
  const t = useAppT();
  return (
    <Suspense
      fallback={
        <InlineLoadingStatus className="min-h-[200px]" label={t('customerRemedy.loadingPage')} />
      }
    >
      <CustomerRemedyContent />
    </Suspense>
  );
}
