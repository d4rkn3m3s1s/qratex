'use client';

import { useEffect, useState, type ComponentType } from 'react';

/**
 * Native köprü kabuğu (perf-2): `@capacitor/core` ve köprü mantığı web'de ilk yük JS'ine
 * girmesin diye yalnız native kabukta yüklenir. Capacitor native WebView'a `window.Capacitor`
 * nesnesini sayfa betiklerinden ÖNCE enjekte eder; web'de bu nesne yoktur → hiçbir şey yüklenmez.
 * Gerçek uygulama: `./native-bridge-impl`.
 */
type CapacitorGlobal = { isNativePlatform?: () => boolean };

export function NativeBridge() {
  const [Impl, setImpl] = useState<ComponentType | null>(null);

  useEffect(() => {
    const cap = (window as unknown as { Capacitor?: CapacitorGlobal }).Capacitor;
    if (!cap?.isNativePlatform?.()) return;
    let cancelled = false;
    void import('./native-bridge-impl').then((mod) => {
      if (!cancelled) setImpl(() => mod.NativeBridge);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return Impl ? <Impl /> : null;
}
