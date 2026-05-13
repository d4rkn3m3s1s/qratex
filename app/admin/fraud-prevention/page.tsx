import { getServerSession } from "next-auth";
import { authOptions } from '@/lib/auth';
import { redirect } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle, ShieldAlert, ShieldCheck, UserX } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { BootstrapActionButton } from "@/components/admin/bootstrap-action-button";
import { AdminPremiumHero } from "@/components/admin/admin-premium-hero";

export default async function AdminFraudPreventionPage() {
    const session = await getServerSession(authOptions);

    if (!session || session.user.role !== "ADMIN") {
        redirect("/auth/signin");
    }

    // Fetch Suspicious Activities
    const recentActivities = await prisma.suspiciousActivity.findMany({
        orderBy: { createdAt: 'desc' },
        take: 50,
        include: {
            user: { select: { name: true, email: true, fraudStatus: true, fraudScore: true } },
            dealer: { select: { businessName: true } }
        }
    });

    const shadowBannedCount = await prisma.user.count({ where: { fraudStatus: 'shadow_ban' } });
    const flaggedCount = await prisma.user.count({ where: { fraudStatus: 'flagged' } });

    return (
        <div className="space-y-6">
            <AdminPremiumHero
                eyebrow="Güven"
                title="Sahtekarlık ve spam kalkanı"
                description="Kullanıcıların QR tarama hızlarını ve konum anormalliklerini takip eden AI tabanlı analiz motoru."
                icon={<ShieldAlert className="text-white" />}
                chips={
                    <div className="flex flex-wrap gap-2">
                        <BootstrapActionButton
                            action="seed_suspicious_activities"
                            label="Demo şüpheli aktivite üret"
                            reloadOnDone
                        />
                        <BootstrapActionButton
                            action="clear_suspicious_activities"
                            label="Demo veriyi sil"
                            variant="destructive"
                            reloadOnDone
                        />
                    </div>
                }
            />

            <div className="grid gap-4 md:grid-cols-3">
                <Card className="border-border/50">
                    <CardHeader className="pb-2 flex flex-row items-center justify-between">
                        <CardTitle className="text-sm font-medium">Gölge Banlı (Shadow Ban)</CardTitle>
                        <UserX className="w-4 h-4 text-red-500" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold text-red-500">{shadowBannedCount}</div>
                        <p className="text-xs text-muted-foreground">İşlemleri kaydedilmiyor</p>
                    </CardContent>
                </Card>

                <Card className="border-border/50">
                    <CardHeader className="pb-2 flex flex-row items-center justify-between">
                        <CardTitle className="text-sm font-medium">Şüpheli (Flagged)</CardTitle>
                        <AlertTriangle className="w-4 h-4 text-amber-500" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold text-amber-500">{flaggedCount}</div>
                        <p className="text-xs text-muted-foreground">İzlemeye alındı</p>
                    </CardContent>
                </Card>

                <Card className="border-border/50">
                    <CardHeader className="pb-2 flex flex-row items-center justify-between">
                        <CardTitle className="text-sm font-medium">Sistem Durumu</CardTitle>
                        <ShieldCheck className="w-4 h-4 text-emerald-500" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold text-emerald-500">Aktif</div>
                        <p className="text-xs text-muted-foreground">Hız limitleri devrede</p>
                    </CardContent>
                </Card>
            </div>

            <Card className="border-border/50">
                <CardHeader>
                    <CardTitle>Son Şüpheli Aktiviteler</CardTitle>
                    <CardDescription>Otomatik olarak tespit edilen anormallik kayıtları (Son 50 kayıt)</CardDescription>
                </CardHeader>
                <CardContent>
                    {recentActivities.length === 0 ? (
                        <div className="text-center p-8 bg-muted/20 border border-dashed rounded-xl">
                            <ShieldCheck className="w-10 h-10 text-emerald-500/50 mx-auto justify-center mb-3" />
                            <p className="text-foreground font-medium">Hiçbir şüpheli aktivite bulunamadı.</p>
                            <p className="text-muted-foreground text-sm">Sistem koruma altında.</p>
                            <div className="mt-4 flex flex-wrap justify-center gap-2">
                                <BootstrapActionButton
                                    action="seed_suspicious_activities"
                                    label="Demo şüpheli aktivite üret"
                                    reloadOnDone
                                />
                                <BootstrapActionButton
                                    action="clear_suspicious_activities"
                                    label="Demo veriyi sil"
                                    variant="destructive"
                                    reloadOnDone
                                />
                            </div>
                        </div>
                    ) : (
                        <div className="space-y-4">
                            {recentActivities.map((log) => (
                                <div key={log.id} className="flex flex-col sm:flex-row justify-between items-start sm:items-center p-3 rounded-xl border bg-card gap-3">
                                    <div className="flex items-center gap-3">
                                        <span className={`p-2 rounded-full ${log.severity === 'high' ? 'bg-red-500/10 text-red-500' : 'bg-amber-500/10 text-amber-500'}`}>
                                            <ShieldAlert className="w-4 h-4" />
                                        </span>
                                        <div>
                                            <p className="text-sm font-medium">{log.user?.name || 'Gizli Üye'} <span className="text-xs text-muted-foreground uppercase opacity-70">({log.user?.email || 'Bilinmiyor'})</span></p>
                                            <p className="text-xs text-muted-foreground">{log.description || 'Bilinmeyen Sebep'} - {log.dealer?.businessName || 'Bilinmeyen Bayi'}</p>
                                        </div>
                                    </div>
                                    <div className="flex flex-col text-right">
                                        <Badge variant="outline" className={log.user?.fraudStatus === 'shadow_ban' ? 'border-red-500/50 text-red-500' : 'border-amber-500/50 text-amber-500'}>
                                            {log.user?.fraudStatus === 'shadow_ban' ? 'GÖLGE BAN' : 'ŞÜPHELİ'}
                                        </Badge>
                                        <span className="text-xs text-muted-foreground mt-1">{new Date(log.createdAt).toLocaleString('tr-TR')}</span>
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
