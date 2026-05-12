'use client';

import { motion } from 'framer-motion';
import { LucideIcon, TrendingUp, TrendingDown } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { cn, formatCompactNumber } from '@/lib/utils';

interface StatsCardProps {
  title: string;
  value: string | number;
  change?: number;
  icon: LucideIcon;
  iconColor?: string;
  iconBgColor?: string;
  delay?: number;
}

export function StatsCard({
  title,
  value,
  change,
  icon: Icon,
  iconColor = 'text-primary',
  iconBgColor = 'bg-primary/10',
  delay = 0,
}: StatsCardProps) {
  const formattedValue = typeof value === 'number' ? formatCompactNumber(value) : value;
  const normalizedChange =
    typeof change === 'number'
      ? Number.isFinite(change)
        ? change
        : 0
      : 0;
  const isPositive = normalizedChange > 0;
  const isNegative = normalizedChange < 0;
  const changeText = `${isPositive ? '+' : ''}${Math.abs(normalizedChange)}% son 30 gün`;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay, duration: 0.4 }}
    >
      <Card
        hover
        className="overflow-hidden border-border/60 bg-card/80 backdrop-blur-sm shadow-lg transition-all duration-300 hover:shadow-xl hover:shadow-primary/5"
      >
        <CardContent className="p-3 sm:p-4 md:p-5">
          <div className="flex items-start justify-between gap-2">
            <div className="space-y-1 min-w-0">
              <p className="text-[11px] sm:text-xs font-semibold text-muted-foreground uppercase tracking-wider truncate">
                {title}
              </p>
              <p className="text-2xl sm:text-3xl font-bold tabular-nums leading-none truncate">
                {formattedValue}
              </p>
            </div>
            <div
              className={cn(
                'w-10 h-10 sm:w-11 sm:h-11 rounded-xl flex items-center justify-center shrink-0 ring-1 ring-border/50',
                iconBgColor
              )}
            >
              <Icon className={cn('w-5 h-5', iconColor)} />
            </div>
          </div>

          {change !== undefined && (
            <div className="mt-3 flex items-center justify-between gap-2">
              <div
                className={cn(
                  'inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold',
                  isPositive && 'bg-emerald-500/15 text-emerald-500',
                  isNegative && 'bg-red-500/15 text-red-500',
                  !isPositive && !isNegative && 'bg-muted text-muted-foreground'
                )}
              >
                {isPositive && <TrendingUp className="w-3.5 h-3.5" />}
                {isNegative && <TrendingDown className="w-3.5 h-3.5" />}
                {!isPositive && !isNegative && <span className="w-1.5 h-1.5 rounded-full bg-current/70" />}
                <span>{isPositive ? `+${Math.abs(normalizedChange)}%` : `${Math.abs(normalizedChange)}%`}</span>
              </div>
              <p className="text-[11px] text-muted-foreground truncate">{changeText}</p>
            </div>
          )}
        </CardContent>
      </Card>
    </motion.div>
  );
}

