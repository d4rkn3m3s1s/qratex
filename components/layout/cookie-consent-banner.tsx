'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { AnimatePresence, m as Motion } from 'framer-motion';
import { ShieldCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { floatingZTw } from '@/lib/ui-z';
import { useAppLocale } from '@/lib/app-locale';
import { fadeUp } from '@/lib/motion/variants';
import { useConsent } from '@/lib/consent/client';
import { ConsentCenter, openConsentCenter } from '@/components/analytics/consent-center';
import { getConsentCopy } from '@/components/analytics/consent-copy';
import { adoptAccountConsent, applyConsentDecision } from '@/components/analytics/consent-record';

/**
 * Çerez/izleme rıza bildirimi + tercih merkezi (P0-31).
 *
 * Eskiden "Opsiyonelleri Reddet" `localStorage`'a yazılıyor ama hiçbir yerde okunmuyordu;
 * analitik ve oturum kaydı rızasız çalışıyordu ve tercih bir daha değiştirilemiyordu. Şimdi:
 *  - Karar `lib/consent` çerezine (sürümlü, 180 gün) yazılır; PostHog yalnız bu karara göre
 *    başlar/durur. Eski kayıt otomatik taşınır.
 *  - "Tümünü reddet" ile "Tümünü kabul et" eşit ağırlıkta; kategori seçimi tercih merkezinde.
 *  - Tercih merkezi footer, Ayarlar › Gizlilik ve Çerez Politikası'ndan yeniden açılır.
 *  - Her karar sunucuya kanıt olarak yazılır (`ConsentRecord`); oturum açmış kullanıcının
 *    hesabındaki güncel kararı yeni cihazda yeniden sorulmadan uygulanır.
 *  - Kök layout'ta: panele doğrudan giren kullanıcı da görür.
 */
export function CookieConsentBanner() {
  const { locale } = useAppLocale();
  const copy = getConsentCopy(locale);
  const consent = useConsent();
  // Hesaptaki karar denenene kadar banner'ı gösterme (yanıp sönmesin).
  const [syncChecked, setSyncChecked] = useState(false);

  useEffect(() => {
    if (!consent.ready || consent.decided || syncChecked) return;
    const ctrl = new AbortController();
    const timer = window.setTimeout(() => ctrl.abort(), 2500);
    void adoptAccountConsent(ctrl.signal).finally(() => {
      window.clearTimeout(timer);
      setSyncChecked(true);
    });
    return () => {
      window.clearTimeout(timer);
      ctrl.abort();
    };
  }, [consent.ready, consent.decided, syncChecked]);

  // Müşteri sesi duvarı (/wall/[token]) TV/kiosk ekranında açılır: dokunan kimse yok, banner
  // istatistik ve QR'ı kalıcı örter. Rıza verilmediği için analitik zaten kapalı kalır.
  const pathname = usePathname();
  const kiosk = pathname?.startsWith('/wall/') ?? false;
  const visible = !kiosk && consent.ready && !consent.decided && syncChecked;

  return (
    <>
      <ConsentCenter />
      <AnimatePresence>
        {visible ? (
          <Motion.section
            key="consent-banner"
            variants={fadeUp}
            initial="hidden"
            animate="visible"
            exit="exit"
            role="region"
            aria-labelledby="cookie-consent-title"
            aria-describedby="cookie-consent-desc"
            className={cn(
              'pointer-events-auto fixed bottom-[max(1rem,env(safe-area-inset-bottom))] left-[max(1rem,env(safe-area-inset-left))] right-[max(1rem,env(safe-area-inset-right))] mx-auto max-w-4xl rounded-2xl border border-border bg-card/95 p-4 shadow-xl backdrop-blur-xl supports-[backdrop-filter]:bg-card/90 sm:p-5',
              floatingZTw.cookieConsent
            )}
          >
            <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
              <div className="flex items-start gap-3">
                <span className="mt-0.5 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-brand-subtle text-brand ring-1 ring-inset ring-brand-border">
                  <ShieldCheck className="h-5 w-5" aria-hidden />
                </span>
                <div className="min-w-0 space-y-1">
                  <h2 id="cookie-consent-title" className="text-sm font-semibold text-fg">
                    {copy.bannerTitle}
                  </h2>
                  <p id="cookie-consent-desc" className="text-sm leading-relaxed text-fg-muted">
                    {copy.bannerBody}{' '}
                    <Link
                      href="/cerez-politikasi"
                      className="font-medium text-fg underline decoration-brand/40 underline-offset-2 transition-colors hover:decoration-brand"
                    >
                      {copy.policyLink}
                    </Link>
                  </p>
                </div>
              </div>
              <div className="grid shrink-0 grid-cols-2 gap-2 sm:flex sm:items-center">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="col-span-2 min-h-11 touch-manipulation sm:col-span-1 sm:min-h-9"
                  onClick={() => openConsentCenter('banner')}
                >
                  {copy.manage}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="min-h-11 touch-manipulation sm:min-h-9"
                  onClick={() => applyConsentDecision({ analytics: false, replay: false }, 'banner')}
                >
                  {copy.rejectAll}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="min-h-11 touch-manipulation sm:min-h-9"
                  onClick={() => applyConsentDecision({ analytics: true, replay: true }, 'banner')}
                >
                  {copy.acceptAll}
                </Button>
              </div>
            </div>
          </Motion.section>
        ) : null}
      </AnimatePresence>
    </>
  );
}
