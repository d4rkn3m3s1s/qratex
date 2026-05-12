"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Gift } from "lucide-react";
import { toast } from "sonner";
import { useAppT } from "@/lib/app-locale";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import {
    DEFAULT_WIN_BACK_OFFER_ID,
    WIN_BACK_OFFER_IDS,
    type WinBackOfferId,
} from "@/lib/dealer/win-back-offers";

export function RadarBulkCampaignButton({ userIds, disabled }: { userIds: string[], disabled: boolean }) {
    const router = useRouter();
    const t = useAppT();
    const [loading, setLoading] = useState(false);

    const handleSendBulk = async () => {
        if (userIds.length === 0) return;
        setLoading(true);
        try {
            const res = await fetch("/api/dealer/win-back", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ userIds, offerType: "5x_points" }),
            });
            const data = await res.json();
            if (data.success) {
                toast.success(data.message || t("dealerRadar.toastCampaignSent"));
                router.refresh();
            } else {
                toast.error(data.error || t("dealerRadar.toastError"));
            }
        } catch (error) {
            toast.error(t("dealerRadar.toastConnectionError"));
        } finally {
            setLoading(false);
        }
    };

    return (
        <Button
            className="w-full rounded-xl"
            disabled={disabled || loading}
            onClick={handleSendBulk}
        >
            <Gift className="w-4 h-4 mr-2" />
            {loading ? t("dealerRadar.bulkSending") : t("dealerRadar.bulkStartCampaign")}
        </Button>
    );
}

export function RadarSingleOfferButton({
    userId,
    customerLabel,
}: {
    userId: string;
    customerLabel: string;
}) {
    const router = useRouter();
    const t = useAppT();
    const [open, setOpen] = useState(false);
    const [offerType, setOfferType] = useState<WinBackOfferId>(DEFAULT_WIN_BACK_OFFER_ID);
    const [personalNote, setPersonalNote] = useState("");
    const [loading, setLoading] = useState(false);

    const resetForm = () => {
        setOfferType(DEFAULT_WIN_BACK_OFFER_ID);
        setPersonalNote("");
    };

    const handleOpenChange = (next: boolean) => {
        setOpen(next);
        if (!next) resetForm();
    };

    const handleSend = async () => {
        setLoading(true);
        try {
            const trimmed = personalNote.trim();
            const res = await fetch("/api/dealer/win-back", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    userIds: [userId],
                    offerType,
                    ...(trimmed ? { personalNote: trimmed } : {}),
                }),
            });
            const data = await res.json();
            if (data.success) {
                toast.success(t("dealerRadar.singleToastSuccess"));
                router.refresh();
                setOpen(false);
                resetForm();
            } else {
                toast.error(data.error || t("dealerRadar.toastError"));
            }
        } catch (error) {
            toast.error(t("dealerRadar.toastConnectionError"));
        } finally {
            setLoading(false);
        }
    };

    return (
        <>
            <Button
                variant="outline"
                size="sm"
                className="hidden h-8 rounded-xl sm:flex"
                type="button"
                onClick={() => setOpen(true)}
            >
                {t("dealerRadar.singleOffer")}
            </Button>

            <Dialog open={open} onOpenChange={handleOpenChange}>
                <DialogContent className="sm:max-w-md">
                    <DialogHeader>
                        <DialogTitle>{t("dealerRadar.singleOfferDialogTitle")}</DialogTitle>
                        <DialogDescription>
                            {t("dealerRadar.singleOfferDialogDescription").replace("{name}", customerLabel)}
                        </DialogDescription>
                    </DialogHeader>

                    <div className="grid gap-4 py-2">
                        <div className="grid gap-2">
                            <Label htmlFor="radar-offer-type">{t("dealerRadar.singleOfferTypeLabel")}</Label>
                            <Select
                                value={offerType}
                                onValueChange={(v) => setOfferType(v as WinBackOfferId)}
                            >
                                <SelectTrigger id="radar-offer-type" className="w-full">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    {WIN_BACK_OFFER_IDS.map((id) => (
                                        <SelectItem key={id} value={id}>
                                            {t(`dealerRadar.winBackOfferOptions.${id}`)}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="grid gap-2">
                            <Label htmlFor="radar-offer-note">{t("dealerRadar.singleOfferNoteLabel")}</Label>
                            <Textarea
                                id="radar-offer-note"
                                value={personalNote}
                                onChange={(e) => setPersonalNote(e.target.value)}
                                placeholder={t("dealerRadar.singleOfferNotePlaceholder")}
                                rows={4}
                                maxLength={500}
                                className="min-h-[100px] resize-none"
                            />
                        </div>
                    </div>

                    <DialogFooter className="gap-2 sm:gap-0">
                        <Button
                            type="button"
                            variant="outline"
                            onClick={() => handleOpenChange(false)}
                            disabled={loading}
                        >
                            {t("common.cancel")}
                        </Button>
                        <Button type="button" onClick={handleSend} disabled={loading}>
                            {loading ? t("dealerRadar.singleOfferSending") : t("dealerRadar.singleOfferSend")}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </>
    );
}
