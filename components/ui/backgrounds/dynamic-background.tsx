'use client';

import { lazy, Suspense, useEffect, useState, type ComponentType, type LazyExoticComponent, type ReactNode } from 'react';
import { parseBackgroundEffectFromDb } from '@/lib/background-effect-shared';
import { readSeasonalOverride, subscribeSeasonalOverride } from '@/lib/seasonal-concept-events';
import { useReducedMotionPref } from '@/lib/motion/use-reduced-motion-pref';

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

/**
 * Varyant başına AYRI parça (perf Y2): eskiden 27 varyantın hepsi (≈7.300 satır, framer/canvas
 * döngüleri) statik import ediliyordu → admin tek bir sezonluk zemin seçtiğinde public sayfalar
 * hepsini indiriyordu. Artık yalnız seçili varyantın modülü `React.lazy` ile iner; inene kadar
 * içerik (children) zeminsiz gösterilir, yerleşim kaymaz.
 */
type BgProps = { className?: string; children?: ReactNode };
type BgComponent = ComponentType<BgProps>;

function lazyBg(loader: () => Promise<BgComponent>): LazyExoticComponent<BgComponent> {
  return lazy(() => loader().then((Component) => ({ default: Component })));
}

const GridDotsLazy = lazy(() => import('./grid-dots').then((m) => ({ default: m.GridDotsBackground })));

const LAZY_VARIANTS: Partial<Record<BackgroundVariant, LazyExoticComponent<BgComponent>>> = {
  'aurora': lazyBg(() => import('./aurora').then((m) => m.AuroraBackground as BgComponent)),
  'sparkles': lazyBg(() => import('./sparkles').then((m) => m.SparklesBackground as BgComponent)),
  'beams': lazyBg(() => import('./beams').then((m) => m.BackgroundBeams as BgComponent)),
  'gradient': lazyBg(() => import('./gradient-animation').then((m) => m.GradientAnimation as BgComponent)),
  'meteors': lazyBg(() => import('./meteors').then((m) => m.MeteorsBackground as BgComponent)),
  'matrix': lazyBg(() => import('./matrix').then((m) => m.MatrixBackground as BgComponent)),
  'particles': lazyBg(() => import('./particles').then((m) => m.ParticlesBackground as BgComponent)),
  'waves': lazyBg(() => import('./waves').then((m) => m.WavesBackground as BgComponent)),
  'starfield': lazyBg(() => import('./starfield').then((m) => m.StarfieldBackground as BgComponent)),
  'cyberpunk': lazyBg(() => import('./cyberpunk').then((m) => m.CyberpunkBackground as BgComponent)),
  'geometric': lazyBg(() => import('./geometric').then((m) => m.GeometricBackground as BgComponent)),
  'fireflies': lazyBg(() => import('./fireflies').then((m) => m.FirefliesBackground as BgComponent)),
  'christmas': lazyBg(() => import('./christmas').then((m) => m.ChristmasBackground as BgComponent)),
  'valentine': lazyBg(() => import('./valentine').then((m) => m.ValentineBackground as BgComponent)),
  'birthday': lazyBg(() => import('./birthday').then((m) => m.BirthdayBackground as BgComponent)),
  'nebula': lazyBg(() => import('./nebula').then((m) => m.NebulaBackground as BgComponent)),
  'northern-lights': lazyBg(() => import('./northern-lights').then((m) => m.NorthernLightsBackground as BgComponent)),
  'holographic': lazyBg(() => import('./holographic').then((m) => m.HolographicBackground as BgComponent)),
  'galaxy': lazyBg(() => import('./galaxy').then((m) => m.GalaxyBackground as BgComponent)),
  'summer': lazyBg(() => import('./summer').then((m) => m.SummerBackground as BgComponent)),
  'winter': lazyBg(() => import('./winter').then((m) => m.WinterBackground as BgComponent)),
  'autumn': lazyBg(() => import('./autumn').then((m) => m.AutumnBackground as BgComponent)),
  'spring': lazyBg(() => import('./spring').then((m) => m.SpringBackground as BgComponent)),
  'ice-kingdom': lazyBg(() => import('./ice-kingdom').then((m) => m.IceKingdomBackground as BgComponent)),
};


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
  // Aktif dönemsel konseptin arka plan efekti (site geneli arka planı geçici olarak ezer).
  const [seasonalVariant, setSeasonalVariant] = useState<BackgroundVariant | null>(null);
  // Hareket politikası (OS prefers-reduced-motion VEYA uygulama "Animasyonları azalt"): dekoratif
  // zeminlerin hepsi sonsuz döngü (framer `repeat: Infinity` / canvas rAF) — azaltılmış harekette
  // hiç yüklenmez ve çizilmez (tasarım raporu Y4; MotionConfig opaklık/blur döngülerini durdurmuyordu).
  const reduceMotion = useReducedMotionPref();

  useEffect(() => {
    if (propVariant || !fetchFromApi) return;
    const apply = (effect: string | null) =>
      setSeasonalVariant(effect ? (parseBackgroundEffectFromDb(effect) as BackgroundVariant) : null);
    apply(readSeasonalOverride().backgroundEffect);
    return subscribeSeasonalOverride((o) => apply(o.backgroundEffect));
  }, [propVariant, fetchFromApi]);

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
        // Uç herkese aynı ve CDN önbellekli; tarayıcı önbelleğini atlamaya gerek yok.
        const res = await fetch('/api/settings/background');
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
  if (isLoading && !seasonalVariant) {
    return <div className={className}>{children}</div>;
  }

  const active = seasonalVariant ?? variant;
  const plain = <div className={className}>{children}</div>;
  if (reduceMotion) return plain;
  if (active === 'grid' || active === 'dots') {
    return (
      <Suspense fallback={plain}>
        <GridDotsLazy variant={active} className={className}>
          {children}
        </GridDotsLazy>
      </Suspense>
    );
  }
  const Variant = LAZY_VARIANTS[active];
  if (!Variant) return plain; // 'original' | 'none' | bilinmeyen
  return (
    <Suspense fallback={plain}>
      <Variant className={className}>{children}</Variant>
    </Suspense>
  );
}
