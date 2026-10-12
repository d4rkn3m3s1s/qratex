'use client';

/**
 * Capacitor native kabuk köprüsü — yalnız native platformda çalışır (web'de hiçbir şey yapmaz).
 * - Android geri tuşu: açık katman → geçmiş → kökte "tekrar bas, çık" (lib/native/back-button)
 * - Status bar: tema (açık/koyu) ile senkron; web görünümü altına uzanır (safe-area CSS'te)
 * - Splash: ilk boyamada gizlenir
 * - Deep link (appUrlOpen): aynı alan adındaki yolu uygulama içinde açar
 * - Harici bağlantılar: sistem tarayıcısında açılır
 */
import { useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Capacitor, type PluginListenerHandle } from '@capacitor/core';
import { useAppT } from '@/lib/app-locale';
import { closeTopLayer, decideBackAction, hasOpenLayer, isExternalHttpUrl } from '@/lib/native/back-button';

const EXIT_WINDOW_MS = 2000;

export function NativeBridge() {
  const router = useRouter();
  const t = useAppT();
  const tRef = useRef(t);
  useEffect(() => {
    tRef.current = t;
  }, [t]);

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;
    const handles: PluginListenerHandle[] = [];
    let disposed = false;
    let lastBackAt = 0;
    const root = document.documentElement;
    root.classList.add('native-app', `native-${Capacitor.getPlatform()}`);

    const onClick = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0) return;
      const a = (e.target as Element | null)?.closest?.('a[href]') as HTMLAnchorElement | null;
      if (!a || a.hasAttribute('download')) return;
      if (!isExternalHttpUrl(a.href, window.location.host)) return;
      e.preventDefault();
      // allowNavigation dışındaki ana çerçeve gezinmesini Capacitor sistem tarayıcısına devreder.
      window.location.href = a.href;
    };
    document.addEventListener('click', onClick, true);

    let observer: MutationObserver | null = null;

    void (async () => {
      const [{ App }, { StatusBar, Style }, { SplashScreen }] = await Promise.all([
        import('@capacitor/app'),
        import('@capacitor/status-bar'),
        import('@capacitor/splash-screen'),
      ]);
      if (disposed) return;

      const syncStatusBar = () => {
        const dark = root.classList.contains('dark');
        StatusBar.setStyle({ style: dark ? Style.Dark : Style.Light }).catch(() => {});
      };
      StatusBar.setOverlaysWebView({ overlay: true }).catch(() => {});
      syncStatusBar();
      observer = new MutationObserver(syncStatusBar);
      observer.observe(root, { attributes: true, attributeFilter: ['class'] });
      SplashScreen.hide().catch(() => {});

      const back = await App.addListener('backButton', ({ canGoBack }) => {
        const action = decideBackAction({
          hasOpenLayer: hasOpenLayer(document),
          canGoBack: canGoBack || window.history.length > 1,
          pathname: window.location.pathname,
        });
        if (action === 'close-layer') return closeTopLayer(document);
        if (action === 'history-back') return window.history.back();
        const now = Date.now();
        if (now - lastBackAt < EXIT_WINDOW_MS) {
          void App.exitApp();
          return;
        }
        lastBackAt = now;
        toast(tRef.current('appShell.nativeExitHint'), { duration: EXIT_WINDOW_MS });
      });
      const deepLink = await App.addListener('appUrlOpen', ({ url }) => {
        try {
          const u = new URL(url);
          if (u.host === window.location.host || u.host === 'qratex.com' || u.host === 'www.qratex.com') {
            router.push(`${u.pathname}${u.search}${u.hash}`);
          }
        } catch {
          /* geçersiz URL yoksay */
        }
      });
      handles.push(back, deepLink);
      if (disposed) handles.forEach((h) => void h.remove());
    })();

    return () => {
      disposed = true;
      document.removeEventListener('click', onClick, true);
      observer?.disconnect();
      handles.forEach((h) => void h.remove());
    };
  }, [router]);

  return null;
}
