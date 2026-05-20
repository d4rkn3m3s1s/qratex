'use client';

import { m } from 'framer-motion';
import { Award, Star, ShieldCheck, Zap, Heart } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import Image from 'next/image';

interface HallOfFamer {
    id: string;
    name: string;
    image?: string;
    level: number;
    biography?: string;
    badgesCount: number;
}

interface HallOfFameProps {
    users: HallOfFamer[];
}

export function HallOfFame({ users }: HallOfFameProps) {
    return (
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {users.map((user, idx) => (
                <m.div
                    key={user.id}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: idx * 0.1 }}
                >
                    <Card className="group relative overflow-hidden border-border/50 bg-card/40 backdrop-blur-sm transition-all hover:border-amber-500/50 hover:shadow-lg hover:shadow-amber-500/10">
                        {/* Decorative background */}
                        <div className="absolute top-0 right-0 p-4 opacity-5 group-hover:opacity-10 transition-opacity">
                            <Award className="w-24 h-24 text-amber-500 rotate-12" />
                        </div>

                        <CardContent className="p-6">
                            <div className="flex items-start gap-4">
                                <div className="relative">
                                    <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-amber-500 to-orange-500 p-0.5">
                                        <div className="w-full h-full rounded-2xl bg-card overflow-hidden">
                                            {user.image ? (
                                                <Image src={user.image} alt={user.name} width={64} height={64} className="object-cover" />
                                            ) : (
                                                <div className="w-full h-full flex items-center justify-center bg-muted">
                                                    <span className="text-xl font-bold">{user.name.charAt(0)}</span>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                    <div className="absolute -bottom-2 -right-2 w-8 h-8 rounded-full bg-background border-2 border-amber-500 flex items-center justify-center">
                                        <ShieldCheck className="w-4 h-4 text-amber-500" />
                                    </div>
                                </div>

                                <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2">
                                        <h3 className="font-bold text-lg truncate">{user.name}</h3>
                                        <Badge variant="outline" className="bg-amber-500/10 text-amber-500 border-amber-500/20 text-[10px] h-4">
                                            Legend
                                        </Badge>
                                    </div>
                                    <div className="flex items-center gap-3 mt-1">
                                        <span className="text-xs font-semibold text-muted-foreground flex items-center gap-1">
                                            <Zap className="w-3 h-3 text-amber-500" /> Lv. {user.level}
                                        </span>
                                        <span className="text-xs font-semibold text-muted-foreground flex items-center gap-1">
                                            <Star className="w-3 h-3 text-orange-500" /> {user.badgesCount} Rozet
                                        </span>
                                    </div>
                                </div>
                            </div>

                            {user.biography && (
                                <p className="mt-4 text-sm text-muted-foreground line-clamp-2 italic leading-relaxed">
                                    "{user.biography}"
                                </p>
                            )}

                            <div className="mt-4 pt-4 border-t border-border/50 flex items-center justify-between">
                                <div className="flex -space-x-2">
                                    {[1, 2, 3].map((i) => (
                                        <div key={i} className="w-6 h-6 rounded-full border-2 border-background bg-muted flex items-center justify-center">
                                            <Award className="w-3 h-3 text-muted-foreground" />
                                        </div>
                                    ))}
                                    <span className="text-[10px] text-muted-foreground ml-4 flex items-center">+ {user.badgesCount - 3} Rozet</span>
                                </div>
                                <Button variant="ghost" size="sm" className="h-8 text-xs gap-1 group/btn">
                                    Profil <ArrowRight className="w-3 h-3 transition-transform group-hover/btn:translate-x-1" />
                                </Button>
                            </div>
                        </CardContent>
                    </Card>
                </m.div>
            ))}
        </div>
    );
}

import { Button } from '@/components/ui/button';
import { ArrowRight } from 'lucide-react';
