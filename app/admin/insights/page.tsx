import { getServerSession } from "next-auth";
import { authOptions } from '@/lib/auth';
import { redirect } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { TrendingUp, Users, Target, Activity } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import { unstable_cache } from "next/cache";
import { BootstrapActionButton } from "@/components/admin/bootstrap-action-button";
import { AdminPremiumHero } from "@/components/admin/admin-premium-hero";

// Platform geneli (kullanıcıya özel değil) → 5 dk cache. Önceden 3 sıralı sorgu
// + her feedback/qr için dealers.find() (O(n²)) vardı; artık 2 toplu SQL groupBy.
const getAggregatedData = unstable_cache(
    async () => {
        const [ratingRows, scanRows] = await Promise.all([
            prisma.$queryRaw<Array<{ category: string; dealerCount: bigint; ratingSum: bigint | null; ratingN: bigint }>>(Prisma.sql`
                SELECT LOWER(u."businessCategory") AS category,
                       COUNT(DISTINCT u."id") AS "dealerCount",
                       SUM(f."rating") AS "ratingSum",
                       COUNT(f."id") AS "ratingN"
                FROM "User" u
                LEFT JOIN "QRCode" q ON q."dealerId" = u."id"
                LEFT JOIN "Feedback" f ON f."qrCodeId" = q."id" AND f."deletedAt" IS NULL
                WHERE u."role" = 'DEALER' AND u."businessCategory" IS NOT NULL
                GROUP BY LOWER(u."businessCategory")
            `),
            prisma.$queryRaw<Array<{ category: string; totalScans: bigint | null }>>(Prisma.sql`
                SELECT LOWER(u."businessCategory") AS category,
                       COALESCE(SUM(q."scanCount"), 0) AS "totalScans"
                FROM "User" u
                LEFT JOIN "QRCode" q ON q."dealerId" = u."id"
                WHERE u."role" = 'DEALER' AND u."businessCategory" IS NOT NULL
                GROUP BY LOWER(u."businessCategory")
            `),
        ]);

        const scanByCat = new Map(scanRows.map((r) => [r.category, Number(r.totalScans ?? 0)]));
        const rawStats = ratingRows.map((r) => {
            const ratingN = Number(r.ratingN ?? 0);
            return {
                category: r.category,
                dealerCount: Number(r.dealerCount ?? 0),
                avgRating: ratingN > 0 ? Number(r.ratingSum ?? 0) / ratingN : 0,
                totalScans: scanByCat.get(r.category) ?? 0,
            };
        });
        return rawStats.sort((a, b) => b.totalScans - a.totalScans);
    },
    ['admin-insights-categories'],
    { revalidate: 300, tags: ['admin-insights'] }
);

export default async function AdminInsightsPage() {
    const session = await getServerSession(authOptions);

    if (!session || session.user.role !== "ADMIN") {
        redirect("/auth/signin");
    }

    const stats = await getAggregatedData();

    return (
        <div className="space-y-6">
            <AdminPremiumHero
                eyebrow="Analitik"
                title="Sektörel karşılaştırma (global insights)"
                description="QRATEX sistemine kayıtlı tüm bayilerin (anonimleştirilmiş) sektör bazlı performans analizleri. Bu verileri bayilere içgörü veya ekstra abonelik paketi olarak sunabilirsiniz."
                icon={<TrendingUp className="text-white" />}
                chips={
                    <div className="flex flex-wrap gap-2">
                        <BootstrapActionButton action="seed_insights_categories" label="Demo sektör verisi üret" reloadOnDone />
                        <BootstrapActionButton action="clear_insights_categories" label="Demo veriyi sil" variant="destructive" reloadOnDone />
                    </div>
                }
            />

            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {stats.map((stat) => (
                    <Card key={stat.category} className="overflow-hidden border-border/50">
                        <div className="h-2 w-full bg-gradient-to-r from-primary to-primary/80" />
                        <CardHeader className="pb-2">
                            <div className="flex justify-between items-start">
                                <div>
                                    <CardTitle className="capitalize text-xl">{stat.category}</CardTitle>
                                    <CardDescription>Sektör Benchmark Özeti</CardDescription>
                                </div>
                                <Badge variant="secondary" className="px-2 py-1 flex gap-1">
                                    <Users className="w-3 h-3" /> {stat.dealerCount} Bayi
                                </Badge>
                            </div>
                        </CardHeader>
                        <CardContent>
                            <div className="grid grid-cols-2 gap-4 mt-4">
                                <div className="bg-muted p-3 rounded-xl border border-border/50 flex flex-col items-center justify-center text-center">
                                    <Activity className="w-5 h-5 text-amber-500 mb-1" />
                                    <span className="text-2xl font-bold">{stat.avgRating.toFixed(1)}</span>
                                    <span className="text-xs text-muted-foreground uppercase font-semibold">Ort. Puan</span>
                                </div>
                                <div className="bg-muted p-3 rounded-xl border border-border/50 flex flex-col items-center justify-center text-center">
                                    <TrendingUp className="w-5 h-5 text-emerald-500 mb-1" />
                                    <span className="text-2xl font-bold">{(stat.totalScans / 1000).toFixed(1)}k</span>
                                    <span className="text-xs text-muted-foreground uppercase font-semibold">Tarama</span>
                                </div>
                            </div>
                        </CardContent>
                    </Card>
                ))}

                <Card className="border-dashed border-2 flex items-center justify-center bg-muted/30 min-h-[220px]">
                    <div className="text-center p-6 max-w-xs">
                        <Target className="w-10 h-10 text-muted-foreground mx-auto mb-3 opacity-50" />
                        {stats.length > 0 ? (
                            <>
                                <p className="font-semibold">Odak önerisi</p>
                                <p className="text-xs text-muted-foreground mt-1">
                                    {stats[stats.length - 1]?.category} kategorisinde puan/etkileşim düşük. Bu sektör için
                                    hedefli playbook ve kampanya tanımlayın.
                                </p>
                            </>
                        ) : (
                            <>
                                <p className="font-semibold text-muted-foreground">Henüz sektör verisi yok</p>
                                <p className="text-xs text-muted-foreground mt-1">
                                    Bayiler kategori bilgisi ile kayıt oldukça içgörü kartları dolacaktır.
                                </p>
                                <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
                                    <BootstrapActionButton
                                        action="seed_insights_categories"
                                        label="Demo sektör verisi üret"
                                        reloadOnDone
                                    />
                                    <BootstrapActionButton
                                        action="clear_insights_categories"
                                        label="Demo veriyi sil"
                                        variant="destructive"
                                        reloadOnDone
                                    />
                                </div>
                            </>
                        )}
                    </div>
                </Card>
            </div>
        </div>
    );
}
