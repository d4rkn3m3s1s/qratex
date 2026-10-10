import Link from 'next/link';
import { SearchX } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { getServerLocale } from '@/lib/server-locale';
import { getShareCopy } from '@/components/public/p-deneyim-anket/copy';
import { StatusPanel } from '@/components/public/p-deneyim-anket/status-panel';

/** Geçersiz/hiç var olmamış kart: 404 + çıkış yolu (keşfet / ana sayfa). */
export default async function ExperienceNotFound() {
  const copy = getShareCopy(await getServerLocale());
  return (
    <div className="mx-auto flex w-full max-w-lg flex-col items-center px-4 py-12 sm:py-16">
      <StatusPanel
        icon={SearchX}
        title={copy.expNotFoundTitle}
        description={copy.expNotFoundBody}
        actions={
          <>
            <Button asChild className="w-full">
              <Link href="/customer/places">{copy.explore}</Link>
            </Button>
            <Button asChild variant="ghost" className="w-full">
              <Link href="/">{copy.goHome}</Link>
            </Button>
          </>
        }
      />
    </div>
  );
}
