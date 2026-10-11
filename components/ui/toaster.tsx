'use client';

import { useEffect, useState } from 'react';
import { Toaster as SonnerToaster } from 'sonner';
import { useTheme } from 'next-themes';
import { useAppT } from '@/lib/app-locale';

export function Toaster() {
  const t = useAppT();
  const { resolvedTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);

  const sonnerTheme: 'light' | 'dark' =
    mounted && resolvedTheme === 'dark' ? 'dark' : 'light';

  return (
    <SonnerToaster
      theme={sonnerTheme}
      className="toaster group"
      position="bottom-right"
      // Müşteri mobil alt sekme çubuğu varken toast onun üstünde açılır (değişken yoksa Sonner varsayılanları: 24px / mobil 16px).
      offset={{ bottom: 'calc(var(--qx-tabbar-h, 0px) + 24px)' }}
      mobileOffset={{ bottom: 'calc(var(--qx-tabbar-h, 0px) + 16px)' }}
      closeButton
      containerAriaLabel={t('appShell.toasterRegion')}
      dir="ltr"
      toastOptions={{
        classNames: {
          // Yükseltilmiş yüzey (surface-2 + elevation-2): eskiden bg-background idi, kart/zeminle
          // ayrışmıyordu. Tür ikonları rol token'ı (tema, renk körü ve yüksek kontrast izler).
          toast:
            'group toast group-[.toaster]:bg-surface-elevated group-[.toaster]:text-foreground group-[.toaster]:border-border group-[.toaster]:qx-elevation-2',
          success: '[&_[data-icon]]:text-success',
          error: '[&_[data-icon]]:text-danger',
          warning: '[&_[data-icon]]:text-warning',
          info: '[&_[data-icon]]:text-info',
          description: 'group-[.toast]:text-muted-foreground',
          actionButton:
            'group-[.toast]:min-h-9 group-[.toast]:cursor-pointer group-[.toast]:touch-manipulation group-[.toast]:rounded-md group-[.toast]:bg-primary group-[.toast]:px-3 group-[.toast]:py-2 group-[.toast]:text-sm group-[.toast]:font-medium group-[.toast]:text-primary-foreground group-[.toast]:transition-colors group-[.toast]:duration-200 group-[.toast]:focus-visible:outline-none group-[.toast]:focus-visible:ring-2 group-[.toast]:focus-visible:ring-ring',
          cancelButton:
            'group-[.toast]:min-h-9 group-[.toast]:cursor-pointer group-[.toast]:touch-manipulation group-[.toast]:rounded-md group-[.toast]:bg-muted group-[.toast]:px-3 group-[.toast]:py-2 group-[.toast]:text-sm group-[.toast]:font-medium group-[.toast]:text-muted-foreground group-[.toast]:transition-colors group-[.toast]:duration-200 group-[.toast]:focus-visible:outline-none group-[.toast]:focus-visible:ring-2 group-[.toast]:focus-visible:ring-ring',
        },
      }}
    />
  );
}

