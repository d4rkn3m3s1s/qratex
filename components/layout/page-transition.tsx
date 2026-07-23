import { Suspense, type ReactNode } from 'react';

interface PageTransitionProps {
  children: ReactNode;
}

/**
 * Qratex sayfa kabı.
 *
 * Not: Buradaki eski sayfa-geçiş animasyonu (framer-motion → styled-jsx → key'li CSS)
 * her seferinde HYDRATION uyuşmazlığı çıkardı:
 *  - `motion.div` SSR'da inline style enjekte ediyordu,
 *  - `<style jsx>` SSR'da farklı hash üretiyordu,
 *  - `usePathname()` + `key={pathname}` sunucuda <Suspense>, istemcide <div> farkı yaratıyordu.
 * Bu yüzden bileşen artık SERVER component (client hook YOK, animasyon YOK) ve DOM'a
 * sunucu/istemci birebir aynı sabit bir sarmalayıcı üretir.
 *
 * Ek olarak: route segment'lerinin `loading.tsx`'i (Next otomatik <Suspense> sınırı)
 * streaming sırasında sunucuda <Suspense>, istemcide <div> farkı yaratıp "recoverable"
 * hidrasyon uyarısı çıkarıyordu. Çocukları AÇIKÇA bir <Suspense> ile sarmalayınca
 * sunucu ve istemci aynı ağaç yapısını görür → uyarı biter.
 */
export const PageTransition = ({ children }: PageTransitionProps) => {
  return (
    <div className="w-full h-full min-h-screen">
      <Suspense fallback={null}>{children}</Suspense>
    </div>
  );
};
