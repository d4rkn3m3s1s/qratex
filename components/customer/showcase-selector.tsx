'use client';

import { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { toast } from 'sonner';
import { useRouter } from 'next/navigation';
import { Plus, X, Award, Sparkles, Sliders, Save, RefreshCw, User } from 'lucide-react';
import Image from 'next/image';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogTrigger } from '@/components/ui/dialog';
import { UserAvatarFrame, DiamondBadge, RubyBadge } from '@/components/ui/avatar-frame';

type UserCosmeticWithDetails = {
    id: string;
    userId: string;
    cosmeticId: string;
    isEquipped: boolean;
    isPinned: boolean;
    cosmetic: {
        id: string;
        name: string;
        type: string;
        imageUrl: string | null;
        rarity: string;
    }
};

type UserBadgeWithDetails = {
    id: string;
    userId: string;
    badgeId: string;
    isPinned: boolean;
    badge: {
        id: string;
        name: string;
        imageUrl: string | null;
        description: string;
    }
};

export function ShowcaseSelector() {
    const { data: session, update: updateSession } = useSession();
    const router = useRouter();
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    
    // Inventory state
    const [cosmetics, setCosmetics] = useState<UserCosmeticWithDetails[]>([]);
    const [badges, setBadges] = useState<UserBadgeWithDetails[]>([]);
    
    // Customization states
    const [hueDegree, setHueDegree] = useState<number>(0);
    const [pinnedCosmetics, setPinnedCosmetics] = useState<string[]>([]);
    const [pinnedBadges, setPinnedBadges] = useState<string[]>([]);

    const activeFrame = (session?.user as any)?.equippedFrame || null;
    const userImage = session?.user?.image || null;

    // Fetch initial inventory and selections
    useEffect(() => {
        const fetchShowcaseData = async () => {
            try {
                const res = await fetch('/api/customer/showcase');
                const data = await res.json();
                if (data.success) {
                    setCosmetics(data.cosmetics);
                    setBadges(data.badges);
                    
                    // Filter pinned item IDs
                    const pinnedCosIds = data.cosmetics
                        .filter((c: any) => c.isPinned)
                        .map((c: any) => c.cosmeticId);
                    const pinnedBadgeIds = data.badges
                        .filter((b: any) => b.isPinned)
                        .map((b: any) => b.badgeId);

                    setPinnedCosmetics(pinnedCosIds);
                    setPinnedBadges(pinnedBadgeIds);

                    // Set initial hue rotation from user db
                    if (data.customFrameColor) {
                        setHueDegree(parseInt(data.customFrameColor) || 0);
                    }
                }
            } catch (error) {
                console.error('Showcase fetch error:', error);
                toast.error('Envanter bilgileri yüklenemedi.');
            } finally {
                setLoading(false);
            }
        };

        fetchShowcaseData();
    }, []);

    // Save Pinned items
    const handleSaveShowcase = async () => {
        setSaving(true);
        try {
            const res = await fetch('/api/customer/showcase', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    pinnedBadgeIds: pinnedBadges,
                    pinnedCosmeticIds: pinnedCosmetics
                })
            });

            const data = await res.json();
            if (data.success) {
                toast.success('Profil vitrininiz başarıyla güncellendi!');
                router.refresh();
            } else {
                toast.error(data.error || 'Vitrin güncellenemedi.');
            }
        } catch (error) {
            toast.error('Bağlantı hatası oluştu.');
        } finally {
            setSaving(false);
        }
    };

    // Save Hue Rotate Frame Color
    const handleSaveFrameColor = async (colorVal: string | null) => {
        try {
            const res = await fetch('/api/customer/custom-color', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ customFrameColor: colorVal })
            });

            const data = await res.json();
            if (data.success) {
                toast.success('Çerçeve rengi güncellendi!');
                // Update next-auth session client state dynamically
                await updateSession({ customFrameColor: colorVal });
                router.refresh();
            } else {
                toast.error(data.error || 'Renk güncellenemedi.');
            }
        } catch (error) {
            toast.error('Bağlantı hatası oluştu.');
        }
    };

    // Helper to toggle pin status
    const togglePinCosmetic = (cosmeticId: string) => {
        setPinnedCosmetics(prev => {
            if (prev.includes(cosmeticId)) {
                return prev.filter(id => id !== cosmeticId);
            }
            if (prev.length + pinnedBadges.length >= 4) {
                toast.error('Vitrin sınırı doldu. En fazla 4 öge sergilenebilir.');
                return prev;
            }
            return [...prev, cosmeticId];
        });
    };

    const togglePinBadge = (badgeId: string) => {
        setPinnedBadges(prev => {
            if (prev.includes(badgeId)) {
                return prev.filter(id => id !== badgeId);
            }
            if (pinnedCosmetics.length + prev.length >= 4) {
                toast.error('Vitrin sınırı doldu. En fazla 4 öge sergilenebilir.');
                return prev;
            }
            return [...prev, badgeId];
        });
    };

    if (loading) {
        return (
            <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                <RefreshCw className="w-8 h-8 animate-spin mb-4 text-primary" />
                <p>Yükleniyor...</p>
            </div>
        );
    }

    // Rendered list of pinned objects (up to 4 slots)
    const pinnedList: Array<{ id: string; type: 'badge' | 'cosmetic'; name: string; imageUrl: string | null }> = [];
    
    pinnedCosmetics.forEach(id => {
        const item = cosmetics.find(c => c.cosmeticId === id);
        if (item) {
            pinnedList.push({
                id: item.cosmeticId,
                type: 'cosmetic',
                name: item.cosmetic.name,
                imageUrl: item.cosmetic.imageUrl
            });
        }
    });

    pinnedBadges.forEach(id => {
        const item = badges.find(b => b.badgeId === id);
        if (item) {
            pinnedList.push({
                id: item.badgeId,
                type: 'badge',
                name: item.badge.name,
                imageUrl: item.badge.imageUrl
            });
        }
    });

    // Fill remaining slots up to 4
    const totalSlots = 4;
    const slots = Array.from({ length: totalSlots });

    return (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
            {/* 1. Frame Color Customizer (Left Panel) */}
            <div className="lg:col-span-5 bg-card/20 border border-white/[0.08] rounded-[2.5rem] p-6 backdrop-blur-md flex flex-col items-center">
                <div className="w-full flex items-center justify-between mb-6">
                    <h3 className="text-lg font-bold flex items-center gap-2">
                        <Sliders className="w-4 h-4 text-primary" />
                        Çerçeve Renk Özelleştirici
                    </h3>
                </div>

                {/* Avatar Frame Real-time Hue Rotate Preview */}
                <div className="relative w-40 h-40 flex items-center justify-center mb-8">
                    {activeFrame ? (
                        <UserAvatarFrame frameId={activeFrame} customColor={String(hueDegree)}>
                            {userImage ? (
                                <Image src={userImage} alt="User" fill className="object-cover" unoptimized />
                            ) : (
                                <User className="w-1/2 h-1/2 text-muted-foreground/30" />
                            )}
                        </UserAvatarFrame>
                    ) : (
                        <div className="relative w-28 h-28 rounded-full border-4 border-dashed border-white/20 flex flex-col items-center justify-center text-center p-3 text-muted-foreground/40">
                            <User className="w-8 h-8 mb-1" />
                            <span className="text-[10px] leading-tight">Özelleştirmek için dükkandan bir çerçeve kuşanın.</span>
                        </div>
                    )}
                </div>

                {/* Hue Degree Input Control */}
                {activeFrame && (
                    <div className="w-full space-y-5">
                        <div className="flex items-center justify-between text-sm">
                            <span className="text-muted-foreground font-bold">Renk Tonu (Hue Rotate)</span>
                            <span className="text-amber-500 font-mono font-black">{hueDegree}°</span>
                        </div>
                        <input
                            type="range"
                            min="0"
                            max="360"
                            value={hueDegree}
                            onChange={(e) => setHueDegree(parseInt(e.target.value))}
                            className="w-full h-2 bg-slate-900 border border-white/10 rounded-lg appearance-none cursor-pointer accent-primary"
                        />
                        <div className="flex gap-3 mt-4">
                            <Button 
                                variant="outline" 
                                className="flex-1 rounded-xl h-10 border-white/10"
                                onClick={() => {
                                    setHueDegree(0);
                                    handleSaveFrameColor(null);
                                }}
                            >
                                Sıfırla
                            </Button>
                            <Button 
                                className="flex-1 bg-primary text-primary-foreground hover:bg-primary/95 rounded-xl h-10 shadow-md shadow-primary/10"
                                onClick={() => handleSaveFrameColor(String(hueDegree))}
                            >
                                <Save className="w-4 h-4 mr-2" /> Rengi Kaydet
                            </Button>
                        </div>
                    </div>
                )}
            </div>

            {/* 2. Profile Showcase (Right Panel) */}
            <div className="lg:col-span-7 bg-card/20 border border-white/[0.08] rounded-[2.5rem] p-6 backdrop-blur-md flex flex-col">
                <div className="flex justify-between items-start mb-6">
                    <div>
                        <h3 className="text-lg font-bold flex items-center gap-2">
                            <Award className="w-4 h-4 text-purple-400" />
                            Profil Vitrini (Showcase)
                        </h3>
                        <p className="text-xs text-muted-foreground mt-1">
                            Profil kartınızda sergilenmesini istediğiniz rozet ve kozmetikleri seçin (Maks. 4).
                        </p>
                    </div>
                    
                    <Button 
                        disabled={saving}
                        className="bg-purple-600 hover:bg-purple-700 text-white rounded-xl shadow-lg shadow-purple-600/20 px-4 h-10"
                        onClick={handleSaveShowcase}
                    >
                        <Save className="w-4 h-4 mr-2" /> Vitrini Kaydet
                    </Button>
                </div>

                {/* Showcase Slots Grid */}
                <div className="grid grid-cols-4 gap-4 py-4 flex-1">
                    {slots.map((_, index) => {
                        const pinned = pinnedList[index];

                        if (pinned) {
                            return (
                                <div 
                                    key={pinned.id}
                                    className="relative aspect-square rounded-[1.5rem] border border-white/10 bg-white/[0.02] flex flex-col items-center justify-center p-3 group hover:border-red-500/30 transition-all duration-300"
                                >
                                    {/* Clear Button */}
                                    <button 
                                        onClick={() => {
                                            if (pinned.type === 'cosmetic') togglePinCosmetic(pinned.id);
                                            else togglePinBadge(pinned.id);
                                        }}
                                        className="absolute -top-1.5 -right-1.5 w-6 h-6 rounded-full bg-slate-900 border border-white/10 flex items-center justify-center hover:bg-red-500 hover:text-white transition-colors z-20"
                                    >
                                        <X className="w-3.5 h-3.5" />
                                    </button>

                                    {/* Visual Representation */}
                                    <div className="relative w-full h-full flex items-center justify-center">
                                        {pinned.id === 'diamond_badge' ? (
                                            <DiamondBadge />
                                        ) : pinned.id === 'ruby_badge' ? (
                                            <RubyBadge />
                                        ) : pinned.imageUrl && (pinned.imageUrl.startsWith('/') || pinned.imageUrl.startsWith('http')) ? (
                                            <Image 
                                                src={pinned.imageUrl} 
                                                alt={pinned.name} 
                                                fill 
                                                className="object-contain" 
                                                unoptimized 
                                            />
                                        ) : (
                                            <div className="flex flex-col items-center justify-center text-center">
                                                <Sparkles className="w-6 h-6 text-purple-400/60 mb-1" />
                                                <span className="text-[8px] opacity-40 font-mono break-all">{pinned.id}</span>
                                            </div>
                                        )}
                                    </div>
                                    <span className="text-[9px] text-slate-400 font-medium text-center truncate w-full mt-2" title={pinned.name}>
                                        {pinned.name}
                                    </span>
                                </div>
                            );
                        }

                        // Empty slot - opens Dialog to select item
                        return (
                            <Dialog key={index}>
                                <DialogTrigger asChild>
                                    <button className="aspect-square rounded-[1.5rem] border border-dashed border-white/10 hover:border-white/30 bg-white/[0.01] hover:bg-white/[0.03] flex flex-col items-center justify-center transition-all duration-300 group">
                                        <Plus className="w-6 h-6 text-muted-foreground group-hover:scale-110 group-hover:text-primary transition-all duration-300" />
                                        <span className="text-[10px] text-muted-foreground font-bold mt-2">Slot {index + 1}</span>
                                    </button>
                                </DialogTrigger>
                                
                                <DialogContent className="max-w-md bg-slate-950/95 border-white/10 text-white backdrop-blur-xl max-h-[80vh] overflow-y-auto">
                                    <DialogHeader>
                                        <DialogTitle className="flex items-center gap-2">
                                            <Award className="w-5 h-5 text-primary" />
                                            Sergilenecek Öge Seçin
                                        </DialogTitle>
                                        <DialogDescription className="text-white/60">
                                            Profilinde sergilemek istediğin rozet veya başarıyı seç.
                                        </DialogDescription>
                                    </DialogHeader>

                                    {/* Choice Lists */}
                                    <div className="space-y-6 py-4">
                                        {/* 1. Badges */}
                                        <div className="space-y-3">
                                            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                                                Rozetler ({badges.length})
                                            </h4>
                                            {badges.length === 0 ? (
                                                <p className="text-xs text-muted-foreground italic">Henüz sahip olduğunuz rozet yok.</p>
                                            ) : (
                                                <div className="grid grid-cols-2 gap-2">
                                                    {badges.map((b) => {
                                                        const isPinned = pinnedBadges.includes(b.badgeId);
                                                        return (
                                                            <button
                                                                key={b.id}
                                                                onClick={() => togglePinBadge(b.badgeId)}
                                                                className={cn(
                                                                    "flex items-center gap-3 p-2.5 rounded-xl border text-left transition-all duration-200",
                                                                    isPinned 
                                                                        ? "border-primary bg-primary/10 text-white" 
                                                                        : "border-white/5 bg-white/[0.02] hover:border-white/20 hover:bg-white/[0.04]"
                                                                )}
                                                            >
                                                                <div className="relative w-8 h-8 shrink-0 flex items-center justify-center">
                                                                    {b.badgeId === 'diamond_badge' ? (
                                                                        <DiamondBadge />
                                                                    ) : b.badgeId === 'ruby_badge' ? (
                                                                        <RubyBadge />
                                                                    ) : b.badge.imageUrl ? (
                                                                        <Image src={b.badge.imageUrl} alt={b.badge.name} fill className="object-contain" unoptimized />
                                                                    ) : (
                                                                        <Award className="w-5 h-5 text-muted-foreground" />
                                                                    )}
                                                                </div>
                                                                <div className="min-w-0">
                                                                    <p className="text-xs font-bold truncate">{b.badge.name}</p>
                                                                    <p className="text-[9px] text-muted-foreground truncate">{b.badge.description}</p>
                                                                </div>
                                                            </button>
                                                        );
                                                    })}
                                                </div>
                                            )}
                                        </div>

                                        {/* 2. Cosmetics */}
                                        <div className="space-y-3">
                                            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                                                Kozmetikler ({cosmetics.length})
                                            </h4>
                                            {cosmetics.length === 0 ? (
                                                <p className="text-xs text-muted-foreground italic">Henüz sahip olduğunuz kozmetik yok.</p>
                                            ) : (
                                                <div className="grid grid-cols-2 gap-2">
                                                    {cosmetics.map((c) => {
                                                        const isPinned = pinnedCosmetics.includes(c.cosmeticId);
                                                        return (
                                                            <button
                                                                key={c.id}
                                                                onClick={() => togglePinCosmetic(c.cosmeticId)}
                                                                className={cn(
                                                                    "flex items-center gap-3 p-2.5 rounded-xl border text-left transition-all duration-200",
                                                                    isPinned 
                                                                        ? "border-primary bg-primary/10 text-white" 
                                                                        : "border-white/5 bg-white/[0.02] hover:border-white/20 hover:bg-white/[0.04]"
                                                                )}
                                                            >
                                                                <div className="relative w-8 h-8 shrink-0 flex items-center justify-center">
                                                                    {c.cosmetic.imageUrl && (c.cosmetic.imageUrl.startsWith('/') || c.cosmetic.imageUrl.startsWith('http')) ? (
                                                                        <Image src={c.cosmetic.imageUrl} alt={c.cosmetic.name} fill className="object-contain" unoptimized />
                                                                    ) : (
                                                                        <Sparkles className="w-5 h-5 text-purple-400" />
                                                                    )}
                                                                </div>
                                                                <div className="min-w-0">
                                                                    <p className="text-xs font-bold truncate">{c.cosmetic.name}</p>
                                                                    <p className="text-[9px] text-muted-foreground truncate uppercase font-bold tracking-wider">{c.cosmetic.type === 'avatar_frame' ? 'Çerçeve' : 'Arka Plan'}</p>
                                                                </div>
                                                            </button>
                                                        );
                                                    })}
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                </DialogContent>
                            </Dialog>
                        );
                    })}
                </div>
            </div>
        </div>
    );
}
