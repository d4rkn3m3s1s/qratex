import Link from 'next/link';
import { Compass, MapPinOff } from 'lucide-react';
import { EmptyState } from '@/components/states';
import { Button } from '@/components/ui/button';
import { getServerLocale } from '@/lib/server-locale';
import { getVenueCopy } from '@/components/customer/m-mekan-detay/copy';

export default async function VenueNotFound() {
  const copy = getVenueCopy(await getServerLocale());
  return (
    <EmptyState
      icon={MapPinOff}
      title={copy.notFoundTitle}
      description={copy.notFoundBody}
      headingLevel="h2"
      action={
        <Button asChild className="gap-2">
          <Link href="/customer/places">
            <Compass aria-hidden className="h-4 w-4" />
            {copy.goToPlaces}
          </Link>
        </Button>
      }
    />
  );
}
