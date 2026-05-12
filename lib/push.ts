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

                    await prisma.pushNotificationLog.create({
                        data: {
                            userId,
                            subscriptionId: sub.id,
                            title,
                            body,
                            data: { url, icon },
                            status: "SENT",
                        },
                    });
                } catch (err: any) {
                    if (err.statusCode === 404 || err.statusCode === 410) {
                        await prisma.pushSubscription.delete({ where: { id: sub.id } });
                    }

                    await prisma.pushNotificationLog.create({
                        data: {
                            userId,
                            subscriptionId: sub.id,
                            title,
                            body,
                            data: { url, icon },
                            status: "FAILED",
                            error: err.message,
                        },
                    });

                    throw err;
                }
            })
        );

        return results.some((r) => r.status === "fulfilled");
    } catch (error) {
        console.error("sendPushNotification Error:", error);
        return false;
    }
}
