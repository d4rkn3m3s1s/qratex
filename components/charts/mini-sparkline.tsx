'use client';

import { useMemo } from 'react';

export interface MiniSparklineProps {
  /** Array of numeric values (e.g. [3, 5, 2, 7, 4]) */
  values: number[];
  /** CSS color for the line/fill */
  color?: string;
  /** Height in pixels */
  height?: number;
  /** Width in pixels; default fills container */
  width?: number;
  /** Show area fill under the line */
  showArea?: boolean;
  /** Line stroke width */
  strokeWidth?: number;
  /** Optional: class for the wrapper */
  className?: string;
}

export function MiniSparkline({
  values,
  color = 'hsl(var(--primary))',
  height = 32,
  width,
  showArea = true,
  strokeWidth = 1.5,
  className = '',
}: MiniSparklineProps) {
  const { pathD, areaD, viewBox } = useMemo(() => {
    if (!values?.length) return { pathD: '', areaD: '', viewBox: '0 0 60 32' };
    const min = Math.min(...values);
    const max = Math.max(...values);
    const range = max - min || 1;
    const w = width ?? 60;
    const h = height;
    const pad = 2;
    const xStep = (w - pad * 2) / Math.max(1, values.length - 1);
    const points = values.map((v, i) => {
      const x = pad + i * xStep;
      const y = h - pad - ((v - min) / range) * (h - pad * 2);
      return [x, y];
    });
    const pathD = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p[0]} ${p[1]}`).join(' ');
    const areaD = pathD + ` L ${points[points.length - 1][0]} ${h - pad} L ${points[0][0]} ${h - pad} Z`;
    return { pathD, areaD, viewBox: `0 0 ${w} ${h}` };
  }, [values, height, width]);

  if (!values?.length) {
    return (
      <div className={className} style={{ height, width: width ?? '100%', minWidth: 48 }}>
        <span className="text-[10px] text-muted-foreground">—</span>
      </div>
    );
  }

  return (
    <div className={className} style={{ height, width: width ?? '100%', minWidth: 48 }}>
      <svg
        viewBox={viewBox}
        preserveAspectRatio="none"
        className="w-full h-full"
        style={{ display: 'block' }}
      >
        {showArea && <path d={areaD} fill={color} fillOpacity={0.2} />}
        <path
          d={pathD}
          fill="none"
          stroke={color}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </div>
  );
}
