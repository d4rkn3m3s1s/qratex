import { useState, useEffect } from "react";
import { toast } from "sonner";

export function usePushNotifications() {
    const [isSupported, setIsSupported] = useState(false);
    const [subscription, setSubscription] = useState<PushSubscription | null>(null);
    const [loading, setLoading] = useState(true);
    const [isSubscribed, setIsSubscribed] = useState(false);

    useEffect(() => {
        if (typeof window !== "undefined" && "serviceWorker" in navigator && "PushManager" in window) {
            setIsSupported(true);
            registerServiceWorker();
        } else {
            setLoading(false);
        }
    }, []);

    const registerServiceWorker = async () => {
        try {
            const registration = await navigator.serviceWorker.register("/push-sw.js", {
                scope: "/",
            });

            // Ensure the service worker is active before proceeding
            if (registration.installing) {
                registration.installing.addEventListener("statechange", (e) => {
                    if ((e.target as ServiceWorker).state === "activated") {
                        checkSubscription(registration);
                    }
                });
            } else if (registration.active) {
                checkSubscription(registration);
            }
        } catch (err) {
            console.error("Service Worker registration failed:", err);
            setLoading(false);
        }
    };

    const checkSubscription = async (registration: ServiceWorkerRegistration) => {
        try {
            const sub = await registration.pushManager.getSubscription();
            setSubscription(sub);
            setIsSubscribed(!!sub);
        } catch (err) {
            console.error("Check subscription error:", err);
        } finally {
            setLoading(false);
        }
    };

    const urlBase64ToUint8Array = (base64String: string) => {
        const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
        const base64 = (base64String + padding).replace(/\-/g, "+").replace(/_/g, "/");

        const rawData = window.atob(base64);
        const outputArray = new Uint8Array(rawData.length);

        for (let i = 0; i < rawData.length; ++i) {
            outputArray[i] = rawData.charCodeAt(i);
        }
        return outputArray;
    };

    const subscribeToPush = async () => {
        try {
            setLoading(true);

            const registration = await navigator.serviceWorker.ready;

            const pwaPubKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;

            if (!pwaPubKey) {
                toast.error("VAPID public key eksik.");
                return;
            }

            const sub = await registration.pushManager.subscribe({
                userVisibleOnly: true,
                applicationServerKey: urlBase64ToUint8Array(pwaPubKey),
            });

            setSubscription(sub);
            setIsSubscribed(true);

            // Backend'e gönder
            const res = await fetch("/api/customer/push", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ subscription: sub }),
            });

            if (!res.ok) {
                throw new Error("Sunucuya kaydedilemedi");
            }

            toast.success("Bildirimlere abone olundu.");
        } catch (error) {
            console.error("Subscribe error:", error);
            toast.error("Bildirimlere abone olunamadı.");
            setIsSubscribed(false);
            setSubscription(null);
        } finally {
            setLoading(false);
        }
    };

    const unsubscribeFromPush = async () => {
        try {
            setLoading(true);

            if (subscription) {
                await subscription.unsubscribe();

                // Backend'den sil
                await fetch("/api/customer/push", {
                    method: "DELETE",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ endpoint: subscription.endpoint }),
                });
            }

            setSubscription(null);
            setIsSubscribed(false);
            toast.success("Bildirimlerden çıkıldı.");
        } catch (error) {
            console.error("Unsubscribe error:", error);
            toast.error("Bildirim iptali başarısız oldu.");
        } finally {
            setLoading(false);
        }
    };

    return {
        isSupported,
        isSubscribed,
        loading,
        subscribeToPush,
        unsubscribeFromPush,
    };
}
