'use client';

import { m } from 'framer-motion';
import { Star } from 'lucide-react';

export interface RatingDistributionDatum {
  stars: number;
  count: number;
  percent: number;
}

interface RatingDistributionBarProps {
  data: RatingDistributionDatum[];
  maxCount?: number;
  barColor?: string;
  height?: number;
}

const DEFAULT_BAR = 'hsl(var(--primary))';

export function RatingDistributionBar({
  data,
  maxCount: maxCountProp,
  barColor = DEFAULT_BAR,
  height = 24,
}: RatingDistributionBarProps) {
  const maxCount = maxCountProp ?? Math.max(1, ...data.map((d) => d.count));
  if (!data?.length) {
    return (
      <div className="flex items-center justify-center text-muted-foreground text-sm py-4">
        Veri yok
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {data.map((item, i) => (
        <div key={item.stars} className="flex items-center gap-2">
          <div className="flex items-center gap-1 w-16 shrink-0">
            <Star className="h-3.5 w-3.5 text-amber-500 fill-amber-500" />
            <span className="text-xs font-medium">{item.stars}</span>
          </div>
          <div className="flex-1 h-6 rounded-md bg-muted/50 overflow-hidden">
            <m.div
              initial={{ width: 0 }}
              animate={{ width: `${(item.count / maxCount) * 100}%` }}
              transition={{ duration: 0.6, delay: Math.min(i, 10) * 0.06 }}
              className="h-full rounded-md flex items-center justify-end pr-2 min-w-0"
              style={{ backgroundColor: barColor, opacity: 0.9 }}
            >
              {item.count > 0 && (
                <span className="text-[10px] font-medium text-white drop-shadow-sm">{item.count}</span>
              )}
            </m.div>
          </div>
          <span className="text-xs text-muted-foreground w-8 text-right tabular-nums">{item.percent}%</span>
        </div>
      ))}
    </div>
  );
}
