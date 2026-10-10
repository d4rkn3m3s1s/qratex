'use client';

import Link from 'next/link';
import type { ComponentProps, ReactNode } from 'react';
import { track } from '@/lib/analytics';

/**
 * Ölçülebilir dönüşüm bağlantısı (neden-qratex.md envanter #17): tıklamada rızaya bağlı
 * `public_cta_click` olayı gönderir (analitik onayı yoksa hiçbir şey göndermez).
 * Kaynak bilgisi ayrıca hedef URL'deki `src` parametresiyle kayda taşınır.
 */
export function CtaLink({
  href,
  cta,
  page,
  children,
  ...rest
}: Omit<ComponentProps<typeof Link>, 'href' | 'onClick'> & {
  href: string;
  /** Olay etiketi: `hero_primary`, `pricing_plan` … */
  cta: string;
  /** Kaynak sayfa: `landing`, `neden_qratex`, `guven`. */
  page: string;
  children: ReactNode;
}) {
  return (
    <Link href={href} onClick={() => track('public_cta_click', { cta, page, href })} {...rest}>
      {children}
    </Link>
  );
}
