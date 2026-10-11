'use client';

import { useNotificationStream } from '@/lib/use-notification-stream';
import { toast } from '@/lib/admin-toast';
import { claimNotificationToast } from '@/lib/notification-toast-dedupe';

/**
 * Dealer panelinde gerçek zamanlı bildirim akışını dinler (SSE) ve yeni bildirim
 * geldiğinde toast gösterir. Bildirim merkezi listesi ayrıca (görünür sekmede) tazelenir;
 * aynı bildirim iki kanaldan gelirse toast'ı yalnız ilk gören açar (mimari-api B9).
 */
export function RealtimeNotifications() {
  useNotificationStream({
    onNotification: (n) => {
      if (!claimNotificationToast(n.id)) return;
      const variant =
        n.type === 'error' || n.type === 'warning'
          ? 'error'
          : n.type === 'success'
            ? 'success'
            : 'default';
      const text = n.title || n.message;
      if (variant === 'error') toast.error(text);
      else if (variant === 'success') toast.success(text);
      else toast(text);
    },
  });
  return null;
}
