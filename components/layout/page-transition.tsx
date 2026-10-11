import type { ReactNode } from 'react';

interface PageTransitionProps {
  children: ReactNode;
}

/**
 * Qratex sayfa kabı.
 *
 * Not: Buradaki eski sayfa-geçiş animasyonu (framer-motion → styled-jsx → key'li CSS)
 * her seferinde HYDRATION uyuşmazlığı çıkardı; bileşen bu yüzden SERVER component
 * (client hook YOK, animasyon YOK) ve sunucu/istemci birebir aynı sabit bir sarmalayıcı üretir.
 *
 * Burada bilerek <Suspense> YOK (perf-bundle kapısı, LCP kök nedeni): React 19.2 akışında
 * her bekleyen Suspense sınırı ayrı "reveal" ile açılır ve ardışık açılışlar en az 300 ms
 * aralıkla kısıtlanır ($RT+300). Kök sarmalayıcıda bir sınır + segment `loading.tsx` sınırı
 * iç içe olunca sayfa içeriği (LCP öğesi) ilk HTML'de hazır olduğu hâlde ikinci açılışa
 * kalıp tüm JS indikten sonra boyanıyordu (/ gözlenen LCP 660 ms, Lighthouse 6.9 sn).
 * Artık async layout'lar kabuğu bekletir; tek akış sınırı rotanın kendi `loading.tsx`'idir.
 */
export const PageTransition = ({ children }: PageTransitionProps) => {
  return <div className="w-full h-full min-h-dvh">{children}</div>;
};
