'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { m as Motion, AnimatePresence } from 'framer-motion';
import { Download, X, Share, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { usePWA } from '@/hooks/use-pwa';
import { cn } from '@/lib/utils';
import { floatingZTw } from '@/lib/ui-z';
import { useAppT } from '@/lib/app-locale';

export function InstallBanner() {
  const t = useAppT();
  const { isInstallable, isInstalled, isIOS, promptInstall, isStandalone } = usePWA();
  const [isDismissed, setIsDismissed] = useState(false);
  const [showIOSGuide, setShowIOSGuide] = useState(false);
  const iosGuideDialogRef = useRef<HTMLDivElement>(null);
  const prevIosFocusRef = useRef<HTMLElement | null>(null);

  const openIosGuide = useCallback(() => {
    if (document.activeElement instanceof HTMLElement) prevIosFocusRef.current = document.activeElement;
    else prevIosFocusRef.current = null;
    setShowIOSGuide(true);
  }, []);

  const closeIosGuide = useCallback(() => {
    setShowIOSGuide(false);
    const restore = prevIosFocusRef.current;
    prevIosFocusRef.current = null;
    requestAnimationFrame(() => {
      if (restore?.isConnected) restore.focus({ preventScroll: true });
    });
  }, []);

  // Check localStorage for dismissed state
  useEffect(() => {
    const dismissed = localStorage.getItem('pwa-install-dismissed');
    if (dismissed) {
      const dismissedAt = new Date(dismissed);
      const now = new Date();
      // Show again after 7 days
      if (now.getTime() - dismissedAt.getTime() < 7 * 24 * 60 * 60 * 1000) {
        setIsDismissed(true);
      }
    }
  }, []);

  useEffect(() => {
    const showAfterCookieChoice = () => {
      setIsDismissed(false);
    };
    window.addEventListener('qratex-cookie-consent-complete', showAfterCookieChoice);
    return () => window.removeEventListener('qratex-cookie-consent-complete', showAfterCookieChoice);
  }, []);

  useEffect(() => {
    if (!showIOSGuide) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeIosGuide();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [showIOSGuide, closeIosGuide]);

  useEffect(() => {
    if (!showIOSGuide) return;
    let id = 0;
    id = window.requestAnimationFrame(() => {
      iosGuideDialogRef.current?.querySelector<HTMLButtonElement>('button[data-pwa-dismiss]')?.focus();
    });
    return () => cancelAnimationFrame(id);
  }, [showIOSGuide]);

  useEffect(() => {
    if (!showIOSGuide) return;
    const node = iosGuideDialogRef.current;
    if (!node) return;
    const selector =
      'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';
    const onTab = (e: KeyboardEvent) => {
      if (e.key !== 'Tab') return;
      const list = [...node.querySelectorAll<HTMLElement>(selector)].filter((el) => el.tabIndex !== -1);
      if (list.length < 2) return;
      const first = list[0];
      const last = list[list.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    node.addEventListener('keydown', onTab);
    return () => node.removeEventListener('keydown', onTab);
  }, [showIOSGuide]);

  const handleDismiss = () => {
    setIsDismissed(true);
    localStorage.setItem('pwa-install-dismissed', new Date().toISOString());
  };

  const handleInstall = async () => {
    if (isIOS) {
      openIosGuide();
    } else {
      const installed = await promptInstall();
      if (installed) {
        setIsDismissed(true);
      }
    }
  };

  // Don't show if already installed or dismissed
  if (isInstalled || isStandalone || isDismissed) {
    return null;
  }

  // Don't show if not installable (and not iOS)
  if (!isInstallable && !isIOS) {
    return null;
  }

  return (
    <>
      {/* z-[40]: dashboard mobil menü (z-50) üstte kalır; cookie bandı z-[70] üzerine oturabilir */}
      <AnimatePresence>
        <Motion.div
          role="region"
          aria-labelledby="pwa-install-banner-title"
          initial={{ y: 100, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 100, opacity: 0 }}
          className={cn(
            'fixed bottom-[max(1rem,env(safe-area-inset-bottom))] left-[max(1rem,env(safe-area-inset-left))] right-[max(1.75rem,calc(env(safe-area-inset-right)+5.5rem))] px-4 pb-2 pt-2',
            floatingZTw.pwaInstall
          )}
        >
          <div className="max-w-lg mx-auto">
            <div className="bg-card/95 backdrop-blur-xl border border-border rounded-2xl shadow-2xl p-4">
              <div className="flex items-start gap-4">
                {/* App Icon */}
                <div
                  className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-primary to-primary/80 shadow-lg shadow-primary/25"
                  aria-hidden
                >
                  <span className="text-2xl font-bold text-white">Q</span>
                </div>

                {/* Content */}
                <div className="min-w-0 flex-1">
                  <h3 id="pwa-install-banner-title" className="mb-1 font-semibold">
                    {t('pwaInstall.title')}
                  </h3>
                  <p className="text-sm text-muted-foreground mb-3">
                    {t('pwaInstall.subtitle')}
                  </p>
                  <div className="flex items-center gap-2">
                    <Button
                      type="button"
                      onClick={handleInstall}
                      variant="gradient"
                      size="sm"
                      className="min-h-11 flex-1 touch-manipulation sm:min-h-9"
                    >
                      <Download className="mr-2 h-4 w-4 shrink-0" aria-hidden />
                      {t('pwaInstall.install')}
                    </Button>
                    <Button
                      type="button"
                      onClick={handleDismiss}
                      variant="ghost"
                      size="sm"
                      className="min-h-11 touch-manipulation sm:min-h-9"
                    >
                      {t('pwaInstall.later')}
                    </Button>
                  </div>
                </div>

                {/* Close */}
                <button
                  type="button"
                  data-pwa-dismiss
                  aria-label={t('pwaInstall.closeAria')}
                  onClick={handleDismiss}
                  className="-m-2 flex min-h-11 min-w-11 touch-manipulation items-center justify-center rounded-md text-muted-foreground transition-colors duration-200 hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                >
                  <X className="h-5 w-5 shrink-0" aria-hidden />
                </button>
              </div>
            </div>
          </div>
        </Motion.div>
      </AnimatePresence>

      {/* iOS Guide Modal */}
      <AnimatePresence>
        {showIOSGuide && (
          <Motion.div
            role="presentation"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] flex items-end justify-center bg-black/80 backdrop-blur-sm"
            onClick={closeIosGuide}
          >
            <Motion.div
              ref={iosGuideDialogRef}
              role="dialog"
              aria-modal="true"
              aria-labelledby="pwa-ios-install-title"
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              className="safe-bottom w-full max-w-lg rounded-t-3xl bg-card p-6"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="mb-6 flex items-center justify-between">
                <h3 id="pwa-ios-install-title" className="text-xl font-bold">
                  {t('pwaInstall.iosTitle')}
                </h3>
                <button
                  type="button"
                  data-pwa-dismiss
                  aria-label={t('pwaInstall.closeAria')}
                  onClick={closeIosGuide}
                  className="-m-2 flex min-h-11 min-w-11 touch-manipulation items-center justify-center rounded-md text-muted-foreground transition-colors duration-200 hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                >
                  <X className="h-6 w-6 shrink-0" aria-hidden />
                </button>
              </div>

              <div className="space-y-6">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-full bg-blue-500/10 flex items-center justify-center flex-shrink-0">
                    <span className="text-2xl">1</span>
                  </div>
                  <div>
                    <p className="font-medium">{t('pwaInstall.iosStep1Title')}</p>
                    <p className="flex items-center gap-1 text-sm text-muted-foreground flex-wrap">
                      {t('pwaInstall.iosStep1Before')}
                      <Share className="h-4 w-4 shrink-0" aria-hidden />
                      {t('pwaInstall.iosStep1After')}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-full bg-blue-500/10 flex items-center justify-center flex-shrink-0">
                    <span className="text-2xl">2</span>
                  </div>
                  <div>
                    <p className="font-medium">{t('pwaInstall.iosStep2Title')}</p>
                    <p className="flex items-center gap-1 text-sm text-muted-foreground flex-wrap">
                      {t('pwaInstall.iosStep2Before')}
                      <Plus className="h-4 w-4 shrink-0" aria-hidden />
                      {t('pwaInstall.iosStep2After')}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-full bg-blue-500/10 flex items-center justify-center flex-shrink-0">
                    <span className="text-2xl">3</span>
                  </div>
                  <div>
                    <p className="font-medium">{t('pwaInstall.iosStep3Title')}</p>
                    <p className="text-sm text-muted-foreground">
                      {t('pwaInstall.iosStep3Desc')}
                    </p>
                  </div>
                </div>
              </div>

              <Button
                type="button"
                data-pwa-dismiss
                onClick={closeIosGuide}
                variant="outline"
                className="mt-6 min-h-11 w-full touch-manipulation sm:min-h-9"
              >
                {t('pwaInstall.iosGotIt')}
              </Button>
            </Motion.div>
          </Motion.div>
        )}
      </AnimatePresence>
    </>
  );
}

export default InstallBanner;




