'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import Link from 'next/link';
import {
  Box,
  Gift,
  Sparkles,
  ChevronRight,
  Trophy,
  Clock3,
  PackageOpen,
  MessageSquareText,
  Coins,
  Loader2,
  ArrowRight,
} from 'lucide-react';
import { DashboardPageHeading } from '@/components/dashboard/page-heading';
import { DashboardPageHeroChrome } from '@/components/layout/dashboard-page-hero';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { SurpriseBoxModal, type SurpriseBoxContent } from '@/components/rewards/surprise-box-modal';
import { formatDistanceToNow } from 'date-fns';
import { tr } from 'date-fns/locale';
import { toast } from '@/lib/admin-toast';
import { cn } from '@/lib/utils';
import { useAppT } from '@/lib/app-locale';
import { playRewardChime } from '@/lib/play-chime';

interface SurpriseBoxItem {
  id: string;
  title: string;
  message: string | null;
  couponCode: string | null;
  points: number;
  rewardType: string | null;
  openedAt: string | null;
  createdAt: string;
}

interface RewardStrategyData {
  pendingReviewCount: number;
  consumptionCount: number;
}

function StatChip({
  label,
  value,
  accent,
}: {
  label: string;
  value: number;
  accent: 'amber' | 'muted' | 'primary';
}) {
  const accentClass =
    accent === 'amber'
      ? 'border-amber-500/25 bg-amber-500/[0.08] text-amber-950 dark:text-amber-50'
      : accent === 'primary'
        ? 'border-primary/25 bg-primary/[0.06]'
        : 'border-border/70 bg-muted/40';
  return (
    <div
      className={cn(
        'rounded-2xl border px-3 py-3 text-center shadow-sm backdrop-blur-sm sm:px-4 sm:py-3.5',
        accentClass
      )}
    >
      <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground sm:text-xs">{label}</p>
      <p className="mt-1 font-mono text-2xl font-bold tabular-nums tracking-tight sm:text-3xl">{value}</p>
    </div>
  );
}

export default function CustomerSurpriseBoxesPage() {
  const t = useAppT();
  const [unopened, setUnopened] = useState<SurpriseBoxItem[]>([]);
  const [opened, setOpened] = useState<SurpriseBoxItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [modalContent, setModalContent] = useState<SurpriseBoxContent | null>(null);
  const [pointsGranted, setPointsGranted] = useState(0);
  const [openingId, setOpeningId] = useState<string | null>(null);
  const [rewardStrategy, setRewardStrategy] = useState<RewardStrategyData | null>(null);
  const [listTab, setListTab] = useState<'unopened' | 'opened'>('unopened');

  const previewBox: SurpriseBoxContent = {
    title: 'Günlük Giriş Ödülü',
    message: 'Her gün giriş yaparak yeni sürprizler kazanabilirsin. Bugünün ödülü seninle.',
    couponCode: 'PREVIEW-2026',
    points: 120,
    rewardType: 'points',
  };

  const total = unopened.length + opened.length;

  const fetchBoxes = useCallback(async () => {
    try {
      const [boxesRes, statsRes] = await Promise.all([
        fetch('/api/surprise-box', { cache: 'no-store' }),
        fetch('/api/customer/stats', { cache: 'no-store' }),
      ]);
      const boxesData = await boxesRes.json();
      const statsData = await statsRes.json();

      if (boxesData.success && boxesData.data) {
        const nextUnopened = boxesData.data.unopened ?? [];
        const nextOpened = boxesData.data.opened ?? [];
        setUnopened(nextUnopened);
        setOpened(nextOpened);
        setListTab(nextUnopened.length > 0 ? 'unopened' : nextOpened.length > 0 ? 'opened' : 'unopened');
      }
      if (statsData.success && statsData.data?.stats) {
        setRewardStrategy({
          pendingReviewCount: Number(statsData.data.stats.pendingReviewCount || 0),
          consumptionCount: Number(statsData.data.stats.consumptionCount || 0),
        });
      }
    } catch {
      toast.error(t('surpriseBoxes.errorLoading') || 'Kutular yüklenemedi');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchBoxes();
  }, [fetchBoxes]);

  const strategyHint = useMemo(() => {
    if (!rewardStrategy) return null;
    if (rewardStrategy.pendingReviewCount > 0) {
      return (
        <>
          <span className="font-semibold text-foreground">{rewardStrategy.pendingReviewCount} {t('common.consumptions') || 'tüketim'}</span> {t('surpriseBoxes.reviewHint', { count: rewardStrategy.pendingReviewCount }) || 'için yorum yazarsan yeni sürpriz kutu ihtimalin artar.'}
        </>
      );
    }
    return (
      <>
        {t('surpriseBoxes.keepRhythmHint') || 'Bu dönemde ritmini koru: işletme deneyimlerini paylaşmaya devam et; özel kutular burada birikir.'}
      </>
    );
  }, [rewardStrategy]);

  const handleOpen = async (box: SurpriseBoxItem) => {
    if (box.openedAt) return;
    setOpeningId(box.id);
    try {
      const res = await fetch(`/api/surprise-box/${box.id}/open`, { method: 'POST' });
      const data = await res.json();
      if (!data.success) {
        toast.error(data.error ?? 'Kutu açılamadı');
        return;
      }
      setModalContent({
        title: box.title,
        message: box.message,
        couponCode: box.couponCode,
        points: box.points,
        rewardType: box.rewardType,
      });
      setPointsGranted(data.data?.pointsGranted ?? box.points ?? 0);
      setModalOpen(true);
      playRewardChime(); // kutlama ses efekti (animasyon-azaltma açıksa sessiz)
      await fetchBoxes();
    } catch {
      toast.error(t('surpriseBoxes.openError') || 'Kutu açılamadı');
    } finally {
      setOpeningId(null);
    }
  };

  const handlePreview = () => {
    setModalContent(previewBox);
    setPointsGranted(previewBox.points ?? 0);
    setModalOpen(true);
  };

  return (
    <div className="space-y-5 md:space-y-6">
      <DashboardPageHeading
        title={t('surpriseBoxes.title') || 'Sürpriz Kutularım'}
        description={t('surpriseBoxes.description') || 'Size özel kutuları açın; puan ve kuponlar hesabınıza işlenir.'}
      />

      <div className="rounded-2xl border border-border/60 bg-card/40 p-4 shadow-sm backdrop-blur-sm sm:hidden dark:bg-card/30">
        <h1 className="text-balance text-xl font-bold tracking-tight">{t('surpriseBoxes.title') || 'Sürpriz Kutularım'}</h1>
        <p className="mt-1 text-pretty text-sm leading-relaxed text-muted-foreground">
          {t('surpriseBoxes.description') || 'Size özel kutuları açın; puan ve kuponlar hesabınıza işlenir.'}
        </p>
      </div>

      <DashboardPageHeroChrome tone="auto" padded={false}>
        <div className="space-y-5 p-4 sm:p-6 md:p-8">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-4">
              <div className="relative flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-amber-400/35 via-amber-500/25 to-orange-600/20 shadow-inner ring-1 ring-amber-500/25 dark:from-amber-500/20 dark:to-orange-950/40">
                <Gift className="h-7 w-7 text-amber-900 dark:text-amber-200" aria-hidden />
                <span className="absolute -right-0.5 -top-0.5 flex h-5 w-5 items-center justify-center rounded-full bg-primary text-[10px] font-bold text-primary-foreground shadow-sm">
                  {total > 9 ? '9+' : total}
                </span>
              </div>
              <div className="min-w-0 space-y-1">
                <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">{t('surpriseBoxes.rewardCenter') || 'Ödül merkezi'}</p>
                <h2 className="text-balance text-lg font-semibold tracking-tight sm:text-xl">{t('surpriseBoxes.heroTitle') || 'Kutularını aç, ödülleri topla'}</h2>
                <p className="max-w-xl text-pretty text-sm text-muted-foreground">
                  {t('surpriseBoxes.heroDescription') || 'Her kutu işletmelerden veya platformdan size özel hazırlanır. Açmadan önce kutunun başlığını görebilirsiniz.'}
                </p>
              </div>
            </div>
          </div>

          {loading ? (
            <div className="grid grid-cols-3 gap-2 sm:gap-3">
              {[0, 1, 2].map((i) => (
                <div key={i} className="h-[88px] animate-pulse rounded-2xl bg-muted/60" />
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-3 gap-2 sm:gap-3">
              <StatChip label={t('surpriseBoxes.statUnopened') || 'Açılacak'} value={unopened.length} accent="amber" />
              <StatChip label={t('surpriseBoxes.statOpened') || 'Açılmış'} value={opened.length} accent="muted" />
              <StatChip label={t('surpriseBoxes.statTotal') || 'Toplam'} value={total} accent="primary" />
            </div>
          )}
        </div>
      </DashboardPageHeroChrome>

      {!loading && rewardStrategy && strategyHint && (
        <Card className="glass overflow-hidden border-primary/15 bg-gradient-to-br from-primary/[0.06] to-transparent">
          <CardContent className="p-4 sm:p-5">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
              <div className="flex min-w-0 flex-1 gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/12 text-primary">
                  <Sparkles className="h-5 w-5" aria-hidden />
                </div>
                <div className="min-w-0">
                  <p className="text-xs font-medium text-muted-foreground">{t('surpriseBoxes.personalRecommendation') || 'Kişisel öneri'}</p>
                  <p className="mt-1 text-pretty text-sm leading-relaxed text-foreground sm:text-base">{strategyHint}</p>
                  {rewardStrategy.consumptionCount > 0 && (
                    <p className="mt-2 text-xs text-muted-foreground">
                      {t('surpriseBoxes.consumptionCount', { count: rewardStrategy.consumptionCount }) || `Toplam ${rewardStrategy.consumptionCount} tüketim kaydın var.`}
                    </p>
                  )}
                </div>
              </div>
              <Badge variant="secondary" className="w-fit shrink-0 self-start">
                Daha fazla kutu
              </Badge>
            </div>
            <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:flex-wrap">
              <Button variant="outline" asChild className="w-full min-h-11 touch-manipulation sm:w-auto sm:min-w-[12rem]">
                <Link href="/customer/consumptions" className="gap-2">
                  <MessageSquareText className="h-4 w-4 shrink-0" />
                  {t('surpriseBoxes.pendingReviews') || 'Yorum bekleyenler'}
                </Link>
              </Button>
              <Button variant="outline" asChild className="w-full min-h-11 touch-manipulation sm:w-auto sm:min-w-[12rem]">
                <Link href="/customer/feedbacks" className="gap-2">
                  {t('surpriseBoxes.myFeedbacks') || 'Geri bildirimlerim'}
                  <ArrowRight className="h-4 w-4 shrink-0 opacity-70" />
                </Link>
              </Button>
              <Button variant="secondary" className="w-full min-h-11 touch-manipulation sm:w-auto sm:min-w-[12rem]" onClick={handlePreview}>
                Önizlemeyi aç
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {loading ? (
        <div className="space-y-3">
          <div className="h-11 w-full max-w-md animate-pulse rounded-xl bg-muted/70" />
          {[1, 2, 3].map((i) => (
            <Card key={i} className="overflow-hidden border-border/60">
              <CardContent className="p-4 sm:p-5">
                <div className="flex flex-col items-center gap-4 sm:flex-row sm:items-center">
                  <div className="h-20 w-20 shrink-0 animate-pulse rounded-2xl bg-muted/70" />
                  <div className="w-full flex-1 space-y-2">
                    <div className="h-4 w-3/4 max-w-sm animate-pulse rounded bg-muted/70" />
                    <div className="h-3 w-1/2 animate-pulse rounded bg-muted/50" />
                  </div>
                  <div className="h-11 w-full max-w-xs shrink-0 animate-pulse rounded-xl bg-muted/70 sm:w-36" />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : unopened.length === 0 && opened.length === 0 ? (
        <Card className="border-2 border-dashed border-border/80 bg-muted/20">
          <CardContent className="flex flex-col items-center px-4 py-12 text-center sm:py-16">
            <div className="mb-5 flex h-20 w-20 items-center justify-center rounded-3xl bg-muted/60 ring-1 ring-border/60">
              <Box className="h-10 w-10 text-muted-foreground" aria-hidden />
            </div>
            <h3 className="text-lg font-semibold text-foreground">{t('surpriseBoxes.emptyTitle') || 'Henüz sürpriz kutun yok'}</h3>
            <p className="mt-2 max-w-md text-pretty text-sm text-muted-foreground">
              {t('surpriseBoxes.emptyDescription') || 'İşletmelerden veya kampanyalardan gönderilen kutular burada listelenir. Yorum ve geri bildirimlerinle görünürlüğünü artır.'}
            </p>
            <div className="mt-8 flex w-full max-w-md flex-col gap-3 sm:flex-row">
              <Button asChild className="min-h-11 w-full touch-manipulation sm:flex-1">
                <Link href="/customer/consumptions">{t('surpriseBoxes.goToConsumptions') || 'Tüketimlere git'}</Link>
              </Button>
              <Button asChild variant="outline" className="min-h-11 w-full touch-manipulation sm:flex-1">
                <Link href="/customer/rewards">{t('surpriseBoxes.rewardStore') || 'Ödül mağazası'}</Link>
              </Button>
              <Button variant="secondary" className="min-h-11 w-full touch-manipulation sm:flex-1" onClick={handlePreview}>
                Önizlemeyi aç
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : (
        <Tabs value={listTab} onValueChange={(v) => setListTab(v as 'unopened' | 'opened')} className="w-full">
          <TabsList className="grid h-auto w-full max-w-lg grid-cols-2 gap-1 rounded-xl bg-muted/60 p-1 touch-manipulation">
            <TabsTrigger
              value="unopened"
              className="min-h-11 flex-col gap-0.5 rounded-lg px-2 py-2 text-xs data-[state=active]:shadow-sm sm:flex-row sm:gap-2 sm:px-3 sm:py-2.5 sm:text-sm"
            >
              <span className="inline-flex items-center gap-1.5 font-medium">
                <Sparkles className="h-3.5 w-3.5 shrink-0 text-amber-500 sm:h-4 sm:w-4" aria-hidden />
                {t('surpriseBoxes.tabUnopened') || 'Açılacaklar'}
              </span>
              <span className="rounded-md bg-background/90 px-2 py-0.5 text-[11px] font-semibold tabular-nums text-foreground shadow-sm ring-1 ring-border/60 dark:bg-background/50">
                {unopened.length}
              </span>
            </TabsTrigger>
            <TabsTrigger
              value="opened"
              className="min-h-11 flex-col gap-0.5 rounded-lg px-2 py-2 text-xs data-[state=active]:shadow-sm sm:flex-row sm:gap-2 sm:px-3 sm:py-2.5 sm:text-sm"
            >
              <span className="inline-flex items-center gap-1.5 font-medium">
                <Trophy className="h-3.5 w-3.5 shrink-0 text-muted-foreground sm:h-4 sm:w-4" aria-hidden />
                {t('surpriseBoxes.tabHistory') || 'Geçmiş'}
              </span>
              <span className="rounded-md bg-background/90 px-2 py-0.5 text-[11px] font-semibold tabular-nums text-muted-foreground shadow-sm ring-1 ring-border/60 dark:bg-background/50">
                {opened.length}
              </span>
            </TabsTrigger>
          </TabsList>

          <TabsContent value="unopened" className="mt-5 outline-none focus-visible:ring-0">
            {unopened.length === 0 ? (
              <Card className="border-border/70 bg-card/50">
                <CardContent className="flex flex-col items-center gap-4 px-4 py-12 text-center">
                  <PackageOpen className="h-12 w-12 text-muted-foreground/50" />
                  <div>
                    <p className="font-medium text-foreground">{t('surpriseBoxes.noUnopened') || 'Açılacak kutu yok'}</p>
                    <p className="mt-1 max-w-sm text-sm text-muted-foreground">
                      {t('surpriseBoxes.noUnopenedDesc') || 'Yeni kutu geldiğinde burada göreceksin. Geçmiş açılışların için "Geçmiş" sekmesine geç.'}
                    </p>
                  </div>
                  <Button variant="outline" asChild className="min-h-11 w-full max-w-xs touch-manipulation">
                    <Link href="/customer/consumptions">{t('surpriseBoxes.speedUpByReview') || 'Yorum yaparak hızlan'}</Link>
                  </Button>
                </CardContent>
              </Card>
            ) : (
              <ul className="space-y-4">
                <AnimatePresence mode="popLayout">
                  {unopened.map((box, i) => (
                    <motion.li
                      key={box.id}
                      layout
                      initial={{ opacity: 0, y: 14 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, scale: 0.98 }}
                      transition={{ delay: Math.min(i, 10) * 0.04, type: 'spring', stiffness: 380, damping: 28 }}
                    >
                      <Card className="overflow-hidden border-amber-500/20 bg-gradient-to-b from-card to-amber-500/[0.04] shadow-md ring-1 ring-amber-500/10 dark:from-card dark:to-amber-950/20">
                        <CardContent className="p-4 sm:p-5">
                          <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:gap-6">
                            <div className="flex flex-col items-center gap-3 sm:flex-row sm:items-center sm:gap-4">
                              <div className="relative flex h-[4.5rem] w-[4.5rem] shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-amber-400/40 to-orange-600/25 shadow-inner dark:from-amber-500/25 dark:to-orange-900/30">
                                <motion.div
                                  className="absolute inset-2 rounded-lg bg-amber-200/25 dark:bg-amber-400/10"
                                  animate={{ opacity: [0.4, 0.85, 0.4] }}
                                  transition={{ duration: 2.2, repeat: Infinity, ease: 'easeInOut' }}
                                />
                                <Box className="relative z-[1] h-9 w-9 text-amber-950 dark:text-amber-100" />
                              </div>
                              <div className="min-w-0 flex-1 text-center sm:text-left">
                                <div className="flex flex-wrap items-center justify-center gap-2 sm:justify-start">
                                  <Badge className="bg-amber-500/90 text-amber-950 hover:bg-amber-500">{t('surpriseBoxes.surpriseBadge') || 'Sürpriz'}</Badge>
                                  {box.points > 0 && (
                                    <Badge variant="outline" className="gap-1 border-amber-500/30">
                                      <Coins className="h-3 w-3" />
                                      {t('surpriseBoxes.pointsPotential', { points: box.points }) || `+${box.points} puan potansiyeli`}
                                    </Badge>
                                  )}
                                </div>
                                <h3 className="mt-2 text-balance text-base font-semibold leading-snug sm:text-lg">
                                  {box.title}
                                </h3>
                                <p className="mt-1 inline-flex items-center justify-center gap-1.5 text-xs text-muted-foreground sm:justify-start">
                                  <Clock3 className="h-3.5 w-3.5 shrink-0" aria-hidden />
                                  {formatDistanceToNow(new Date(box.createdAt), { addSuffix: true, locale: tr })}
                                </p>
                              </div>
                            </div>
                            <div className="w-full shrink-0 sm:ml-auto sm:w-auto sm:min-w-[10.5rem]">
                              <Button
                                className="h-12 w-full min-h-12 touch-manipulation bg-gradient-to-r from-amber-500 to-orange-500 font-semibold text-amber-950 shadow-md hover:from-amber-400 hover:to-orange-400 sm:w-auto sm:min-w-[10.5rem]"
                                onClick={() => handleOpen(box)}
                                disabled={openingId === box.id}
                              >
                                {openingId === box.id ? (
                                  <>
                                    <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                                    {t('surpriseBoxes.opening') || 'Açılıyor…'}
                                  </>
                                ) : (
                                  <>
                                    {t('surpriseBoxes.openBox') || 'Kutuyu aç'}
                                    <ChevronRight className="ml-1 h-5 w-5" />
                                  </>
                                )}
                              </Button>
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    </motion.li>
                  ))}
                </AnimatePresence>
              </ul>
            )}
          </TabsContent>

          <TabsContent value="opened" className="mt-5 outline-none focus-visible:ring-0">
            {opened.length === 0 ? (
              <Card className="border-border/70 bg-card/50">
                <CardContent className="flex flex-col items-center gap-3 px-4 py-12 text-center">
                  <Trophy className="h-11 w-11 text-muted-foreground/60" />
                  <p className="font-medium text-foreground">{t('surpriseBoxes.noOpened') || 'Henüz açılmış kutu yok'}</p>
                  <p className="max-w-sm text-sm text-muted-foreground">{t('surpriseBoxes.noOpenedDesc') || 'İlk kutunu açtığında ödüllerin burada özetlenir.'}</p>
                </CardContent>
              </Card>
            ) : (
              <ul className="space-y-2.5">
                {opened.map((box) => (
                  <li key={box.id}>
                    <Card className="border-border/60 transition-colors hover:bg-muted/30">
                      <CardContent className="flex items-center gap-3 p-3.5 sm:gap-4 sm:p-4">
                        <div className="relative flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-emerald-500/12 text-emerald-600 dark:text-emerald-400">
                          <PackageOpen className="h-6 w-6" aria-hidden />
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="truncate font-medium leading-tight text-foreground">{box.title}</p>
                          <p className="mt-0.5 text-xs text-muted-foreground">
                            {box.openedAt
                              ? formatDistanceToNow(new Date(box.openedAt), { addSuffix: true, locale: tr })
                              : ''}
                          </p>
                        </div>
                        {box.points > 0 && (
                          <Badge variant="secondary" className="shrink-0 tabular-nums">
                            +{box.points}
                          </Badge>
                        )}
                      </CardContent>
                    </Card>
                  </li>
                ))}
              </ul>
            )}
          </TabsContent>
        </Tabs>
      )}

      <SurpriseBoxModal
        open={modalOpen}
        content={modalContent}
        pointsGranted={pointsGranted}
        onClose={() => {
          setModalOpen(false);
          setModalContent(null);
          setPointsGranted(0);
        }}
      />
    </div>
  );
}
