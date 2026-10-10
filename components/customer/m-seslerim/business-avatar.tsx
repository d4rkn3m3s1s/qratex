'use client';

import { useState } from 'react';
import { cn } from '@/lib/utils';
import type { VoiceBusiness } from '@/lib/customer-voices/types';

/**
 * İşletme logosu ya da baş harfi. Dekoratiftir (`alt=""`): işletme adı her zaman yanında
 * metin olarak yazılır. Logo yüklenemezse baş harfe düşer.
 */
export function BusinessAvatar({ business, size = 'md' }: { business: VoiceBusiness; size?: 'sm' | 'md' }) {
  const [broken, setBroken] = useState(false);
  const box = size === 'sm' ? 'h-9 w-9 text-sm' : 'h-11 w-11 text-base';
  const initial = business.name.trim().charAt(0).toLocaleUpperCase('tr-TR') || '?';
  if (business.logo && !broken && /^(https:\/\/|\/)/.test(business.logo)) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- harici işletme logosu, alan adı listesi yok
      <img
        src={business.logo}
        alt=""
        loading="lazy"
        decoding="async"
        onError={() => setBroken(true)}
        className={cn(box, 'shrink-0 rounded-control border border-subtle bg-surface-1 object-cover')}
      />
    );
  }
  return (
    <span aria-hidden className={cn(box, 'grid shrink-0 place-items-center rounded-control bg-brand-subtle font-semibold text-brand')}>
      {initial}
    </span>
  );
}
