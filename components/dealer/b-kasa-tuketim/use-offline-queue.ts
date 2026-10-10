'use client';

/**
 * Kasa çevrimdışı kuyruğu. Bağlantı yokken (ya da istek ağ hatasıyla düştüğünde) işlem bu
 * cihazda bekler; bağlantı gelince AYNI `clientOpId` ile `POST /api/dealer/consumptions`'a
 * sırayla gönderilir. Sunucu `@@unique(dealerId, clientOpId)` ile tekrar oynatmayı tek kayda
 * indirir (çift kayıt / çift puan yok). Kalıcı ret (kart bloklu vb.) listede gösterilir.
 *
 * Depolama yalnız bu cihazdır (localStorage, try/catch); sunucu kuyruğu (offline-sync) bağlantı
 * gerektirdiği için çevrimdışı senaryoyu çözmez.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  classifyReplay,
  enqueue,
  pendingItems,
  sanitizeQueue,
  type QueuedConsumption,
} from '@/lib/dealer/kasa/core';
import { KasaApiError, postJson } from './api';

const KEY = 'qx:kasa-queue:v1';

function load(): QueuedConsumption[] {
  try {
    return sanitizeQueue(JSON.parse(window.localStorage.getItem(KEY) ?? '[]'));
  } catch {
    return [];
  }
}

function persist(q: QueuedConsumption[]) {
  try {
    if (q.length === 0) window.localStorage.removeItem(KEY);
    else window.localStorage.setItem(KEY, JSON.stringify(q));
  } catch {
    /* depolama kapalı: kuyruk yalnız bu oturumda bellekte kalır */
  }
}

export function useOnline(): boolean {
  const [online, setOnline] = useState(true);
  useEffect(() => {
    setOnline(navigator.onLine !== false);
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => {
      window.removeEventListener('online', on);
      window.removeEventListener('offline', off);
    };
  }, []);
  return online;
}

export function useOfflineQueue(opts: { onSynced?: (n: number) => void } = {}) {
  const [queue, setQueue] = useState<QueuedConsumption[]>([]);
  const [syncing, setSyncing] = useState(false);
  const online = useOnline();
  const busyRef = useRef(false);
  const onSyncedRef = useRef(opts.onSynced);
  onSyncedRef.current = opts.onSynced;

  useEffect(() => setQueue(load()), []);

  const update = useCallback((fn: (q: QueuedConsumption[]) => QueuedConsumption[]) => {
    setQueue((prev) => {
      const next = fn(prev);
      persist(next);
      return next;
    });
  }, []);

  const add = useCallback((item: QueuedConsumption) => update((q) => enqueue(q, item)), [update]);
  const dismiss = useCallback((id: string) => update((q) => q.filter((x) => x.clientOpId !== id)), [update]);

  const flush = useCallback(async () => {
    if (busyRef.current) return;
    const items = pendingItems(load());
    if (items.length === 0) return;
    busyRef.current = true;
    setSyncing(true);
    let sent = 0;
    try {
      for (const item of items) {
        let status: number | null = null;
        let message = '';
        let code: string | null = null;
        try {
          await postJson('/api/dealer/consumptions', {
            cardToken: item.cardToken,
            productId: item.productId,
            amount: item.amount,
            note: item.note,
            clientOpId: item.clientOpId,
          });
          status = 200;
        } catch (e) {
          if (e instanceof KasaApiError) {
            status = e.status === 0 ? null : e.status;
            message = e.message;
            code = e.code;
          }
        }
        const outcome = classifyReplay(status);
        if (outcome === 'done') {
          sent += 1;
          update((q) => q.filter((x) => x.clientOpId !== item.clientOpId));
        } else if (outcome === 'rejected') {
          update((q) => q.map((x) => (x.clientOpId === item.clientOpId ? { ...x, failed: { code, message } } : x)));
        } else {
          break; // ağ / oran sınırı / sunucu: sırayı koru, sonra tekrar dene
        }
      }
    } finally {
      busyRef.current = false;
      setSyncing(false);
      if (sent > 0) onSyncedRef.current?.(sent);
    }
  }, [update]);

  // Bağlantı gelince ve açılışta gönder; çevrimiçiyken bekleyen varsa 30 sn'de bir dene.
  useEffect(() => {
    if (!online) return;
    void flush();
    const id = window.setInterval(() => void flush(), 30_000);
    return () => window.clearInterval(id);
  }, [online, flush]);

  return {
    queue,
    pending: pendingItems(queue),
    failed: queue.filter((q) => q.failed),
    online,
    syncing,
    add,
    dismiss,
    flush,
  };
}
