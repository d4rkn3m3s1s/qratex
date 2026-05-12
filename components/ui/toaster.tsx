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
      closeButton
      containerAriaLabel={t('appShell.toasterRegion')}
      dir="ltr"
      toastOptions={{
        classNames: {
          toast:
            'group toast group-[.toaster]:bg-background group-[.toaster]:text-foreground group-[.toaster]:border-border group-[.toaster]:shadow-lg',
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

