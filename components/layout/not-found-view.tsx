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
    <div className="flex min-h-dvh flex-col items-center justify-center bg-gradient-to-b from-background to-muted/20 px-4">
      <SkipToMainContent targetId="not-found-main" variant="content" />
      <main
        id="not-found-main"
        tabIndex={-1}
        className="max-w-md space-y-6 text-center outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
      >
        <p className="text-8xl font-bold text-primary/20" aria-hidden>
          404
        </p>
        <h1 className="text-2xl font-semibold">{copy.notFoundTitle}</h1>
        <p className="text-muted-foreground">{copy.notFoundBody}</p>
        <div className="flex flex-col justify-center gap-3 sm:flex-row">
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
