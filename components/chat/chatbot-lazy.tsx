'use client';

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

export function ChatbotLazy() {
  const pathname = usePathname();
  // Çevrimdışı yedek sayfası ve masa sinyali (QR/kiosk) gibi "çıplak" yüzeylerde yüklenmez
  // (lib/pwa/bare-chrome). Bilinene kadar (ilk render) çizilmez → gereksiz chunk isteği yok.
  const bare = useBareChrome();
  if (pathname && HIDDEN_PREFIXES.some((p) => pathname.startsWith(p))) return null;
  if (bare !== false) return null;
  return <ChatbotDynamic />;
}
