import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { redirect } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Users, Swords, Trophy, Sparkles, Plus, Copy } from "lucide-react";
import { prisma } from "@/lib/prisma";
import Image from "next/image";
import { SquadIntroCards, SquadLeaveButton } from "@/components/customer/squad-interactive";
import { SquadWeeklyGoalBar } from "@/components/customer/squad-weekly-goal";
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
                    owner: { select: { id: true, name: true } }
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

    return (
        <div className="space-y-6">
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
                <Card className="col-span-12 lg:col-span-8 border-border/50">
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
                                            <p className="font-semibold text-sm flex items-center gap-2">
                                                {m.user.name} {m.user.id === session.user.id && <Badge className="h-5 text-[10px]">Sen</Badge>}
                                                {m.user.id === squad.ownerId && <Badge variant="outline" className="h-5 text-[10px] border-amber-500/50 text-amber-500">Kurucu</Badge>}
                                            </p>
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

                {/* Activity / Info */}
                <div className="col-span-12 lg:col-span-4 space-y-4">
                    <Card className="border-border/50 bg-gradient-to-br from-amber-500/10 to-orange-500/5">
                        <CardHeader className="pb-2">
                            <CardTitle className="text-lg">Klan Sandığı</CardTitle>
                            <CardDescription>Ortak havuzda biriken puanlar (Yakında)</CardDescription>
                        </CardHeader>
                        <CardContent>
                            <div className="text-4xl font-black text-amber-500 flex items-center gap-2">
                                {squad.totalPoints.toLocaleString('tr-TR')} <span className="text-xl">XP</span>
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
