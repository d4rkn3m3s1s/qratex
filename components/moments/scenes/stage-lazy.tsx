'use client';

import dynamic from 'next/dynamic';
import { useCallback, useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/utils';
import type { ScenePair } from '@/lib/moments/scene-colors';
import { STAGE_READY_TIMEOUT_MS, type SceneClock } from './scene-math';
import { StageFallback2D, type StagePreset } from './stage-fallback-2d';

/**
 * 3B sahnenin TEK `next/dynamic` bildirimi — üç sahne kabuğu da bunu kullanır, böylece
 * `moment-stage-3d` (three.js dahil) TEK lazy chunk olarak kalır ve yalnız bir büyük an
 * oynarken indirilir. `ssr: false` zorunlu (WebGL `window` ister).
 */
const MomentStage3D = dynamic(() => import('../moment-stage-3d'), {
  ssr: false,
  loading: () => null,
});

/** Host/sayfa bir anı oynatmadan önce chunk'ı ısıtmak isterse (isteğe bağlı). */
export function preloadMomentStage(): void {
  void import('../moment-stage-3d').catch(() => {});
}

export interface SceneStageProps {
  preset: StagePreset;
  colors: ScenePair;
  fromColors?: ScenePair;
  clock: SceneClock;
  focusY?: number;
  /** true → 3B hiç yüklenmez, statik 2B kare (azaltılmış hareket). */
  staticOnly?: boolean;
  /** 3B ilk kareyi çizdi YA DA kullanılamıyor (kabuk saati başlatır). */
  onSettled?: () => void;
  className?: string;
  /** 2B yedeğin kaplama oranı için sınıf (kart içi/küçük sahne). */
  fallbackClassName?: string;
}

/**
 * 3B sahne + 2B yedek katmanı. 3B parça `STAGE_READY_TIMEOUT_MS` içinde ilk karesini
 * çizemezse statik 2B yedek belirir; 3B hazır olunca söner. WebGL yoksa / bağlam
 * kaybolursa / azaltılmış harekette yedek kalır.
 */
export function SceneStage({
  preset,
  colors,
  fromColors,
  clock,
  focusY,
  staticOnly,
  onSettled,
  className,
  fallbackClassName,
}: SceneStageProps) {
  const [state, setState] = useState<'loading' | 'ready' | 'failed'>(staticOnly ? 'failed' : 'loading');
  // Hızlı yüklemede 2B yedek hiç görünmez (statik halka → söner → parçacıklar toplanır
  // sırası çirkin okunuyordu); yalnız 3B gecikirse kabuk saatiyle aynı anda belirir.
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    if (staticOnly) return;
    const t = window.setTimeout(() => setSlow(true), STAGE_READY_TIMEOUT_MS);
    return () => window.clearTimeout(t);
  }, [staticOnly]);
  const settledRef = useRef(false);
  const onSettledRef = useRef(onSettled);
  useEffect(() => {
    onSettledRef.current = onSettled;
  });

  const settle = useCallback(() => {
    if (settledRef.current) return;
    settledRef.current = true;
    onSettledRef.current?.();
  }, []);

  useEffect(() => {
    if (staticOnly) {
      setState('failed');
      settle();
    }
  }, [staticOnly, settle]);

  const onReady = useCallback(() => {
    setState('ready');
    settle();
  }, [settle]);
  const onUnavailable = useCallback(() => {
    setState('failed');
    settle();
  }, [settle]);

  // Yedek, hedef (yeni) renklerle; lig sahnesinde 3B yoksa doğrudan yeni lig görünür.
  return (
    <div aria-hidden className={cn('pointer-events-none relative', className)}>
      {state !== 'failed' && !staticOnly && (
        <MomentStage3D
          preset={preset}
          colors={colors}
          fromColors={fromColors}
          clock={clock}
          focusY={focusY}
          onReady={onReady}
          onUnavailable={onUnavailable}
          className="absolute inset-0"
        />
      )}
      <div
        className={cn(
          'absolute inset-0 transition-opacity duration-slow',
          state === 'failed' || (state === 'loading' && slow) ? 'opacity-100' : 'opacity-0',
        )}
        style={focusY != null && focusY !== 0.5 ? { transform: `translateY(${(focusY - 0.5) * 100}%)` } : undefined}
      >
        <StageFallback2D preset={preset} colors={colors} className={fallbackClassName} />
      </div>
    </div>
  );
}
