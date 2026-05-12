'use client';

import { useState } from 'react';
import { useSession } from 'next-auth/react';
import { motion } from 'framer-motion';
import {
    Shield, Download, Trash2, Loader2, Key, Eye, EyeOff,
    QrCode, CheckCircle2, AlertTriangle, Copy, Bell, BellRing, BellOff
} from 'lucide-react';
import { usePushNotifications } from '@/hooks/use-push-notifications';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
    Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { toast } from 'sonner';
import { useAppT } from '@/lib/app-locale';

export function PrivacySecuritySettings() {
    const t = useAppT();
    const { data: session } = useSession();
    // 2FA state
    const [setupLoading, setSetupLoading] = useState(false);
    const [secret, setSecret] = useState('');
    const [otpauthUri, setOtpauthUri] = useState('');
    const [verifyCode, setVerifyCode] = useState('');
    const [verifying, setVerifying] = useState(false);
    const [is2FAEnabled, setIs2FAEnabled] = useState(false);
    const [disableDialog, setDisableDialog] = useState(false);
    const [disableCode, setDisableCode] = useState('');
    const [disabling, setDisabling] = useState(false);

    // KVKK state
    const [exporting, setExporting] = useState(false);
    const [deleteDialog, setDeleteDialog] = useState(false);
    const [deleteEmail, setDeleteEmail] = useState('');
    const [deleting, setDeleting] = useState(false);

    // Push Notifications
    const { isSupported, isSubscribed, subscribeToPush, unsubscribeFromPush, loading: pushLoading } = usePushNotifications();

    async function setup2FA() {
        setSetupLoading(true);
        try {
            const r = await fetch('/api/auth/2fa', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'setup' }),
            });
            const d = await r.json();
            if (!r.ok) throw new Error(d.error);
            setSecret(d.secret);
            setOtpauthUri(d.otpauthUri);
        } catch (e: unknown) {
            toast.error(e instanceof Error ? e.message : t('privacySecurity.toast2faSetupFailed'));
        } finally {
            setSetupLoading(false);
        }
    }

    async function verify2FA() {
        setVerifying(true);
        try {
            const r = await fetch('/api/auth/2fa', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'verify', code: verifyCode }),
            });
            const d = await r.json();
            if (!r.ok) throw new Error(d.error);
            setIs2FAEnabled(true);
            setSecret('');
            setOtpauthUri('');
            setVerifyCode('');
            toast.success(t('privacySecurity.toast2faEnabled'));
        } catch (e: unknown) {
            toast.error(e instanceof Error ? e.message : t('privacySecurity.toastVerifyFailed'));
        } finally {
            setVerifying(false);
        }
    }

    async function disable2FA() {
        setDisabling(true);
        try {
            const r = await fetch('/api/auth/2fa', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'disable', code: disableCode }),
            });
            const d = await r.json();
            if (!r.ok) throw new Error(d.error);
            setIs2FAEnabled(false);
            setDisableDialog(false);
            setDisableCode('');
            toast.success(t('privacySecurity.toast2faDisabled'));
        } catch (e: unknown) {
            toast.error(e instanceof Error ? e.message : t('privacySecurity.toastOperationFailed'));
        } finally {
            setDisabling(false);
        }
    }

    async function exportData() {
        setExporting(true);
        try {
            const r = await fetch('/api/user/data-export');
            if (!r.ok) throw new Error(t('privacySecurity.toastDownloadFailed'));
            const blob = await r.blob();
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = 'qratex-verilerim.json';
            a.click();
            URL.revokeObjectURL(url);
            toast.success(t('privacySecurity.toastDataDownloaded'));
        } catch (e: unknown) {
            toast.error(e instanceof Error ? e.message : t('privacySecurity.toastGenericError'));
        } finally {
            setExporting(false);
        }
    }

    async function deleteAccount() {
        setDeleting(true);
        try {
            const r = await fetch('/api/user/delete-account', {
                method: 'DELETE',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ confirmEmail: deleteEmail }),
            });
            const d = await r.json();
            if (!r.ok) throw new Error(d.error);
            toast.success(t('privacySecurity.toastAccountDeleted'));
            setTimeout(() => window.location.href = '/', 2000);
        } catch (e: unknown) {
            toast.error(e instanceof Error ? e.message : t('privacySecurity.toastGenericError'));
        } finally {
            setDeleting(false);
        }
    }

    return (
        <div className="space-y-6">
            {/* 2FA Section */}
            <Card className="rounded-2xl">
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <Shield className="h-5 w-5 text-blue-500" />
                        {t('privacySecurity.title2fa')}
                    </CardTitle>
                    <CardDescription>
                        {t('privacySecurity.desc2fa')}
                    </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                            <Badge variant={is2FAEnabled ? 'default' : 'secondary'}>
                                {is2FAEnabled ? t('privacySecurity.badgeActive') : t('privacySecurity.badgeInactive')}
                            </Badge>
                            <span className="text-sm text-muted-foreground">
                                {is2FAEnabled ? t('privacySecurity.status2faOn') : t('privacySecurity.status2faOff')}
                            </span>
                        </div>
                        {is2FAEnabled ? (
                            <Button variant="destructive" size="sm" onClick={() => setDisableDialog(true)}>
                                {t('privacySecurity.disable2fa')}
                            </Button>
                        ) : secret ? null : (
                            <Button onClick={setup2FA} disabled={setupLoading} size="sm" className="gap-2">
                                {setupLoading && <Loader2 className="h-4 w-4 animate-spin" />}
                                <Key className="h-4 w-4" /> {t('privacySecurity.startSetup')}
                            </Button>
                        )}
                    </div>

                    {/* Setup flow */}
                    {secret && !is2FAEnabled && (
                        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="space-y-4 border-t pt-4">
                            <div className="p-4 rounded-xl bg-muted/50 space-y-3">
                                <p className="text-sm font-medium">{t('privacySecurity.step1Scan')}</p>
                                <div className="flex items-center gap-2 bg-background rounded-lg px-3 py-2">
                                    <code className="text-xs font-mono flex-1 break-all">{secret}</code>
                                    <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={() => {
                                        navigator.clipboard.writeText(secret);
                                        toast.success(t('privacySecurity.toastCopied'));
                                    }}>
                                        <Copy className="h-3.5 w-3.5" />
                                    </Button>
                                </div>
                                <p className="text-xs text-muted-foreground">
                                    {t('privacySecurity.step1Hint')}
                                </p>
                            </div>

                            <div className="space-y-2">
                                <Label>{t('privacySecurity.step2Label')}</Label>
                                <div className="flex gap-3">
                                    <Input
                                        value={verifyCode}
                                        onChange={(e) => setVerifyCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                                        placeholder="000000"
                                        maxLength={6}
                                        className="w-40 font-mono text-lg text-center tracking-[0.3em]"
                                    />
                                    <Button onClick={verify2FA} disabled={verifying || verifyCode.length !== 6} className="gap-2">
                                        {verifying ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                                        {t('privacySecurity.verify')}
                                    </Button>
                                </div>
                            </div>
                        </motion.div>
                    )}
                </CardContent>
            </Card>

            {/* Push Notifications Section */}
            {isSupported && (
                <Card className="rounded-2xl">
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                            <BellRing className="h-5 w-5 text-primary" />
                            {t('privacySecurity.titlePush')}
                        </CardTitle>
                        <CardDescription>
                            {t('privacySecurity.descPush')}
                        </CardDescription>
                    </CardHeader>
                    <CardContent>
                        <div className="flex items-center justify-between p-3 rounded-xl bg-muted/30">
                            <div>
                                <p className="text-sm font-medium">{t('privacySecurity.pushHeading')}</p>
                                <p className="text-xs text-muted-foreground">
                                    {isSubscribed ? t('privacySecurity.pushSubscribed') : t('privacySecurity.pushOff')}
                                </p>
                            </div>
                            <Button
                                variant={isSubscribed ? "destructive" : "default"}
                                onClick={isSubscribed ? unsubscribeFromPush : subscribeToPush}
                                disabled={pushLoading}
                                className="gap-2 rounded-xl"
                            >
                                {pushLoading && <Loader2 className="h-4 w-4 animate-spin" />}
                                {!pushLoading && (isSubscribed ? <BellOff className="h-4 w-4" /> : <Bell className="h-4 w-4" />)}
                                {isSubscribed ? t('privacySecurity.close') : t('privacySecurity.open')}
                            </Button>
                        </div>
                    </CardContent>
                </Card>
            )}

            {/* KVKK Data & Privacy */}
            <Card className="rounded-2xl">
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <Download className="h-5 w-5 text-emerald-500" />
                        {t('privacySecurity.titleKvkk')}
                    </CardTitle>
                    <CardDescription>
                        {t('privacySecurity.descKvkk')}
                    </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="flex items-center justify-between p-3 rounded-xl bg-muted/30">
                        <div>
                            <p className="text-sm font-medium">{t('privacySecurity.downloadTitle')}</p>
                            <p className="text-xs text-muted-foreground">{t('privacySecurity.downloadHint')}</p>
                        </div>
                        <Button variant="outline" onClick={exportData} disabled={exporting} className="gap-2 rounded-xl">
                            {exporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
                            {t('privacySecurity.download')}
                        </Button>
                    </div>

                    <Separator />

                    <div className="flex items-center justify-between p-3 rounded-xl bg-red-500/5 border border-red-500/20">
                        <div>
                            <p className="text-sm font-medium text-red-600 dark:text-red-400">{t('privacySecurity.deleteTitle')}</p>
                            <p className="text-xs text-muted-foreground">{t('privacySecurity.deleteHint')}</p>
                        </div>
                        <Button variant="destructive" onClick={() => setDeleteDialog(true)} className="gap-2 rounded-xl">
                            <Trash2 className="h-4 w-4" /> {t('privacySecurity.deleteAccount')}
                        </Button>
                    </div>
                </CardContent>
            </Card>

            {/* 2FA Disable Dialog */}
            <Dialog open={disableDialog} onOpenChange={setDisableDialog}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>{t('privacySecurity.dialogDisableTitle')}</DialogTitle>
                        <DialogDescription>{t('privacySecurity.dialogDisableDesc')}</DialogDescription>
                    </DialogHeader>
                    <Input
                        value={disableCode}
                        onChange={(e) => setDisableCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                        placeholder="000000"
                        maxLength={6}
                        className="font-mono text-lg text-center tracking-[0.3em]"
                    />
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setDisableDialog(false)}>{t('privacySecurity.cancel')}</Button>
                        <Button variant="destructive" onClick={disable2FA} disabled={disabling || disableCode.length !== 6}>
                            {disabling && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                            {t('privacySecurity.dialogDisableConfirm')}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Delete Account Dialog */}
            <Dialog open={deleteDialog} onOpenChange={setDeleteDialog}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2 text-red-500">
                            <AlertTriangle className="h-5 w-5" />
                            {t('privacySecurity.dialogDeleteTitle')}
                        </DialogTitle>
                        <DialogDescription>
                            {t('privacySecurity.dialogDeleteDesc')}
                        </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-3">
                        <Label>{t('privacySecurity.confirmEmailLabel')}</Label>
                        <Input
                            value={deleteEmail}
                            onChange={(e) => setDeleteEmail(e.target.value)}
                            placeholder={session?.user?.email || 'email@example.com'}
                        />
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setDeleteDialog(false)}>{t('privacySecurity.cancel')}</Button>
                        <Button variant="destructive" onClick={deleteAccount} disabled={deleting || !deleteEmail}>
                            {deleting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                            {t('privacySecurity.deleteForever')}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}
