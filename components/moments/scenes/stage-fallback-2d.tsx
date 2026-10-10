'use client';

import { useId } from 'react';
import { cn } from '@/lib/utils';
import { hexToRgba, lightenHex, darkenHex, type ScenePair } from '@/lib/moments/scene-colors';

export type StagePreset = 'ring' | 'gem' | 'medallion';

/**
 * 3B sahnenin 2B yedeği — WebGL yokken, 3B parça yüklenirken ve azaltılmış harekette.
 * Saf CSS/SVG; three.js içe AKTARMAZ (yükleme yer tutucusu olarak ana pakette kalır).
 * Hareket yok: tek statik kare (azaltılmış hareket politikası).
 */
export function StageFallback2D({
  preset,
  colors,
  className,
}: {
  preset: StagePreset;
  colors: ScenePair;
  className?: string;
}) {
  const rawId = useId();
  const id = rawId.replace(/[^a-zA-Z0-9_-]/g, '');
  const [a, b] = colors;

  return (
    <div aria-hidden className={cn('pointer-events-none relative grid size-full place-items-center', className)}>
      {/* Yumuşak ışık lekesi */}
      <div
        className="absolute inset-0"
        style={{ background: `radial-gradient(closest-side, ${hexToRgba(a, 0.45)}, ${hexToRgba(b, 0.12)} 55%, transparent 75%)` }}
      />
      {preset === 'ring' && (
        <div
          className="relative aspect-square rounded-full"
          style={{
            width: '56%',
            padding: 'max(6px, 1.6%)',
            background: `conic-gradient(from 210deg, ${a}, ${lightenHex(b, 0.25)}, ${a}, ${b}, ${a})`,
            boxShadow: `0 0 40px ${hexToRgba(b, 0.55)}, inset 0 0 24px ${hexToRgba(a, 0.6)}`,
            WebkitMask: 'radial-gradient(closest-side, transparent calc(100% - max(8px, 3%)), #000 calc(100% - max(7px, 2.9%)))',
            mask: 'radial-gradient(closest-side, transparent calc(100% - max(8px, 3%)), #000 calc(100% - max(7px, 2.9%)))',
          }}
        />
      )}
      {preset === 'gem' && (
        <svg viewBox="0 0 100 100" className="relative" style={{ width: '46%', filter: `drop-shadow(0 0 24px ${hexToRgba(b, 0.6)})` }}>
          <defs>
            <linearGradient id={`${id}-g`} x1="0" y1="0" x2="1" y2="1">
              <stop offset="0" stopColor={lightenHex(b, 0.45)} />
              <stop offset="0.55" stopColor={a} />
              <stop offset="1" stopColor={darkenHex(a, 0.45)} />
            </linearGradient>
          </defs>
          {/* Taç + pavyon: kesim taşı silueti */}
          <path d="M22 34 L36 18 L64 18 L78 34 L50 88 Z" fill={`url(#${id}-g)`} />
          <path d="M22 34 L78 34 M36 18 L44 34 L50 88 M64 18 L56 34 L50 88 M44 34 L50 18 L56 34" stroke={hexToRgba('#ffffff', 0.55)} strokeWidth="1.2" fill="none" />
        </svg>
      )}
      {preset === 'medallion' && (
        <div
          className="relative aspect-square rounded-full"
          style={{
            width: '78%',
            padding: '5%',
            background: `linear-gradient(135deg, ${lightenHex(a, 0.35)}, ${a} 45%, ${darkenHex(b, 0.25)})`,
            boxShadow: `0 0 36px ${hexToRgba(a, 0.5)}`,
          }}
        >
          <div
            className="size-full rounded-full"
            style={{ background: `radial-gradient(circle at 35% 30%, ${lightenHex(a, 0.5)}, ${darkenHex(a, 0.35)} 80%)` }}
          />
        </div>
      )}
    </div>
  );
}
