'use client';

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { nextReconnectDelayMs } from '@/lib/notification-stream-policy';
import { publishNotificationStreamItems, setNotificationStreamLive } from '@/lib/notification-stream-bus';

export interface StreamNotification {
  id: string;
  title: string;
  message: string;
  type: string;
  createdAt: string;
  isRead: boolean;
}

interface UseNotificationStreamOptions {
  /** Yeni bildirim geldiğinde çağrılır (ör. toast göster, rozet artır). */
  onNotification?: (n: StreamNotification) => void;
  /** İlk açılışta okunmamış sayısı geldiğinde. */
  onInit?: (unread: number) => void;
  /** Akışı aç/kapat (örn. yalnızca DEALER rolünde). */
  enabled?: boolean;
}

/**
 * Dealer gerçek zamanlı bildirim akışı (SSE). /api/dealer/notifications/stream'e
 * EventSource ile bağlanır; yeni bildirimleri callback'le iletir. Bağlantı
 * koparsa (serverless maxDuration) EventSource otomatik yeniden bağlanır; `since`
 * imleci ile kaçırma olmaz. 30sn polling yerine ~3sn gecikme.
 */
export function useNotificationStream({
  onNotification,
  onInit,
  enabled = true,
}: UseNotificationStreamOptions = {}) {
  const [connected, setConnected] = useState(false);
  const sinceRef = useRef<string | null>(null);
  // Callback'leri ref'te tut ki effect her render'da yeniden bağlanmasın.
  const onNotifRef = useRef(onNotification);
  const onInitRef = useRef(onInit);
  // Render sırasında ref'e yazmak yerine commit fazında güncelle.
  useLayoutEffect(() => {
    onNotifRef.current = onNotification;
    onInitRef.current = onInit;
  });

  useEffect(() => {
    if (!enabled || typeof window === 'undefined') return;

    let es: EventSource | null = null;
    let stopped = false;
    let failures = 0;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;

    const connect = () => {
      if (stopped) return;
      if (document.visibilityState === 'hidden') {
        // Gizliyken açılmaz; görünür olunca `onVisibility` yeniden bağlar.
        es?.close();
        es = null;
        return;
      }
      const url = sinceRef.current
        ? `/api/dealer/notifications/stream?since=${encodeURIComponent(sinceRef.current)}`
        : '/api/dealer/notifications/stream';
      es = new EventSource(url);

      es.addEventListener('open', () => {
        failures = 0;
        setConnected(true);
        setNotificationStreamLive(true);
      });

      es.addEventListener('init', (e) => {
        try {
          const data = JSON.parse((e as MessageEvent).data);
          if (typeof data.since === 'string') sinceRef.current = data.since;
          if (typeof data.unread === 'number') onInitRef.current?.(data.unread);
        } catch { /* ignore */ }
      });

      es.addEventListener('notifications', (e) => {
        try {
          const data = JSON.parse((e as MessageEvent).data);
          const items: StreamNotification[] = Array.isArray(data.items) ? data.items : [];
          for (const n of items) {
            sinceRef.current = n.createdAt;
            onNotifRef.current?.(n);
          }
          publishNotificationStreamItems(items.length);
        } catch { /* ignore */ }
      });

      // Sunucu akış ömrü doldu: güncel imleçle hemen yeniden bağlan (kaçırma yok).
      es.addEventListener('bye', (e) => {
        try {
          const data = JSON.parse((e as MessageEvent).data);
          if (typeof data.since === 'string' && !sinceRef.current) sinceRef.current = data.since;
        } catch { /* ignore */ }
        es?.close();
        if (!stopped) connect();
      });

      es.addEventListener('error', () => {
        setConnected(false);
        setNotificationStreamLive(false);
        // EventSource kendi yeniden bağlanmasını yapar; ama kapanmışsa (ör. 429 bağlantı sınırı)
        // elle aç — üstel geri çekilmeyle (3 sn → 60 sn), sunucuyu yeniden deneme fırtınasına boğmadan.
        if (es && es.readyState === EventSource.CLOSED && !stopped) {
          es.close();
          const delay = nextReconnectDelayMs(failures);
          failures += 1;
          retryTimer = setTimeout(connect, delay);
        }
      });
    };

    // Gizli sekmede akış KAPALI (mimari-api B9): her açık bayi sekmesi 60 sn'lik bir sunucu
    // fonksiyonunu sürekli açık tutuyor ve süresi dolunca yeniden bağlanıyordu. Görünür olunca
    // `since` imleciyle yeniden bağlanılır; aradaki bildirimler kaçırılmaz.
    const pause = () => {
      if (retryTimer) clearTimeout(retryTimer);
      retryTimer = null;
      es?.close();
      es = null;
      setConnected(false);
      setNotificationStreamLive(false);
    };
    const onVisibility = () => {
      if (stopped) return;
      if (document.visibilityState === 'hidden') pause();
      else if (!es) {
        failures = 0;
        connect();
      }
    };
    document.addEventListener('visibilitychange', onVisibility);
    if (document.visibilityState !== 'hidden') connect();

    return () => {
      stopped = true;
      document.removeEventListener('visibilitychange', onVisibility);
      if (retryTimer) clearTimeout(retryTimer);
      es?.close();
      setConnected(false);
      setNotificationStreamLive(false);
    };
  }, [enabled]);

  return { connected };
}
