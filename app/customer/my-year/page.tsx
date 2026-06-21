'use client';

import { useEffect, useState } from 'react';
import { DashboardPageHero } from '@/components/layout/dashboard-page-hero';
import { Card, CardContent } from '@/components/ui/card';
import { Sparkles, MessageSquare, Store, Trophy, Flame, Zap, TrendingUp } from 'lucide-react';
import { toast } from '@/lib/admin-toast';
import { InlineLoadingStatus } from '@/components/ui/inline-loading-status';

interface MyYear {
  period: string;
  level: number;
  currentPoints: number;
  feedback: { total: number; avgRating: number | null; dealersWhoActed: number; impactRate: number };
  visits: { count: number; totalSpent: number; topDealer: { name: string; visits: number } | null };
  rewards: { badgesEarned: number; pointsEarned: number; pointsSpent: number };
  social: { squadBattles: number; longestStreak: number; currentStreak: number };
}

function Stat({ icon, value, label, accent }: { icon: React.ReactNode; value: React.ReactNode; label: string; accent?: boolean }) {
  return (
    <Card className={accent ? 'border-primary/40 bg-primary/5' : undefined}>
      <CardContent className="flex flex-col items-center gap-1 p-5 text-center">
        <div className={accent ? 'text-primary' : 'text-muted-foreground'}>{icon}</div>
        <span className="text-2xl font-bold tabular-nums">{value}</span>
        <span className="text-xs text-muted-foreground">{label}</span>
      </CardContent>
    </Card>
  );
}

export default function CustomerMyYearPage() {
  const [data, setData] = useState<MyYear | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/customer/my-year')
      .then((r) => r.json())
      .then((d) => {
        if (d.error) throw new Error(d.error);
        setData(d);
      })
      .catch(() => toast.error('Özet yüklenemedi'))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="flex flex-1 flex-col gap-6 p-6">
      <DashboardPageHero
        title="QRATEX'te Yılım"
        description="Geri bildirimlerinin gerçek etkisi ve bu yılki kilometre taşların"
        icon={<Sparkles className="text-white" />}
      />

      {loading ? (
        <Card>
          <CardContent className="p-6">
            <InlineLoadingStatus />
          </CardContent>
        </Card>
      ) : !data ? (
        <Card>
          <CardContent className="p-6 text-sm text-muted-foreground">Henüz özet oluşturulamadı.</CardContent>
        </Card>
      ) : (
        <>
          {/* Etki vurgusu — "sesin duyuldu" */}
          <Card className="overflow-hidden border-primary/40">
            <CardContent className="flex flex-col items-center gap-2 bg-gradient-to-br from-primary/10 to-transparent p-8 text-center">
              <MessageSquare className="h-8 w-8 text-primary" />
              <p className="text-4xl font-extrabold text-primary">{data.feedback.dealersWhoActed}</p>
              <p className="max-w-md text-sm text-muted-foreground">
                işletme geri bildiriminize <span className="font-semibold text-foreground">yanıt verdi</span>.
                {data.feedback.total > 0 && (
                  <> Toplam {data.feedback.total} yorumunun %{data.feedback.impactRate}'i karşılık buldu.</>
                )}
              </p>
            </CardContent>
          </Card>

          {/* Kilometre taşları */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            <Stat icon={<TrendingUp className="h-5 w-5" />} value={data.level} label="Seviye" accent />
            <Stat icon={<MessageSquare className="h-5 w-5" />} value={data.feedback.total} label="Geri bildirim" />
            <Stat
              icon={<Sparkles className="h-5 w-5" />}
              value={data.feedback.avgRating != null ? `${data.feedback.avgRating}★` : '—'}
              label="Ortalama puanın"
            />
            <Stat icon={<Store className="h-5 w-5" />} value={data.visits.count} label="Ziyaret" />
            <Stat icon={<Trophy className="h-5 w-5" />} value={data.rewards.badgesEarned} label="Rozet" />
            <Stat icon={<Zap className="h-5 w-5" />} value={data.rewards.pointsEarned.toLocaleString('tr-TR')} label="Kazanılan puan" />
            <Stat icon={<Flame className="h-5 w-5" />} value={data.social.longestStreak} label="En uzun seri (gün)" />
            <Stat icon={<Trophy className="h-5 w-5" />} value={data.social.squadBattles} label="Klan savaşı" />
          </div>

          {data.visits.topDealer && (
            <Card>
              <CardContent className="flex items-center gap-3 p-4">
                <Store className="h-5 w-5 text-muted-foreground" />
                <p className="text-sm">
                  En çok ziyaret ettiğin yer:{' '}
                  <span className="font-semibold">{data.visits.topDealer.name}</span>{' '}
                  <span className="text-muted-foreground">({data.visits.topDealer.visits} ziyaret)</span>
                </p>
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
