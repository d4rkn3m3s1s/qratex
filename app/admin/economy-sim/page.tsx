'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { SlidersHorizontal, RefreshCw, Coins } from 'lucide-react';
import { AdminPremiumHero } from '@/components/admin/admin-premium-hero';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export default function AdminEconomySimPage() {
  const [fb, setFb] = useState('120');
  const [detailed, setDetailed] = useState('0.25');
  const [quests, setQuests] = useState('30');
  const [spins, setSpins] = useState('150');
  const [payload, setPayload] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const qs = useMemo(() => {
    const p = new URLSearchParams();
    p.set('feedbackCount', fb);
    p.set('detailedRatio', detailed);
    p.set('questCompletions', quests);
    p.set('spinPulls', spins);
    return p.toString();
  }, [fb, detailed, quests, spins]);

  const load = async () => {
    setLoading(true);
    setErr(null);
    try {
      const r = await fetch(`/api/admin/economy-sim?${qs}`);
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || 'Yüklenemedi');
      setPayload(j);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Hata');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const est = payload?.estimate as
    | {
        totalPoints: number;
        totalXp: number;
        feedbackPoints: number;
        questPoints: number;
        spinPoints: number;
      }
    | undefined;

  return (
    <div className="space-y-6 pb-10 w-full">
      <AdminPremiumHero
        eyebrow="Simülasyon"
        title="Ekonomi simülatörü"
        description="Puan matrisi ayarlarınıza göre toplu tahmin. Canlı veriyi değiştirmez."
        icon={<Coins className="text-white" />}
        actions={
          <Button asChild variant="outline" size="sm" className="border-border/70 bg-background/80 text-foreground hover:bg-accent dark:border-white/35 dark:bg-white/10 dark:text-white dark:hover:bg-white/20">
            <Link href="/admin/points-matrix">
              <SlidersHorizontal className="h-4 w-4 mr-2" />
              Puan matrisi
            </Link>
          </Button>
        }
      />

      <Card className="border-border/60 bg-card/50 backdrop-blur-sm shadow-sm">
        <CardHeader>
          <CardTitle className="text-base">Senaryo</CardTitle>
          <CardDescription>Geri bildirim sayısı, detaylı oran, görev tamamlama, çark çekişi</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <div>
            <Label>Geri bildirim adedi</Label>
            <Input className="mt-1" value={fb} onChange={(e) => setFb(e.target.value)} inputMode="numeric" />
          </div>
          <div>
            <Label>Detaylı metin oranı (0–1)</Label>
            <Input className="mt-1" value={detailed} onChange={(e) => setDetailed(e.target.value)} />
          </div>
          <div>
            <Label>Görev tamamlama</Label>
            <Input className="mt-1" value={quests} onChange={(e) => setQuests(e.target.value)} inputMode="numeric" />
          </div>
          <div>
            <Label>Çark çekişi</Label>
            <Input className="mt-1" value={spins} onChange={(e) => setSpins(e.target.value)} inputMode="numeric" />
          </div>
          <div className="sm:col-span-2 flex gap-2">
            <Button onClick={() => void load()} disabled={loading} className="gap-2">
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
              Hesapla
            </Button>
          </div>
        </CardContent>
      </Card>

      {err && (
        <Card className="border-destructive/40">
          <CardContent className="pt-6 text-sm text-destructive">{err}</CardContent>
        </Card>
      )}

      {est && (
        <Card className="border-border/60 bg-card/50 backdrop-blur-sm shadow-sm">
          <CardHeader>
            <CardTitle className="text-base">Tahmini toplam</CardTitle>
            <CardDescription>{(payload?.note as string) || ''}</CardDescription>
          </CardHeader>
          <CardContent className="grid grid-cols-2 gap-3 text-sm md:grid-cols-4">
            <div className="rounded-lg border p-3 md:col-span-2">
              <p className="text-xs text-muted-foreground">Puan</p>
              <p className="text-3xl font-bold tabular-nums">{est.totalPoints.toLocaleString('tr-TR')}</p>
            </div>
            <div className="rounded-lg border p-3 md:col-span-2">
              <p className="text-xs text-muted-foreground">XP</p>
              <p className="text-3xl font-bold tabular-nums">{est.totalXp.toLocaleString('tr-TR')}</p>
            </div>
            <div className="rounded-lg border p-3 col-span-2 md:col-span-4 text-muted-foreground text-xs">
              Geri bildirim puanı: {est.feedbackPoints.toLocaleString('tr-TR')} · Görev:{' '}
              {est.questPoints.toLocaleString('tr-TR')} · Çark: {est.spinPoints.toLocaleString('tr-TR')}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
