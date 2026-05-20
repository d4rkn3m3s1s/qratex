'use client';

import { m } from 'framer-motion';
import { Trophy, Users, Swords, Sparkles, TrendingUp } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import Image from 'next/image';

interface SquadRank {
    id: string;
    name: string;
    points: number;
    level: number;
    memberCount: number;
    logo?: string;
}

interface SquadLeaderboardProps {
    squads: SquadRank[];
}

export function SquadLeaderboard({ squads }: SquadLeaderboardProps) {
    const sortedSquads = [...squads].sort((a, b) => b.points - a.points);

    return (
        <Card className="border-border/50 bg-card/40 backdrop-blur-sm overflow-hidden">
            <CardHeader className="border-b border-border/50 bg-muted/30">
                <div className="flex items-center justify-between">
                    <div>
                        <CardTitle className="flex items-center gap-2">
                            <Trophy className="w-5 h-5 text-amber-500" />
                            Squad Battle: Global Sıralama
                        </CardTitle>
                        <CardDescription>En aktif ve güçlü klanlar burada yarışıyor</CardDescription>
                    </div>
                    <Badge variant="outline" className="bg-amber-500/10 text-amber-500 border-amber-500/20">
                        Sezon 1
                    </Badge>
                </div>
            </CardHeader>
            <CardContent className="p-0">
                <div className="divide-y divide-border/50">
                    {sortedSquads.map((squad, idx) => (
                        <m.div
                            key={squad.id}
                            initial={{ opacity: 0, x: -20 }}
                            animate={{ opacity: 1, x: 0 }}
                            transition={{ delay: idx * 0.05 }}
                            className={`flex items-center justify-between p-4 transition-colors hover:bg-muted/30 ${
                                idx < 3 ? 'bg-primary/5' : ''
                            }`}
                        >
                            <div className="flex items-center gap-4">
                                <div className="w-8 text-center font-black text-lg">
                                    {idx === 0 ? (
                                        <span className="text-2xl">🥇</span>
                                    ) : idx === 1 ? (
                                        <span className="text-2xl">🥈</span>
                                    ) : idx === 2 ? (
                                        <span className="text-2xl">🥉</span>
                                    ) : (
                                        <span className="text-muted-foreground">#{idx + 1}</span>
                                    )}
                                </div>
                                
                                <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center overflow-hidden border border-primary/20 shadow-inner">
                                    {squad.logo ? (
                                        <Image src={squad.logo} alt={squad.name} width={48} height={48} />
                                    ) : (
                                        <Swords className="w-6 h-6 text-primary" />
                                    )}
                                </div>

                                <div>
                                    <h4 className="font-bold flex items-center gap-2">
                                        {squad.name}
                                        <Badge variant="secondary" className="text-[10px] h-4">
                                            Lv. {squad.level}
                                        </Badge>
                                    </h4>
                                    <div className="flex items-center gap-3 text-xs text-muted-foreground mt-1">
                                        <span className="flex items-center gap-1">
                                            <Users className="w-3 h-3" /> {squad.memberCount} Üye
                                        </span>
                                        <span className="flex items-center gap-1 text-emerald-500">
                                            <TrendingUp className="w-3 h-3" /> Aktif
                                        </span>
                                    </div>
                                </div>
                            </div>

                            <div className="text-right">
                                <div className="text-lg font-black text-primary flex items-center justify-end gap-1">
                                    {squad.points.toLocaleString('tr-TR')}
                                    <Sparkles className="w-4 h-4 text-amber-500" />
                                </div>
                                <p className="text-[10px] text-muted-foreground uppercase font-bold tracking-tighter">Toplam XP</p>
                            </div>
                        </m.div>
                    ))}
                </div>
            </CardContent>
        </Card>
    );
}
