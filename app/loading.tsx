'use client';

import { Loader2 } from 'lucide-react';
import { LazyMotion, domAnimation, m } from 'framer-motion';

export default function Loading() {
  return (
    <LazyMotion features={domAnimation}>
      <div
        className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-background/80 backdrop-blur-sm"
        role="status"
        aria-busy="true"
        aria-live="polite"
      >
        <m.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.3 }}
          className="flex flex-col items-center justify-center p-8 rounded-3xl bg-card border border-border/50 shadow-2xl shadow-primary/5"
        >
          <div className="relative mb-6 flex h-20 w-20 items-center justify-center" aria-hidden>
            <div className="absolute inset-0 rounded-full border-4 border-primary/20" />
            <div className="absolute inset-0 animate-spin rounded-full border-4 border-primary border-t-transparent" />
            <Loader2 className="h-8 w-8 animate-pulse text-primary" />
          </div>
          <h2 className="text-xl font-semibold tracking-tight text-foreground">Yükleniyor</h2>
          <p className="text-sm text-muted-foreground mt-2">Lütfen kısa bir süre bekleyin...</p>
        </m.div>
      </div>
    </LazyMotion>
  );
}
