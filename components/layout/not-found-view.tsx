'use client';

import Link from 'next/link';
import { Home, LogIn } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { SkipToMainContent } from '@/components/layout/skip-to-main';
import { useLocaleSafe } from '@/lib/app-locale';
import { uiCopy } from '@/lib/i18n/ui-copy';

/**
 * 404 gövdesi. Kök 404 statik üretilir (eşleşmeyen her URL'de aynı HTML), bu yüzden dil sunucuda
 * değil sağlayıcıdan gelir: EN kullanıcı Türkçe 404'te kalmaz (mobil-erisilebilirlik-i18n B1).
 */
export function NotFoundView() {
  const copy = uiCopy(useLocaleSafe());
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center bg-surface-0 px-4 text-fg">
      <SkipToMainContent targetId="not-found-main" variant="content" />
      <main
        id="not-found-main"
        tabIndex={-1}
        className="w-full max-w-md text-left outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
      >
        <p className="qx-caption font-mono tabular-nums tracking-wide text-fg-muted" aria-hidden>
          404
        </p>
        <h1 className="qx-h1 mt-2 text-balance">{copy.notFoundTitle}</h1>
        <p className="qx-body mt-3 text-fg-muted text-pretty">{copy.notFoundBody}</p>
        <div className="mt-8 flex flex-col gap-3 border-t border-border pt-6 sm:flex-row">
          <Button asChild>
            <Link href="/" className="gap-2">
              <Home className="h-4 w-4 shrink-0" aria-hidden />
              {copy.goHome}
            </Link>
          </Button>
          <Button asChild variant="outline">
            <Link href="/auth/login" className="gap-2">
              <LogIn className="h-4 w-4 shrink-0" aria-hidden />
              {copy.signIn}
            </Link>
          </Button>
        </div>
      </main>
    </div>
  );
}
