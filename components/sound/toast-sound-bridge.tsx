'use client';

import { useEffect, useRef } from 'react';
import { useSonner } from 'sonner';
import { playSound } from '@/lib/sound';

/**
 * Toast seslerinin TEK noktası: Sonner'ın görünür toast listesini izler, YENİ
 * başarı → 'success', hata → 'error' çalar. Tüm `toast.success/error` çağrıları
 * (uygulamada yüzlerce) dokunulmadan sesli olur. Bilgi/uyarı/yükleniyor sessiz.
 * Bayi/admin'de tercih varsayılan KAPALI olduğundan orada ses çıkmaz.
 */
export function ToastSoundBridge() {
  const { toasts } = useSonner();
  const seen = useRef<Set<string | number>>(new Set());

  useEffect(() => {
    const live = new Set<string | number>();
    for (const t of toasts) {
      live.add(t.id);
      if (seen.current.has(t.id)) continue;
      seen.current.add(t.id);
      if (t.type === 'success') playSound('success');
      else if (t.type === 'error') playSound('error');
    }
    // Kapanan toast kimliklerini unut (aynı id ile güncellenen toast tekrar ses çıkarmasın diye
    // yalnız listeden düşenleri siliyoruz).
    for (const id of seen.current) if (!live.has(id)) seen.current.delete(id);
  }, [toasts]);

  return null;
}
