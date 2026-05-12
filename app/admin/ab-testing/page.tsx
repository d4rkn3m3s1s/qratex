'use client';

import { useEffect, useState } from 'react';
import { FlaskConical, Target, Zap, Users, TrendingUp, RefreshCw, Sparkles } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { toast } from '@/lib/admin-toast';
import { AdminPremiumHero } from '@/components/admin/admin-premium-hero';

type Cohort = {
  key: 'A' | 'B' | 'C';
  label: string;
  multiplier: number;
  dealerCount: number;
  feedbackCount: number;
  avgRating: number;
  avgReplyRate: number;
};

export default function AdminABTestingPage() {
  const [cohorts, setCohorts] = useState<Cohort[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [assigning, setAssigning] = useState(false);
  const [totals, setTotals] = useState({ dealerCount: 0, unassigned: 0 });

  const load = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/ab-testing/overview', { cache: 'no-store' });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || 'Veri alınamadı');
      setCohorts(data.cohorts || []);
      setTotals(data.totals || { dealerCount: 0, unassigned: 0 });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'A/B verisi alınamadı');
      setCohorts([]);
      setTotals({ dealerCount: 0, unassigned: 0 });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const assignCohorts = async () => {
    setAssigning(true);
    try {
      const res = await fetch('/api/admin/bootstrap', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'assign_ab_cohorts' }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || 'Atama başarısız');
      toast.success(`${data.assigned ?? 0} bayi kohorta atandı`);
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Atama başarısız');
    } finally {
      setAssigning(false);
    }
  };

  const refresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  const hasData = cohorts.some((c) => c.dealerCount > 0);

  return (
    <div className="space-y-6">
      <AdminPremiumHero
        eyebrow="Deneysel"
        title="Oyunlaştırma A/B testi"
        description="Dealer kohortlarına farklı puan çarpanları atayın; geri bildirim ve yanıt oranı etkisini karşılaştırın."
        icon={<FlaskConical className="text-white" />}
        chips={
          <Badge variant="outline" className="h-8 flex gap-2 items-center border-border/70 bg-background/85 text-foreground dark:border-white/35 dark:bg-white/15 dark:text-white">
            <FlaskConical className="w-4 h-4" /> Deneysel mod
          </Badge>
        }
        actions={
          <div className="flex items-center gap-2 flex-wrap justify-end">
            <Button
              variant="outline"
              size="sm"
              onClick={() => void refresh()}
              disabled={refreshing || loading}
              className="border-border/70 bg-background/80 text-foreground hover:bg-accent dark:border-white/35 dark:bg-white/10 dark:text-white dark:hover:bg-white/20"
            >
              <RefreshCw className={`h-4 w-4 mr-2 ${refreshing ? 'animate-spin' : ''}`} />
              Yenile
            </Button>
            {totals.unassigned > 0 && (
              <Button size="sm" onClick={() => void assignCohorts()} disabled={assigning} className="bg-white text-emerald-900 hover:bg-white/90">
                <Sparkles className="h-4 w-4 mr-2" />
                Boş cohortları ata ({totals.unassigned})
              </Button>
            )}
          </div>
        }
      />

      <div className="grid gap-4 md:grid-cols-3">
        {loading ? (
          [1, 2, 3].map((i) => (
            <Card key={i}><CardContent className="h-36 animate-pulse" /></Card>
          ))
        ) : (
          cohorts.map((cohort) => (
            <Card key={cohort.key} className="group relative overflow-hidden border-border/50 transition-colors hover:border-primary/50">
              <div className="absolute right-0 top-0 -z-10 h-32 w-32 rounded-bl-full bg-primary/5 transition-colors group-hover:bg-primary/10" />
              <CardHeader className="pb-2 flex flex-row items-center justify-between">
                <div>
                  <CardTitle className="text-xl font-bold">{cohort.label}</CardTitle>
                  <CardDescription>XP çarpanı x{cohort.multiplier}</CardDescription>
                </div>
                <div className="p-2 bg-muted rounded-lg"><Users className="w-4 h-4 text-muted-foreground" /></div>
              </CardHeader>
              <CardContent className="space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Bayi</span>
                  <span className="font-semibold">{cohort.dealerCount}</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Geri bildirim</span>
                  <span className="font-semibold">{cohort.feedbackCount}</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Ort. puan</span>
                  <span className="font-semibold">{cohort.avgRating.toFixed(2)}</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Yanıt oranı</span>
                  <span className="font-semibold">%{cohort.avgReplyRate}</span>
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>

      <Card className="border-border/50 bg-card overflow-hidden">
        <div className="p-6 border-b border-border/50">
          <h3 className="font-semibold text-lg flex items-center gap-2"><TrendingUp className="w-5 h-5 text-primary" /> Cohort Etki Özeti</h3>
        </div>
        <div className="p-8">
          {!hasData ? (
            <div className="text-center text-muted-foreground">
              <Target className="w-10 h-10 mx-auto mb-3 opacity-40" />
              <p>Henüz cohort verisi yok. Önce bayileri cohortlara atayın.</p>
            </div>
          ) : (
            <div className="grid md:grid-cols-3 gap-4 text-sm">
              {cohorts.map((c) => (
                <div key={c.key} className="rounded-xl border p-4">
                  <p className="font-semibold">{c.label}</p>
                  <p className="text-muted-foreground mt-1">x{c.multiplier} kuralı ile çalışan grup</p>
                  <p className="mt-3">Ortalama skor: <b>{c.avgRating.toFixed(2)}</b></p>
                  <p>Yanıt: <b>%{c.avgReplyRate}</b></p>
                </div>
              ))}
            </div>
          )}
        </div>
      </Card>
    </div>
  );
}
