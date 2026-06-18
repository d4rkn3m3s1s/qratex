'use client';

import { useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Zap, Loader2 } from 'lucide-react';
import { toast } from '@/lib/admin-toast';

interface Config {
  enabled: boolean;
  churnThreshold: number;
  inactiveDays: number;
  autoFlashOffer: boolean;
  maxPerRun: number;
}

/**
 * Bayi tahminsel churn müdahale ayarı. Açıkken günlük cron riskli müşterileri
 * tespit edip bayiyi uyarır (+ opsiyonel flash teklif taslağı).
 */
export function ChurnInterventionSettings() {
  const [cfg, setCfg] = useState<Config | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch('/api/dealer/churn-intervention')
      .then((r) => r.json())
      .then((d) => setCfg(d.config))
      .catch(() => {});
  }, []);

  const patch = (partial: Partial<Config>) => {
    if (!cfg) return;
    const next = { ...cfg, ...partial };
    setCfg(next);
  };

  const save = async () => {
    if (!cfg) return;
    setSaving(true);
    try {
      const res = await fetch('/api/dealer/churn-intervention', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(cfg),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || 'Kaydedilemedi');
      toast.success('Müdahale ayarı kaydedildi');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Kaydedilemedi');
    } finally {
      setSaving(false);
    }
  };

  if (!cfg) return null;

  return (
    <Card className="border-amber-500/30">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Zap className="h-5 w-5 text-amber-500" />
          Otomatik Churn Müdahalesi
        </CardTitle>
        <CardDescription>
          Açıkken her gün riskli ve uzun süredir pasif müşterileri tespit eder, sizi uyarır.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center justify-between">
          <Label htmlFor="churn-enabled">Etkin</Label>
          <Switch id="churn-enabled" checked={cfg.enabled} onCheckedChange={(v) => patch({ enabled: v })} />
        </div>
        <div className="grid gap-4 sm:grid-cols-3">
          <div className="space-y-1.5">
            <Label className="text-xs">Churn eşiği (0-1)</Label>
            <Input
              type="number"
              step="0.05"
              min={0}
              max={1}
              value={cfg.churnThreshold}
              onChange={(e) => patch({ churnThreshold: Number(e.target.value) })}
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Pasif gün eşiği</Label>
            <Input
              type="number"
              min={1}
              value={cfg.inactiveDays}
              onChange={(e) => patch({ inactiveDays: Number(e.target.value) })}
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Koşu başına maks.</Label>
            <Input
              type="number"
              min={1}
              max={100}
              value={cfg.maxPerRun}
              onChange={(e) => patch({ maxPerRun: Number(e.target.value) })}
            />
          </div>
        </div>
        <div className="flex items-center justify-between rounded-lg border p-3">
          <div>
            <Label htmlFor="churn-offer">Otomatik flash teklif taslağı</Label>
            <p className="text-xs text-muted-foreground">Riskli müşteri için %15 indirim taslağı (pasif başlar, onayınızla aktive olur).</p>
          </div>
          <Switch id="churn-offer" checked={cfg.autoFlashOffer} onCheckedChange={(v) => patch({ autoFlashOffer: v })} />
        </div>
        <Button onClick={save} disabled={saving}>
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Zap className="h-4 w-4" />}
          Kaydet
        </Button>
      </CardContent>
    </Card>
  );
}
