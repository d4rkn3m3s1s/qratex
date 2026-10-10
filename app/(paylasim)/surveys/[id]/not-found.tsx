import Link from 'next/link';
import { SearchX } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { getServerLocale } from '@/lib/server-locale';
import { getShareCopy } from '@/components/public/p-deneyim-anket/copy';
import { StatusPanel } from '@/components/public/p-deneyim-anket/status-panel';

/** Var olmayan anket bağlantısı: 404 + çıkış yolu. */
export default async function SurveyNotFound() {
  const copy = getShareCopy(await getServerLocale());
  return (
    <div className="mx-auto flex w-full max-w-lg flex-col items-center px-4 py-12 sm:py-16">
      <StatusPanel
        icon={SearchX}
        title={copy.svNotFoundTitle}
        description={copy.svNotFoundBody}
        actions={
          <Button asChild variant="outline" className="w-full">
            <Link href="/">{copy.goHome}</Link>
          </Button>
        }
      />
    </div>
  );
}
