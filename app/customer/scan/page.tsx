'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { m as Motion } from 'framer-motion';
import { Camera, Keyboard, ArrowRight, Sparkles, X, Loader2 } from 'lucide-react';
import { DashboardPageHeading } from '@/components/dashboard/page-heading';
import { DashboardPageHeroChrome } from '@/components/layout/dashboard-page-hero';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { InlineError } from '@/components/states';
import { toast } from '@/lib/admin-toast';
import { useAppT } from '@/lib/app-locale';
import { useQrScanner, QR_SCANNER_ERROR_KEYS } from '@/lib/hooks/use-qr-scanner';
import { extractFeedbackCode } from '@/lib/qr-scan-targets';

const READER_ID = 'customer-qr-reader';

export default function CustomerScanPage() {
  const t = useAppT();
  const router = useRouter();
  const [code, setCode] = useState('');
  const [navigating, setNavigating] = useState(false);

  /**
   * Geri bildirim sayfasına geçiş. Kod doğrulaması (bulunamadı / pasif / süresi dolmuş)
   * hedef sayfada yapılır; burada ayrıca `GET /api/qr-codes/public/:code` çağırmak her
   * taramada ikinci bir `qr_scanned` analitik olayı yazıyor ve bir ağ turu ekliyordu.
   */
  const goToFeedback = (feedbackCode: string) => {
    setNavigating(true);
    router.push(`/feedback/${encodeURIComponent(feedbackCode)}`);
  };

  const scanner = useQrScanner({
    elementId: READER_ID,
    fps: 8,
    qrbox: { width: 220, height: 220 },
    dedupeMs: 5000,
    onDecode: async (decodedText) => {
      const extracted = extractFeedbackCode(decodedText);
      if (!extracted) {
        // Başka bir QR (ör. web sitesi bağlantısı): tarama sürer, aynı kod 5 sn yok sayılır.
        toast.error(t('customerScan.notFound'));
        return;
      }
      await scanner.stop();
      goToFeedback(extracted);
    },
  });

  const handleSubmit = () => {
    const extracted = extractFeedbackCode(code.trim().toUpperCase());
    if (!code.trim()) {
      toast.error(t('customerScan.enterCode'));
      return;
    }
    if (!extracted) {
      toast.error(t('customerScan.notFound'));
      return;
    }
    goToFeedback(extracted);
  };

  const cameraOpen = scanner.isActive;
  const errorMessage = scanner.error ? t(QR_SCANNER_ERROR_KEYS[scanner.error.code]) : null;

  return (
    <div className="space-y-6">
      <DashboardPageHeading title={t('customerScan.title')} description={t('customerScan.description')} />

      <div className="rounded-2xl border border-border/60 bg-card/40 backdrop-blur-sm p-4 shadow-sm sm:hidden">
        <h1 className="text-xl font-bold tracking-tight text-balance">{t('customerScan.title')}</h1>
        <p className="text-sm text-muted-foreground mt-1 text-pretty leading-relaxed">
          {t('customerScan.description')}
        </p>
      </div>

      <div className="max-w-lg mx-auto space-y-6">
        {/* Camera Scan */}
        <Motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
          <DashboardPageHeroChrome tone="auto" padded={false}>
            <div className="relative p-4 sm:p-8">
              {/* Kap her zaman DOM'da: hook başlatırken bulamama yarışı olmaz; kapalıyken gizli. */}
              <div className={cameraOpen ? 'space-y-3' : 'hidden'}>
                <div className="flex items-center justify-between">
                  <p className="text-sm font-medium" aria-live="polite">
                    {t('customerScan.holdToCamera')}
                  </p>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="shrink-0 touch-manipulation"
                    onClick={() => void scanner.stop()}
                    aria-label={t('customerScan.closeCamera')}
                  >
                    <X className="h-5 w-5" aria-hidden />
                  </Button>
                </div>
                <div className="relative overflow-hidden rounded-lg bg-black/80">
                  <div id={READER_ID} className="min-h-[240px] w-full" />
                  {(scanner.status === 'starting' || scanner.status === 'paused' || navigating) && (
                    <div className="absolute inset-0 flex items-center justify-center bg-black/40" role="status">
                      <Loader2 className="h-8 w-8 animate-spin text-white" aria-hidden />
                    </div>
                  )}
                </div>
                <Button
                  type="button"
                  variant="outline"
                  className="w-full min-h-10 touch-manipulation"
                  onClick={() => void scanner.stop()}
                >
                  {t('customerScan.closeCamera')}
                </Button>
              </div>

              {!cameraOpen && (
                <div className="text-center space-y-4">
                  <div className="inline-flex p-6 rounded-full bg-brand-subtle">
                    <Camera className="h-12 w-12 text-brand" aria-hidden />
                  </div>
                  <h3 className="text-xl font-semibold text-balance">{t('customerScan.scanWithCamera')}</h3>
                  <p className="text-muted-foreground text-pretty leading-relaxed px-1">
                    {t('customerScan.scanWithCameraDesc')}
                  </p>
                  {errorMessage && (
                    <InlineError
                      variant="banner"
                      className="text-left"
                      onRetry={() => {
                        scanner.resetError();
                        void scanner.start();
                      }}
                    >
                      {errorMessage}
                    </InlineError>
                  )}
                  <Button
                    size="lg"
                    className="w-full min-h-12 gap-2 text-base touch-manipulation"
                    onClick={() => void scanner.start()}
                    disabled={scanner.status === 'stopping' || navigating}
                  >
                    <Camera className="h-5 w-5 shrink-0" aria-hidden />
                    {t('customerScan.openCamera')}
                  </Button>
                </div>
              )}
            </div>
          </DashboardPageHeroChrome>
        </Motion.div>

        <div className="relative">
          <div className="absolute inset-0 flex items-center">
            <span className="w-full border-t" />
          </div>
          <div className="relative flex justify-center text-xs uppercase">
            <span className="bg-background px-2 text-muted-foreground">{t('customerScan.or')}</span>
          </div>
        </div>

        {/* Manual Entry */}
        <Motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
          <Card glass>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Keyboard className="h-5 w-5" aria-hidden />
                {t('customerScan.manualEntry')}
              </CardTitle>
              <CardDescription>{t('customerScan.manualEntryDesc')}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <form
                className="flex gap-2 items-stretch"
                onSubmit={(e) => {
                  e.preventDefault();
                  handleSubmit();
                }}
              >
                <Input
                  placeholder={t('customerScan.enterCodePlaceholder')}
                  aria-label={t('customerScan.manualEntry')}
                  value={code}
                  onChange={(e) => setCode(e.target.value.toUpperCase())}
                  className="flex-1 min-w-0 text-center text-base sm:text-lg tracking-widest min-h-11"
                  maxLength={8}
                  inputMode="text"
                  autoCapitalize="characters"
                  autoCorrect="off"
                />
                <Button
                  type="submit"
                  className="min-h-11 min-w-11 shrink-0 px-0 touch-manipulation"
                  disabled={navigating}
                  aria-label={t('common.next')}
                >
                  {navigating ? (
                    <Loader2 className="h-5 w-5 animate-spin" aria-hidden />
                  ) : (
                    <ArrowRight className="h-5 w-5" aria-hidden />
                  )}
                </Button>
              </form>
            </CardContent>
          </Card>
        </Motion.div>

        {/* Info */}
        <Motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
          <Card glass className="bg-brand-subtle border-brand-border">
            <CardContent className="p-4">
              <div className="flex gap-3">
                <Sparkles className="h-5 w-5 text-brand flex-shrink-0 mt-0.5" aria-hidden />
                <div>
                  <p className="font-medium">{t('customerScan.earnPoints')}</p>
                  <p className="text-sm text-muted-foreground">{t('customerScan.earnPointsDesc')}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </Motion.div>
      </div>
    </div>
  );
}
