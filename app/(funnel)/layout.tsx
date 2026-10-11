import type { ReactNode } from 'react';
import { ServerLocaleBoundary } from '@/lib/server-locale-boundary';

/**
 * QR hunisi: sayfa zaten dil çerezini okur (dinamik); sınır istemci bileşenlerini SSR'da doğru
 * dilde basar — EN misafir ilk boyamada Türkçe görüp sıçrama yaşamaz (mobil-erisilebilirlik-i18n B2).
 */
export default function FunnelLayout({ children }: { children: ReactNode }) {
  return <ServerLocaleBoundary>{children}</ServerLocaleBoundary>;
}
