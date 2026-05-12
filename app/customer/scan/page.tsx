'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import {
  QrCode,
  Camera,
  Keyboard,
  ArrowRight,
  Sparkles,
  X,
  Loader2,
} from 'lucide-react';
import { DashboardPageHeading } from '@/components/dashboard/page-heading';
import { DashboardPageHeroChrome } from '@/components/layout/dashboard-page-hero';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { toast } from '@/lib/admin-toast';
import { useAppT } from '@/lib/app-locale';

function extractCodeFromDecoded(decoded: string): string {
  const t = decoded.trim();
  const match = t.match(/\/feedback\/([A-Za-z0-9_-]+)/);
  if (match) return match[1];
  if (/^[A-Za-z0-9_-]{4,12}$/.test(t)) return t;
  return t.slice(-8);
}

async function validateAndGo(router: ReturnType<typeof useRouter>, code: string) {
  const res = await fetch(`/api/qr-codes/public/${encodeURIComponent(code)}`);
  const data = await res.json();
  if (res.ok && data.qrCode) {
    router.push(`/feedback/${code}`);
    return true;
  }
  return false;
}

export default function CustomerScanPage() {
  const t = useAppT();
  const router = useRouter();
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const scannerRef = useRef<HTMLDivElement>(null);
  const html5QrRef = useRef<import('html5-qrcode').Html5Qrcode | null>(null);

  const handleSubmit = async () => {
    if (!code.trim()) {
      toast.error(t('customerScan.enterCode'));
      return;
    }

    setLoading(true);
    try {
      const ok = await validateAndGo(router, code.trim().toUpperCase());
      if (!ok) toast.error(t('customerScan.notFound'));
    } catch {
      toast.error(t('common.error'));
    } finally {
      setLoading(false);
    }
  };

  const stopCamera = useCallback(async () => {
    if (html5QrRef.current?.isScanning) {
      try {
        await html5QrRef.current.stop();
      } catch {}
      html5QrRef.current?.clear();
      html5QrRef.current = null;
    }
    setCameraOpen(false);
    setCameraError(null);
  }, []);

  const handleCameraClick = useCallback(() => {
    if (cameraOpen) {
      stopCamera();
      return;
    }
    setCameraError(null);
    setCameraOpen(true);
  }, [cameraOpen, stopCamera]);

  useEffect(() => {
    if (!cameraOpen) return;
    const id = 'customer-qr-reader';
    let mounted = true;
    (async () => {
      await new Promise(r => setTimeout(r, 100));
      if (!mounted || !document.getElementById(id)) return;
      try {
        const { Html5Qrcode } = await import('html5-qrcode');
        const qr = new Html5Qrcode(id);
        html5QrRef.current = qr;
        await qr.start(
          { facingMode: 'environment' },
          { fps: 6, qrbox: { width: 220, height: 220 } },
          (decodedText) => {
            const extracted = extractCodeFromDecoded(decodedText);
            if (!extracted) return;
            qr.stop().then(() => {
              html5QrRef.current = null;
              setCameraOpen(false);
              validateAndGo(router, extracted).then((ok) => {
                if (!ok) toast.error(t('customerScan.notFound'));
              });
            });
          },
          () => {}
        );
      } catch (err: unknown) {
        if (!mounted) return;
        const msg = err instanceof Error ? err.message : t('customerScan.cameraOpenFail');
        setCameraError(msg);
        toast.error(t('customerScan.cameraAccessFail'), { description: msg });
        stopCamera();
      }
    })();
    return () => {
      mounted = false;
      if (html5QrRef.current) {
        html5QrRef.current.stop().catch(() => {});
        html5QrRef.current.clear();
        html5QrRef.current = null;
      }
    };
  }, [cameraOpen, router, stopCamera]);

  return (
    <div className="space-y-6">
      <DashboardPageHeading
        title={t('customerScan.title')}
        description={t('customerScan.description')}
      />

      <div className="rounded-2xl border border-border/60 bg-card/40 backdrop-blur-sm p-4 shadow-sm sm:hidden">
        <h1 className="text-xl font-bold tracking-tight text-balance">{t('customerScan.title')}</h1>
        <p className="text-sm text-muted-foreground mt-1 text-pretty leading-relaxed">
          {t('customerScan.description')}
        </p>
      </div>

      <div className="max-w-lg mx-auto space-y-6">
        {/* Camera Scan */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
        >
          <DashboardPageHeroChrome tone="auto" padded={false}>
            <div className="relative p-4 sm:p-8">
              {cameraOpen ? (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-medium">{t('customerScan.holdToCamera')}</p>
                    <Button type="button" variant="ghost" size="icon" className="shrink-0 touch-manipulation" onClick={stopCamera} aria-label={t('customerScan.closeCamera')}>
                      <X className="h-5 w-5" />
                    </Button>
                  </div>
                  <div ref={scannerRef} className="overflow-hidden rounded-lg bg-black/80">
                    <div id="customer-qr-reader" className="min-h-[240px] w-full" />
                  </div>
                  {cameraError && (
                    <p className="text-sm text-destructive">{cameraError}</p>
                  )}
                  <Button type="button" variant="outline" className="w-full" onClick={stopCamera}>
                    {t('customerScan.closeCamera')}
                  </Button>
                </div>
              ) : (
                <div className="text-center space-y-4">
                  <div className="inline-flex p-6 rounded-full bg-primary/10">
                    <Camera className="h-12 w-12 text-primary" />
                  </div>
                  <h3 className="text-xl font-semibold text-balance">{t('customerScan.scanWithCamera')}</h3>
                  <p className="text-muted-foreground text-pretty leading-relaxed px-1">
                    {t('customerScan.scanWithCameraDesc')}
                  </p>
                  <Button size="lg" className="w-full min-h-12 gap-2 text-base touch-manipulation" onClick={handleCameraClick}>
                    <Camera className="h-5 w-5 shrink-0" />
                    {t('customerScan.openCamera')}
                  </Button>
                </div>
              )}
            </div>
          </DashboardPageHeroChrome>
        </motion.div>

        <div className="relative">
          <div className="absolute inset-0 flex items-center">
            <span className="w-full border-t" />
          </div>
          <div className="relative flex justify-center text-xs uppercase">
            <span className="bg-background px-2 text-muted-foreground">{t('customerScan.or')}</span>
          </div>
        </div>

        {/* Manual Entry */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
        >
          <Card glass>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Keyboard className="h-5 w-5" />
                {t('customerScan.manualEntry')}
              </CardTitle>
              <CardDescription>
                {t('customerScan.manualEntryDesc')}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex gap-2 items-stretch">
                <Input
                  placeholder={t('customerScan.enterCodePlaceholder')}
                  value={code}
                  onChange={(e) => setCode(e.target.value.toUpperCase())}
                  className="flex-1 min-w-0 text-center text-base sm:text-lg tracking-widest min-h-11"
                  maxLength={8}
                  inputMode="text"
                  autoCapitalize="characters"
                  autoCorrect="off"
                />
                <Button className="min-h-11 min-w-11 shrink-0 px-0 touch-manipulation" onClick={handleSubmit} disabled={loading} aria-label={t('common.next')}>
                  {loading ? <Loader2 className="h-5 w-5 animate-spin" /> : <ArrowRight className="h-5 w-5" />}
                </Button>
              </div>
            </CardContent>
          </Card>
        </motion.div>

        {/* Info */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
        >
          <Card glass className="bg-primary/5 border-primary/20">
            <CardContent className="p-4">
              <div className="flex gap-3">
                <Sparkles className="h-5 w-5 text-primary flex-shrink-0 mt-0.5" />
                <div>
                  <p className="font-medium">{t('customerScan.earnPoints')}</p>
                  <p className="text-sm text-muted-foreground">
                    {t('customerScan.earnPointsDesc')}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </motion.div>
      </div>
    </div>
  );
}




