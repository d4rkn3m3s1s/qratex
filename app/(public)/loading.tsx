'use client';

import { useEffect, useState } from 'react';
import { LazyMotion, domAnimation, m } from 'framer-motion';

export default function PublicLoading() {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  return (
    <div
      className="fixed inset-0 z-[100] flex min-h-dvh flex-col items-center justify-center overflow-hidden bg-background"
      role="status"
      aria-busy="true"
      aria-live="polite"
      aria-label="Sayfa yükleniyor"
    >
      {/* Arka plan */}
      <div
        className="absolute inset-0 bg-gradient-to-br from-primary/8 via-background to-primary/8"
        aria-hidden
      />
      <div
        className="absolute inset-0 bg-gradient-to-b from-transparent via-background/20 to-background"
        aria-hidden
      />

      <LazyMotion features={domAnimation} strict>
        <div className="container relative z-10 flex flex-col items-center justify-center px-4">
          <m.div
            className="flex flex-col items-center"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.35, ease: 'easeOut' }}
          >
            {/* Marka */}
            <div className="relative mb-8" aria-hidden>
              <div className="absolute -inset-4 rounded-3xl bg-primary/15 blur-2xl" />
              <div className="relative">
                <span className="bg-gradient-to-r from-primary via-primary/75 to-primary bg-clip-text text-3xl font-bold tracking-tight text-transparent sm:text-4xl">
                  Qratex
                </span>
              </div>
            </div>

            {/* Progress bar */}
            <div
              className="h-1 w-48 overflow-hidden rounded-full bg-muted/80 shadow-inner sm:w-56"
              aria-hidden
            >
              <m.div
                className="h-full rounded-full bg-gradient-to-r from-primary via-primary/70 to-primary"
                initial={{ x: '-100%' }}
                animate={{ x: '200%' }}
                transition={{
                  duration: 1.5,
                  repeat: Infinity,
                  ease: 'easeInOut',
                }}
                style={{ width: '45%' }}
              />
            </div>

            {/* Yükleniyor */}
            <m.p
              className="mt-6 text-sm font-medium text-muted-foreground flex items-center gap-1"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.25 }}
            >
              Yükleniyor
              {mounted && (
                <span className="inline-flex gap-0.5" aria-hidden>
                  {[0, 1, 2].map((i) => (
                    <m.span
                      key={i}
                      className="w-1 h-1 rounded-full bg-primary"
                      animate={{ opacity: [0.3, 1, 0.3] }}
                      transition={{
                        duration: 0.5,
                        repeat: Infinity,
                        delay: i * 0.12,
                      }}
                    />
                  ))}
                </span>
              )}
            </m.p>
          </m.div>
        </div>
      </LazyMotion>
    </div>
  );
}
