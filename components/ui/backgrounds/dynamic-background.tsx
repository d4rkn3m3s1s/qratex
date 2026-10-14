'use client';

import { useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import { parseBackgroundEffectFromDb } from '@/lib/background-effect-shared';

// Her varyant ayrı chunk: yalnız seçili efektin kodu indirilir (21 canvas tek pakette değil).
const AuroraBackground = dynamic(() => import('./aurora').then((mod) => mod.AuroraBackground), { ssr: false });
const SparklesBackground = dynamic(() => import('./sparkles').then((mod) => mod.SparklesBackground), { ssr: false });
const BackgroundBeams = dynamic(() => import('./beams').then((mod) => mod.BackgroundBeams), { ssr: false });
const GradientAnimation = dynamic(() => import('./gradient-animation').then((mod) => mod.GradientAnimation), { ssr: false });
const MeteorsBackground = dynamic(() => import('./meteors').then((mod) => mod.MeteorsBackground), { ssr: false });
const GridDotsBackground = dynamic(() => import('./grid-dots').then((mod) => mod.GridDotsBackground), { ssr: false });
const MatrixBackground = dynamic(() => import('./matrix').then((mod) => mod.MatrixBackground), { ssr: false });
const ParticlesBackground = dynamic(() => import('./particles').then((mod) => mod.ParticlesBackground), { ssr: false });
const WavesBackground = dynamic(() => import('./waves').then((mod) => mod.WavesBackground), { ssr: false });
const StarfieldBackground = dynamic(() => import('./starfield').then((mod) => mod.StarfieldBackground), { ssr: false });
const CyberpunkBackground = dynamic(() => import('./cyberpunk').then((mod) => mod.CyberpunkBackground), { ssr: false });
const GeometricBackground = dynamic(() => import('./geometric').then((mod) => mod.GeometricBackground), { ssr: false });
const FirefliesBackground = dynamic(() => import('./fireflies').then((mod) => mod.FirefliesBackground), { ssr: false });
const ChristmasBackground = dynamic(() => import('./christmas').then((mod) => mod.ChristmasBackground), { ssr: false });
const ValentineBackground = dynamic(() => import('./valentine').then((mod) => mod.ValentineBackground), { ssr: false });
const BirthdayBackground = dynamic(() => import('./birthday').then((mod) => mod.BirthdayBackground), { ssr: false });
const NebulaBackground = dynamic(() => import('./nebula').then((mod) => mod.NebulaBackground), { ssr: false });
const NorthernLightsBackground = dynamic(() => import('./northern-lights').then((mod) => mod.NorthernLightsBackground), { ssr: false });
const HolographicBackground = dynamic(() => import('./holographic').then((mod) => mod.HolographicBackground), { ssr: false });
const GalaxyBackground = dynamic(() => import('./galaxy').then((mod) => mod.GalaxyBackground), { ssr: false });
const SummerBackground = dynamic(() => import('./summer').then((mod) => mod.SummerBackground), { ssr: false });
const WinterBackground = dynamic(() => import('./winter').then((mod) => mod.WinterBackground), { ssr: false });
const AutumnBackground = dynamic(() => import('./autumn').then((mod) => mod.AutumnBackground), { ssr: false });
const SpringBackground = dynamic(() => import('./spring').then((mod) => mod.SpringBackground), { ssr: false });
const IceKingdomBackground = dynamic(() => import('./ice-kingdom').then((mod) => mod.IceKingdomBackground), { ssr: false });

export type BackgroundVariant =
  | 'original'
  | 'aurora' 
  | 'sparkles' 
  | 'beams' 
  | 'gradient' 
  | 'meteors' 
  | 'grid' 
  | 'dots'
  | 'matrix'
  | 'particles'
  | 'waves'
  | 'starfield'
  | 'cyberpunk'
  | 'geometric'
  | 'fireflies'
  | 'christmas'
  | 'valentine'
  | 'birthday'
  | 'nebula'
  | 'northern-lights'
  | 'holographic'
  | 'galaxy'
  | 'summer'
  | 'winter'
  | 'autumn'
  | 'spring'
  | 'ice-kingdom'
  | 'none';

interface DynamicBackgroundProps {
  children: React.ReactNode;
  variant?: BackgroundVariant;
  className?: string;
  fetchFromApi?: boolean;
}

export function DynamicBackground({
  children,
  variant: propVariant,
  className,
  fetchFromApi = true,
}: DynamicBackgroundProps) {
  const [variant, setVariant] = useState<BackgroundVariant>(() => propVariant ?? 'original');
  const [isLoading, setIsLoading] = useState(() => Boolean(fetchFromApi && !propVariant));

  useEffect(() => {
    if (propVariant) {
      setVariant(propVariant);
      setIsLoading(false);
      return;
    }

    if (!fetchFromApi) {
      setIsLoading(false);
      return;
    }

    const fetchBackground = async () => {
      try {
        const res = await fetch('/api/settings/background', {
          cache: 'no-store',
          headers: {
            'Cache-Control': 'no-cache',
          },
        });
        if (res.ok) {
          const data = await res.json();
          if (data.backgroundEffect != null) {
            setVariant(parseBackgroundEffectFromDb(data.backgroundEffect));
          }
        }
      } catch (error) {
        console.error('Failed to fetch background setting:', error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchBackground();
  }, [propVariant, fetchFromApi]);

  // Don't render background during loading to prevent flash
  if (isLoading) {
    return <div className={className}>{children}</div>;
  }

  switch (variant) {
    case 'original':
      return <div className={className}>{children}</div>;

    case 'aurora':
      return (
        <AuroraBackground className={className}>
          {children}
        </AuroraBackground>
      );

    case 'sparkles':
      return (
        <SparklesBackground className={className}>
          {children}
        </SparklesBackground>
      );

    case 'beams':
      return (
        <BackgroundBeams className={className}>
          {children}
        </BackgroundBeams>
      );

    case 'gradient':
      return (
        <GradientAnimation className={className}>
          {children}
        </GradientAnimation>
      );

    case 'meteors':
      return (
        <MeteorsBackground className={className}>
          {children}
        </MeteorsBackground>
      );

    case 'grid':
      return (
        <GridDotsBackground variant="grid" className={className}>
          {children}
        </GridDotsBackground>
      );

    case 'dots':
      return (
        <GridDotsBackground variant="dots" className={className}>
          {children}
        </GridDotsBackground>
      );

    case 'matrix':
      return (
        <MatrixBackground className={className}>
          {children}
        </MatrixBackground>
      );

    case 'particles':
      return (
        <ParticlesBackground className={className}>
          {children}
        </ParticlesBackground>
      );

    case 'waves':
      return (
        <WavesBackground className={className}>
          {children}
        </WavesBackground>
      );

    case 'starfield':
      return (
        <StarfieldBackground className={className}>
          {children}
        </StarfieldBackground>
      );

    case 'cyberpunk':
      return (
        <CyberpunkBackground className={className}>
          {children}
        </CyberpunkBackground>
      );

    case 'geometric':
      return (
        <GeometricBackground className={className}>
          {children}
        </GeometricBackground>
      );

    case 'fireflies':
      return (
        <FirefliesBackground className={className}>
          {children}
        </FirefliesBackground>
      );

    case 'christmas':
      return (
        <ChristmasBackground className={className}>
          {children}
        </ChristmasBackground>
      );

    case 'valentine':
      return (
        <ValentineBackground className={className}>
          {children}
        </ValentineBackground>
      );

    case 'birthday':
      return (
        <BirthdayBackground className={className}>
          {children}
        </BirthdayBackground>
      );

    case 'nebula':
      return (
        <NebulaBackground className={className}>
          {children}
        </NebulaBackground>
      );

    case 'northern-lights':
      return (
        <NorthernLightsBackground className={className}>
          {children}
        </NorthernLightsBackground>
      );

    case 'holographic':
      return (
        <HolographicBackground className={className}>
          {children}
        </HolographicBackground>
      );

    case 'galaxy':
      return (
        <GalaxyBackground className={className}>
          {children}
        </GalaxyBackground>
      );

    case 'summer':
      return (
        <SummerBackground className={className}>
          {children}
        </SummerBackground>
      );

    case 'winter':
      return (
        <WinterBackground className={className}>
          {children}
        </WinterBackground>
      );

    case 'autumn':
      return (
        <AutumnBackground className={className}>
          {children}
        </AutumnBackground>
      );

    case 'spring':
      return (
        <SpringBackground className={className}>
          {children}
        </SpringBackground>
      );

    case 'ice-kingdom':
      return (
        <IceKingdomBackground className={className}>
          {children}
        </IceKingdomBackground>
      );

    case 'none':
    default:
      return <div className={className}>{children}</div>;
  }
}
