import type { Metadata } from 'next';
import { segmentLayoutMetadata } from '@/lib/segment-layout-metadata';

/**
 * Giriş/kayıt bilinçli olarak İNDEKSLENEBİLİR (eskiden noindex + robots.txt /auth/ engeli → Lighthouse SEO 69):
 * herkese açık giriş kapısı, sorgu parametreli (callbackUrl) kopyalar canonical ile tek URL'ye toplanır.
 * Diğer /auth/* (şifre sıfırlama, doğrulama) robots.txt'te kapalı kalır.
 */
export async function generateMetadata(): Promise<Metadata> {
  return { ...(await segmentLayoutMetadata('layoutMetadata.authRegister', 'layoutMetadata.authRegisterDescription')), alternates: { canonical: '/auth/register' },
    // (auth) grup yerleşimi noindex verir; metadata sığ birleştiği için açıkça ezilmezse miras kalır.
    robots: { index: true, follow: true },
  };
}

export default function RegisterLayout({ children }: { children: React.ReactNode }) {
  return children;
}
