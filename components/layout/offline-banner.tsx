'use client';

import { useEffect, useState } from 'react';
import { WifiOff } from 'lucide-react';
import { usePWA } from '@/hooks/use-pwa';

/**
 * Çevrimdışı olunduğunda ekranın altında sabit bir uyarı şeridi gösterir.
 * usePWA().isOnline (online/offline event'lerine bağlı) ile sürülür. Önceden
 * isOnline izleniyordu ama kullanıcıya hiç gösterilmiyordu. role=status +
 * aria-live ile ekran okuyucuya da duyurulur.
 */
export function OfflineBanner() {
  const { isOnline } = usePWA();
  // Hidrasyon uyumsuzluğunu önlemek için yalnızca mount sonrası göster.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  if (!mounted || isOnline) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed inset-x-0 bottom-0 z-[100] flex items-center justify-center gap-2 bg-amber-500 px-4 py-2 text-sm font-medium text-amber-950 shadow-lg"
      style={{ paddingBottom: 'calc(0.5rem + env(safe-area-inset-bottom))' }}
    >
      <WifiOff className="h-4 w-4 shrink-0" aria-hidden />
      <span>Çevrimdışısınız — bazı özellikler bağlantı gelene kadar çalışmayabilir.</span>
    </div>
  );
}
