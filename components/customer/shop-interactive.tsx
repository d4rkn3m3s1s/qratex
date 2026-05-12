"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Sparkles, Check } from "lucide-react";
import { toast } from "sonner";
import { t as translate, type Locale } from "@/i18n/request";

export function ShopBuyButton({
    itemId,
    price,
    userPoints,
    isOwned,
    isEquipped,
    locale
}: {
    itemId: string,
    price: number,
    userPoints: number,
    isOwned: boolean,
    isEquipped: boolean,
    locale: Locale
}) {
    const tr = (key: string) => translate(locale, key);
    const router = useRouter();
    const [loading, setLoading] = useState(false);

    const handleBuy = async () => {
        if (userPoints < price) {
            toast.error(tr("customerShop.insufficientBalance"));
            return;
        }
        setLoading(true);
        try {
            const res = await fetch("/api/customer/shop", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ itemId }),
            });
            const data = await res.json();
            if (data.success) {
                toast.success(data.message || tr("customerShop.purchaseSuccess"));
                router.refresh();
            } else {
                toast.error(data.error || tr("common.error"));
            }
        } catch (error) {
            toast.error(tr("customerShop.connectionError"));
        } finally {
            setLoading(false);
        }
    };

    const handleEquip = async () => {
        setLoading(true);
        try {
            const res = await fetch(`/api/customer/shop/${itemId}/equip`, {
                method: "PATCH",
            });
            const data = await res.json();
            if (data.success) {
                toast.success(data.message || tr("customerShop.equipSuccess"));
                router.refresh();
            } else {
                toast.error(data.error || tr("common.error"));
            }
        } catch (error) {
            toast.error(tr("customerShop.connectionError"));
        } finally {
            setLoading(false);
        }
    };

    if (isEquipped) {
        return (
            <Button variant="secondary" className="w-full rounded-xl bg-background border shadow-sm h-10" onClick={handleEquip} disabled={loading}>
                {loading ? tr("customerShop.processing") : tr("customerShop.unequip")}
            </Button>
        );
    }

    if (isOwned) {
        return (
            <Button variant="default" className="w-full rounded-xl h-10 shadow-md shadow-primary/20" onClick={handleEquip} disabled={loading}>
                {loading ? tr("customerShop.processing") : tr("customerShop.equip")}
            </Button>
        );
    }

    return (
        <Button
            variant="outline"
            className={`w-full rounded-xl h-10 border-amber-500/50 text-amber-600 hover:bg-amber-50 hover:text-amber-700 ${userPoints < price ? 'opacity-50 cursor-not-allowed' : ''}`}
            disabled={userPoints < price || loading}
            onClick={handleBuy}
        >
            <Sparkles className="w-4 h-4 mr-2" /> {loading ? tr("customerShop.processing") : tr("customerShop.buy")}
        </Button>
    );
}
