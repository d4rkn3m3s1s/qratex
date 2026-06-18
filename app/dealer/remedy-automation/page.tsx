'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { Wand2, RefreshCw, Play, Settings2 } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Input } from '@/components/ui/input';
import { toast } from '@/lib/admin-toast';
import { useAppT } from '@/lib/app-locale';

type Auto = {
  enabled: boolean;
  minRating: number;
  maxPerRun: number;
  maxMonthlyAuto: number;
  messageTemplate: string;
};

export default function DealerRemedyAutomationPage() {
  const t = useAppT();
  const mkDefault = useCallback(
    (): Auto => ({
      enabled: false,
      minRating: 2,
      maxPerRun: 5,
      maxMonthlyAuto: 40,
      messageTemplate: t('dealerRemedyAutomation.defaultMessageTemplate'),
    }),
    [t],
  );
  const [cfg, setCfg] = useState<Auto>(() => mkDefault());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [scanning, setScanning] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch('/api/dealer/remedy-automation');
      const j = await r.json();
      if (j.success && j.automation) setCfg({ ...mkDefault(), ...j.automation });
    } catch {
      toast.error(t('dealerRemedyAutomation.toastLoadFailed'));
    } finally {
      setLoading(false);
    }
  }, [mkDefault, t]);

  useEffect(() => {
    void load();
  }, [load]);

  const save = async () => {
    setSaving(true);
    try {
      const r = await fetch('/api/dealer/remedy-automation', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(cfg),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || t('dealerRemedyAutomation.toastSaveFailed'));
      setCfg(j.automation);
      toast.success(t('dealerRemedyAutomation.toastSaved'));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('dealerRemedyAutomation.toastGenericError'));
    } finally {
      setSaving(false);
    }
  };

  const scan = async () => {
    setScanning(true);
    try {
      const r = await fetch('/api/dealer/remedy-automation/apply-scan', { method: 'POST' });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || t('dealerRemedyAutomation.toastScanFailed'));
      toast.success(t('dealerRemedyAutomation.toastScanQueued').replace('{count}', String(j.queued ?? 0)));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('dealerRemedyAutomation.toastGenericError'));
    } finally {
      setScanning(false);
    }
  };

  return (
    <div className="space-y-6 max-w-xl pb-10">
      <Button variant="ghost" size="sm" asChild className="w-fit -mb-2 touch-manipulation">
        <Link href="/dealer/settings">
          <Settings2 className="h-4 w-4 shrink-0 mr-2" />
          {t('dealerRemedyAutomation.backToSettings')}
        </Link>
      </Button>
      <div className="rounded-2xl border border-border/60 bg-card/40 backdrop-blur-sm p-4 sm:p-6 shadow-sm">
        <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2 text-balance">
          <Wand2 className="h-7 w-7 shrink-0 text-primary" />
          {t('dealerRemedyAutomation.title')}
        </h1>
        <p className="text-sm text-muted-foreground mt-2 text-pretty leading-relaxed">{t('dealerRemedyAutomation.description')}</p>
        <Button variant="outline" size="sm" asChild className="mt-4 w-fit touch-manipulation">
          <Link href="/dealer/remedy-automation/templates">
            <Settings2 className="h-4 w-4 shrink-0 mr-2" />
            Şablonlar & Mekanlar
          </Link>
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t('dealerRemedyAutomation.rulesTitle')}</CardTitle>
          <CardDescription>{t('dealerRemedyAutomation.rulesDescription')}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {loading ? (
            <p className="text-sm text-muted-foreground">{t('dealerRemedyAutomation.loading')}</p>
          ) : (
            <>
              <div className="flex items-center justify-between gap-4">
                <div>
                  <Label>{t('dealerRemedyAutomation.automationEnabled')}</Label>
                  <p className="text-xs text-muted-foreground">{t('dealerRemedyAutomation.automationEnabledHint')}</p>
                </div>
                <Switch checked={cfg.enabled} onCheckedChange={(v) => setCfg((c) => ({ ...c, enabled: v }))} />
              </div>
              <div>
                <Label>{t('dealerRemedyAutomation.minRatingLabel')}</Label>
                <Input
                  type="number"
                  min={1}
                  max={5}
                  className="mt-1"
                  value={cfg.minRating}
                  onChange={(e) => setCfg((c) => ({ ...c, minRating: Number(e.target.value) || 2 }))}
                />
              </div>
              <div>
                <Label>{t('dealerRemedyAutomation.maxPerRunLabel')}</Label>
                <Input
                  type="number"
                  min={1}
                  max={25}
                  className="mt-1"
                  value={cfg.maxPerRun}
                  onChange={(e) => setCfg((c) => ({ ...c, maxPerRun: Number(e.target.value) || 5 }))}
                />
              </div>
              <div>
                <Label>{t('dealerRemedyAutomation.maxMonthlyLabel')}</Label>
                <Input
                  type="number"
                  min={1}
                  max={500}
                  className="mt-1"
                  value={cfg.maxMonthlyAuto}
                  onChange={(e) => setCfg((c) => ({ ...c, maxMonthlyAuto: Number(e.target.value) || 40 }))}
                />
              </div>
              <div>
                <Label>{t('dealerRemedyAutomation.customerMessageLabel')}</Label>
                <Input
                  className="mt-1"
                  value={cfg.messageTemplate}
                  onChange={(e) => setCfg((c) => ({ ...c, messageTemplate: e.target.value }))}
                />
              </div>
              <div className="flex flex-wrap gap-2">
                <Button onClick={() => void save()} disabled={saving}>
                  {saving ? t('dealerRemedyAutomation.saving') : t('dealerRemedyAutomation.save')}
                </Button>
                <Button variant="outline" onClick={() => void load()} disabled={loading}>
                  <RefreshCw className="h-4 w-4 mr-2" />
                  {t('dealerRemedyAutomation.refresh')}
                </Button>
                <Button variant="secondary" onClick={() => void scan()} disabled={scanning || !cfg.enabled}>
                  <Play className="h-4 w-4 mr-2" />
                  {t('dealerRemedyAutomation.scanNow')}
                </Button>
                <Button asChild variant="ghost" size="sm">
                  <Link href="/dealer/remedy-queue">{t('dealerRemedyAutomation.remedyQueueLink')}</Link>
                </Button>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
