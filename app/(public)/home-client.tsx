'use client';

import { useEffect } from 'react';
import dynamic from 'next/dynamic';
import { useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import HeroSection from '@/components/landing/HeroSection';
import FeaturesSection from '@/components/landing/FeaturesSection';
import CTASection from '@/components/landing/CTASection';

const DemoSection = dynamic(() => import('@/components/landing/DemoSection'), { ssr: true });
const HowItWorksSection = dynamic(() => import('@/components/landing/HowItWorksSection'), { ssr: true });
const PricingSection = dynamic(() => import('@/components/landing/PricingSection'), { ssr: true });
const FAQSection = dynamic(() => import('@/components/landing/FAQSection'), { ssr: true });
const AdMarquee = dynamic(() => import('@/components/landing/AdMarquee'), { ssr: true });

// pricingEnabled/marqueeEnabled: admin module toggle. Sunucudan page.tsx üzerinden gelir.
// Hareketli arka plan artık (public)/layout.tsx'te (header+footer dahil).
type HomeClientProps = { pricingEnabled?: boolean; marqueeEnabled?: boolean };

export default function HomeClient({ pricingEnabled = true, marqueeEnabled = true }: HomeClientProps) {
  const { data: session, status } = useSession();
  const router = useRouter();

  useEffect(() => {
    if (status === 'authenticated' && session?.user?.role) {
      const roleRoutes: Record<string, string> = {
        ADMIN: '/admin',
        DEALER: '/dealer',
        CUSTOMER: '/customer',
      };
      const targetRoute = roleRoutes[session.user.role] || '/customer';
      router.push(targetRoute);
    }
  }, [session, status, router]);

  // Oturum kontrolü arka planda; misafirleri tam sayfa "Yükleniyor"da tutmayız (SEO / algılanan hız).
  return (
    <div className="relative">
      {/* Hareketli arka plan artık (public)/layout.tsx'te — header + footer dahil tüm
          sayfanın arkasında. İçerik z-[1] ile üstünde durur. */}
      <div className="relative z-[1]">
      <HeroSection />
      <FeaturesSection />
      {marqueeEnabled && <AdMarquee />}
      <DemoSection />
      <HowItWorksSection />
      {pricingEnabled && <PricingSection />}
      <CTASection />
      <FAQSection />
      </div>
    </div>
  );
}

