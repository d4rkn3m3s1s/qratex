'use client';

import { useEffect, useState } from 'react';
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
  const [variant, setVariant] = useState<BackgroundVariant>(propVariant || 'aurora');
  const [isLoading, setIsLoading] = useState(fetchFromApi);

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
        const res = await fetch('/api/settings/background');
        if (res.ok) {
          const data = await res.json();
          if (data.backgroundEffect) {
            setVariant(data.backgroundEffect as BackgroundVariant);
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
      // Original is handled by the parent component (landing page)
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

    case 'none':
    default:
      return <div className={className}>{children}</div>;
  }
}

