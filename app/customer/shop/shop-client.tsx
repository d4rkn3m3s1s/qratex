'use client';

import { useState } from "react";
import { useAppT } from "@/lib/app-locale";
import { Coins, Check, Lock, Sparkles, User2, Zap, Gift, Search, Loader2 } from "lucide-react";
import Image from "next/image";
import { ShopBuyButton } from "@/components/customer/shop-interactive";
import { cn } from "@/lib/utils";
import { UserAvatarFrame, DiamondBadge, RubyBadge } from "@/components/ui/avatar-frame";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { toast } from "sonner";
import { useRouter } from "next/navigation";

type ShopItem = {
    id: string;
    name: string;
    description: string | null;
    price: number;
    type: string;
    rarity: string;
    imageUrl: string | null;
    isActive: boolean;
    createdAt: Date;
    isOwned: boolean;
    isEquipped: boolean;
};

interface ShopClientProps {
    items: ShopItem[];
    userPoints: number;
    userImage: string | null;
    userName: string | null;
    locale: string;
}

export function ShopClient({ items, userPoints, userImage, userName, locale }: ShopClientProps) {
    const tr = useAppT();
    const router = useRouter();
    
    // Filters and search states
    const [activeCategory, setActiveCategory] = useState<'all' | 'avatar_frame' | 'profile_badge' | 'profile_background'>('all');
    
    // Gifting Modal states
    const [giftItem, setGiftItem] = useState<ShopItem | null>(null);
    const [recipient, setRecipient] = useState('');
    const [giftMessage, setGiftMessage] = useState('');
    const [isGifting, setIsGifting] = useState(false);

    const filteredItems = items.filter(item => {
        if (activeCategory === 'all') return true;
        return item.type === activeCategory;
    });

    const handleSendGift = async () => {
        if (!giftItem) return;
        if (!recipient.trim()) {
            toast.error("Lütfen alıcı e-posta adresini veya kullanıcı adını girin.");
            return;
        }

        setIsGifting(true);
        try {
            const res = await fetch("/api/customer/shop/gift", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    cosmeticId: giftItem.id,
                    recipientIdentifier: recipient.trim(),
                    message: giftMessage.trim()
                })
            });

            const data = await res.json();
            if (data.success) {
                toast.success(data.message || "Hediye başarıyla gönderildi!");
                setGiftItem(null);
                setRecipient('');
                setGiftMessage('');
                router.refresh();
            } else {
                toast.error(data.error || "Hediye gönderilemedi.");
            }
        } catch (error) {
            toast.error("Bağlantı hatası oluştu.");
        } finally {
            setIsGifting(false);
        }
    };

    const UserAvatar = () => (
        userImage ? (
            <Image src={userImage} alt="User" fill className="object-cover" unoptimized />
        ) : (
            <User2 className="w-1/2 h-1/2 text-muted-foreground/50" />
        )
    );

    return (
        <div className="space-y-6">
            {/* Category Filter Tabs */}
            <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-none">
                {[
                    { id: 'all', label: tr('customerShop.all') || 'Tümü' },
                    { id: 'avatar_frame', label: tr('customerShop.itemTypeFrame') || 'Çerçeveler' },
                    { id: 'profile_badge', label: tr('customerShop.itemTypeBadge') || 'Rozetler' },
                    { id: 'profile_background', label: tr('customerShop.itemTypeBackground') || 'Arka Planlar' },
                ].map((tab) => (
                    <button
                        key={tab.id}
                        onClick={() => setActiveCategory(tab.id as any)}
                        className={cn(
                            "px-4 py-2 rounded-full text-xs font-bold transition-all duration-200 border whitespace-nowrap",
                            activeCategory === tab.id
                                ? "bg-primary text-primary-foreground border-primary shadow-md"
                                : "bg-card/25 border-white/[0.08] hover:border-white/20 hover:bg-card/40 text-muted-foreground"
                        )}
                    >
                        {tab.label}
                    </button>
                ))}
            </div>

            {/* Shop Grid */}
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-5">
                {filteredItems.map((item) => {
                    const isLegendary = item.rarity === 'legendary';
                    const isFrame = item.type === 'avatar_frame';
                    const isBackground = item.type === 'profile_background';
                    const isAnimated = item.name.toLocaleLowerCase().includes('animasyon') || isLegendary;

                    return (
                        <div 
                            key={item.id} 
                            className={cn(
                                "group flex flex-col relative overflow-hidden rounded-[2rem] border transition-all duration-300",
                                item.isOwned 
                                    ? "bg-primary/[0.03] border-primary/20" 
                                    : "bg-card/20 border-white/[0.08] hover:border-white/20 hover:bg-card/40"
                            )}
                        >
                            {/* Upper Visual Area */}
                            <div className="relative aspect-square w-full flex items-center justify-center p-6 bg-gradient-to-b from-white/[0.03] to-transparent overflow-hidden">
                                
                                {/* Background class preview if type is background */}
                                {isBackground && item.imageUrl && (
                                    <div className={cn("absolute inset-0 z-0", item.imageUrl)} />
                                )}

                                {/* Badges */}
                                <div className="absolute top-4 left-4 right-4 flex justify-between items-start z-20">
                                    <span className={cn(
                                        "text-[9px] uppercase tracking-widest font-black px-2.5 py-1 rounded-full border backdrop-blur-md",
                                        isLegendary 
                                            ? "bg-amber-500/10 text-amber-500 border-amber-500/20" 
                                            : "bg-black/30 text-muted-foreground border-white/10"
                                    )}>
                                        {isFrame ? tr("customerShop.itemTypeFrame")
                                          : isBackground ? tr("customerShop.itemTypeBackground") || "Arka Plan"
                                          : tr("customerShop.itemTypeBadge")}
                                    </span>

                                    {item.isEquipped && (
                                        <span className="bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 p-1.5 rounded-full shadow-[0_0_10px_rgba(16,185,129,0.3)]">
                                            <Check className="w-3.5 h-3.5" strokeWidth={3} />
                                        </span>
                                    )}
                                </div>

                                {/* Item Visual */}
                                <div className="relative z-10 w-full h-full flex items-center justify-center mt-4">
                                    {isFrame ? (
                                        /* Small Avatar Frame Preview */
                                        <div className="relative w-24 h-24 sm:w-28 sm:h-28 group-hover:scale-110 transition-transform duration-500">
                                            <UserAvatarFrame frameId={item.imageUrl}>
                                                <UserAvatar />
                                            </UserAvatarFrame>
                                        </div>
                                    ) : isBackground ? (
                                        /* Small Profile Background Card Preview */
                                        <div className="relative w-32 h-20 rounded-lg border border-white/20 shadow-xl overflow-hidden bg-card/60 backdrop-blur-sm flex flex-col items-center justify-center p-2 group-hover:scale-110 transition-transform duration-500">
                                            <div className="w-8 h-8 rounded-full bg-slate-700/60 border border-white/10 flex items-center justify-center text-[10px] font-bold">
                                                {userName ? userName.slice(0, 2).toUpperCase() : 'U'}
                                            </div>
                                            <span className="text-[9px] text-muted-foreground mt-1.5 font-bold uppercase tracking-wider">Kart Teması</span>
                                        </div>
                                    ) : (
                                        /* Normal Badge Item Preview */
                                        <div className="relative w-20 h-20 sm:w-24 sm:h-24 transition-transform duration-500 group-hover:scale-110">
                                            {item.imageUrl === 'diamond_badge' ? (
                                                <DiamondBadge />
                                            ) : item.imageUrl === 'ruby_badge' ? (
                                                <RubyBadge />
                                            ) : item.imageUrl && (item.imageUrl.startsWith('/') || item.imageUrl.startsWith('http')) ? (
                                                <Image
                                                    src={item.imageUrl}
                                                    alt={item.name}
                                                    fill
                                                    className={cn(
                                                        "object-contain drop-shadow-xl",
                                                        isAnimated && "animate-pulse"
                                                    )}
                                                    unoptimized
                                                />
                                            ) : (
                                                <div className="w-full h-full rounded-full border border-white/10 flex flex-col items-center justify-center text-center p-2 text-muted-foreground/30 bg-muted/20">
                                                    <Zap className="w-6 h-6 mb-1" />
                                                    <span className="text-[8px] font-mono opacity-50 break-all">{item.imageUrl || ''}</span>
                                                </div>
                                            )}
                                        </div>
                                    )}
                                </div>

                                {/* Insufficient Balance Overlay */}
                                {!item.isOwned && userPoints < item.price && (
                                    <div className="absolute inset-0 bg-background/80 backdrop-blur-[2px] flex flex-col items-center justify-center opacity-0 group-hover:opacity-100 transition-all duration-300 z-30">
                                        <Lock className="w-6 h-6 text-muted-foreground mb-3" strokeWidth={1.5} />
                                        <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">{tr("customerShop.insufficientBalance")}</span>
                                    </div>
                                )}
                            </div>

                            {/* Text and Action Area */}
                            <div className="p-5 flex flex-col flex-1 border-t border-white/[0.05]">
                                <h3 className="font-bold text-sm leading-tight text-foreground truncate mb-1" title={item.name}>
                                    {item.name}
                                </h3>
                                <p className="text-[10px] text-muted-foreground line-clamp-1 mb-3" title={item.description || ''}>
                                    {item.description}
                                </p>
                                
                                <div className="flex items-center justify-between mt-auto mb-4">
                                    {!item.isOwned ? (
                                        <div className="flex items-center gap-1.5 text-amber-500 bg-amber-500/10 px-2 py-1 rounded-md">
                                            <Coins className="w-3.5 h-3.5" />
                                            <span className="font-bold text-sm tabular-nums">
                                                {item.price.toLocaleString()}
                                            </span>
                                        </div>
                                    ) : (
                                        <span className="text-xs text-muted-foreground font-bold uppercase tracking-wider">
                                            {tr("customerShop.owned") || "Sahipsin"}
                                        </span>
                                    )}
                                </div>

                                {/* Interactive Buttons (Buy/Equip + Gift) */}
                                <div className="flex gap-2 w-full">
                                    <div className="flex-1">
                                        <ShopBuyButton
                                            itemId={item.id}
                                            price={item.price}
                                            userPoints={userPoints}
                                            isOwned={item.isOwned}
                                            isEquipped={item.isEquipped}
                                            locale={locale as any}
                                        />
                                    </div>
                                    <Button
                                        variant="outline"
                                        size="icon"
                                        className="h-10 w-10 border-white/[0.08] hover:bg-purple-500/10 hover:border-purple-500/30 hover:text-purple-400 rounded-xl shrink-0"
                                        onClick={() => setGiftItem(item)}
                                        title="Arkadaşına Hediye Et"
                                    >
                                        <Gift className="w-4 h-4" />
                                    </Button>
                                </div>
                            </div>
                        </div>
                    );
                })}

                {filteredItems.length === 0 && (
                    <div className="col-span-full py-20 flex flex-col items-center justify-center text-center">
                        <Sparkles className="w-8 h-8 text-muted-foreground/30 mb-4" />
                        <h3 className="text-lg font-medium text-foreground">{tr("customerShop.emptyTitle")}</h3>
                        <p className="text-muted-foreground text-sm mt-1 max-w-sm">
                            {tr("customerShop.emptyDescription")}
                        </p>
                    </div>
                )}
            </div>

            {/* Gifting Dialog */}
            <Dialog open={!!giftItem} onOpenChange={(open) => !open && setGiftItem(null)}>
                <DialogContent className="max-w-md bg-slate-950/95 border-white/10 text-white backdrop-blur-xl">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2 text-xl font-bold">
                            <Gift className="w-5 h-5 text-purple-400" />
                            Kozmetik Hediye Et
                        </DialogTitle>
                        <DialogDescription className="text-slate-400">
                            <strong>{giftItem?.name}</strong> ögesini başka bir QRateX kullanıcısına hediye edin.
                        </DialogDescription>
                    </DialogHeader>

                    <div className="space-y-4 py-4">
                        <div className="flex items-center justify-between p-3 rounded-xl bg-white/[0.03] border border-white/5">
                            <span className="text-sm text-slate-300">Öge Değeri</span>
                            <div className="flex items-center gap-1 text-amber-500 font-bold">
                                <Coins className="w-4 h-4" />
                                <span>{giftItem?.price.toLocaleString()} Puan</span>
                            </div>
                        </div>

                        <div className="space-y-1.5">
                            <label className="text-xs font-bold uppercase tracking-wider text-slate-400">Alıcı Kullanıcı</label>
                            <div className="relative">
                                <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                                <input
                                    type="text"
                                    placeholder="Kullanıcı adı veya e-posta girin..."
                                    value={recipient}
                                    onChange={(e) => setRecipient(e.target.value)}
                                    className="w-full h-11 bg-slate-900 border border-white/10 rounded-xl pl-10 pr-4 text-sm text-white focus:outline-none focus:border-purple-500/50"
                                />
                            </div>
                        </div>

                        <div className="space-y-1.5">
                            <label className="text-xs font-bold uppercase tracking-wider text-slate-400">Kişisel Mesaj (İsteğe Bağlı)</label>
                            <textarea
                                placeholder="Hediye mesajınızı yazın..."
                                value={giftMessage}
                                onChange={(e) => setGiftMessage(e.target.value)}
                                className="w-full h-24 bg-slate-900 border border-white/10 rounded-xl p-3 text-sm text-white focus:outline-none focus:border-purple-500/50 resize-none"
                                maxLength={200}
                            />
                        </div>
                    </div>

                    <DialogFooter>
                        <Button 
                            variant="ghost" 
                            className="hover:bg-white/5 rounded-xl border border-transparent hover:border-white/10"
                            onClick={() => setGiftItem(null)}
                            disabled={isGifting}
                        >
                            İptal
                        </Button>
                        <Button 
                            className="bg-purple-600 hover:bg-purple-700 text-white rounded-xl shadow-lg shadow-purple-600/20"
                            onClick={handleSendGift}
                            disabled={isGifting}
                        >
                            {isGifting ? (
                                <>
                                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                                    Gönderiliyor...
                                </>
                            ) : (
                                <>
                                    <Gift className="w-4 h-4 mr-2" />
                                    Hediyeyi Gönder
                                </>
                            )}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}
