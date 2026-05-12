"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Plus, Users } from "lucide-react";
import { toast } from "sonner";

export function SquadIntroCards() {
    const router = useRouter();
    const [createOpen, setCreateOpen] = useState(false);
    const [joinOpen, setJoinOpen] = useState(false);
    const [loading, setLoading] = useState(false);
    const [squadName, setSquadName] = useState("");
    const [inviteCode, setInviteCode] = useState("");

    const handleCreate = async () => {
        if (!squadName || squadName.length < 3) {
            toast.error("Klan adı en az 3 karakter olmalıdır.");
            return;
        }
        setLoading(true);
        try {
            const res = await fetch("/api/customer/squads", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ name: squadName }),
            });
            const data = await res.json();
            if (data.success) {
                toast.success("Klan başarıyla oluşturuldu!");
                setCreateOpen(false);
                router.refresh();
            } else {
                toast.error(data.error || "Bir hata oluştu.");
            }
        } catch (error) {
            toast.error("Bağlantı hatası.");
        } finally {
            setLoading(false);
        }
    };

    const handleJoin = async () => {
        if (!inviteCode) {
            toast.error("Davet kodu gerekli.");
            return;
        }
        setLoading(true);
        try {
            const res = await fetch("/api/customer/squads/join", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ inviteCode: inviteCode.toUpperCase() }),
            });
            const data = await res.json();
            if (data.success) {
                toast.success("Klana başarıyla katıldınız!");
                setJoinOpen(false);
                router.refresh();
            } else {
                toast.error(data.error || "Bir hata oluştu.");
            }
        } catch (error) {
            toast.error("Bağlantı hatası.");
        } finally {
            setLoading(false);
        }
    };

    return (
        <>
            <div className="grid gap-6 sm:grid-cols-2">
                <Card
                    className="border-border/50 border-primary/20 bg-primary/5 hover:border-primary/40 transition-colors cursor-pointer"
                    onClick={() => setCreateOpen(true)}
                >
                    <CardHeader className="text-center pb-2 pointer-events-none">
                        <div className="w-12 h-12 bg-primary/20 text-primary rounded-full flex items-center justify-center mx-auto mb-2">
                            <Plus className="w-6 h-6" />
                        </div>
                        <CardTitle className="text-lg">Klan Oluştur</CardTitle>
                        <CardDescription>Lider sen ol, arkadaşlarını davet et.</CardDescription>
                    </CardHeader>
                    <CardContent className="flex justify-center">
                        <Button className="rounded-xl w-full pointer-events-none">Yeni Klan Kur</Button>
                    </CardContent>
                </Card>

                <Card
                    className="border-border/50 hover:border-border transition-colors cursor-pointer"
                    onClick={() => setJoinOpen(true)}
                >
                    <CardHeader className="text-center pb-2 pointer-events-none">
                        <div className="w-12 h-12 bg-muted text-foreground rounded-full flex items-center justify-center mx-auto mb-2">
                            <Users className="w-6 h-6" />
                        </div>
                        <CardTitle className="text-lg">Bir Klana Katıl</CardTitle>
                        <CardDescription>Bir davet kodun mu var?</CardDescription>
                    </CardHeader>
                    <CardContent className="flex justify-center">
                        <Button variant="outline" className="rounded-xl w-full pointer-events-none">Koda Katıl</Button>
                    </CardContent>
                </Card>
            </div>

            <Dialog open={createOpen} onOpenChange={setCreateOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Yeni Klan Kur</DialogTitle>
                        <DialogDescription>Mekanda beraber olduğun arkadaşlarınla aynı klan altında güçlerini birleştir.</DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4 py-4">
                        <div className="space-y-2">
                            <label className="text-sm font-medium">Klan Adı</label>
                            <Input
                                placeholder="Örn: Efsane 5'li"
                                value={squadName}
                                onChange={(e) => setSquadName(e.target.value)}
                                maxLength={30}
                            />
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setCreateOpen(false)}>İptal</Button>
                        <Button onClick={handleCreate} disabled={loading}>{loading ? "Kuruluyor..." : "Klanı Kur"}</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            <Dialog open={joinOpen} onOpenChange={setJoinOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Klana Katıl</DialogTitle>
                        <DialogDescription>Sana gönderilen 6 haneli davet kodunu aşağıya girerek müttefiklerine katıl.</DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4 py-4">
                        <div className="space-y-2">
                            <label className="text-sm font-medium">Davet Kodu</label>
                            <Input
                                placeholder="Örn: AB12C3"
                                value={inviteCode}
                                onChange={(e) => setInviteCode(e.target.value)}
                                className="uppercase font-mono tracking-widest text-lg"
                                maxLength={6}
                            />
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setJoinOpen(false)}>İptal</Button>
                        <Button onClick={handleJoin} disabled={loading}>{loading ? "Katılınıyor..." : "Katıl"}</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </>
    );
}

export function SquadLeaveButton({ squadId }: { squadId: string }) {
    const router = useRouter();
    const [loading, setLoading] = useState(false);

    const handleLeave = async () => {
        if (!confirm("Klandan ayrılmak istediğine emin misin? Tüm pasif puan gelirinden vazgeçeceksin.")) return;
        setLoading(true);
        // Assuming we need a leave endpoint. Let's create it later or handle it if it exists.
        try {
            const res = await fetch(`/api/customer/squads/${squadId}/leave`, {
                method: "POST",
            });
            const data = await res.json();
            if (data.success) {
                toast.success("Klandan ayrıldınız.");
                router.refresh();
            } else {
                toast.error(data.error || "Hata oluştu.");
            }
        } catch (e) {
            toast.error("Bağlantı hatası.");
        } finally {
            setLoading(false);
        }
    };

    return (
        <Button variant="destructive" size="sm" onClick={handleLeave} disabled={loading}>
            {loading ? "Ayrılıyor..." : "Klandan Ayrıl"}
        </Button>
    )
}
