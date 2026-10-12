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
import { useFirstRunBusy } from '@/lib/first-run-queue';
import { ConsentCenterLazy, openConsentCenter } from '@/components/analytics/consent-center-lazy';
import { getConsentCopy } from '@/components/analytics/consent-copy';
import { adoptAccountConsent, applyConsentDecision } from '@/components/analytics/consent-record';
import { CONSENT_PREPAINT_CLASS, CONSENT_PREPAINT_SNIPPET } from '@/lib/consent/types';

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
  // Hesaptaki karar (yeni cihazda oturum açık kullanıcı) bulunursa banner kapanır.
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
  // LCP (kalite kapısı): banner eskiden hidrasyon + hesap senkronundan SONRA beliriyordu; metin
  // ağırlıklı sayfalarda (blog, yasal) en büyük boyama o olduğundan LCP tüm JS'in yüklenmesini
  // bekliyordu (~7 sn mobil). Artık ilk HTML'de basılır; karar verilmiş/kiosk ziyaretçide
  // `CONSENT_PREPAINT_SNIPPET` ilk boyamadan önce <html>'e sınıf ekler ve CSS gizler (yanıp
  // sönme yok). Hidrasyondan sonra karar React'tedir: ön-kontrol yanıldıysa sınıf kaldırılır.
  // İlk açılış sırası: karşılama videosu / tanıtım / doğum günü açıkken band geri çekilir,
  // akış bitince kendi sırası gelir (üç katman üst üste açılmasın). Karar hâlâ zorunlu.
  const firstRunBusy = useFirstRunBusy();
  const visible = !firstRunBusy && (!consent.ready || (!kiosk && !consent.decided));

  useEffect(() => {
    if (!consent.ready || consent.decided || kiosk) return;
    document.documentElement.classList.remove(CONSENT_PREPAINT_CLASS);
  }, [consent.ready, consent.decided, kiosk]);

  return (
    <>
      {/* Ön-kontrol banner'dan ÖNCE, gövdede satır içi: ayrıştırılınca hemen çalışır (Next'in
          beforeInteractive kuyruğu çalışma zamanını beklediği için ilk boyamaya yetişmez). */}
      <script suppressHydrationWarning dangerouslySetInnerHTML={{ __html: CONSENT_PREPAINT_SNIPPET }} />
      <ConsentCenterLazy />
      {/* initial={false}: ilk HTML'deki banner giriş animasyonuyla opaklık 0'dan başlamasın. */}
      <AnimatePresence initial={false}>
        {visible ? (
          <Motion.section
            key="consent-banner"
            data-consent-banner=""
            variants={fadeUp}
            initial="hidden"
            animate="visible"
            exit="exit"
            role="region"
            aria-labelledby="cookie-consent-title"
            aria-describedby="cookie-consent-desc"
            className={cn(
              // CLS kalite kapısı (0.135, tüm rotalarda aynı): banner gövdenin SONUNDA akışla gelir;
              // HTML parça parça ayrıştırılırken yarım banner alta sabitli boyanıyor, kalanı gelince
              // yukarı doğru büyüyüp üst kenarı ~270 px kayıyordu. Son çocuk işaretçisi ayrıştırılana
              // kadar gizli: belirme kayma sayılmaz. (:has desteklemeyen tarayıcı eskisi gibi gösterir.)
              '[&:not(:has(>[data-consent-end]))]:hidden',
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
                      prefetch={false}
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
            <span data-consent-end="" hidden />
          </Motion.section>
        ) : null}
      </AnimatePresence>
    </>
  );
}
