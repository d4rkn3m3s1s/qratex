'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import * as Sentry from '@sentry/nextjs';
import { Compass } from 'lucide-react';
import { ErrorState } from '@/components/states';
import { Button } from '@/components/ui/button';
import { useAppLocale } from '@/lib/app-locale';
import { getVenueCopy } from '@/components/customer/m-mekan-detay/copy';

export default function VenueDetailError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const { locale } = useAppLocale();
  const copy = getVenueCopy(locale);
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);
  return (
    <ErrorState
      variant="page"
      title={copy.errorTitle}
      description={copy.errorBody}
      digest={error.digest}
      onRetry={reset}
      headingLevel="h1"
      action={
        <Button asChild variant="outline" className="gap-2">
          <Link href="/customer/places">
            <Compass aria-hidden className="h-4 w-4" />
            {copy.goToPlaces}
          </Link>
        </Button>
      }
    />
  );
}
