'use client';

import { useEffect, useLayoutEffect, useRef, useState } from 'react';

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

    const connect = () => {
      if (stopped) return;
      const url = sinceRef.current
        ? `/api/dealer/notifications/stream?since=${encodeURIComponent(sinceRef.current)}`
        : '/api/dealer/notifications/stream';
      es = new EventSource(url);

      es.addEventListener('open', () => setConnected(true));

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
        } catch { /* ignore */ }
      });

      es.addEventListener('error', () => {
        setConnected(false);
        // EventSource kendi yeniden bağlanmasını yapar; ama kapanmışsa elle aç.
        if (es && es.readyState === EventSource.CLOSED && !stopped) {
          es.close();
          setTimeout(connect, 3000);
        }
      });
    };

    connect();

    return () => {
      stopped = true;
      es?.close();
      setConnected(false);
    };
  }, [enabled]);

  return { connected };
}
