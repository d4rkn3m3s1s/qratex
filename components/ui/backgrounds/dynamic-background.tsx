'use client';

import { useEffect, useState } from 'react';
import { parseBackgroundEffectFromDb } from '@/lib/background-effect-shared';
import { AuroraBackground } from './aurora';
import { SparklesBackground } from './sparkles';
import { BackgroundBeams } from './beams';
import { GradientAnimation } from './gradient-animation';
import { MeteorsBackground } from './meteors';
import { GridDotsBackground } from './grid-dots';
import { MatrixBackground } from './matrix';
import { ParticlesBackground } from './particles';
import { WavesBackground } from './waves';
import { StarfieldBackground } from './starfield';
import { CyberpunkBackground } from './cyberpunk';
import { GeometricBackground } from './geometric';
import { FirefliesBackground } from './fireflies';
import { ChristmasBackground } from './christmas';
import { ValentineBackground } from './valentine';
import { BirthdayBackground } from './birthday';
import { NebulaBackground } from './nebula';
import { NorthernLightsBackground } from './northern-lights';
import { HolographicBackground } from './holographic';
import { GalaxyBackground } from './galaxy';
import { SummerBackground } from './summer';
import { WinterBackground } from './winter';
import { AutumnBackground } from './autumn';
import { SpringBackground } from './spring';
import { IceKingdomBackground } from './ice-kingdom';

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
