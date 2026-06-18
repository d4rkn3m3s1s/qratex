'use client';

import { useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import { useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { DynamicBackground, type BackgroundVariant } from '@/components/ui/backgrounds';
import { parseBackgroundEffectFromDb } from '@/lib/background-effect-shared';
import HeroSection from '@/components/landing/HeroSection';
import FeaturesSection from '@/components/landing/FeaturesSection';
import CTASection from '@/components/landing/CTASection';

const DemoSection = dynamic(() => import('@/components/landing/DemoSection'), { ssr: true });
const HowItWorksSection = dynamic(() => import('@/components/landing/HowItWorksSection'), { ssr: true });
const TestimonialsSection = dynamic(() => import('@/components/landing/TestimonialsSection'), { ssr: true });
const PricingSection = dynamic(() => import('@/components/landing/PricingSection'), { ssr: true });
const FAQSection = dynamic(() => import('@/components/landing/FAQSection'), { ssr: true });

type HomeClientProps = { initialBackgroundEffect?: BackgroundVariant };

export default function HomeClient({ initialBackgroundEffect }: HomeClientProps) {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [backgroundEffect, setBackgroundEffect] = useState<BackgroundVariant>(
    () => initialBackgroundEffect ?? 'original'
  );
  const [reducedMotion, setReducedMotion] = useState(false);

  useEffect(() => {
    setBackgroundEffect(initialBackgroundEffect ?? 'original');
  }, [initialBackgroundEffect]);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/settings/background', { cache: 'no-store' })
      .then((res) => (res.ok ? res.json() : null))
      .then((data: { backgroundEffect?: unknown } | null) => {
        if (cancelled || !data) return;
        setBackgroundEffect(parseBackgroundEffectFromDb(data.backgroundEffect));
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    setReducedMotion(mq.matches);
    const handler = () => setReducedMotion(mq.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);

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

  // Arka plan efekti yalnızca hero'da değil TÜM landing sayfasının arkasında görünür.
  // `fixed inset-0` (viewport boyu) → kullanıcı aşağı kaydırınca opak bölümlerin de
  // arkasında efekt görünür kalır. Bölümler `relative z-10` ile efektin önünde.
  const hasEffect = backgroundEffect !== 'none' && backgroundEffect !== 'original';

  // Oturum kontrolü arka planda; misafirleri tam sayfa "Yükleniyor"da tutmayız (SEO / algılanan hız).
  return (
    <div className="relative isolate">
      {hasEffect && (
        <div className="fixed inset-0 z-0 pointer-events-none" aria-hidden="true">
          <DynamicBackground variant={backgroundEffect} fetchFromApi={false}>
            <div />
          </DynamicBackground>
        </div>
      )}
      <div className="relative z-10">
        <HeroSection backgroundEffect={backgroundEffect} reducedMotion={reducedMotion} />
        <FeaturesSection />
        <DemoSection />
        <HowItWorksSection />
        <TestimonialsSection />
        <PricingSection />
        <FAQSection />
        <CTASection />
      </div>
    </div>
  );
}

