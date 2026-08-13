'use client';

import { useState, useEffect, useCallback } from 'react';
import { m as Motion } from 'framer-motion';
import { DashboardPageHero } from '@/components/layout/dashboard-page-hero';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Sparkles, Timer, Gift, Zap, Loader2, PartyPopper, Trophy } from 'lucide-react';
import { toast } from '@/lib/admin-toast';
import { formatRemaining } from '@/lib/seasonal-event-core';

interface EventData {
  active: boolean;
  event?: {
    id: string;
    name: string;
    description: string;
    type: string;
    multiplier: number;
    bonusPoints: number;
    imageUrl: string | null;
    endsInMs: number;
    endDate: string;
  };
  challenge?: {
    type: string;
    goal: number;
    current: number;
    ratio: number;
    complete: boolean;
    rewardPoints: number;
    claimed: boolean;
  } | null;
}

const challengeLabel = (type: string) =>
  type === 'games_played' ? 'oyun oyna' : type === 'reviews_written' ? 'yorum yaz' : 'görev tamamla';

export default function SeasonalEventPage() {
  const [data, setData] = useState<EventData | null>(null);
  const [loading, setLoading] = useState(true);
  const [claiming, setClaiming] = useState(false);
  const [remainingMs, setRemainingMs] = useState(0);

  const load = useCallback(() => {
    setLoading(true);
    fetch('/api/customer/seasonal-event')
      .then((r) => r.json())
      .then((j) => {
        setData(j);
        if (j?.event?.endsInMs) setRemainingMs(j.event.endsInMs);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (remainingMs <= 0) return;
    const t = setInterval(() => setRemainingMs((v) => Math.max(0, v - 60_000)), 60_000);
    return () => clearInterval(t);
  }, [remainingMs]);

  const claim = async () => {
    setClaiming(true);
    try {
      const res = await fetch('/api/customer/seasonal-event', { method: 'POST' });
      const j = await res.json();
      if (!res.ok) throw new Error(j?.error || 'Ödül alınamadı');
      toast.success(j.points > 0 ? `🎉 +${j.points} puan kazandın!` : '🎉 Özel ödülün hesabında!');
      load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Ödül alınamadı');
    } finally {
      setClaiming(false);
    }
  };

  return (
    <div className="space-y-6">
      <DashboardPageHero
        icon={<PartyPopper className="text-white" />}
        title="Etkinlik Merkezi"
        description="Zaman-sınırlı özel etkinlikler, çarpanlar ve challenge ödülleri."
      />

      {loading ? (
        <div className="h-48 animate-pulse rounded-2xl bg-muted/50" />
      ) : !data?.active || !data.event ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-16 text-center">
            <Sparkles className="h-10 w-10 text-muted-foreground/40" />
            <p className="text-lg font-semibold">Şu an aktif etkinlik yok</p>
            <p className="max-w-sm text-sm text-muted-foreground">
              Yakında özel bir etkinlik başlayacak — bonus puanlar ve challenge ödülleri seni bekliyor. Takipte kal! ✨
            </p>
          </CardContent>
        </Card>
      ) : (
        <>
          {/* Etkinlik başlığı + geri sayım + çarpan */}
          <Motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
            <Card className="overflow-hidden border-primary/30 bg-gradient-to-br from-primary/10 via-violet-500/5 to-amber-400/10">
              <CardContent className="p-6">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="min-w-0">
                    <div className="mb-1 flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-primary">
                      <Sparkles className="h-4 w-4" /> Aktif Etkinlik
                    </div>
                    <h2 className="text-2xl font-black">{data.event.name}</h2>
                    <p className="mt-1 max-w-lg text-sm text-muted-foreground">{data.event.description}</p>
                  </div>
                  <div className="flex items-center gap-1.5 rounded-full bg-background/70 px-3 py-1.5 text-sm font-semibold shadow-sm">
                    <Timer className="h-4 w-4 text-primary" />
                    {remainingMs > 0 ? `${formatRemaining(remainingMs)} kaldı` : 'Bitiyor'}
                  </div>
                </div>

                {/* Çarpan + bonus rozetleri */}
                <div className="mt-4 flex flex-wrap gap-2">
                  {data.event.multiplier > 1 && (
                    <span className="flex items-center gap-1 rounded-full bg-primary/15 px-3 py-1 text-sm font-bold text-primary">
                      <Zap className="h-4 w-4" /> {data.event.multiplier}× puan
                    </span>
                  )}
                  {data.event.bonusPoints > 0 && (
                    <span className="flex items-center gap-1 rounded-full bg-violet-500/15 px-3 py-1 text-sm font-bold text-violet-600 dark:text-violet-400">
                      <Gift className="h-4 w-4" /> +{data.event.bonusPoints} bonus
                    </span>
                  )}
                </div>
              </CardContent>
            </Card>
          </Motion.div>

          {/* Challenge (varsa) */}
          {data.challenge && (
            <Motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
              <Card>
                <CardContent className="space-y-4 p-6">
                  <div className="flex items-center gap-2">
                    <Trophy className="h-5 w-5 text-amber-500" />
                    <h3 className="text-lg font-bold">Etkinlik Görevi</h3>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    Etkinlik boyunca <span className="font-semibold text-foreground">{data.challenge.goal} {challengeLabel(data.challenge.type)}</span>
                    {data.challenge.rewardPoints > 0 && <> → <span className="font-semibold text-primary">+{data.challenge.rewardPoints} puan</span></>} kazan.
                  </p>

                  {/* İlerleme çubuğu */}
                  <div>
                    <div className="mb-1.5 flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">İlerleme</span>
                      <span className="font-bold">{data.challenge.current}/{data.challenge.goal}</span>
                    </div>
                    <div className="h-3 w-full overflow-hidden rounded-full bg-muted">
                      <div
                        className="h-full rounded-full bg-gradient-to-r from-primary to-amber-400 transition-all"
                        style={{ width: `${Math.round(data.challenge.ratio * 100)}%` }}
                      />
                    </div>
                  </div>

                  {/* Durum / ödül talebi */}
                  {data.challenge.claimed ? (
                    <p className="flex items-center gap-2 rounded-xl bg-emerald-500/10 px-4 py-3 text-sm font-semibold text-emerald-600 dark:text-emerald-400">
                      <PartyPopper className="h-5 w-5" /> Ödülünü aldın — tekrar teşekkürler!
                    </p>
                  ) : data.challenge.complete ? (
                    <Button className="w-full" disabled={claiming} onClick={claim}>
                      {claiming ? <Loader2 className="h-4 w-4 animate-spin" /> : <><Gift className="mr-1 h-4 w-4" /> Ödülü al</>}
                    </Button>
                  ) : (
                    <p className="text-center text-sm text-muted-foreground">
                      Tamamlamana {data.challenge.goal - data.challenge.current} {challengeLabel(data.challenge.type)} kaldı 💪
                    </p>
                  )}
                </CardContent>
              </Card>
            </Motion.div>
          )}
        </>
      )}
    </div>
  );
}
