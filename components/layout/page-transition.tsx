'use client';

import { usePathname } from 'next/navigation';

interface PageTransitionProps {
  children: React.ReactNode;
}

/**
 * Qratex 2.0 Sayfa Geçiş Motoru
 * Sayfalar arası geçişte saf CSS opacity fade efekti sağlar.
 *
 * Neden framer-motion DEĞİL: `motion.div` SSR'da inline `style` (opacity) enjekte edip
 * hydration uyuşmazlığı çıkarıyordu. Saf CSS animasyonu SSR ile birebir aynı DOM üretir.
 *
 * Neden `transform`/`filter` YOK: bunlar CSS gereği `position: fixed` alt elemanlar için
 * yeni bir "containing block" oluşturup fixed arka planları (<LandingBackground/>) viewport
 * yerine bu sarmalayıcıya hapsederdi. Yalnızca `opacity` kullanılır.
 *
 * `key={pathname}`: rota değişince element yeniden mount olur → CSS animasyonu tekrar oynar.
 */
export const PageTransition = ({ children }: PageTransitionProps) => {
  const pathname = usePathname();

  // Animasyon globals.css'te (.qx-page-fade). styled-jsx SSR'da farklı hash üretip
  // hydration uyuşmazlığı çıkardığı için burada inline <style jsx> KULLANMIYORUZ.
  return (
    <div key={pathname} className="qx-page-fade w-full h-full min-h-screen">
      {children}
    </div>
  );
};
