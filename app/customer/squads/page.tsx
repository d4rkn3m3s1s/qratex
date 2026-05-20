import { getServerSession } from "next-auth";
import { authOptions } from '@/lib/auth';
import { redirect } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Users, Swords, Trophy, Sparkles, Plus, Copy, TrendingUp } from "lucide-react";
import { prisma } from "@/lib/prisma";
import Image from "next/image";
import { SquadIntroCards, SquadLeaveButton } from "@/components/customer/squad-interactive";
import { SquadWeeklyGoalBar } from "@/components/customer/squad-weekly-goal";
import { SquadLeaderboard } from "@/components/customer/squad-leaderboard";
export default async function SquadsPage() {
    const session = await getServerSession(authOptions);

    if (!session || session.user.role !== "CUSTOMER") {
        redirect("/auth/signin");
    }

    // Fetch the user's squad
    const member = await prisma.squadMember.findFirst({
        where: { userId: session.user.id },
        include: {
            squad: {
                include: {
                    members: {
                        include: {
                            user: { select: { id: true, name: true, image: true, points: true } }
                        }
                    },
                    owner: { select: { id: true, name: true } },
                    battlesAsSquad1: {
                        where: { status: 'active' },
                        include: { squad2: true }
                    },
                    battlesAsSquad2: {
                        where: { status: 'active' },
                        include: { squad1: true }
                    }
                }
            }
        }
    });

    const squad = member?.squad;

    // Render "No Squad" empty state
    if (!squad) {
        return (
            <div className="space-y-6 max-w-2xl mx-auto pt-8">
                <div className="text-center space-y-4 mb-8 rounded-2xl border border-border/60 bg-card/40 backdrop-blur-sm p-6 sm:p-8 shadow-sm">
                    <div className="w-20 h-20 bg-primary/10 rounded-full flex items-center justify-center mx-auto text-primary">
                        <Swords className="w-10 h-10 shrink-0" />
                    </div>
                    <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-balance">Klan&apos;a Katıl</h1>
                    <p className="text-muted-foreground max-w-md mx-auto text-pretty leading-relaxed">
                        Arkadaşlarınla bir araya gel, mekanlarda QR okuttukça <b>%5 ekstra Pasif Puan</b> kazan!
                    </p>
                </div>
                <SquadIntroCards />
            </div>
        );
    }

    // Sorted members by points
    const sortedMembers = [...squad.members].sort((a, b) => (b.user.points || 0) - (a.user.points || 0));

    // Fetch all squads for leaderboard
    const allSquads = await prisma.squad.findMany({
        take: 10,
        orderBy: { totalPoints: 'desc' },
        include: {
            _count: { select: { members: true } }
        }
    });

    const squadRanks = allSquads.map(s => ({
        id: s.id,
        name: s.name,
        points: s.totalPoints,
        level: Math.floor(Math.sqrt(s.totalPoints / 100)) + 1,
        memberCount: s._count.members,
    }));

    // Check for active battle
    const activeBattle1 = squad.battlesAsSquad1[0] ?? null;
    const activeBattle2 = squad.battlesAsSquad2[0] ?? null;
    const activeBattle = activeBattle1 || activeBattle2 || null;

    let opponent = null;
    if (activeBattle1) {
        opponent = activeBattle1.squad2;
    } else if (activeBattle2) {
        opponent = activeBattle2.squad1;
    }

    return (
        <div className="space-y-8">
            {activeBattle && opponent && (
                <div className="rounded-2xl border border-amber-500/30 bg-gradient-to-r from-amber-500/10 via-orange-500/5 to-transparent p-6 shadow-sm relative overflow-hidden">
                    <div className="absolute -right-4 -top-4 opacity-10">
                        <Swords className="w-32 h-32 text-amber-500" />
                    </div>
                    <div className="relative z-10 flex flex-col md:flex-row items-center justify-between gap-6">
                        <div>
                            <Badge className="bg-amber-500 text-white mb-2 shadow-sm border-0 animate-pulse">AKTİF SAVAŞ</Badge>
                            <h2 className="text-xl sm:text-2xl font-black tracking-tight text-balance">
                                {squad.name} <span className="text-muted-foreground font-medium mx-2 italic">VS</span> {opponent.name}
                            </h2>
                            <p className="text-sm text-muted-foreground mt-1">Klanınız savaşıyor! En çok puanı toplayan ödül havuzunu kazanır.</p>
                        </div>
                        <div className="shrink-0 text-center bg-card border border-border/50 rounded-xl p-4 min-w-[150px]">
                            <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-1">Ödül Havuzu</p>
                            <p className="text-3xl font-black text-amber-500 drop-shadow-sm">{activeBattle.rewardPool}</p>
                            <p className="text-xs font-semibold mt-0.5 text-muted-foreground">Puan + XP</p>
                        </div>
                    </div>
                </div>
            )}

            <div className="flex flex-col gap-4 rounded-2xl border border-border/60 bg-card/40 backdrop-blur-sm p-4 sm:p-6 shadow-sm md:flex-row md:justify-between md:items-end">
                <div className="min-w-0">
                    <Badge variant="outline" className="mb-2 bg-primary/10 text-primary border-primary/20">
                        {squad.members.length} / 10 Üye
                    </Badge>
                    <h1 className="text-2xl sm:text-3xl font-bold tracking-tight flex items-center gap-2 text-balance">
                        <Swords className="w-8 h-8 shrink-0 text-primary" /> {squad.name}
                    </h1>
                    <p className="text-muted-foreground mt-2 flex flex-wrap items-center gap-1.5 text-pretty leading-relaxed">
                        <Sparkles className="w-4 h-4 shrink-0 text-amber-500" /> Klan üyelerinin kazandığı puanların <b>%5'i</b> ortak havuza veya diğer üyelere yansır!
                    </p>
                </div>
                <div className="flex flex-wrap gap-2 shrink-0">
                    <div className="px-4 py-2 border border-border/60 rounded-xl bg-card flex items-center gap-3">
                        <span className="text-xs text-muted-foreground uppercase font-semibold tracking-wider">Davet Kodu</span>
                        <span className="font-mono font-bold text-lg select-all">{squad.inviteCode}</span>
                    </div>
                    <SquadLeaveButton squadId={squad.id} />
                </div>
            </div>

            <SquadWeeklyGoalBar squadId={squad.id} />

            <div className="grid gap-6 md:grid-cols-12">
                {/* Members List */}
                <div className="col-span-12 lg:col-span-8 space-y-6">
                    <Card className="border-border/50">
                        <CardHeader>
                            <CardTitle>Klan Lider Tablosu</CardTitle>
                            <CardDescription>Klan içi rekabet ve katkı sağlayanlar</CardDescription>
                        </CardHeader>
                        <CardContent>
                            <div className="space-y-1">
                                {sortedMembers.map((m, idx) => (
                                    <div key={m.id} className={`flex items-center justify-between p-3 rounded-xl transition-colors ${m.user.id === session.user.id ? 'bg-primary/5 border border-primary/20' : 'hover:bg-muted/50'}`}>
                                        <div className="flex items-center gap-3">
                                            <div className="w-8 text-center font-bold text-muted-foreground">
                                                {idx === 0 ? <Trophy className="w-5 h-5 mx-auto text-amber-500" /> : `#${idx + 1}`}
                                            </div>
                                            <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center overflow-hidden shrink-0">
                                                {m.user.image ? (
                                                    <Image src={m.user.image} alt={m.user.name || ''} width={40} height={40} />
                                                ) : (
                                                    <span className="text-primary font-bold">{m.user.name?.charAt(0)}</span>
                                                )}
                                            </div>
                                            <div>
                                                <div className="font-semibold text-sm flex items-center gap-2">
                                                    {m.user.name} {m.user.id === session.user.id && <Badge className="h-5 text-[10px]">Sen</Badge>}
                                                    {m.user.id === squad.ownerId && <Badge variant="outline" className="h-5 text-[10px] border-amber-500/50 text-amber-500">Kurucu</Badge>}
                                                </div>
                                            </div>
                                        </div>
                                        <div className="text-right">
                                            <p className="font-bold text-sm">{m.user.points?.toLocaleString('tr-TR')} XP</p>
                                            <p className="text-[10px] text-emerald-500 flex items-center gap-1 justify-end"><Sparkles className="w-3 h-3" /> +{Math.floor((m.user.points || 0) * 0.05)} Katkı</p>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </CardContent>
                    </Card>

                    <SquadLeaderboard squads={squadRanks} />
                </div>

                {/* Activity / Info */}
                <div className="col-span-12 lg:col-span-4 space-y-4">
                    <Card className="border-border/50 bg-gradient-to-br from-amber-500/10 to-orange-500/5 shadow-inner">
                        <CardHeader className="pb-2">
                            <CardTitle className="text-lg flex items-center gap-2">
                                <TrendingUp className="w-5 h-5 text-amber-500" />
                                Klan Sandığı
                            </CardTitle>
                            <CardDescription>Ortak havuzda biriken puanlar</CardDescription>
                        </CardHeader>
                        <CardContent>
                            <div className="text-4xl font-black text-amber-500 flex items-center gap-2">
                                {squad.treasuryPoints?.toLocaleString('tr-TR') || 0} <span className="text-xl">XP</span>
                            </div>
                            <div className="mt-4 p-3 rounded-lg bg-background/50 border border-border/50 text-xs text-muted-foreground italic">
                                Ay sonunda bu puanlar aktif üyeler arasında paylaştırılacaktır.
                            </div>
                        </CardContent>
                    </Card>

                    <Card className="border-border/50">
                        <CardHeader>
                            <CardTitle className="text-sm">Nasıl Çalışır?</CardTitle>
                        </CardHeader>
                        <CardContent className="text-sm text-muted-foreground space-y-2">
                            <p>Klanınızdaki herhangi bir üye QR okutarak Puan veya XP kazandığında, sistem <b>ekstra %5'lik bir bonus üretip</b> klan sandığına ekler.</p>
                            <p>Bu sandık ay sonunda aktif üyelereeşit olarak dağıtılır.</p>
                        </CardContent>
                    </Card>
                </div>
            </div>
        </div>
    );
}
