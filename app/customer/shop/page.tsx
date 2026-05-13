import { getServerSession } from "next-auth";
import { authOptions } from '@/lib/auth';
import { redirect } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Store, Coins, Shirt, Award, Sparkles, Check, Lock } from "lucide-react";
import { prisma } from "@/lib/prisma";
import Image from "next/image";
import { ShopBuyButton } from "@/components/customer/shop-interactive";
import { t as translate, type Locale } from "@/i18n/request";
export default async function ShopPage() {
    const session = await getServerSession(authOptions);

    if (!session || session.user.role !== "CUSTOMER") {
        redirect("/auth/signin");
    }

    const userId = session.user.id;
    const locale: Locale = session.user.preferredLanguage === "en" ? "en" : "tr";
    const tr = (key: string) => translate(locale, key);

    // 1. Fetch user points
    const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { points: true }
    });

    const userPoints = user?.points || 0;

    // 2. Fetch all shop items
    const items = await prisma.cosmeticItem.findMany({
        orderBy: { price: 'asc' }
    });

    // 3. Fetch user's inventory
    const inventory = await prisma.userCosmetic.findMany({
        where: { userId }
    });

    // 4. Map ownership state
    const shopItems = items.map(item => {
        const owned = inventory.find(inv => inv.cosmeticId === item.id);
        return {
            ...item,
            isOwned: !!owned,
            isEquipped: owned?.isEquipped || false
        };
    });

    return (
        <div className="space-y-6">
            <div className="flex flex-col gap-4 rounded-2xl border border-border/60 bg-card/40 backdrop-blur-sm p-4 sm:p-6 shadow-sm md:flex-row md:justify-between md:items-end">
                <div className="min-w-0">
                    <h1 className="text-2xl sm:text-3xl font-bold tracking-tight flex items-center gap-2 text-balance">
                        <Store className="h-8 w-8 shrink-0 text-primary" /> {tr("customerShop.title")}
                    </h1>
                    <p className="text-muted-foreground mt-2 text-pretty leading-relaxed max-w-2xl">
                        {tr("customerShop.description")}
                    </p>
                </div>
                <div className="flex gap-2 shrink-0">
                    <div className="px-4 py-2 border border-amber-500/30 rounded-xl bg-amber-500/10 flex items-center gap-3">
                        <span className="text-xs text-amber-600 font-semibold uppercase tracking-wider">{tr("customerShop.currentBalance")}</span>
                        <span className="font-bold text-xl text-amber-500 flex items-center gap-1 tabular-nums">
                            {userPoints.toLocaleString(locale === "tr" ? "tr-TR" : "en-US")} <Coins className="w-5 h-5 shrink-0" />
                        </span>
                    </div>
                </div>
            </div>

            <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {shopItems.map((item) => (
                    <Card key={item.id} className={`relative overflow-hidden border-border/50 group transition-all duration-300 ${item.isOwned ? 'bg-primary/5 border-primary/20' : 'hover:border-primary/50 hover:shadow-lg'}`}>

                        {/* Item Image Area */}
                        <div className="aspect-square bg-muted/30 w-full relative flex items-center justify-center p-6 grayscale-0 group-hover:grayscale-0 transition-all">
                            {item.isEquipped && (
                                <Badge className="absolute top-3 left-3 bg-emerald-500 hover:bg-emerald-600">
                                    <Check className="w-3 h-3 mr-1" /> {tr("customerShop.equipped")}
                                </Badge>
                            )}
                            {item.type === 'avatar_frame' ? (
                                <div className={`w-32 h-32 rounded-full border-4 shadow-xl flex items-center justify-center relative overflow-hidden bg-background ${item.isOwned ? 'border-primary' : 'border-muted-foreground/30'}`}>
                                    <Shirt className={`w-12 h-12 ${item.isOwned ? 'text-primary/50' : 'text-muted-foreground/30'}`} />
                                    {/* Optional overlay simulation: <div className="absolute inset-0 border-4 border-amber-500 rounded-full" /> */}
                                </div>
                            ) : (
                                <div className={`w-28 h-28 transform group-hover:scale-110 transition-transform flex items-center justify-center ${item.isOwned ? 'text-amber-500 drop-shadow-lg scale-110' : 'text-muted-foreground/50 scale-100'}`}>
                                    <Award className="w-full h-full" />
                                </div>
                            )}

                            {!item.isOwned && userPoints < item.price && (
                                <div className="absolute inset-0 bg-background/60 backdrop-blur-[2px] flex flex-col items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                                    <Lock className="w-8 h-8 text-foreground/50 mb-2" />
                                    <span className="text-sm font-semibold text-foreground/80">{tr("customerShop.insufficientBalance")}</span>
                                </div>
                            )}
                        </div>

                        <CardContent className="p-5">
                            <div className="flex justify-between items-start mb-4">
                                <div>
                                    <p className="text-xs text-muted-foreground uppercase font-semibold">
                                        {item.type === 'avatar_frame' ? tr("customerShop.itemTypeFrame") : tr("customerShop.itemTypeBadge")}
                                    </p>
                                    <h3 className="font-bold text-lg leading-tight mt-1">{item.name}</h3>
                                </div>
                                {!item.isOwned && (
                                    <div className="text-right">
                                        <span className="font-bold text-amber-500 flex items-center gap-1"><Coins className="w-3.5 h-3.5" /> {item.price}</span>
                                    </div>
                                )}
                            </div>

                            <ShopBuyButton
                                itemId={item.id}
                                price={item.price}
                                userPoints={userPoints}
                                isOwned={item.isOwned}
                                isEquipped={item.isEquipped}
                                locale={locale}
                            />
                        </CardContent>
                    </Card>
                ))}

                {/* Seed prompt if no items exist */}
                {shopItems.length === 0 && (
                    <div className="col-span-full py-12 text-center border rounded-2xl bg-muted/10 border-dashed">
                        <Store className="w-12 h-12 text-muted-foreground mx-auto mb-3 opacity-50" />
                        <h3 className="text-lg font-bold">{tr("customerShop.emptyTitle")}</h3>
                        <p className="text-sm text-muted-foreground">{tr("customerShop.emptyDescription")}</p>
                    </div>
                )}
            </div>
        </div>
    );
}
