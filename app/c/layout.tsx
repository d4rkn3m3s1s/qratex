import type { ReactNode } from 'react';
import { ServerLocaleBoundary } from '@/lib/server-locale-boundary';

/**
 * Kart aktivasyonu (/c/[token]): sayfa zaten dil çerezini okur (dinamik); sınır istemci
 * bileşenlerini SSR'da doğru dilde basar (mobil-erisilebilirlik-i18n B2).
 */
export default function CardActivationLayout({ children }: { children: ReactNode }) {
  return <ServerLocaleBoundary>{children}</ServerLocaleBoundary>;
}
