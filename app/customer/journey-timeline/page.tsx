'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import {
    Map,
    Star,
    Award,
    Trophy,
    TrendingUp,
    ChevronLeft,
    CheckCircle2,
    Circle,
    Calendar,
    ChevronRight,
    Milestone
} from 'lucide-react';
import Link from 'next/link';
import { InlineLoadingStatus } from '@/components/ui/inline-loading-status';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { cn, formatRelativeTime } from '@/lib/utils';
import { TW_BRAND_HERO_GRADIENT_BR } from '@/lib/tw-brand-classes';
import { Spotlight } from '@/components/ui/spotlight';
import { useCustomerT } from '@/lib/use-customer-locale';

interface TimelineMilestone {
    key: string;
    label: string;
    description: string;
    icon: string;
    date: string | null;
    completed: boolean;
}

interface TimelineResponse {
    success: boolean;
    milestones: TimelineMilestone[];
    stats: {
        totalFeedbacks: number;
        totalBadges: number;
        level: number;
        points: number;
    };
}

export default function JourneyTimelinePage() {
    const tc = useCustomerT();

    const { data: timelineData, isLoading } = useQuery<TimelineResponse>({
        queryKey: ['customer', 'journey-timeline'],
        queryFn: async () => {
            const res = await fetch('/api/customer/journey-timeline');
            if (!res.ok) throw new Error(tc('journeyTimeline.loadError'));
            return res.json();
        },
        staleTime: 60 * 1000,
    });

    const milestones = timelineData?.milestones || [];
    const stats = timelineData?.stats;

    // Filter milestones to completed vs upcoming if needed, but rendering them in a full line
    const container = {
        hidden: { opacity: 0 },
        show: {
            opacity: 1,
            transition: { staggerChildren: 0.1 }
        }
    };

    const item = {
        hidden: { opacity: 0, y: 15 },
        show: { opacity: 1, y: 0 }
    };

    if (isLoading) {
        return (
            <InlineLoadingStatus
                className="min-h-[40vh]"
                spinnerClassName="text-primary"
                description={<p className="text-muted-foreground animate-pulse text-center text-sm">{tc('journeyTimeline.loading')}</p>}
            />
        );
    }

    return (
        <div className="space-y-6 pb-12 max-w-lg mx-auto">
            {/* Header */}
            <motion.header
                initial={{ opacity: 0, y: -20 }}
                animate={{ opacity: 1, y: 0 }}
                className={cn(
                  TW_BRAND_HERO_GRADIENT_BR,
                  'relative overflow-hidden rounded-3xl p-6 text-white shadow-xl ring-1 ring-black/10 sm:p-8 dark:ring-white/10'
                )}
            >
                <Spotlight className="top-0 left-0 w-full h-full" fill="rgba(255,255,255,0.2)" />
                <div className="relative z-10 flex items-center justify-between">
                    <Button asChild variant="ghost" size="icon" className="rounded-full border-0 shrink-0 touch-manipulation bg-background/25 text-foreground hover:bg-background/40 dark:bg-white/10 dark:text-white dark:hover:bg-white/20">
                        <Link href="/customer/journey-score"><ChevronLeft className="h-5 w-5" /></Link>
                    </Button>
                    <h1 className="text-xl sm:text-2xl font-bold flex items-center gap-2 text-balance">
                        <Map className="h-5 w-5 shrink-0" />
                        {tc('journeyTimeline.title')}
                    </h1>
                    <div className="w-10" /> {/* Spacer */}
                </div>

                <div className="relative z-10 mt-6 grid grid-cols-3 gap-2 text-center divide-x divide-white/20 border-t border-white/20 pt-6">
                    <div>
                        <p className="text-2xl font-black">{stats?.level ?? 1}</p>
                        <p className="text-xs text-white/80 font-medium uppercase tracking-wider mt-1">{tc('journeyTimeline.level')}</p>
                    </div>
                    <div>
                        <p className="text-2xl font-black">{stats?.totalFeedbacks ?? 0}</p>
                        <p className="text-xs text-white/80 font-medium uppercase tracking-wider mt-1">{tc('journeyTimeline.feedback')}</p>
                    </div>
                    <div>
                        <p className="text-2xl font-black">{stats?.totalBadges ?? 0}</p>
                        <p className="text-xs text-white/80 font-medium uppercase tracking-wider mt-1">{tc('journeyTimeline.badge')}</p>
                    </div>
                </div>
            </motion.header>

            {/* Timeline View */}
            <div className="px-4">
                <motion.div variants={container} initial="hidden" animate="show" className="relative">
                    {/* Vertical Line */}
                    <div className="absolute left-[39px] top-6 bottom-6 w-0.5 bg-border rounded-full" />

                    <div className="space-y-8">
                        {milestones.length === 0 && (
                            <Card className="rounded-2xl border-dashed border-border/60 bg-card/40">
                                <CardContent className="p-8 text-center text-muted-foreground">
                                    <Map className="mx-auto mb-3 h-8 w-8 opacity-40" />
                                    <p className="font-medium text-foreground">{tc('journeyTimeline.emptyTitle')}</p>
                                    <p className="mt-1 text-sm">{tc('journeyTimeline.emptyDesc')}</p>
                                </CardContent>
                            </Card>
                        )}
                        {milestones.map((milestone, index) => {
                            const isCompleted = milestone.completed;
                            const isLastCompleted = isCompleted && (!milestones[index + 1] || !milestones[index + 1].completed);
                            const isNextUpcoming = !isCompleted && (index === 0 || milestones[index - 1].completed);

                            return (
                                <motion.div key={milestone.key} variants={item} className={`relative flex items-start gap-5 ${!isCompleted ? 'opacity-60 grayscale-[0.5]' : ''}`}>
                                    {/* Icon / Node */}
                                    <div className="relative z-10 flex flex-col items-center">
                                        <div className={`h-[80px] w-20 flex items-center justify-center rounded-2xl border-4 ${isCompleted ? 'bg-primary border-background text-primary-foreground shadow-lg' : 'bg-muted border-background text-muted-foreground'}`}>
                                            <span className="text-3xl">{milestone.icon}</span>
                                        </div>
                                        {isLastCompleted && (
                                            <div className="absolute -bottom-3 rounded-full bg-emerald-500 text-white p-0.5 shadow-sm">
                                                <CheckCircle2 className="h-4 w-4" />
                                            </div>
                                        )}
                                    </div>

                                    {/* Content Card */}
                                    <div className="flex-1 pt-2 pb-4">
                                        <Card className={`rounded-2xl transition-all ${isNextUpcoming ? 'border-primary/50 shadow-md ring-1 ring-primary/20' : isCompleted ? 'border-border/60 shadow-sm bg-card/80' : 'border-dashed border-border/50 bg-transparent'}`}>
                                            <CardContent className="p-4">
                                                <div className="flex justify-between items-start gap-2 mb-1">
                                                    <h3 className={`font-bold ${isNextUpcoming ? 'text-primary' : ''}`}>
                                                        {milestone.label}
                                                    </h3>
                                                    {isCompleted ? (
                                                        <span className="shrink-0 text-[10px] font-medium uppercase tracking-wider text-emerald-600 bg-emerald-500/10 px-2 py-0.5 rounded-full">
                                                            {tc('journeyTimeline.opened')}
                                                        </span>
                                                    ) : isNextUpcoming ? (
                                                        <span className="shrink-0 text-[10px] font-medium uppercase tracking-wider text-primary bg-primary/10 px-2 py-0.5 rounded-full">
                                                            {tc('journeyTimeline.next')}
                                                        </span>
                                                    ) : (
                                                        <span className="shrink-0 text-[10px] font-medium uppercase tracking-wider text-muted-foreground bg-muted px-2 py-0.5 rounded-full">
                                                            {tc('journeyTimeline.waiting')}
                                                        </span>
                                                    )}
                                                </div>
                                                <p className="text-sm text-muted-foreground">{milestone.description}</p>

                                                {isCompleted && milestone.date ? (
                                                    <div className="flex items-center gap-1.5 mt-3 text-xs text-muted-foreground font-medium bg-muted/50 w-fit px-2 py-1 rounded-md">
                                                        <Calendar className="h-3 w-3" />
                                                        {formatRelativeTime(milestone.date)} {tc('journeyTimeline.completed')}
                                                    </div>
                                                ) : (
                                                    <div className="flex items-center gap-1.5 mt-3 text-xs text-muted-foreground italic">
                                                        <Milestone className="h-3 w-3" />
                                                        {tc('journeyTimeline.goalWaiting')}
                                                    </div>
                                                )}
                                            </CardContent>
                                        </Card>
                                    </div>
                                </motion.div>
                            );
                        })}
                    </div>

                    {/* Progress Bar (Fill vertical line) */}
                    <div
                        className="absolute left-[39px] top-6 w-0.5 bg-gradient-to-b from-primary via-primary to-transparent rounded-full"
                        style={{
                            height: `${(milestones.filter(m => m.completed).length / Math.max(1, milestones.length)) * 100}%`,
                            maxHeight: 'calc(100% - 24px)'
                        }}
                    />
                </motion.div>

                <div className="mt-8 text-center pb-8 opacity-70">
                    <TrendingUp className="h-10 w-10 mx-auto text-muted-foreground mb-3 opacity-30" />
                    <p className="text-sm font-medium">{tc('journeyTimeline.footerTitle')}</p>
                    <p className="text-xs text-muted-foreground mt-1">{tc('journeyTimeline.footerDesc')}</p>
                </div>
            </div>
        </div>
    );
}
