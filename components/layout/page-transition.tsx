'use client';

import { motion, AnimatePresence } from 'framer-motion';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';

interface PageTransitionProps {
  children: React.ReactNode;
}

/**
 * Qratex 2.0 Sayfa Geçiş Motoru
 * Sayfalar arası geçişte Apple tarzı yumuşak bir fade/blur efekti sağlar.
 * Hydration hatalarını önlemek için mounting kontrolü eklenmiştir.
 */
export const PageTransition = ({ children }: PageTransitionProps) => {
  const pathname = usePathname();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Server-side veya hydration sırasında düz render yapıyoruz
  if (!mounted) {
    return <div className="w-full h-full min-h-screen">{children}</div>;
  }

  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={pathname}
        initial={{ opacity: 0, y: 10, filter: 'blur(10px)' }}
        animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
        exit={{ opacity: 0, y: -10, filter: 'blur(10px)' }}
        transition={{
          duration: 0.4,
          ease: [0.22, 1, 0.36, 1], // Custom cubic-bezier for premium feel
        }}
        className="w-full h-full min-h-screen"
      >
        {children}
      </motion.div>
    </AnimatePresence>
  );
};
