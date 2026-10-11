'use client';

import { useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import { usePathname } from 'next/navigation';
import { useBareChrome } from '@/lib/pwa/bare-chrome';

/** Root layout: ağır framer-motion + ikon yükünü ilk JS’ten ayırır. */
const ChatbotDynamic = dynamic(() => import('./chatbot').then((m) => m.Chatbot), {
  ssr: false,
  loading: () => null,
});

/**
 * Tek görevli huni rotalarında asistan yüklenmez: QR geri bildirim akışının (`/feedback/…`)
 * ve anket akışının (`/surveys/…`) yapışkan İleri/Gönder çubuğunu örtmesin, paylaşım kartı
 * (`/experience/…`) tek ekranlık kalsın ve huninin JS bütçesine (≤ 150 KB gzip) girmesin.
 */
const HIDDEN_PREFIXES = ['/feedback/', '/surveys/', '/experience/', '/wall/'];

/**
 * Asistan balonu sayfanın ana işi değil (perf D2): parçası hidrasyonun hemen ardından değil,
 * tarayıcı boşa düştüğünde (en geç 4 sn) indirilir; ilk etkileşim ve LCP ile yarışmaz.
 */
function useIdleReady(timeoutMs = 4000): boolean {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    const w = window as Window & {
      requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number;
      cancelIdleCallback?: (id: number) => void;
    };
    if (typeof w.requestIdleCallback === 'function') {
      const id = w.requestIdleCallback(() => setReady(true), { timeout: timeoutMs });
      return () => w.cancelIdleCallback?.(id);
    }
    const t = window.setTimeout(() => setReady(true), 1500);
    return () => window.clearTimeout(t);
  }, [timeoutMs]);
  return ready;
}

export function ChatbotLazy() {
  const pathname = usePathname();
  // Çevrimdışı yedek sayfası ve masa sinyali (QR/kiosk) gibi "çıplak" yüzeylerde yüklenmez
  // (lib/pwa/bare-chrome). Bilinene kadar (ilk render) çizilmez → gereksiz chunk isteği yok.
  const bare = useBareChrome();
  const idle = useIdleReady();
  if (pathname && HIDDEN_PREFIXES.some((p) => pathname.startsWith(p))) return null;
  if (bare !== false || !idle) return null;
  return <ChatbotDynamic />;
}
