'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Rocket, ArrowRight, CheckCircle2 } from 'lucide-react';
import { cn } from '@/lib/utils';

type OnboardingStep = { key: string; done: boolean; href: string; required: boolean };
type OnboardingState = { steps: OnboardingStep[]; completedCount: number; total: number; complete: boolean };

/**
 * Bayi onboarding "yumuşak gating": kurulum (zorunlu adımlar) tamamlanana kadar tüm
 * bayi sayfalarının üstünde kalıcı bir uyarı şeridi gösterir ve kullanıcıyı kuruluma
 * yönlendirir. Sayfalara erişimi TAMAMEN engellemez — kullanıcı ayarlar/QR gibi kurulum
 * adımlarına gidebilmelidir. Kurulum bitince şerit kaybolur (diğer her şey "açılmış" olur).
 */
export function OnboardingGateBanner() {
  const pathname = usePathname();
  const [state, setState] = useState<OnboardingState | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/dealer/onboarding', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((data: OnboardingState | null) => {
        if (!cancelled && data && Array.isArray(data.steps)) setState(data);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
    // pathname değişince yeniden kontrol et (adım tamamlanmış olabilir).
  }, [pathname]);

  // Kurulum sayfasındayken veya tamamlanmışsa şerit gösterme.
  if (!state || state.complete || pathname === '/dealer/onboarding') return null;

  const nextStep = state.steps.find((s) => s.required && !s.done);
  const requiredTotal = state.steps.filter((s) => s.required).length;
  const requiredDone = state.steps.filter((s) => s.required && s.done).length;

  return (
    <div className="sticky top-0 z-30 -mx-3 mb-3 sm:-mx-4 lg:-mx-6">
      <div className="border-b border-amber-500/30 bg-amber-500/10 px-4 py-2.5 backdrop-blur-sm">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2 text-sm">
            <Rocket className="h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
            <span className="font-medium text-amber-800 dark:text-amber-200">
              Kurulumu tamamlayın
            </span>
            <span className="hidden text-amber-700/80 dark:text-amber-300/80 sm:inline">
              — {requiredDone}/{requiredTotal} zorunlu adım tamam. Kurulum bitene kadar panel sınırlıdır.
            </span>
          </div>
          <Link
            href={nextStep?.href ?? '/dealer/onboarding'}
            className={cn(
              'inline-flex items-center gap-1.5 rounded-lg bg-amber-500 px-3 py-1.5 text-xs font-semibold text-white',
              'transition-colors hover:bg-amber-600'
            )}
          >
            {requiredDone === requiredTotal ? (
              <>
                <CheckCircle2 className="h-3.5 w-3.5" /> Kurulumu bitir
              </>
            ) : (
              <>
                Kuruluma git <ArrowRight className="h-3.5 w-3.5" />
              </>
            )}
          </Link>
        </div>
      </div>
    </div>
  );
}
