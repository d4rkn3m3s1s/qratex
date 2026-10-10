'use client';

import Link from 'next/link';
import type { ReactNode } from 'react';
import { track } from '@/lib/analytics';

/**
 * Tıklaması dönüşüm olayı olarak ölçülen bağlantı. `track` rızaya bağlıdır: analitik onayı
 * yoksa hiçbir şey göndermez (lib/analytics).
 */
export function TrackedLink({
  href,
  event,
  props,
  className,
  children,
}: {
  href: string;
  event: string;
  props?: Record<string, unknown>;
  className?: string;
  children: ReactNode;
}) {
  return (
    <Link href={href} className={className} onClick={() => track(event, props)}>
      {children}
    </Link>
  );
}
