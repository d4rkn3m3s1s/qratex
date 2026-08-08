'use client';

import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { DashboardPageHero } from '@/components/layout/dashboard-page-hero';
import {
  Users,
  Copy,
  Share2,
  Gift,
  Star,
  CheckCircle2,
  Clock,
  Loader2,
  Sparkles,
  Trophy,
  Zap,
  Heart,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { toast } from '@/lib/admin-toast';
import { cn, getInitials } from '@/lib/utils';
import { TW_BRAND_CTA_BUTTON, TW_BRAND_ORB_FILL } from '@/lib/tw-brand-classes';
import { useAppLocale, useAppT } from '@/lib/app-locale';

interface ReferralData {
  referralCode: string;
  referrals: {
    id: string;
    status: string;
    pointsEarned: number;
    bonusGiven: number;
    createdAt: string;
    completedAt: string | null;
    referred: {
      id: string;
      name: string | null;
      image: string | null;
      createdAt: string;
    };
  }[];
  referredBy: {
    referrer: { id: string; name: string | null; image: string | null };
  } | null;
  stats: {
    totalReferrals: number;
    completedReferrals: number;
    totalPointsEarned: number;
  };
  rewards?: { referredPoints: number; referrerPoints: number };
  milestones?: {
    all: { count: number; points: number; label: string }[];
    claimed: number[];
    claimable: { count: number; points: number; label: string }[];
    progress: {
      next: { count: number; points: number; label: string } | null;
      current: number;
      target: number | null;
      ratio: number;
    };
  };
}

export default function CustomerReferralPage() {
  const t = useAppT();
  const { locale } = useAppLocale();
  const dateLocale = locale === 'tr' ? 'tr-TR' : 'en-US';
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<ReferralData | null>(null);
  const [applyCode, setApplyCode] = useState('');
  const [applying, setApplying] = useState(false);
  useEffect(() => {
    fetchReferralData();
  }, []);

  const [claimingMs, setClaimingMs] = useState(false);

  const fetchReferralData = async () => {
    try {
      const res = await fetch('/api/referral');
      const result = await res.json();
      if (result.success) {
        setData(result);
      }
    } catch (error) {
      toast.error(t('customerReferral.loadError'));
    } finally {
      setLoading(false);
    }
  };

  // Ulaşılmış kademe ödüllerini talep et (sunucu doğrular + atomik öder).
  const claimMilestones = async () => {
    setClaimingMs(true);
    try {
      const res = await fetch('/api/referral', { method: 'PUT' });
      const result = await res.json();
      if (!res.ok) throw new Error(result?.error || 'Ödül alınamadı');
      toast.success(`🎁 +${result.points} puan kazandın!`);
      fetchReferralData();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Ödül alınamadı');
    } finally {
      setClaimingMs(false);
    }
  };

  const copyCode = () => {
    if (!data?.referralCode) return;
    navigator.clipboard.writeText(data.referralCode);
    toast.success(t('customerReferral.codeCopied'));
  };

  const shareCode = async () => {
    if (!data?.referralCode) return;
    const shareData = {
      title: t('customerReferral.shareTitle'),
      text: `${t('customerReferral.shareText')} ${data.referralCode}`,
      url: `${window.location.origin}/auth/register?ref=${data.referralCode}`,
    };

    if (navigator.share) {
      try {
        await navigator.share(shareData);
      } catch {
        copyCode();
      }
    } else {
      copyCode();
    }
  };

  const applyReferralCode = async () => {
    if (!applyCode.trim()) return;
    setApplying(true);
    try {
      const res = await fetch('/api/referral', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: applyCode.trim() }),
      });
      const result = await res.json();
      if (result.success) {
        toast.success(result.message || t('customerReferral.codeApplied'));
        setApplyCode('');
        fetchReferralData();
      } else {
        toast.error(result.error || t('customerReferral.codeApplyError'));
      }
    } catch {
      toast.error(t('customerReferral.connectionError'));
    } finally {
      setApplying(false);
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[420px] gap-4">
        <Loader2 className="h-10 w-10 animate-spin text-primary" />
        <p className="text-muted-foreground">{t('customerReferral.loading')}</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-8">
      <DashboardPageHero
        eyebrow={t('customerReferral.eyebrow')}
        title={<>{t('customerReferral.title')}</>}
        description={t('customerReferral.description')}
        icon={<Heart className="h-7 w-7" aria-hidden />}
        tone="auto"
      />

      {/* Referral Code */}
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
        <Card className="border-border/60 bg-card/50 backdrop-blur-sm">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-primary" /> {t('customerReferral.yourCode')}
            </CardTitle>
            <CardDescription>{t('customerReferral.yourCodeDescription')}</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col sm:flex-row items-center gap-3">
              <div className="flex-1 w-full">
                <div className="relative">
                  <Input
                    value={data?.referralCode || ''}
                    readOnly
                    className="text-center text-2xl font-bold tracking-widest bg-muted/50 h-14"
                  />
                </div>
              </div>
              <div className="flex gap-2">
                <Button onClick={copyCode} variant="outline" size="lg">
                  <Copy className="h-4 w-4 mr-2" /> {t('customerReferral.copy')}
                </Button>
                <Button onClick={shareCode} size="lg" className={TW_BRAND_CTA_BUTTON}>
                  <Share2 className="h-4 w-4 mr-2" /> {t('customerReferral.share')}
                </Button>
              </div>
            </div>

            {/* Bonus Info */}
            <div className="grid grid-cols-2 gap-4 mt-6">
              <div className="p-4 rounded-xl bg-primary/10 text-center">
                <Gift className="h-6 w-6 text-primary mx-auto mb-2" />
                <p className="text-2xl font-bold text-primary">{data?.rewards?.referrerPoints ?? '—'}</p>
                <p className="text-xs text-muted-foreground">{t('customerReferral.pointsToYou')}</p>
              </div>
              <div className="p-4 rounded-xl bg-violet-500/10 text-center">
                <Star className="h-6 w-6 text-violet-600 dark:text-violet-400 mx-auto mb-2" />
                <p className="text-2xl font-bold text-violet-600 dark:text-violet-400">{data?.rewards?.referredPoints ?? '—'}</p>
                <p className="text-xs text-muted-foreground">{t('customerReferral.pointsToFriend')}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </motion.div>

      {/* Apply Referral Code */}
      {!data?.referredBy && (
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }}>
          <Card className="border-border/60 bg-card/50 backdrop-blur-sm">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Zap className="h-5 w-5 text-yellow-500" /> {t('customerReferral.applyCodeTitle')}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex gap-2">
                <Input
                  value={applyCode}
                  onChange={(e) => setApplyCode(e.target.value.toUpperCase())}
                  placeholder={t('customerReferral.applyCodePlaceholder')}
                  className="flex-1"
                />
                <Button onClick={applyReferralCode} disabled={applying || !applyCode.trim()}>
                  {applying ? <Loader2 className="h-4 w-4 animate-spin" /> : t('customerReferral.apply')}
                </Button>
              </div>
            </CardContent>
          </Card>
        </motion.div>
      )}

      {/* Referred By */}
      {data?.referredBy && (
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }}>
          <Card className="border-0 bg-emerald-500/5 border-emerald-500/20">
            <CardContent className="p-4 flex items-center gap-3">
              <CheckCircle2 className="h-5 w-5 text-emerald-500 shrink-0" />
              <p className="text-sm">
                <span className="font-medium">{data.referredBy.referrer.name || t('customerReferral.aUser')}</span> {t('customerReferral.referredBy')}
              </p>
            </CardContent>
          </Card>
        </motion.div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        {[
          { label: t('customerReferral.statsInvited'), value: data?.stats.totalReferrals || 0, icon: Users, color: 'text-blue-500', bg: 'bg-blue-500/10' },
          { label: t('customerReferral.statsCompleted'), value: data?.stats.completedReferrals || 0, icon: CheckCircle2, color: 'text-emerald-500', bg: 'bg-emerald-500/10' },
          { label: t('customerReferral.statsPoints'), value: data?.stats.totalPointsEarned || 0, icon: Trophy, color: 'text-yellow-500', bg: 'bg-yellow-500/10' },
        ].map((stat, i) => {
          const Icon = stat.icon;
          return (
            <motion.div key={stat.label} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 + i * 0.05 }}>
              <Card className="border-border/60 bg-card/50 backdrop-blur-sm">
                <CardContent className="p-4 text-center">
                  <div className={`p-2 rounded-lg ${stat.bg} w-fit mx-auto mb-2`}>
                    <Icon className={`h-5 w-5 ${stat.color}`} />
                  </div>
                  <p className="text-xl font-bold">{stat.value}</p>
                  <p className="text-[10px] sm:text-xs text-muted-foreground">{stat.label}</p>
                </CardContent>
              </Card>
            </motion.div>
          );
        })}
      </div>

      {/* Kademe (milestone) ödülleri: ilerleme çubuğu + talep edilebilir bonuslar */}
      {data?.milestones && (
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.25 }}>
          <Card className="border-border/60 bg-gradient-to-br from-primary/5 to-violet-500/5 backdrop-blur-sm">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <Sparkles className="h-5 w-5 text-primary" /> Davet Kademeleri
              </CardTitle>
              <CardDescription>Daha çok davet et, kademe bonusları kazan.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Talep edilebilir ödül(ler) */}
              {data.milestones.claimable.length > 0 && (
                <button
                  onClick={claimMilestones}
                  disabled={claimingMs}
                  className="flex w-full items-center justify-between rounded-xl border border-yellow-400/50 bg-yellow-400/10 px-4 py-3 text-left transition-transform hover:scale-[1.01] disabled:opacity-60"
                >
                  <div className="flex items-center gap-2">
                    <Gift className="h-5 w-5 text-yellow-500" />
                    <div>
                      <p className="text-sm font-bold">
                        {data.milestones.claimable.length} kademe ödülü hazır!
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Toplam +{data.milestones.claimable.reduce((s, m) => s + m.points, 0)} puan
                      </p>
                    </div>
                  </div>
                  {claimingMs ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <span className="text-xs font-bold text-yellow-600">Ödülü al →</span>
                  )}
                </button>
              )}

              {/* İlerleme: bir sonraki kademeye */}
              {data.milestones.progress.next ? (
                <div>
                  <div className="mb-1.5 flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">
                      Sonraki: {data.milestones.progress.next.label} (+{data.milestones.progress.next.points}p)
                    </span>
                    <span className="font-semibold">
                      {data.milestones.progress.current}/{data.milestones.progress.target}
                    </span>
                  </div>
                  <div className="h-2.5 w-full overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-primary to-violet-500 transition-all"
                      style={{ width: `${Math.round(data.milestones.progress.ratio * 100)}%` }}
                    />
                  </div>
                </div>
              ) : (
                <p className="text-center text-sm text-muted-foreground">🏆 Tüm kademeleri tamamladın!</p>
              )}

              {/* Tüm kademeler (rozet şeridi) */}
              <div className="flex flex-wrap gap-2">
                {data.milestones.all.map((m) => {
                  const done = data.milestones!.claimed.includes(m.count);
                  const reached = data.milestones!.progress.current >= m.count;
                  return (
                    <span
                      key={m.count}
                      className={cn(
                        'rounded-full border px-2.5 py-1 text-xs font-medium',
                        done
                          ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                          : reached
                            ? 'border-yellow-400/50 bg-yellow-400/10 text-yellow-600'
                            : 'border-border/60 bg-muted/40 text-muted-foreground'
                      )}
                    >
                      {done ? '✓ ' : reached ? '🎁 ' : ''}
                      {m.count} davet · {m.points}p
                    </span>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        </motion.div>
      )}

      {/* Referral List - always show; empty state when no referrals */}
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}>
        <Card className="border-border/60 bg-card/50 backdrop-blur-sm">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Users className="h-5 w-5 text-primary" /> {t('customerReferral.myInvites')}
            </CardTitle>
            <CardDescription>
              {t('customerReferral.myInvitesDescription')}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {data?.referrals && data.referrals.length > 0 ? (
              data.referrals.map((ref, i) => (
                <motion.div key={ref.id} initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.35 + i * 0.05 }}
                  className="flex items-center gap-3 p-3 rounded-xl bg-muted/30"
                >
                  <Avatar className="h-10 w-10">
                    <AvatarImage src={ref.referred.image || ''} />
                    <AvatarFallback className={cn(TW_BRAND_ORB_FILL, 'text-sm text-white')}>
                      {getInitials(ref.referred.name)}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm truncate">{ref.referred.name || t('customerReferral.user')}</p>
                    <p className="text-xs text-muted-foreground">
                      {new Date(ref.createdAt).toLocaleDateString(dateLocale)}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    {ref.status === 'COMPLETED' ? (
                      <Badge className="bg-emerald-500/10 text-emerald-500 border-emerald-500/30 text-xs">
                        <CheckCircle2 className="h-3 w-3 mr-1" /> +{ref.pointsEarned}
                      </Badge>
                    ) : (
                      <Badge variant="secondary" className="text-xs">
                        <Clock className="h-3 w-3 mr-1" /> {t('customerReferral.pending')}
                      </Badge>
                    )}
                  </div>
                </motion.div>
              ))
            ) : (
              <div className="text-center py-8 px-4 rounded-xl bg-muted/20 border border-dashed border-muted-foreground/20">
                <Users className="h-10 w-10 mx-auto text-muted-foreground/50 mb-3" />
                <p className="font-medium text-foreground mb-1">{t('customerReferral.emptyTitle')}</p>
                <p className="text-sm text-muted-foreground mb-4">{t('customerReferral.emptyDescription')}</p>
                <Button onClick={shareCode} size="sm" className={`${TW_BRAND_CTA_BUTTON} min-h-10 touch-manipulation w-full max-w-xs mx-auto`}>
                  <Share2 className="h-4 w-4 mr-2" /> {t('customerReferral.shareCode')}
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      </motion.div>
    </div>
  );
}
