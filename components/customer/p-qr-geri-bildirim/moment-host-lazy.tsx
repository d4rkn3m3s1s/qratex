'use client';

/**
 * An Motoru Host'u yalnız OTURUMLU görüntüleyende ve ayrı parça olarak yüklenir: anonim
 * QR ziyaretçisinin ilk JS'ine (huni bütçesi ≤ 150 KB gzip) sahne/kuyruk kodu girmez.
 * Puan kapsülü ve seviye/lig/rozet sahneleri gönderim sonrasında buradan oynar.
 */
import dynamic from 'next/dynamic';

const MomentHost = dynamic(() => import('@/components/moments/moment-host').then((m) => m.MomentHost), {
  ssr: false,
  loading: () => null,
});

export function FunnelMomentHost({ enabled }: { enabled: boolean }) {
  return enabled ? <MomentHost /> : null;
}
