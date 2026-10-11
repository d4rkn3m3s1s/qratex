import { Header } from '@/components/layout/header';
import { Footer } from '@/components/layout/footer';
import { SkipToMainContent } from '@/components/layout/skip-to-main';
import { PublicBackdrop } from '@/components/public/p-landing/public-backdrop';
import { getBackgroundEffect } from '@/lib/get-background-effect';
import { ServerLocaleBoundary } from '@/lib/server-locale-boundary';

export default async function PublicLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Bu grup yalnız sunucuda çevrilen pazarlama sayfalarını (/, /neden-qratex, /guven) taşır;
  // sayfalar zaten dil çerezini okuduğundan layout'taki dil sınırı ek dinamiklik getirmez.
  const backgroundEffect = await getBackgroundEffect();
  return (
    <ServerLocaleBoundary>
    <div className="relative flex min-h-dvh flex-col">
      {/* Tüm public sayfayı kaplayan tek zemin (fixed z-0; içerik z-[1] ile üstünde).
          Varsayılan statik gradyan; admin'in sezonluk zemini ayrı parça olarak ve yalnız
          hareket serbestken yüklenir. Değer sunucudan gelir (istemci isteği yok). */}
      <PublicBackdrop effect={backgroundEffect} />
      <SkipToMainContent targetId="main-content" variant="content" />
      <div className="relative z-[1] flex min-h-dvh flex-col">
        <Header />
        <main
          id="main-content"
          className="flex-1 outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          tabIndex={-1}
        >
          {children}
        </main>
        <Footer />
      </div>
      {/* Çerez bildirimi kök layout'ta (P0-31) — burada tekrar render edilmez. */}
    </div>
    </ServerLocaleBoundary>
  );
}

