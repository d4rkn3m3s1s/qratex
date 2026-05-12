'use client';

import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import Link from 'next/link';
import { Box, Gift, Sparkles, ChevronRight, Trophy, Clock3, PackageOpen } from 'lucide-react';
import { DashboardPageHeading } from '@/components/dashboard/page-heading';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { SurpriseBoxModal, type SurpriseBoxContent } from '@/components/rewards/surprise-box-modal';
import { formatDistanceToNow } from 'date-fns';
import { tr } from 'date-fns/locale';
import { toast } from '@/lib/admin-toast';

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

export default function CustomerSurpriseBoxesPage() {
  const [unopened, setUnopened] = useState<SurpriseBoxItem[]>([]);
  const [opened, setOpened] = useState<SurpriseBoxItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [modalContent, setModalContent] = useState<SurpriseBoxContent | null>(null);
  const [pointsGranted, setPointsGranted] = useState(0);
  const [openingId, setOpeningId] = useState<string | null>(null);
  const [rewardStrategy, setRewardStrategy] = useState<RewardStrategyData | null>(null);

  const fetchBoxes = useCallback(async () => {
    try {
      const [boxesRes, statsRes] = await Promise.all([
        fetch('/api/surprise-box', { cache: 'no-store' }),
        fetch('/api/customer/stats', { cache: 'no-store' }),
      ]);
      const boxesData = await boxesRes.json();
      const statsData = await statsRes.json();

      if (boxesData.success && boxesData.data) {
        setUnopened(boxesData.data.unopened ?? []);
        setOpened(boxesData.data.opened ?? []);
      }
      if (statsData.success && statsData.data?.stats) {
        setRewardStrategy({
          pendingReviewCount: Number(statsData.data.stats.pendingReviewCount || 0),
          consumptionCount: Number(statsData.data.stats.consumptionCount || 0),
        });
      }
    } catch {
      toast.error('Kutular yüklenemedi');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchBoxes();
  }, [fetchBoxes]);

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
      await fetchBoxes();
    } catch {
      toast.error('Kutu açılamadı');
    } finally {
      setOpeningId(null);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950">
      <DashboardPageHeading
        title="Sürpriz Kutularım"
        description="Size özel gönderilen sürpriz kutuları açın"
      />
      <div className="px-4 pt-2 md:px-6 md:pt-0 max-w-4xl mx-auto sm:hidden">
        <div className="rounded-2xl border border-border/60 bg-card/40 backdrop-blur-sm p-4 shadow-sm dark:bg-card/30">
          <h1 className="text-xl font-bold tracking-tight text-balance">Sürpriz Kutularım</h1>
          <p className="text-sm text-muted-foreground mt-1 text-pretty leading-relaxed">
            Size özel gönderilen sürpriz kutuları açın
          </p>
        </div>
      </div>
      <main className="p-4 md:p-6 max-w-4xl mx-auto">
        {!loading && rewardStrategy && (
          <section className="mb-6">
            <Card className="border-primary/20 bg-gradient-to-br from-primary/10 to-amber-500/5">
              <CardContent className="p-4 md:p-5">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-xs text-muted-foreground mb-1">Kişisel ödül stratejisi</p>
                    {rewardStrategy.pendingReviewCount > 0 ? (
                      <p className="text-sm md:text-base">
                        <span className="font-semibold">{rewardStrategy.pendingReviewCount} tüketim</span> için
                        yorum eklersen sürpriz kutu kazanma hızın artar.
                      </p>
                    ) : (
                      <p className="text-sm md:text-base">
                        Harika gidiyorsun! Bu hafta 2 yeni yorum ve 1 detaylı geri bildirimle ödül ritmini koru.
                      </p>
                    )}
                  </div>
                  <Badge variant="secondary" className="shrink-0">
                    Hızlandırıcı öneri
                  </Badge>
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  <Button size="sm" variant="outline" asChild>
                    <Link href="/customer/consumptions">Yorum bekleyenleri gör</Link>
                  </Button>
                  <Button size="sm" variant="outline" asChild>
                    <Link href="/customer/feedbacks">Geri bildirimlerim</Link>
                  </Button>
                </div>
              </CardContent>
            </Card>
          </section>
        )}

        {!loading && (
          <section className="mb-6 grid gap-3 sm:grid-cols-3">
            <Card className="border-amber-500/25 bg-gradient-to-br from-amber-500/10 to-orange-500/5">
              <CardContent className="p-4">
                <p className="text-xs text-muted-foreground">Acilmayi bekleyen</p>
                <p className="mt-1 text-2xl font-bold">{unopened.length}</p>
              </CardContent>
            </Card>
            <Card className="border-border/60 bg-card/70">
              <CardContent className="p-4">
                <p className="text-xs text-muted-foreground">Acilmis kutu</p>
                <p className="mt-1 text-2xl font-bold">{opened.length}</p>
              </CardContent>
            </Card>
            <Card className="border-primary/25 bg-gradient-to-br from-primary/10 to-primary/5">
              <CardContent className="p-4">
                <p className="text-xs text-muted-foreground">Toplam kutu</p>
                <p className="mt-1 text-2xl font-bold">{opened.length + unopened.length}</p>
              </CardContent>
            </Card>
          </section>
        )}
        {loading ? (
          <div className="grid gap-4 md:grid-cols-2">
            {[1, 2].map((i) => (
              <Card key={i} className="animate-pulse">
                <CardContent className="p-6 h-32" />
              </Card>
            ))}
          </div>
        ) : (
          <>
            {unopened.length > 0 && (
              <section className="mb-8">
                <h2 className="text-lg font-semibold text-slate-800 dark:text-slate-200 mb-3 flex items-center gap-2 text-balance">
                  <Sparkles className="w-5 h-5 shrink-0 text-amber-500" />
                  Açılmamış Kutular ({unopened.length})
                </h2>
                <div className="grid gap-4 md:grid-cols-2">
                  <AnimatePresence>
                    {unopened.map((box, i) => (
                      <motion.div
                        key={box.id}
                        initial={{ opacity: 0, y: 12 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.95 }}
                        transition={{ delay: i * 0.05 }}
                      >
                        <Card className="overflow-hidden border-2 border-amber-500/30 bg-gradient-to-br from-amber-50 via-orange-50 to-background dark:from-amber-950/30 dark:to-orange-950/20 dark:border-amber-500/20 shadow-sm hover:shadow-md transition-shadow">
                          <CardContent className="p-0">
                            <div className="flex items-stretch">
                              <div className="w-20 flex-shrink-0 flex flex-col items-center justify-center gap-1 bg-amber-500/20 dark:bg-amber-500/10 relative overflow-hidden">
                                <motion.div
                                  className="absolute inset-x-2 top-2 h-1 rounded-full bg-amber-300/80"
                                  animate={{ opacity: [0.35, 1, 0.35], scaleX: [0.85, 1.1, 0.85] }}
                                  transition={{ duration: 1.8, repeat: Infinity, ease: 'easeInOut' }}
                                />
                                <motion.div
                                  animate={{ y: [0, -2, 0], rotate: [0, -2, 2, 0] }}
                                  transition={{ duration: 2.2, repeat: Infinity, ease: 'easeInOut' }}
                                >
                                  <Box className="w-10 h-10 text-amber-600 dark:text-amber-400" />
                                </motion.div>
                                <span className="text-[10px] font-semibold text-amber-700 dark:text-amber-300">Sürpriz</span>
                              </div>
                              <div className="flex-1 p-4 flex flex-col justify-center">
                                <p className="font-semibold text-slate-800 dark:text-slate-200 truncate">
                                  {box.title}
                                </p>
                                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 inline-flex items-center gap-1">
                                  <Clock3 className="w-3.5 h-3.5" />
                                  {formatDistanceToNow(new Date(box.createdAt), {
                                    addSuffix: true,
                                    locale: tr,
                                  })}
                                </p>
                                <Button
                                  size="sm"
                                  className="mt-3 bg-amber-500 hover:bg-amber-600 text-slate-900 w-fit"
                                  onClick={() => handleOpen(box)}
                                  disabled={openingId === box.id}
                                >
                                  {openingId === box.id ? (
                                    'Açılıyor...'
                                  ) : (
                                    <>
                                      Aç
                                      <ChevronRight className="w-4 h-4 ml-1" />
                                    </>
                                  )}
                                </Button>
                              </div>
                            </div>
                          </CardContent>
                        </Card>
                      </motion.div>
                    ))}
                  </AnimatePresence>
                </div>
              </section>
            )}

            {opened.length > 0 && (
              <section>
                <h2 className="text-lg font-semibold text-slate-800 dark:text-slate-200 mb-3 flex items-center gap-2 text-balance">
                  <Trophy className="w-5 h-5 shrink-0 text-slate-500" />
                  Açılmış Kutular
                </h2>
                <div className="grid gap-3 md:grid-cols-2">
                  {opened.map((box) => (
                    <Card
                      key={box.id}
                      className="border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900/50"
                    >
                      <CardContent className="p-4 flex items-center gap-3">
                        <div className="w-12 h-12 rounded-lg bg-slate-100 dark:bg-slate-800 flex items-center justify-center relative overflow-hidden">
                          <motion.div
                            className="absolute inset-x-1 top-1 h-1 rounded bg-emerald-400/60"
                            animate={{ opacity: [0.3, 1, 0.3], scaleX: [0.8, 1.15, 0.8] }}
                            transition={{ duration: 2, repeat: Infinity }}
                          />
                          <PackageOpen className="w-6 h-6 text-emerald-500" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-slate-800 dark:text-slate-200 truncate">
                            {box.title}
                          </p>
                          <p className="text-xs text-slate-500 dark:text-slate-400">
                            {box.openedAt
                              ? formatDistanceToNow(new Date(box.openedAt), {
                                  addSuffix: true,
                                  locale: tr,
                                })
                              : ''}
                          </p>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </section>
            )}

            {!loading && unopened.length === 0 && opened.length === 0 && (
              <Card className="border border-dashed border-slate-300 dark:border-slate-600">
                <CardContent className="py-12 text-center">
                  <Box className="w-14 h-14 mx-auto text-slate-400 dark:text-slate-500 mb-3" />
                  <p className="text-slate-600 dark:text-slate-400 font-medium">
                    Henüz sürpriz kutunuz yok
                  </p>
                  <p className="text-sm text-slate-500 dark:text-slate-500 mt-1">
                    Size özel kutular gönderildiğinde burada görünecek.
                  </p>
                </CardContent>
              </Card>
            )}
          </>
        )}
      </main>

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
