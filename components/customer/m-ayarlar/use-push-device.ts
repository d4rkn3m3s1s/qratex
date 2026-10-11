'use client';

import { useCallback, useEffect, useState } from 'react';
import { ensureServiceWorkerRegistration } from '@/lib/pwa/service-worker';
import { SettingsApiError } from './api';
import {
  getNativePushStatus,
  isNativePushPlatform,
  NativePushError,
  registerNativePush,
  unregisterNativePush,
} from '@/lib/native/push-client';

export type PushSupport = 'checking' | 'unsupported' | 'unconfigured' | 'denied' | 'ready';

function urlBase64ToUint8Array(base64: string): Uint8Array {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4);
  const raw = window.atob((base64 + padding).replace(/-/g, '+').replace(/_/g, '/'));
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

async function readSubscription(): Promise<PushSubscription | null> {
  if (!('serviceWorker' in navigator)) return null;
  const reg = await navigator.serviceWorker.getRegistration();
  return reg ? reg.pushManager.getSubscription() : null;
}

/**
 * "Bu cihaz" push aboneliği — tarayıcı desteği, izin durumu, abonelik ve sunucu kaydı.
 * Yalnız kullanıcı düğmeye basınca izin ister (sayfa açılışında izin penceresi yok).
 */
export function usePushDevice() {
  const [support, setSupport] = useState<PushSupport>('checking');
  const [endpoint, setEndpoint] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const evaluate = useCallback(async () => {
    // Capacitor (Android/iOS): FCM/APNs jetonu — web-push/VAPID yerine native akış.
    if (isNativePushPlatform()) {
      try {
        const st = await getNativePushStatus();
        setSupport(st.state);
        setEndpoint(st.token);
      } catch {
        setSupport('unsupported');
        setEndpoint(null);
      }
      return;
    }
    if (typeof window === 'undefined' || !('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) {
      setSupport('unsupported');
      return;
    }
    if (!process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY) {
      setSupport('unconfigured');
      return;
    }
    if (Notification.permission === 'denied') {
      setSupport('denied');
      setEndpoint(null);
      return;
    }
    try {
      const sub = await readSubscription();
      setEndpoint(sub?.endpoint ?? null);
    } catch {
      setEndpoint(null);
    }
    setSupport('ready');
  }, []);

  useEffect(() => {
    void evaluate();
  }, [evaluate]);

  const enable = useCallback(async () => {
    setBusy(true);
    try {
      if (isNativePushPlatform()) {
        try {
          setEndpoint(await registerNativePush());
        } catch (e) {
          await evaluate();
          if (e instanceof NativePushError && e.code === 'PUSH_DENIED') throw new SettingsApiError('denied', 403, 'PUSH_DENIED');
          throw new SettingsApiError('push', e instanceof NativePushError ? e.status : 0, 'PUSH_ERROR');
        }
        return;
      }
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') {
        await evaluate();
        throw new SettingsApiError('denied', 403, 'PUSH_DENIED');
      }
      await ensureServiceWorkerRegistration();
      const reg = await navigator.serviceWorker.ready;
      const key = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY as string;
      const sub =
        (await reg.pushManager.getSubscription()) ??
        (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(key) as BufferSource }));
      const res = await fetch('/api/customer/push', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subscription: sub.toJSON() }),
      });
      if (!res.ok) {
        // Sunucu kaydetmediyse tarayıcı aboneliğini de bırak: "açık" görünüp bildirim gelmemesin.
        await sub.unsubscribe().catch(() => undefined);
        throw new SettingsApiError('push', res.status, res.status === 409 ? 'PUSH_OTHER_ACCOUNT' : 'PUSH_ERROR');
      }
      setEndpoint(sub.endpoint);
    } finally {
      setBusy(false);
    }
  }, [evaluate]);

  const disable = useCallback(async () => {
    setBusy(true);
    try {
      if (isNativePushPlatform()) {
        try {
          await unregisterNativePush();
        } catch (e) {
          throw new SettingsApiError('push', e instanceof NativePushError ? e.status : 0, 'PUSH_ERROR');
        }
        setEndpoint(null);
        return;
      }
      const sub = await readSubscription();
      if (sub) {
        const ep = sub.endpoint;
        await sub.unsubscribe().catch(() => undefined);
        const res = await fetch('/api/customer/push', {
          method: 'DELETE',
          credentials: 'same-origin',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ endpoint: ep }),
        });
        if (!res.ok) throw new SettingsApiError('push', res.status, 'PUSH_ERROR');
      }
      setEndpoint(null);
    } finally {
      setBusy(false);
    }
  }, []);

  return { support, subscribed: !!endpoint, endpoint, busy, enable, disable, reevaluate: evaluate };
}
