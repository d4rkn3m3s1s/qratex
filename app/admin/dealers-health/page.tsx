'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Activity, RefreshCw, ExternalLink } from 'lucide-react';
import { AdminPremiumHero } from '@/components/admin/admin-premium-hero';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';

type Row = {
  dealerId: string;
  label: string;
  fraudStatus: string;
  feedback30d: number;
  avgRating: number | null;
  replyRate: number;
  openIncidents: number;
  remedyQueue: number;
  healthScore: number;
};

export default function AdminDealersHealthPage() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setErr(null);
    try {
      const r = await fetch('/api/admin/dealers-health');
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || 'Yüklenemedi');
      setRows(j.dealers ?? []);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Hata');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  return (
    <div className="space-y-6 pb-10 w-full">
      <AdminPremiumHero
        eyebrow="Operasyon"
        title="Bayi sağlık skoru"
        description="Son 30 gün geri bildirim, yanıt oranı, olay ve telafi kuyruğundan türetilmiş 0–100 skor."
        icon={<Activity className="text-white" />}
        actions={
          <Button
            variant="outline"
            size="sm"
            onClick={() => void load()}
            disabled={loading}
            className="gap-2 border-border/70 bg-background/80 text-foreground hover:bg-accent dark:border-white/35 dark:bg-white/10 dark:text-white dark:hover:bg-white/20"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            Yenile
          </Button>
        }
      />

      {err && (
        <Card className="border-destructive/40">
          <CardContent className="pt-6 text-sm text-destructive">{err}</CardContent>
        </Card>
      )}

      <div className="space-y-3">
        {loading ? (
          <p className="text-sm text-muted-foreground">Yükleniyor…</p>
        ) : (
          rows.map((d) => (
            <Card key={d.dealerId} className="border-border/70 bg-card/50 backdrop-blur-sm shadow-sm hover:shadow-md transition-shadow">
              <CardHeader className="pb-2">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <CardTitle className="text-base">{d.label}</CardTitle>
                    <CardDescription className="font-mono text-[11px] break-all">{d.dealerId}</CardDescription>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant={d.healthScore < 45 ? 'destructive' : d.healthScore < 65 ? 'secondary' : 'default'}>
                      {d.healthScore}
                    </Badge>
                    <Button asChild size="sm" variant="ghost" className="h-8 px-2">
                      <Link href={`/admin/playbooks`}>
                        Playbook
                        <ExternalLink className="h-3 w-3 ml-1" />
                      </Link>
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="rounded-xl border bg-background/40 p-3">
                  <div className="mb-2 flex items-center justify-between">
                    <p className="text-xs text-muted-foreground">Sağlık skoru</p>
                    <p className="text-sm font-semibold">{d.healthScore}/100</p>
                  </div>
                  <Progress value={d.healthScore} className="h-2.5" />
                </div>
                <div className="grid gap-x-4 gap-y-1 text-xs text-muted-foreground sm:grid-cols-2">
                  <span>Geri bildirim: {d.feedback30d}</span>
                  <span>Ort. puan: {d.avgRating ?? '—'}</span>
                  <span>Yanıt: %{d.replyRate}</span>
                  <span>Olay: {d.openIncidents}</span>
                  <span>Telafi kuyruğu: {d.remedyQueue}</span>
                  <span>Fraud: {d.fraudStatus}</span>
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>
    </div>
  );
}
