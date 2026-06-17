'use client';

import { useNotificationStream } from '@/lib/use-notification-stream';
import { toast } from '@/lib/admin-toast';

/**
 * Dealer panelinde gerçek zamanlı bildirim akışını dinler (SSE) ve yeni bildirim
 * geldiğinde toast gösterir. Mevcut polling tabanlı rozeti bozmaz; eklemeli.
 * Negatif feedback/uyarı gibi olaylar 30sn yerine ~3sn içinde görünür.
 */
export function RealtimeNotifications() {
  useNotificationStream({
    onNotification: (n) => {
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
