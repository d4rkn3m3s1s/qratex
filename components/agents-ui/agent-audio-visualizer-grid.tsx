'use client';

import { useMemo } from 'react';
import { BRAND_PRIMARY_HEX } from '@/lib/brand-colors';
import { cn } from '@/lib/utils';

type VisualizerState = 'idle' | 'listening' | 'thinking' | 'speaking';

interface AgentAudioVisualizerGridProps {
  size?: 'sm' | 'md' | 'lg' | 'xl';
  color?: string;
  rowCount?: number;
  columnCount?: number;
  radius?: number;
  state?: VisualizerState;
  className?: string;
}

const sizeMap: Record<NonNullable<AgentAudioVisualizerGridProps['size']>, number> = {
  sm: 26,
  md: 34,
  lg: 44,
  xl: 56,
};

const speedMap: Record<VisualizerState, number> = {
  idle: 2800,
  listening: 1700,
  thinking: 1300,
  speaking: 700,
};

const intensityMap: Record<VisualizerState, number> = {
  idle: 0.2,
  listening: 0.45,
  thinking: 0.65,
  speaking: 1,
};

export function AgentAudioVisualizerGrid({
  size = 'lg',
  color = BRAND_PRIMARY_HEX,
  rowCount = 15,
  columnCount = 15,
  radius = 60,
  state = 'speaking',
  className,
}: AgentAudioVisualizerGridProps) {
  const cells = useMemo(() => {
    const items: Array<{ key: string; delay: number; weight: number }> = [];
    for (let r = 0; r < rowCount; r += 1) {
      for (let c = 0; c < columnCount; c += 1) {
        const dx = c - (columnCount - 1) / 2;
        const dy = r - (rowCount - 1) / 2;
        const dist = Math.sqrt(dx * dx + dy * dy);
        const ring = Math.max(0, 1 - dist / Math.max(1, radius / 10));
        const delay = ((r * columnCount + c) % 17) * 60;
        items.push({ key: `${r}-${c}`, delay, weight: ring });
      }
    }
    return items;
  }, [rowCount, columnCount, radius]);

  const dotSize = sizeMap[size];
  const speed = speedMap[state];
  const intensity = intensityMap[state];

  return (
    <div
      className={cn('grid place-content-center', className)}
      style={{
        gridTemplateColumns: `repeat(${columnCount}, minmax(0, ${dotSize / 10}px))`,
        gridTemplateRows: `repeat(${rowCount}, minmax(0, ${dotSize / 10}px))`,
      }}
    >
      {cells.map((cell) => (
        <span
          key={cell.key}
          className="rounded-full"
          style={{
            width: `${dotSize / 10}px`,
            height: `${dotSize / 10}px`,
            backgroundColor: color,
            opacity: 0.18 + cell.weight * 0.82,
            transform: `scale(${0.5 + cell.weight * 0.6})`,
            animation: `agentPulse ${speed}ms ease-in-out infinite`,
            animationDelay: `${cell.delay}ms`,
            filter: `drop-shadow(0 0 ${Math.max(1, 7 * intensity)}px ${color})`,
          }}
        />
      ))}
      <style jsx>{`
        @keyframes agentPulse {
          0%, 100% {
            opacity: ${0.2 + intensity * 0.2};
            transform: scale(${0.65 + intensity * 0.1});
          }
          50% {
            opacity: ${0.55 + intensity * 0.35};
            transform: scale(${0.95 + intensity * 0.25});
          }
        }
      `}</style>
    </div>
  );
}

