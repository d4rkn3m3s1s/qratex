'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { QrCode } from 'lucide-react';
import { useAppT } from '@/lib/app-locale';

/**
 * QR Tara — sağ üstte sabit (floating) kısayol butonu. Ana ekran kısayolu gibi her
 * müşteri sayfasından tek dokunuşla QR taramaya götürür. Tarama sayfasının kendisinde
 * gizlenir (zaten oradasınız). Menüden çıkarıldı; artık tek erişim noktası burası.
 */
export function QrScanFab() {
  const t = useAppT();
  const pathname = usePathname();
  if (pathname === '/customer/scan') return null;

  return (
    <Link
      href="/customer/scan"
      aria-label={t('sidebarNav.customer.scan')}
      className="group fixed right-4 top-[calc(var(--header-h,4rem)+0.75rem)] z-40 flex items-center gap-2 rounded-full bg-primary px-4 py-3 text-primary-foreground shadow-lg shadow-primary/30 outline-none ring-offset-background transition-all hover:scale-105 hover:shadow-xl focus-visible:ring-2 focus-visible:ring-ring active:scale-95 sm:right-6"
    >
      <QrCode className="h-5 w-5 shrink-0" />
      <span className="hidden text-sm font-semibold sm:inline">{t('sidebarNav.customer.scan')}</span>
    </Link>
  );
}
