import { getServerSession } from "next-auth";
import { authOptions } from '@/lib/auth';
import { redirect } from "next/navigation";
import { Store, Coins, Sparkles } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { ShopClient } from "./shop-client";
import { t as translate, type Locale } from "@/i18n/request";

export default async function ShopPage() {
    const session = await getServerSession(authOptions);

    if (!session || session.user.role !== "CUSTOMER") {
        redirect("/auth/login");
    }

    const userSession = session.user as any;
    const userId = userSession.id;
    const locale: Locale = userSession.preferredLanguage === "en" ? "en" : "tr";
    const tr = (key: string) => translate(locale, key);

    // 1. Fetch user points
    const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { points: true }
    });

    const userPoints = user?.points || 0;

    // 2. Fetch all shop items
    const items = await prisma.cosmeticItem.findMany({
        where: { isActive: true },
        orderBy: [{ rarity: 'desc' }, { createdAt: 'desc' }],
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
        <div className="space-y-8 pb-10">
            {/* Minimalist Header */}
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-end gap-6 border-b border-border/50 pb-6">
                <div>
                    <h1 className="text-2xl font-semibold tracking-tight text-foreground flex items-center gap-2">
                        <Store className="h-6 w-6 text-muted-foreground" />
                        {tr("customerShop.title")}
                    </h1>
                    <p className="text-sm text-muted-foreground mt-1 max-w-lg">
                        {tr("customerShop.description")}
                    </p>
                </div>
                
                <div className="shrink-0 flex items-center gap-3 bg-secondary/30 px-4 py-2.5 rounded-xl border border-border/40">
                    <div className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                        {tr("customerShop.currentBalance")}
                    </div>
                    <div className="h-4 w-[1px] bg-border" />
                    <div className="font-semibold text-lg text-amber-500 flex items-center gap-1.5 tabular-nums">
                        {userPoints.toLocaleString(locale === "tr" ? "tr-TR" : "en-US")} 
                        <Coins className="w-4 h-4" />
                    </div>
                </div>
            </div>

            {/* Items Grid */}
            <ShopClient 
                items={shopItems}
                userPoints={userPoints}
                userImage={session.user.image || null}
                userName={session.user.name || null}
                locale={locale}
            />
        </div>
    );
}
