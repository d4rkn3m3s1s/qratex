import { getServerSession } from "next-auth";
import { authOptions } from '@/lib/auth';
import { redirect } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Radar, Users, Gift, Megaphone, Clock, Star } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import { RadarBulkCampaignButton, RadarSingleOfferButton } from "@/components/dealer/radar-interactive";
import { DealerRadarScope, type RadarScopeContact } from "@/components/dealer/dealer-radar-scope";
import { t, type Locale } from "@/i18n/request";

export default async function DealerWinBackPage() {
    const session = await getServerSession(authOptions);

    if (!session || session.user.role !== "DEALER") {
        redirect("/auth/login");
    }

    const locale: Locale =
        (session.user as { preferredLanguage?: string }).preferredLanguage === "en" ? "en" : "tr";
    const dealerId = session.user.id;

    // Raw query logic for demo (usually would be the API logic abstracted)
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    // Önceden bu bayinin TÜM consumption'ları belleğe çekiliyordu. Artık SQL'de
    // müşteri başına son ziyaret + ortalama harcama hesaplanıp HAVING ile yalnızca
    // 30 günden uzun süredir gelmeyen ("uyuyan") müşteriler döner.
    // [dealerId, createdAt] index'inden yararlanır.
    const sleepingRows = await prisma.$queryRaw<Array<{ customerId: string; lastVisit: Date; avgSpend: number | null }>>(
        Prisma.sql`
            SELECT c."customerId",
                   MAX(c."createdAt") AS "lastVisit",
                   AVG(c."amount") FILTER (WHERE c."amount" IS NOT NULL) AS "avgSpend"
            FROM "Consumption" c
            WHERE c."dealerId" = ${dealerId}
            GROUP BY c."customerId"
            HAVING MAX(c."createdAt") < ${thirtyDaysAgo}
            ORDER BY MAX(c."createdAt") ASC
            LIMIT 500
        `
    );

    const metaByCustomer = new Map(sleepingRows.map((r) => [r.customerId, r]));
    const sleepingIds = sleepingRows.map((r) => r.customerId);

    const sleepingUsers = sleepingIds.length === 0 ? [] : await prisma.user.findMany({
        where: { id: { in: sleepingIds } },
        select: { id: true, name: true, email: true, image: true }
    });

    const radarData = sleepingUsers.map(u => {
        const meta = metaByCustomer.get(u.id);
        return {
            ...u,
            lastVisit: meta?.lastVisit ?? new Date(),
            avgSpend: meta?.avgSpend != null ? Number(meta.avgSpend) : null,
        };
    });

    const radarScopeContacts: RadarScopeContact[] = radarData.map((u) => ({
        id: u.id,
        name: u.name,
        email: u.email,
        image: u.image,
        lastVisitIso: u.lastVisit.toISOString(),
    }));

    // Tahmini geri kazanım geliri = uyuyan müşterilerin GERÇEK ortalama
    // harcamalarının toplamı (sabit varsayım değil, geçmiş veriye dayalı).
    const potentialRevenue = Math.round(
        radarData.reduce((sum, r) => sum + (r.avgSpend ?? 0), 0)
    );

    return (
        <div className="space-y-6">
            <div className="flex flex-col md:flex-row gap-4 justify-between md:items-center rounded-2xl border border-border/60 bg-card/40 backdrop-blur-sm p-4 sm:p-6 shadow-sm">
                <div className="min-w-0">
                    <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-balance">{t(locale, "dealerRadar.title")}</h1>
                    <p className="text-muted-foreground mt-2 max-w-2xl text-pretty leading-relaxed">
                        {t(locale, "dealerRadar.description")}
                    </p>
                </div>
                <div className="flex items-center gap-3">
                    <Badge variant="outline" className="h-8 bg-blue-500/10 text-blue-500 border-blue-500/50 flex gap-2">
                        <Radar className="w-4 h-4 animate-pulse" /> {t(locale, "dealerRadar.badgeActive")}
                    </Badge>
                </div>
            </div>

            <div className="grid gap-4 md:grid-cols-3">
                <Card className="border-border/50 bg-gradient-to-br from-background to-blue-500/5">
                    <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-medium text-muted-foreground">{t(locale, "dealerRadar.cardSleepingTitle")}</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="flex items-center gap-4">
                            <div className="p-3 bg-blue-500/20 rounded-xl">
                                <Users className="w-8 h-8 text-blue-500" />
                            </div>
                            <div>
                                <div className="text-3xl font-bold">{radarData.length}</div>
                                <p className="text-xs text-muted-foreground mt-1">{t(locale, "dealerRadar.cardSleepingSub")}</p>
                            </div>
                        </div>
                    </CardContent>
                </Card>

                <Card className="border-border/50">
                    <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-medium text-muted-foreground">{t(locale, "dealerRadar.cardRevenueTitle")}</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="flex items-center gap-4">
                            <div className="p-3 bg-emerald-500/20 rounded-xl">
                                <div className="w-8 h-8 text-emerald-500 flex items-center justify-center font-bold text-xl">₺</div>
                            </div>
                            <div>
                                <div className="text-3xl font-bold">~{potentialRevenue} ₺</div>
                                <p className="text-xs text-muted-foreground mt-1">{t(locale, "dealerRadar.cardRevenueSub")}</p>
                            </div>
                        </div>
                    </CardContent>
                </Card>

                <Card className="border-border/50 border-primary/20 shadow-sm relative overflow-hidden group">
                    <div className="absolute inset-0 bg-primary/5 sm:bg-transparent -z-10 transition-colors group-hover:bg-primary/5" />
                    <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-medium text-primary flex items-center gap-2">
                            <Megaphone className="w-4 h-4" /> {t(locale, "dealerRadar.cardCampaignTitle")}
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <p className="text-sm text-foreground mb-3">{t(locale, "dealerRadar.cardCampaignBody")}</p>
                        <RadarBulkCampaignButton userIds={sleepingIds} disabled={radarData.length === 0} />
                    </CardContent>
                </Card>
            </div>

            <DealerRadarScope contacts={radarScopeContacts} />

            <Card className="border-border/50">
                <CardHeader>
                    <CardTitle>{t(locale, "dealerRadar.listTitle")}</CardTitle>
                    <CardDescription>{t(locale, "dealerRadar.listDescription")}</CardDescription>
                </CardHeader>
                <CardContent>
                    {radarData.length === 0 ? (
                        <div className="text-center p-8 bg-muted/20 border border-dashed rounded-xl flex flex-col items-center">
                            <div className="w-16 h-16 rounded-full bg-blue-500/10 flex items-center justify-center mb-4">
                                <Star className="w-8 h-8 text-blue-500" />
                            </div>
                            <p className="text-foreground font-medium text-lg">{t(locale, "dealerRadar.emptyTitle")}</p>
                            <p className="text-muted-foreground text-sm max-w-sm mt-1">{t(locale, "dealerRadar.emptyDescription")}</p>
                        </div>
                    ) : (
                        <div className="space-y-3">
                            {radarData.map(user => (
                                <div key={user.id} className="flex flex-col sm:flex-row justify-between items-start sm:items-center p-4 rounded-xl border bg-card gap-3 hover:border-primary/20 transition-colors">
                                    <div className="flex items-center gap-3">
                                        {user.image ? (
                                            // eslint-disable-next-line @next/next/no-img-element
                                            <img
                                                src={user.image}
                                                alt=""
                                                className="w-10 h-10 rounded-full object-cover ring-2 ring-primary/20"
                                                referrerPolicy="no-referrer"
                                            />
                                        ) : (
                                        <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold">
                                            {user.name?.charAt(0) || t(locale, "dealerRadar.avatarFallbackLetter").charAt(0)}
                                        </div>
                                        )}
                                        <div>
                                            <p className="font-semibold">{user.name || t(locale, "dealerRadar.anonymousCustomer")}</p>
                                            <p className="text-xs text-muted-foreground">{user.email}</p>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-4 text-sm text-right">
                                        <div className="flex flex-col items-end">
                                            <p className="text-muted-foreground text-xs flex items-center gap-1"><Clock className="w-3 h-3" /> {t(locale, "dealerRadar.lastVisitLabel")}</p>
                                            <span className="font-medium text-blue-500">{t(locale, "dealerRadar.daysAgo").replace("{days}", String(Math.floor((new Date().getTime() - user.lastVisit.getTime()) / (1000 * 3600 * 24))))}</span>
                                        </div>
                                        <RadarSingleOfferButton
                                            userId={user.id}
                                            customerLabel={user.name || t(locale, "dealerRadar.anonymousCustomer")}
                                        />
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </CardContent>
            </Card>
        </div>
    );
}
