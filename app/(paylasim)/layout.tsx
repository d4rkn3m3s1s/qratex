import Image from 'next/image';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { SkipLink } from '@/components/ds/a11y';
import { getServerLocale } from '@/lib/server-locale';
import { getShareCopy } from '@/components/public/p-deneyim-anket/copy';
import { ServerLocaleBoundary } from '@/lib/server-locale-boundary';

/**
 * Paylaşım bağlantılarının hafif kabuğu (`/experience/[token]`, `/surveys/[id]`).
 *
 * Denetim (experience_token B11, surveys_id B8): pazarlama header'ı, hareketli landing
 * zemini ve `/api/settings/background` isteği YOK — bağlantı WhatsApp/QR'dan mobil veride
 * açılır; tek ekranlık içerik hızlı gelmeli. Yalnız logo (ana sayfaya dönüş), içerik ve
 * küçük bir alt bilgi (gizlilik/KVKK). URL'ler değişmez (rota grubu).
 */
export default async function ShareLayout({ children }: { children: ReactNode }) {
  const copy = getShareCopy(await getServerLocale());
  return (
    <ServerLocaleBoundary>
    <div className="flex min-h-dvh flex-col bg-background text-fg">
      <SkipLink targetId="main-content" />
      <header className="safe-top border-b border-subtle bg-surface-0">
        <div className="mx-auto flex h-14 w-full max-w-3xl items-center px-4">
          <Link
            href="/"
            aria-label={copy.homeAria}
            className="-ml-2 inline-flex min-h-11 items-center gap-2 rounded-control px-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
          >
            <Image src="/logo/logo-light.png" alt="" width={32} height={32} className="h-8 w-8 object-contain dark:hidden" priority />
            <Image src="/logo/logo.png" alt="" width={32} height={32} className="hidden h-8 w-8 object-contain dark:block" priority />
            <span className="qx-body font-semibold tracking-tight">Qratex</span>
          </Link>
        </div>
      </header>

      <main id="main-content" tabIndex={-1} className="flex-1 outline-none">
        {children}
      </main>

      <footer className="safe-bottom border-t border-subtle">
        <div className="qx-caption mx-auto flex w-full max-w-3xl flex-wrap items-center justify-between gap-x-4 gap-y-1 px-4 py-4 text-fg-muted">
          <span>{copy.poweredBy}</span>
          <nav aria-label={copy.privacy} className="flex gap-1">
            <Link href="/gizlilik-politikasi" className="inline-flex min-h-11 items-center rounded-control px-2 underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus">
              {copy.privacy}
            </Link>
            <Link href="/kvkk-aydinlatma-metni" className="inline-flex min-h-11 items-center rounded-control px-2 underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus">
              {copy.kvkk}
            </Link>
          </nav>
        </div>
      </footer>
    </div>
    </ServerLocaleBoundary>
  );
}
