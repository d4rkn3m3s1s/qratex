import type { Metadata } from 'next';
import Link from 'next/link';
import { WifiOff } from 'lucide-react';

export const metadata: Metadata = {
  title: 'Çevrimdışısınız — QRateX',
  robots: { index: false, follow: false },
};

/**
 * next-pwa `fallbacks.document` ile eşleştirilen çevrimdışı yedek sayfası.
 * Ağ yokken ve istenen sayfa cache'te değilken gösterilir. TAMAMEN statik
 * olmalı (veri çekmez) — çevrimdışı çalışması gerekir.
 */
export default function OfflinePage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 bg-background p-8 text-center">
      <div className="flex h-20 w-20 items-center justify-center rounded-full bg-muted">
        <WifiOff className="h-10 w-10 text-muted-foreground" aria-hidden />
      </div>
      <div className="space-y-2">
        <h1 className="text-2xl font-bold tracking-tight">İnternet bağlantısı yok</h1>
        <p className="max-w-md text-muted-foreground">
          Şu an çevrimdışısınız. Bağlantınız geri geldiğinde kaldığınız yerden devam
          edebilirsiniz. Daha önce açtığınız bazı sayfalar çevrimdışıyken de görüntülenebilir.
        </p>
      </div>
      {/* Ana sayfaya dön (bağlantı gelince cache'ten/ağdan yüklenir). */}
      <Link
        href="/"
        className="inline-flex h-11 items-center justify-center rounded-lg bg-primary px-6 font-semibold text-primary-foreground transition-opacity hover:opacity-90"
      >
        Yeniden dene
      </Link>
    </main>
  );
}
