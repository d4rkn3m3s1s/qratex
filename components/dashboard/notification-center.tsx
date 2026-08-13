'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { m as Motion, AnimatePresence } from 'framer-motion';
import {
    Bell, CheckCheck, Trash2, Info, AlertTriangle, CheckCircle,
    XCircle, ExternalLink, Filter, BellOff, Gift,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import {
    Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger,
} from '@/components/ui/sheet';
import {
    Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { toast } from 'sonner';
import { formatDistanceToNow, format } from 'date-fns';
import { tr, enUS } from 'date-fns/locale';
import { useAppLocale, useAppT } from '@/lib/app-locale';

// ─── Types ──────────────────────────────────────────────────
export interface Notification {
    id: string;
    title: string;
    message: string;
    type: string;
    isRead: boolean;
    createdAt: string;
    data?: Record<string, unknown>;
}

type TabFilter = 'all' | 'unread';

// ─── Constants ──────────────────────────────────────────────
const NOTIFICATION_ICONS: Record<string, typeof Info> = {
    info: Info,
    success: CheckCircle,
    warning: AlertTriangle,
    error: XCircle,
};

const NOTIFICATION_COLORS: Record<string, string> = {
    info: 'text-blue-500',
    success: 'text-green-500',
    warning: 'text-amber-500',
    error: 'text-red-500',
};

const NOTIFICATION_BG: Record<string, string> = {
    info: 'bg-blue-500/10',
    success: 'bg-green-500/10',
    warning: 'bg-amber-500/10',
    error: 'bg-red-500/10',
};

const getIcon = (type: string) => {
    if (type === 'BIRTHDAY_CLAIM') return Gift;
    return NOTIFICATION_ICONS[type] || Info;
};
const getColor = (type: string) => {
    if (type === 'BIRTHDAY_CLAIM') return 'text-pink-500';
    return NOTIFICATION_COLORS[type] || NOTIFICATION_COLORS.info;
};
const getBg = (type: string) => {
    if (type === 'BIRTHDAY_CLAIM') return 'bg-pink-500/10';
    return NOTIFICATION_BG[type] || NOTIFICATION_BG.info;
};

// ─── Component ──────────────────────────────────────────────
export function NotificationCenter() {
    const { locale } = useAppLocale();
    const t = useAppT();
    const dateFnsLocale = locale === 'en' ? enUS : tr;

    const [mounted, setMounted] = useState(false);

    useEffect(() => {
        setMounted(true);
    }, []);

    const formatTime = useCallback((dateString: string) => {
        try {
            return formatDistanceToNow(new Date(dateString), { addSuffix: true, locale: dateFnsLocale });
        } catch { return ''; }
    }, [dateFnsLocale]);

    const formatFullDate = useCallback((dateString: string) => {
        try {
            return format(new Date(dateString), 'PPpp', { locale: dateFnsLocale });
        } catch { return ''; }
    }, [dateFnsLocale]);

    const { data: session } = useSession();
    const router = useRouter();

    const [notifications, setNotifications] = useState<Notification[]>([]);
    const [unreadCount, setUnreadCount] = useState(0);
    const [open, setOpen] = useState(false);
    const [filter, setFilter] = useState<TabFilter>('all');
    const [detailOpen, setDetailOpen] = useState(false);
    const [selected, setSelected] = useState<Notification | null>(null);
    const [birthdayClaiming, setBirthdayClaiming] = useState(false);

    const prevIdsRef = useRef<Set<string>>(new Set());
    const firstLoadRef = useRef(true);

    // ── Fetch ───
    const fetchNotifications = useCallback(async () => {
        if (!session?.user?.id) return;
        try {
            const res = await fetch('/api/notifications?limit=30', { credentials: 'same-origin' });
            if (!res.ok) { setNotifications([]); setUnreadCount(0); return; }
            const data = await res.json().catch(() => ({}));
            if (data?.success && Array.isArray(data.notifications)) {
                const items = data.notifications as Notification[];
                // Toast for genuinely new notifications
                if (!firstLoadRef.current && items.length > 0) {
                    const newOnes = items.filter((n) => !prevIdsRef.current.has(n.id));
                    newOnes.forEach((n) => {
                        const Icon = getIcon(n.type);
                        toast(n.title, {
                            description: n.message,
                            icon: <Icon className={`h-5 w-5 ${getColor(n.type)}`} />,
                            duration: 5000,
                        });
                    });
                }
                prevIdsRef.current = new Set(items.map((n) => n.id));
                setNotifications(items);
                setUnreadCount(typeof data.unreadCount === 'number' ? data.unreadCount : 0);
                firstLoadRef.current = false;
            } else {
                setNotifications([]); setUnreadCount(0);
            }
        } catch {
            setNotifications((prev) => (prev.length ? prev : []));
        }
    }, [session?.user?.id]);

    useEffect(() => {
        if (!session?.user?.id) return;
        fetchNotifications();
        const poll = setInterval(fetchNotifications, 20_000);
        return () => clearInterval(poll);
    }, [session?.user?.id, fetchNotifications]);

    // ── Actions ───
    const markAsRead = async (id: string) => {
        try {
            await fetch('/api/notifications', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ notificationId: id }),
            });
            setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, isRead: true } : n)));
            setUnreadCount((c) => Math.max(0, c - 1));
        } catch { /* silent */ }
    };

    const markAllAsRead = async () => {
        try {
            await fetch('/api/notifications', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ markAllRead: true }),
            });
            setNotifications((prev) => prev.map((n) => ({ ...n, isRead: true })));
            setUnreadCount(0);
            toast.success(t('notificationCenter.markAllToast'));
        } catch { /* silent */ }
    };

    const deleteNotification = async (id: string, e?: React.MouseEvent) => {
        e?.stopPropagation();
        try {
            await fetch(`/api/notifications?id=${id}`, { method: 'DELETE' });
            const n = notifications.find((x) => x.id === id);
            setNotifications((prev) => prev.filter((x) => x.id !== id));
            if (n && !n.isRead) setUnreadCount((c) => Math.max(0, c - 1));
        } catch { /* silent */ }
    };

    const claimBirthdayBonus = async () => {
        if (birthdayClaiming) return;
        setBirthdayClaiming(true);
        try {
            const res = await fetch('/api/birthday', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'claim' }),
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(typeof data.error === 'string' ? data.error : t('common.error'));
            toast.success(t('notificationCenter.birthdayClaimSuccessToast'));
            if (selected?.id) await markAsRead(selected.id);
            setDetailOpen(false);
            setSelected(null);
            await fetchNotifications();
        } catch (err) {
            toast.error(err instanceof Error ? err.message : t('common.error'));
        } finally {
            setBirthdayClaiming(false);
        }
    };

    const claimBirthdayBonusFromList = async (n: Notification, e: React.MouseEvent) => {
        e.stopPropagation();
        if (birthdayClaiming) return;
        setBirthdayClaiming(true);
        try {
            const res = await fetch('/api/birthday', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'claim' }),
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(typeof data.error === 'string' ? data.error : t('common.error'));
            toast.success(t('notificationCenter.birthdayClaimSuccessToast'));
            await markAsRead(n.id);
            await fetchNotifications();
        } catch (err) {
            toast.error(err instanceof Error ? err.message : t('common.error'));
        } finally {
            setBirthdayClaiming(false);
        }
    };

    const openDetail = (n: Notification) => {
        setSelected(n);
        setDetailOpen(true);
        if (!n.isRead) markAsRead(n.id);
    };

    // ── Filtered list ───
    const filteredNotifications = filter === 'unread'
        ? notifications.filter((n) => !n.isRead)
        : notifications;

    if (!mounted) {
        return (
            <Button
                variant="ghost"
                size="icon"
                type="button"
                className="relative h-11 min-h-11 min-w-11 w-11 shrink-0 touch-manipulation rounded-full transition-colors duration-200 hover:bg-muted"
                disabled
                aria-label={t('notificationCenter.trigger')}
            >
                <Bell className="h-[18px] w-[18px] opacity-50" aria-hidden />
            </Button>
        );
    }

    return (
        <>
            {/* ── Trigger: Bell button ── */}
            <Sheet open={open} onOpenChange={setOpen}>
                <SheetTrigger asChild>
                    <Button
                        variant="ghost"
                        size="icon"
                        type="button"
                        className="relative h-11 min-h-11 min-w-11 w-11 touch-manipulation rounded-full transition-colors duration-200 hover:bg-muted"
                        aria-label={
                            unreadCount > 99
                                ? t('notificationCenter.triggerOverflow')
                                : unreadCount > 0
                                  ? t('notificationCenter.triggerUnread').replace('{count}', String(unreadCount))
                                  : t('notificationCenter.trigger')
                        }
                    >
                        <Bell className="h-[18px] w-[18px]" aria-hidden />
                        {unreadCount > 0 && (
                            <Motion.span
                                key={unreadCount}
                                initial={{ scale: 0.5 }}
                                animate={{ scale: 1 }}
                                className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 bg-red-500 text-white text-[10px] rounded-full flex items-center justify-center font-bold shadow-sm"
                            >
                                {unreadCount > 99 ? '99+' : unreadCount}
                            </Motion.span>
                        )}
                    </Button>
                </SheetTrigger>

                <SheetContent side="right" className="w-full sm:max-w-md p-0 flex flex-col pb-[max(0.75rem,env(safe-area-inset-bottom,0px))]">
                    {/* Header */}
                    <SheetHeader className="px-5 pt-5 pb-3 border-b space-y-3">
                        <div className="flex items-center justify-between">
                            <SheetTitle className="flex items-center gap-2 text-lg">
                                <Bell className="h-5 w-5 shrink-0" aria-hidden />
                                {t('notificationCenter.title')}
                                {unreadCount > 0 && (
                                    <Badge variant="secondary" className="text-xs tabular-nums">
                                        {unreadCount} {t('notificationCenter.newBadge')}
                                    </Badge>
                                )}
                            </SheetTitle>
                            {unreadCount > 0 && (
                                <Button variant="ghost" size="sm" className="h-8 text-xs gap-1.5" onClick={markAllAsRead}>
                                    <CheckCheck className="h-3.5 w-3.5" />
                                    {t('notificationCenter.markAllRead')}
                                </Button>
                            )}
                        </div>

                        {/* Filter tabs */}
                        <div className="flex gap-1 p-1 rounded-lg bg-muted/50 w-fit">
                            {(['all', 'unread'] as const).map((tab) => (
                                <button
                                    key={tab}
                                    onClick={() => setFilter(tab)}
                                    className={`cursor-pointer px-3 py-1.5 rounded-md text-xs font-medium transition-colors duration-200 ${filter === tab
                                            ? 'bg-background text-foreground shadow-sm'
                                            : 'text-muted-foreground hover:text-foreground'
                                        }`}
                                >
                                    {tab === 'all' ? t('notificationCenter.tabAll') : t('notificationCenter.tabUnread')}
                                    {tab === 'unread' && unreadCount > 0 && (
                                        <span className="ml-1.5 text-[10px] tabular-nums bg-red-500/15 text-red-600 dark:text-red-400 px-1.5 py-0.5 rounded-full">
                                            {unreadCount}
                                        </span>
                                    )}
                                </button>
                            ))}
                        </div>
                    </SheetHeader>

                    <div role="region" aria-label={t('notificationCenter.listRegion')} className="flex-1 overflow-y-auto">
                        {filteredNotifications.length === 0 ? (
                            <div className="flex flex-col items-center justify-center py-20 px-6 text-center">
                                <div className="w-16 h-16 rounded-2xl bg-muted/50 flex items-center justify-center mb-4">
                                    <BellOff className="h-8 w-8 text-muted-foreground/50" />
                                </div>
                                <p className="font-medium text-muted-foreground">
                                    {filter === 'unread' ? t('notificationCenter.emptyUnreadFilter') : t('notificationCenter.emptyNone')}
                                </p>
                                <p className="text-sm text-muted-foreground/70 mt-1">
                                    {filter === 'unread' ? t('notificationCenter.hintUnread') : t('notificationCenter.hintNone')}
                                </p>
                                {filter === 'unread' && notifications.length > 0 && (
                                    <Button variant="ghost" size="sm" className="mt-3 text-xs" onClick={() => setFilter('all')}>
                                        <Filter className="h-3.5 w-3.5 mr-1.5" />
                                        {t('notificationCenter.showAll')}
                                    </Button>
                                )}
                            </div>
                        ) : (
                            <AnimatePresence mode="popLayout">
                                {filteredNotifications.map((n, i) => {
                                    const Icon = getIcon(n.type);
                                    return (
                                        <Motion.div
                                            key={n.id}
                                            initial={{ opacity: 0, x: 16 }}
                                            animate={{ opacity: 1, x: 0 }}
                                            exit={{ opacity: 0, x: -16, height: 0 }}
                                            transition={{ delay: Math.min(i, 10) * 0.02, type: 'spring', stiffness: 300, damping: 30 }}
                                            layout
                                        >
                                            <div
                                                className={`group flex w-full items-stretch border-b border-border/50 transition-colors duration-200 hover:bg-muted/50 ${!n.isRead ? 'bg-primary/[0.03]' : ''
                                                    }`}
                                            >
                                                <button
                                                    type="button"
                                                    onClick={() => openDetail(n)}
                                                    className="flex min-w-0 flex-1 touch-manipulation cursor-pointer items-start gap-3 px-5 py-4 text-left"
                                                >
                                                    <div className={`mt-0.5 shrink-0 rounded-xl p-2 ${getBg(n.type)}`}>
                                                        <Icon className={`h-4 w-4 ${getColor(n.type)}`} />
                                                    </div>
                                                    <div className="min-w-0 flex-1">
                                                        <div className="flex items-start justify-between gap-2">
                                                            <p className={`text-sm leading-tight ${!n.isRead ? 'font-semibold text-foreground' : 'text-foreground/80'}`}>
                                                                {n.title}
                                                            </p>
                                                            {!n.isRead && (
                                                                <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-primary" />
                                                            )}
                                                        </div>
                                                        <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{n.message}</p>
                                                        <div className="mt-1.5 flex items-center justify-between">
                                                            <p className="text-[11px] text-muted-foreground/70">{formatTime(n.createdAt)}</p>
                                                            <span className="flex items-center gap-0.5 text-[11px] text-primary opacity-0 transition-opacity group-hover:opacity-100">
                                                                {t('notificationCenter.detail')} <ExternalLink className="h-2.5 w-2.5" />
                                                            </span>
                                                        </div>
                                                    </div>
                                                </button>
                                                <div className="flex shrink-0 flex-col items-end gap-1.5 py-4 pr-3 pl-0 sm:flex-row sm:items-start">
                                                    {session?.user?.role === 'CUSTOMER' &&
                                                        (n.type === 'BIRTHDAY_CLAIM' || n.data?.cta === 'birthday_claim') && (
                                                        <Button
                                                            variant="default"
                                                            size="sm"
                                                            className="h-8 touch-manipulation px-2.5 text-xs gap-1"
                                                            disabled={birthdayClaiming}
                                                            onClick={(e) => void claimBirthdayBonusFromList(n, e)}
                                                        >
                                                            <Gift className="h-3.5 w-3.5 shrink-0" aria-hidden />
                                                            {t('notificationCenter.ctaClaimBirthdayBonus')}
                                                        </Button>
                                                    )}
                                                    <Button
                                                        variant="ghost"
                                                        size="icon"
                                                        className="mt-0.5 h-7 w-7 opacity-0 transition-opacity group-hover:opacity-100"
                                                        onClick={(e) => deleteNotification(n.id, e)}
                                                        aria-label={t('common.delete')}
                                                    >
                                                        <Trash2 className="h-3.5 w-3.5 text-muted-foreground hover:text-destructive" />
                                                    </Button>
                                                </div>
                                            </div>
                                        </Motion.div>
                                    );
                                })}
                            </AnimatePresence>
                        )}
                    </div>
                </SheetContent>
            </Sheet>

            {/* ── Detail Modal ── */}
            <Dialog open={detailOpen} onOpenChange={setDetailOpen}>
                <DialogContent className="sm:max-w-lg">
                    {selected && (
                        <>
                            <DialogHeader>
                                <div className="flex items-start gap-4">
                                    <Motion.div
                                        initial={{ scale: 0 }}
                                        animate={{ scale: 1 }}
                                        transition={{ type: 'spring', stiffness: 200 }}
                                        className={`p-3 rounded-full shrink-0 ${getBg(selected.type)}`}
                                    >
                                        {(() => { const I = getIcon(selected.type); return <I className={`h-6 w-6 ${getColor(selected.type)}`} />; })()}
                                    </Motion.div>
                                    <div className="flex-1">
                                        <DialogTitle className="text-lg">{selected.title}</DialogTitle>
                                        <DialogDescription className="mt-1">{formatFullDate(selected.createdAt)}</DialogDescription>
                                    </div>
                                    <Badge
                                        variant={
                                            selected.type === 'success' ? 'default' :
                                                selected.type === 'warning' ? 'secondary' :
                                                    selected.type === 'error' ? 'destructive' :
                                                        selected.type === 'BIRTHDAY_CLAIM' ? 'secondary' : 'outline'
                                        }
                                        className="shrink-0"
                                    >
                                        {selected.type === 'success'
                                            ? t('notificationCenter.typeSuccess')
                                            : selected.type === 'warning'
                                              ? t('notificationCenter.typeWarning')
                                              : selected.type === 'error'
                                                ? t('notificationCenter.typeError')
                                                : selected.type === 'info'
                                                  ? t('notificationCenter.typeInfo')
                                                  : t('notificationCenter.typeInfo')}
                                    </Badge>
                                </div>
                            </DialogHeader>

                            <Separator className="my-4" />

                            <Motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="space-y-4">
                                <div className="p-4 rounded-lg bg-muted/50">
                                    <p className="text-sm leading-relaxed whitespace-pre-wrap">{selected.message}</p>
                                </div>

                                {selected.data && Object.keys(selected.data).length > 0 && (
                                    <div className="space-y-2">
                                        <p className="text-sm font-medium text-muted-foreground">{t('notificationCenter.extraDataTitle')}</p>
                                        <div className="p-4 rounded-lg bg-muted/30 border">
                                            <div className="grid grid-cols-2 gap-3">
                                                {Object.entries(selected.data).map(([key, value]) => (
                                                    <div key={key} className="space-y-1">
                                                        <p className="text-xs text-muted-foreground capitalize">{key.replace(/_/g, ' ')}</p>
                                                        <p className="text-sm font-medium">{typeof value === 'object' ? JSON.stringify(value) : String(value)}</p>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    </div>
                                )}

                                <div className="flex items-center justify-between pt-2 flex-wrap gap-2">
                                    {session?.user?.role === 'CUSTOMER' &&
                                        (selected.type === 'BIRTHDAY_CLAIM' || selected.data?.cta === 'birthday_claim') ? (
                                        <Button
                                            size="sm"
                                            className="bg-primary"
                                            disabled={birthdayClaiming}
                                            onClick={() => void claimBirthdayBonus()}
                                        >
                                            <Gift className="h-4 w-4 mr-2" aria-hidden />
                                            {birthdayClaiming ? t('customerBirthdayPopup.claiming') : t('notificationCenter.ctaClaimBirthdayBonus')}
                                        </Button>
                                    ) : null}
                                    {session?.user?.role === 'CUSTOMER' &&
                                        selected.data?.type === 'remedy_campaign' &&
                                        typeof selected.data?.remedyOfferId === 'string' ? (
                                        <Button
                                            size="sm"
                                            className="bg-amber-500 hover:bg-amber-600"
                                            onClick={() => {
                                                setDetailOpen(false);
                                                router.push(`/customer/remedy/${selected.data?.remedyOfferId ?? ''}`);
                                            }}
                                        >
                                            <ExternalLink className="h-4 w-4 mr-2" />
                                            {t('notificationCenter.ctaChooseRemedy')}
                                        </Button>
                                    ) : null}
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        className="text-destructive hover:text-destructive hover:bg-destructive/10"
                                        onClick={() => {
                                            deleteNotification(selected.id);
                                            setDetailOpen(false);
                                        }}
                                    >
                                        <Trash2 className="h-4 w-4 mr-2" />
                                        {t('notificationCenter.deleteOne')}
                                    </Button>
                                    <Button size="sm" onClick={() => setDetailOpen(false)}>{t('notificationCenter.closeOk')}</Button>
                                </div>
                            </Motion.div>
                        </>
                    )}
                </DialogContent>
            </Dialog>
        </>
    );
}
