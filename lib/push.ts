import webpush from "web-push";
import prisma from "@/lib/prisma";
import { isAllowedPushEndpoint } from "@/lib/push-endpoint";
import { decodeNativeEndpoint, isNativeEndpoint, sendNative, type NativePushPayload } from "@/lib/push-native";
import { isUserChannelEnabled } from "@/lib/notify-prefs-server";

/**
 * TEK PUSH CEPHESİ — `sendPush(userId, payload)`.
 *
 * Bir kullanıcının TÜM etkin cihazlarına gider:
 *  • web-push (VAPID) — tarayıcı/PWA abonelikleri,
 *  • native — Capacitor FCM (Android) / APNs (iOS) jetonları (`endpoint = "native:…"`, lib/push-native).
 * `payload.kind` verilirse kullanıcının o tür grubu için "push" kanalı tercihi okunur (kapalıysa hiç
 * gönderilmez). Her sağlayıcı env yoksa SESSİZCE atlanır. Hata akışı bozmaz (false döner).
 */
export type PushPayload = NativePushPayload;

const publicVapidKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || "";
const privateVapidKey = process.env.VAPID_PRIVATE_KEY || "";
const subject = process.env.VAPID_SUBJECT || "mailto:support@qratex.com";

if (publicVapidKey && privateVapidKey) {
    webpush.setVapidDetails(subject, publicVapidKey, privateVapidKey);
}

type LogEntry = {
    userId: string;
    subscriptionId: string;
    title: string;
    body: string;
    data: { url: string | undefined; icon: string | undefined };
    status: string;
    error?: string;
};

export async function sendPush(userId: string, payload: PushPayload): Promise<boolean> {
    try {
        if (payload.kind && !(await isUserChannelEnabled(userId, payload.kind, "push"))) return false;

        const webEnabled = !!(publicVapidKey && privateVapidKey);
        const rows = await prisma.pushSubscription.findMany({
            where: { userId, isActive: true },
            orderBy: { createdAt: "desc" },
            take: 20,
        });
        if (!rows.length) return false;

        const nativeRows: Array<{ id: string; platform: "fcm" | "apns"; token: string }> = [];
        const webRows: typeof rows = [];
        const rejectedIds: string[] = [];
        for (const sub of rows) {
            if (isNativeEndpoint(sub.endpoint)) {
                const d = decodeNativeEndpoint(sub.endpoint);
                if (d) nativeRows.push({ id: sub.id, ...d });
                else rejectedIds.push(sub.id);
            } else if (isAllowedPushEndpoint(sub.endpoint)) {
                webRows.push(sub);
            } else {
                // Bilinen push servisi dışındaki uç noktaya ASLA istek atılmaz (SSRF) → pasifleştir.
                rejectedIds.push(sub.id);
            }
        }
        if (rejectedIds.length > 0) {
            await prisma.pushSubscription
                .updateMany({ where: { id: { in: rejectedIds } }, data: { isActive: false } })
                .catch((e) => console.error("invalid push endpoint deactivate failed:", e));
        }

        const { title, body, url, icon } = payload;
        const logEntries: LogEntry[] = [];
        const staleSubIds: string[] = [];
        const log = (subscriptionId: string, status: string, error?: string) =>
            logEntries.push({ userId, subscriptionId, title, body, data: { url, icon }, status, ...(error ? { error } : {}) });

        const webJson = JSON.stringify({ title, body, icon, data: { url } });
        const tasks: Array<Promise<boolean>> = [];

        if (webEnabled) {
            for (const sub of webRows) {
                tasks.push(
                    webpush
                        .sendNotification({ endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } }, webJson)
                        .then(() => {
                            log(sub.id, "SENT");
                            return true;
                        })
                        .catch((err: any) => {
                            if (err?.statusCode === 404 || err?.statusCode === 410) staleSubIds.push(sub.id);
                            log(sub.id, "FAILED", err?.message);
                            return false;
                        })
                );
            }
        }
        for (const n of nativeRows) {
            tasks.push(
                sendNative(n.platform, n.token, payload).then((r) => {
                    if (r === null) return false; // sağlayıcı yapılandırılmamış → sessizce atla (log yok)
                    if (r.ok) {
                        log(n.id, "SENT");
                        return true;
                    }
                    if (r.stale) staleSubIds.push(n.id);
                    log(n.id, "FAILED", r.error);
                    return false;
                })
            );
        }
        if (!tasks.length) return false;

        const results = await Promise.all(tasks);

        if (staleSubIds.length > 0) {
            await prisma.pushSubscription
                .deleteMany({ where: { id: { in: staleSubIds } } })
                .catch((e) => console.error("stale push sub cleanup failed:", e));
        }
        if (logEntries.length > 0) {
            await prisma.pushNotificationLog
                .createMany({ data: logEntries })
                .catch((e) => console.error("push log batch failed:", e));
        }
        return results.some(Boolean);
    } catch (error) {
        console.error("sendPush Error:", error);
        return false;
    }
}

/** Geriye dönük uyumlu imza — yeni kod `sendPush` kullanmalı. */
export async function sendPushNotification(
    userId: string,
    title: string,
    body: string,
    url?: string,
    icon?: string,
    kind?: string
) {
    return sendPush(userId, { title, body, url, icon, kind });
}
