import webpush from "web-push";
import prisma from "@/lib/prisma";

const publicVapidKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || "";
const privateVapidKey = process.env.VAPID_PRIVATE_KEY || "";
const subject = process.env.VAPID_SUBJECT || "mailto:support@qratex.com";

if (publicVapidKey && privateVapidKey) {
    webpush.setVapidDetails(subject, publicVapidKey, privateVapidKey);
}

export async function sendPushNotification(
    userId: string,
    title: string,
    body: string,
    url?: string,
    icon?: string
) {
    try {
        if (!publicVapidKey || !privateVapidKey) {
            console.warn("VAPID keys not configured, skipping push notification.");
            return false;
        }

        const subscriptions = await prisma.pushSubscription.findMany({
            where: { userId, isActive: true },
        });

        if (!subscriptions.length) return false;

        const payload = JSON.stringify({
            title,
            body,
            icon,
            data: { url },
        });

        // Gönderimler paralel; loglar tek createMany'de toplanır (abone başına
        // ayrı insert yerine). Süresi dolan abonelikler (404/410) ayrıca silinir.
        type LogEntry = {
            userId: string;
            subscriptionId: string;
            title: string;
            body: string;
            data: { url: string | undefined; icon: string | undefined };
            status: string;
            error?: string;
        };
        const logEntries: LogEntry[] = [];
        const staleSubIds: string[] = [];

        const results = await Promise.allSettled(
            subscriptions.map(async (sub) => {
                try {
                    await webpush.sendNotification(
                        {
                            endpoint: sub.endpoint,
                            keys: {
                                p256dh: sub.p256dh,
                                auth: sub.auth,
                            },
                        },
                        payload
                    );
                    logEntries.push({
                        userId,
                        subscriptionId: sub.id,
                        title,
                        body,
                        data: { url, icon },
                        status: "SENT",
                    });
                } catch (err: any) {
                    if (err.statusCode === 404 || err.statusCode === 410) {
                        staleSubIds.push(sub.id);
                    }
                    logEntries.push({
                        userId,
                        subscriptionId: sub.id,
                        title,
                        body,
                        data: { url, icon },
                        status: "FAILED",
                        error: err?.message,
                    });
                    throw err;
                }
            })
        );

        // Toplu yazımlar (tek tek insert/delete yerine).
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

        return results.some((r) => r.status === "fulfilled");
    } catch (error) {
        console.error("sendPushNotification Error:", error);
        return false;
    }
}
