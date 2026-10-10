import type { Metadata } from 'next';
import { segmentLayoutMetadata } from '@/lib/segment-layout-metadata';
import { getServerLocale } from '@/lib/server-locale';

// Eski açıklama sayfada olmayan "seviye sinyalleri ve hızlı paylaşım"ı vaat ediyordu.
const DESCRIPTION = {
  tr: 'QRateX kartın: kasada göstereceğin QR kodu, kart numaran ve son işlemlerin.',
  en: 'Your QRateX card: the QR code to show at the counter, your card number and recent activity.',
} as const;

export async function generateMetadata(): Promise<Metadata> {
  const [base, locale] = await Promise.all([
    segmentLayoutMetadata('layoutMetadata.customerMyCard', 'layoutMetadata.customerMyCardDescription'),
    getServerLocale(),
  ]);
  return { ...base, description: DESCRIPTION[locale === 'en' ? 'en' : 'tr'] };
}

export default function CustomerMyCardLayout({ children }: { children: React.ReactNode }) {
  return children;
}
