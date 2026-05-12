'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ShieldCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { floatingZTw } from '@/lib/ui-z';
import { useAppT } from '@/lib/app-locale';

const CONSENT_KEY = 'qratex_cookie_consent_v1';
const CONSENT_EVENT = 'qratex-cookie-consent-complete';

export function CookieConsentBanner() {
  const t = useAppT();
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const consent = localStorage.getItem(CONSENT_KEY);
    setVisible(!consent);
  }, []);

  function acceptAll() {
    localStorage.setItem(CONSENT_KEY, JSON.stringify({ accepted: true, date: new Date().toISOString() }));
    // Cookie tercihi tamamlandiginda uygulama yukleme popup'i tekrar gorunsun.
    localStorage.removeItem('pwa-install-dismissed');
    window.dispatchEvent(new CustomEvent(CONSENT_EVENT));
    setVisible(false);
  }

  function rejectOptional() {
    localStorage.setItem(
      CONSENT_KEY,
      JSON.stringify({ accepted: true, optionalRejected: true, date: new Date().toISOString() })
    );
    localStorage.removeItem('pwa-install-dismissed');
    window.dispatchEvent(new CustomEvent(CONSENT_EVENT));
    setVisible(false);
  }

  if (!visible) return null;

  return (
    <div
      role="dialog"
      aria-modal="false"
      aria-labelledby="cookie-consent-title"
      aria-describedby="cookie-consent-desc"
      aria-live="polite"
      className={cn(
        'fixed bottom-[max(1rem,env(safe-area-inset-bottom))] left-[max(1rem,env(safe-area-inset-left))] right-[max(1.75rem,calc(env(safe-area-inset-right)+7rem))] mx-auto max-w-5xl rounded-xl border border-border bg-card/95 p-4 shadow-xl backdrop-blur-xl supports-[backdrop-filter]:bg-card/90',
        floatingZTw.cookieConsent
      )}
    >
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="flex items-start gap-3">
          <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-emerald-500" aria-hidden />
          <div className="space-y-1">
            <p id="cookie-consent-title" className="text-sm font-semibold">
              {t('cookieConsent.title')}
            </p>
            <p id="cookie-consent-desc" className="text-xs text-muted-foreground">
              {t('cookieConsent.intro')}{' '}
              {t('cookieConsent.beforeLinks')}{' '}
              <Link
                href="/cerez-politikasi"
                className="underline decoration-primary/40 underline-offset-2 transition-colors duration-200 hover:text-foreground hover:decoration-primary"
              >
                {t('cookieConsent.cookiePolicy')}
              </Link>{' '}
              {t('cookieConsent.betweenLinks')}{' '}
              <Link
                href="/gizlilik-politikasi"
                className="underline decoration-primary/40 underline-offset-2 transition-colors duration-200 hover:text-foreground hover:decoration-primary"
              >
                {t('cookieConsent.privacyPolicy')}
              </Link>{' '}
              {t('cookieConsent.afterLinks')}
            </p>
          </div>
        </div>
        <div className="flex gap-2 self-end md:self-auto">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="min-h-11 sm:min-h-9 touch-manipulation"
            onClick={rejectOptional}
          >
            {t('cookieConsent.rejectOptional')}
          </Button>
          <Button
            type="button"
            size="sm"
            className="min-h-11 sm:min-h-9 touch-manipulation"
            onClick={acceptAll}
          >
            {t('cookieConsent.acceptAll')}
          </Button>
        </div>
      </div>
    </div>
  );
}

