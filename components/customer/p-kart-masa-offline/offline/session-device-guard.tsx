'use client';

/**
 * Oturum ↔ cihaz verisi bekçisi (global; components/providers.tsx içinde bir kez).
 *
 *  1. Oturum açan kullanıcı cihazdaki son kullanıcıdan farklıysa: kişisel SW önbellekleri ve
 *     diğer kullanıcıların çevrimdışı kart görüntüleri silinir (paylaşılan cihaz, rapor offline
 *     bulgu 2). Son kullanıcı id'si yazılır → çevrimdışı sayfa yalnız onun kartını gösterir.
 *  2. Çevrimiçiyken sunucu KESİN olarak "oturum yok" derse (çıkış yapıldı): hepsi silinir.
 *     Çevrimdışıyken (`unauthenticated` ağ hatasından da gelebilir) hiçbir şey silinmez.
 *  3. Çevrimdışı yedek sayfa gösterimleri (offline sayfasının yazdığı günlük) bağlantı gelince
 *     rızaya bağlı analitiğe (`track`) gönderilir ve günlük temizlenir.
 *
 * Görünür çıktı yok. Hata olursa sessizce geçer (temizlik "en iyi çaba").
 */
import { useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { track } from '@/lib/analytics';
import {
  clearOfflineLog,
  clearUserRuntimeCaches,
  purgeSnapshots,
  readOfflineLog,
  readSessionUid,
  redactPath,
  writeSessionUid,
} from './device-data';

function local(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function cachesApi(): CacheStorage | null {
  return typeof caches === 'undefined' ? null : caches;
}

export function SessionDeviceGuard() {
  const { data, status } = useSession();
  const uid = (data?.user as { id?: string } | undefined)?.id ?? null;

  useEffect(() => {
    const storage = local();
    if (status === 'authenticated' && uid) {
      const prev = readSessionUid(storage);
      if (prev !== uid) {
        void clearUserRuntimeCaches(cachesApi());
        purgeSnapshots(storage, uid);
      }
      writeSessionUid(storage, uid);
      return;
    }
    if (status !== 'unauthenticated' || !readSessionUid(storage)) return;
    if (typeof navigator !== 'undefined' && navigator.onLine === false) return;

    // `unauthenticated` ağ hatasından da gelebilir: sunucudan kesin yanıt alınmadan silme.
    let cancelled = false;
    fetch('/api/auth/session', { cache: 'no-store', credentials: 'same-origin' })
      .then((r) => (r.ok ? r.json() : null))
      .then((json: unknown) => {
        if (cancelled || !json || typeof json !== 'object') return;
        if ((json as { user?: unknown }).user) return;
        void clearUserRuntimeCaches(cachesApi());
        purgeSnapshots(storage, null);
        writeSessionUid(storage, null);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [status, uid]);

  // Çevrimdışı yedek sayfa gösterimlerini bağlantı gelince gönder.
  useEffect(() => {
    const flush = () => {
      if (navigator.onLine === false) return;
      const storage = local();
      const entries = readOfflineLog(storage);
      if (entries.length === 0) return;
      for (const e of entries) {
        track('offline_fallback_shown', { path: redactPath(e.path), offlineAt: new Date(e.at).toISOString() });
      }
      clearOfflineLog(storage);
    };
    flush();
    window.addEventListener('online', flush);
    return () => window.removeEventListener('online', flush);
  }, []);

  return null;
}
