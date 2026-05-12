'use client';

import { useState, useEffect } from 'react';
import { m } from 'framer-motion';
import { Badge } from '@/components/ui/badge';

// ─── Sentiment helpers ──────────────────────────────────────
export const getSentimentIcon = (sentiment: string | null) => {
    switch (sentiment) {
        case 'positive': return <span className="text-base">😊</span>;
        case 'negative': return <span className="text-base">😔</span>;
        default: return <span className="text-base">😐</span>;
    }
};

export type SentimentBadgeLabels = { positive: string; negative: string; neutral: string };

export const getSentimentBadge = (sentiment: string | null, labels: SentimentBadgeLabels) => {
    switch (sentiment) {
        case 'positive':
            return <Badge className="bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 border-0 text-xs">{labels.positive}</Badge>;
        case 'negative':
            return <Badge className="bg-red-500/20 text-red-600 dark:text-red-400 border-0 text-xs">{labels.negative}</Badge>;
        default:
            return <Badge className="bg-muted text-muted-foreground border-0 text-xs">{labels.neutral}</Badge>;
    }
};

// ─── AnimatedCounter ────────────────────────────────────────
export function AnimatedCounter({ value, duration = 1.2 }: { value: number; duration?: number }) {
    const safeValue = Math.max(0, Number(value) || 0);
    const [count, setCount] = useState(0);
    useEffect(() => {
        let start = 0;
        const end = safeValue;
        const step = Math.max(1, Math.ceil(end / (duration * 60)) || 1);
        const timer = setInterval(() => {
            start = Math.min(start + step, end);
            setCount(start);
            if (start >= end) clearInterval(timer);
        }, 16);
        return () => clearInterval(timer);
    }, [safeValue, duration]);
    return <span>{count}</span>;
}

// ─── PerformanceRing ────────────────────────────────────────
const colorMap: Record<string, string> = {
    emerald: 'stroke-emerald-500',
    green: 'stroke-green-500',
    yellow: 'stroke-yellow-500',
    orange: 'stroke-orange-500',
    gray: 'stroke-muted-foreground/30',
    primary: 'stroke-primary',
};

export function PerformanceRing({ value, size = 56, color = 'primary' }: { value: number; size?: number; color?: string }) {
    const safeValue = Math.min(100, Math.max(0, Number(value) || 0));
    const r = (size - 6) / 2;
    const c = 2 * Math.PI * r;
    const offset = c - (safeValue / 100) * c;
    return (
        <div className="relative inline-flex" style={{ width: size, height: size }}>
            <svg className="-rotate-90" width={size} height={size}>
                <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="currentColor" strokeWidth={6} className="text-muted/20" />
                <m.circle
                    cx={size / 2} cy={size / 2} r={r}
                    fill="none" strokeWidth={6} strokeLinecap="round"
                    className={colorMap[color] || 'stroke-primary'}
                    initial={{ strokeDashoffset: c }}
                    animate={{ strokeDashoffset: offset }}
                    transition={{ duration: 1, ease: 'easeOut' }}
                    style={{ strokeDasharray: c }}
                />
            </svg>
            <div className="absolute inset-0 flex items-center justify-center">
                <span className="text-sm font-bold tabular-nums">{safeValue}</span>
            </div>
        </div>
    );
}

// ─── Animation variants ─────────────────────────────────────
export const container = { hidden: { opacity: 0 }, show: { opacity: 1, transition: { staggerChildren: 0.06 } } };
export const item = { hidden: { opacity: 0, y: 12 }, show: { opacity: 1, y: 0 } };
export const pulseSoft = { scale: [1, 1.05, 1], transition: { duration: 2, repeat: Infinity, ease: 'easeInOut' } };
