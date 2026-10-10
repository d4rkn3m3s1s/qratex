import type { Metadata } from 'next';
import {
  buildOfflineMarkup,
  buildOfflineScript,
} from '@/components/customer/p-kart-masa-offline/offline/offline-document';

/** Marka kök şablondan gelir (`%s | QRateX`); burada tekrar yazılmaz (rapor bulgu 7). */
export const metadata: Metadata = {
  title: 'Çevrimdışısınız',
  robots: { index: false, follow: false },
};

/** Build anında statik üretilir ve SW ön belleğine girer (next-pwa `fallbacks.document`). */
export const dynamic = 'force-static';

/**
 * next-pwa `fallbacks.document` yedek sayfası: ağ yokken ve istenen sayfa önbellekte değilken SW
 * bunu ASIL istek adresinde sunar (rapor: docs/audit/2026-10-08/musteri/offline.md).
 *
 * Tamamen statik; veri çekmez. Davranış (yeniden deneme, otomatik toparlanma, son kart, önbellekteki
 * sayfalar, bekleyen masa sinyalleri) HTML'e gömülü betikle çalışır — rota chunk'ı ön bellekte
 * olmasa da (config/pwa.js yalnız kabuğu ön belleğe alır) sayfa tam işlevlidir. Ayrıntı:
 * components/customer/p-kart-masa-offline/offline/offline-document.ts
 *
 * Güvenlik: işaretleme ve betik YALNIZ sunucudaki sabit metin/sabitlerden üretilir; kullanıcı
 * verisi (kart sahibi adı vb.) betikte `textContent` ile yazılır, HTML olarak asla.
 */
export default function OfflinePage() {
  return (
    <>
      <div dangerouslySetInnerHTML={{ __html: buildOfflineMarkup() }} />
      <script dangerouslySetInnerHTML={{ __html: buildOfflineScript() }} />
    </>
  );
}
