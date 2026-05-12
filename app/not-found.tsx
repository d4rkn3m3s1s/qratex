import type { Metadata } from 'next';
import Link from 'next/link';
import { Home, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { SkipToMainContent } from '@/components/layout/skip-to-main';

export const metadata: Metadata = {
  title: 'Sayfa bulunamadı',
  robots: { index: false, follow: false },
};

export default function NotFound() {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center bg-gradient-to-b from-background to-muted/20 px-4">
      <SkipToMainContent targetId="not-found-main" label="İçeriğe atla" />
      <main
        id="not-found-main"
        tabIndex={-1}
        className="max-w-md space-y-6 text-center outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
      >
        <p className="text-8xl font-bold text-primary/20" aria-hidden>
          404
        </p>
        <h1 className="text-2xl font-semibold">Sayfa bulunamadı</h1>
        <p className="text-muted-foreground">
          Aradığınız sayfa mevcut değil veya taşınmış olabilir.
        </p>
        <div className="flex flex-col justify-center gap-3 sm:flex-row">
          <Button asChild>
            <Link href="/" className="gap-2">
              <Home className="h-4 w-4 shrink-0" aria-hidden />
              Ana Sayfa
            </Link>
          </Button>
          <Button asChild variant="outline">
            <Link href="/auth/login" className="gap-2">
              <Search className="h-4 w-4 shrink-0" aria-hidden />
              Giriş Yap
            </Link>
          </Button>
        </div>
      </main>
    </div>
  );
}
