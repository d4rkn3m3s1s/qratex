'use client';

import { useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import { useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { type BackgroundVariant } from '@/components/ui/backgrounds';
import { parseBackgroundEffectFromDb } from '@/lib/background-effect-shared';
import { useAppT } from '@/lib/app-locale';
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
  const t = useAppT();
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

  // Show loading while checking session
  if (status === 'loading') {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4">
        <div className="animate-spin rounded-full h-10 w-10 border-2 border-primary border-t-transparent" />
        <p className="text-sm text-muted-foreground">{t('common.loading')}</p>
      </div>
    );
  }

  return (
    <div className="relative">
      <HeroSection backgroundEffect={backgroundEffect} reducedMotion={reducedMotion} />
      <FeaturesSection />
      <DemoSection />
      <HowItWorksSection />
      <TestimonialsSection />
      <PricingSection />
      <FAQSection />
      <CTASection />
    </div>
  );
}

