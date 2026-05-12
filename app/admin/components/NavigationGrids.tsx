'use client';

import Link from 'next/link';
import { ChevronRight } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import type { FeatureNavItem, QuickAccessItem } from '../types';

export function MainFeaturesGrid({ items }: { items: FeatureNavItem[] }) {
    return (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-2 sm:gap-3 md:gap-5">
            {items.map((item) => (
                <Link key={item.href} href={item.href}>
                    <Card className="h-full border border-border bg-card/80 dark:bg-card/90 backdrop-blur-sm shadow-lg hover:shadow-2xl hover:shadow-primary/10 hover:border-primary/40 hover:-translate-y-0.5 transition-all duration-300 group overflow-hidden">
                        <div className={`absolute inset-0 bg-gradient-to-br ${item.color} opacity-0 group-hover:opacity-5 transition-opacity duration-300`} />
                        <CardContent className="relative p-3 sm:p-4 md:p-6 flex items-start gap-3 sm:gap-5">
                            <div className={`w-11 h-11 sm:w-14 sm:h-14 rounded-xl sm:rounded-2xl bg-gradient-to-br ${item.color} flex items-center justify-center shrink-0 shadow-lg group-hover:scale-110 group-hover:shadow-xl transition-all duration-300`}>
                                <item.icon className="h-6 w-6 sm:h-7 sm:w-7 text-white" />
                            </div>
                            <div className="flex-1 min-w-0">
                                <h3 className="font-bold text-foreground group-hover:text-primary transition-colors text-base sm:text-lg break-words line-clamp-2">{item.label}</h3>
                                <p className="text-sm text-muted-foreground mt-1 leading-relaxed line-clamp-3 break-words">{item.description}</p>
                            </div>
                            <ChevronRight className="h-6 w-6 text-muted-foreground group-hover:text-primary group-hover:translate-x-1 shrink-0 transition-all duration-300" />
                        </CardContent>
                    </Card>
                </Link>
            ))}
        </div>
    );
}

export function QuickAccessGrid({ items }: { items: QuickAccessItem[] }) {
    return (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
            {items.map((item) => (
                <Link key={item.href} href={item.href}>
                    <Card className="h-full border border-border bg-card/80 dark:bg-card/90 backdrop-blur-sm shadow-lg hover:shadow-2xl hover:shadow-primary/10 hover:border-primary/40 hover:-translate-y-0.5 transition-all duration-300 group">
                        <CardContent className="p-4 flex flex-col items-center justify-center gap-2 text-center min-h-[92px]">
                            <div className="w-12 h-12 rounded-xl bg-muted/80 flex items-center justify-center group-hover:bg-primary/15 group-hover:scale-110 transition-all duration-300">
                                <item.icon className="h-6 w-6 text-muted-foreground group-hover:text-primary transition-colors shrink-0" />
                            </div>
                            <span className="text-xs font-semibold leading-tight line-clamp-2 group-hover:text-primary transition-colors">{item.label}</span>
                        </CardContent>
                    </Card>
                </Link>
            ))}
        </div>
    );
}
