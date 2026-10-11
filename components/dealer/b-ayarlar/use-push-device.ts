'use client';

import { useCallback, useEffect, useState } from 'react';
import { ensureServiceWorkerRegistration } from '@/lib/pwa/service-worker';
import { SettingsApiError } from './api';

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
 * "Bu cihaz" anlık bildirim aboneliği (bayi). İzin yalnız düğmeye basınca istenir. Sunucu
 * kaydı genel `/api/push/subscribe` ucuna gider; kaydedilemezse tarayıcı aboneliği de bırakılır
 * ("açık" görünüp bildirim gelmemesin).
 */
export function usePushDevice() {
  const [support, setSupport] = useState<PushSupport>('checking');
  const [endpoint, setEndpoint] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const evaluate = useCallback(async () => {
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
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') {
        await evaluate();
        throw new SettingsApiError(403, 'Bildirim izni verilmedi. Tarayıcı ayarlarından izin verebilirsiniz.', 'PUSH_DENIED', undefined, false);
      }
      await ensureServiceWorkerRegistration();
      const reg = await navigator.serviceWorker.ready;
      const key = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY as string;
      const sub =
        (await reg.pushManager.getSubscription()) ??
        (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(key) as BufferSource }));
      const res = await fetch('/api/push/subscribe', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(sub.toJSON()),
      });
      if (!res.ok) {
        await sub.unsubscribe().catch(() => undefined);
        throw new SettingsApiError(
          res.status,
          res.status === 409 ? 'Bu tarayıcı başka bir hesaba bağlı. O hesapta kapatıp tekrar deneyin.' : 'Cihaz kaydedilemedi.',
          'PUSH_ERROR',
          undefined,
          res.status >= 500
        );
      }
      setEndpoint(sub.endpoint);
    } finally {
      setBusy(false);
    }
  }, [evaluate]);

  const disable = useCallback(async () => {
    setBusy(true);
    try {
      const sub = await readSubscription();
      if (sub) {
        const ep = sub.endpoint;
        await sub.unsubscribe().catch(() => undefined);
        const res = await fetch('/api/push/subscribe', {
          method: 'DELETE',
          credentials: 'same-origin',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ endpoint: ep }),
        });
        if (!res.ok) throw new SettingsApiError(res.status, 'Cihaz kaydı kaldırılamadı.', 'PUSH_ERROR', undefined, true);
      }
      setEndpoint(null);
    } finally {
      setBusy(false);
    }
  }, []);

  return { support, subscribed: !!endpoint, busy, enable, disable };
}
