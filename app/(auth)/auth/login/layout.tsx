import type { Metadata } from 'next';
import { segmentLayoutMetadata } from '@/lib/segment-layout-metadata';

/**
 * Giriş/kayıt bilinçli olarak İNDEKSLENEBİLİR (eskiden noindex + robots.txt /auth/ engeli → Lighthouse SEO 69):
 * herkese açık giriş kapısı, sorgu parametreli (callbackUrl) kopyalar canonical ile tek URL'ye toplanır.
 * Diğer /auth/* (şifre sıfırlama, doğrulama) robots.txt'te kapalı kalır.
 */
export async function generateMetadata(): Promise<Metadata> {
  return { ...(await segmentLayoutMetadata('layoutMetadata.authLogin', 'layoutMetadata.authLoginDescription')), alternates: { canonical: '/auth/login' } };
}

export default function LoginLayout({ children }: { children: React.ReactNode }) {
  return children;
}
