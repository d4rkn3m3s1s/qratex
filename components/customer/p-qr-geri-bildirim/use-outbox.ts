'use client';

/**
 * Çevrimdışı kuyruk boşaltma: sayfa açılınca ve `online` olayında bekleyen yorumları
 * (kendi `Idempotency-Key`'leriyle) gönderir. Geçici hatada (ağ, 5xx, 429) bekler; kalıcı
 * hatada (doğrulama, QR kapalı, çakışma) düşürür — sonsuz deneme yok.
 */
import * as React from 'react';
import { postFeedback } from './api';
import { addClaim, readOutbox, writeOutbox, type OutboxItem } from './storage';

const RETRYABLE = new Set(['network', 'server', 'rate_limited']);

export function useOutbox(onSent: (count: number) => void) {
  const [pending, setPending] = React.useState(0);
  const busy = React.useRef(false);
  const onSentRef = React.useRef(onSent);
  React.useEffect(() => {
    onSentRef.current = onSent;
  }, [onSent]);

  const flush = React.useCallback(async () => {
    if (busy.current) return;
    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      setPending(readOutbox().length);
      return;
    }
    busy.current = true;
    try {
      const items = readOutbox();
      // Zaman aşımına uğrayanları kalıcı olarak temizle.
      writeOutbox(items);
      const keep: OutboxItem[] = [];
      let sent = 0;
      for (const item of items) {
        const res = await postFeedback(item.code, item.body, item.idemKey);
        if (res.ok) {
          sent += 1;
          const r = res.data.reward;
          if (r.status === 'claimable') {
            addClaim({ token: r.claimToken, code: item.code, venueName: item.venueName, points: r.points, expiresAt: r.expiresAt });
          }
        } else if (RETRYABLE.has(res.kind)) {
          keep.push(item);
          if (res.kind === 'network') {
            // Bağlantı yine yok: kalanları da sonra dene.
            keep.push(...items.slice(items.indexOf(item) + 1));
            break;
          }
        }
      }
      writeOutbox(keep);
      setPending(keep.length);
      if (sent > 0) onSentRef.current(sent);
    } finally {
      busy.current = false;
    }
  }, []);

  React.useEffect(() => {
    setPending(readOutbox().length);
    void flush();
    const onOnline = () => void flush();
    window.addEventListener('online', onOnline);
    return () => window.removeEventListener('online', onOnline);
  }, [flush]);

  return { pending, flush, refreshPending: () => setPending(readOutbox().length) };
}
