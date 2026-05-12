import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { redirect } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { TrendingUp, Users, Target, Activity } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { BootstrapActionButton } from "@/components/admin/bootstrap-action-button";
import { AdminPremiumHero } from "@/components/admin/admin-premium-hero";

async function getAggregatedData() {
    // 1. Get dealers with categories
    const dealers = await prisma.user.findMany({
        where: { role: 'DEALER', businessCategory: { not: null } },
        select: { id: true, businessCategory: true }
    });

    const categoryMap = new Map<string, { dealerCount: number; totalRating: number; ratingCount: number; totalScans: number }>();

    // Initialize categories
    for (const dealer of dealers) {
        const cat = dealer.businessCategory?.toLowerCase() || 'other';
        if (!categoryMap.has(cat)) {
            categoryMap.set(cat, { dealerCount: 0, totalRating: 0, ratingCount: 0, totalScans: 0 });
        }
        categoryMap.get(cat)!.dealerCount++;
    }

    // 2. Aggregate feedbacks (average rating)
    const feedbacks = await prisma.feedback.findMany({
        where: { qrCode: { dealerId: { in: dealers.map(d => d.id) } } },
        select: { rating: true, qrCode: { select: { dealerId: true } } }
    });

    for (const fb of feedbacks) {
        const dealer = dealers.find(d => d.id === fb.qrCode.dealerId);
        if (dealer && dealer.businessCategory) {
            const cat = dealer.businessCategory.toLowerCase();
            const stats = categoryMap.get(cat)!;
            stats.totalRating += fb.rating;
            stats.ratingCount++;
        }
    }

    // 3. Aggregate scans
    const qrCodes = await prisma.qRCode.findMany({
        where: { dealerId: { in: dealers.map(d => d.id) } },
        select: { scanCount: true, dealerId: true }
    });

    for (const qr of qrCodes) {
        const dealer = dealers.find(d => d.id === qr.dealerId);
        if (dealer && dealer.businessCategory) {
            const cat = dealer.businessCategory.toLowerCase();
            categoryMap.get(cat)!.totalScans += qr.scanCount;
        }
    }

    const rawStats = Array.from(categoryMap.entries()).map(([category, stats]) => ({
        category,
        dealerCount: stats.dealerCount,
        avgRating: stats.ratingCount > 0 ? stats.totalRating / stats.ratingCount : 0,
        totalScans: stats.totalScans
    }));

    return rawStats.sort((a, b) => b.totalScans - a.totalScans); // Sort by popularity
}

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
