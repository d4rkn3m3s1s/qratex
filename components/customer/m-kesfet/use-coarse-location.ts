'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { coarsen } from '@/lib/places/geo';

/**
 * Kaba konum durum makinesi — Keşfet'in tek konum kaynağı.
 *
 *   idle → (izin verilmiş ve kayıt yok) locating → ready
 *        → (kullanıcı ister) locating → ready | denied | unavailable
 *   unsupported: tarayıcıda geolocation yok.
 *
 * Eski sayfanın hatası (konum yokken `loading` hiç false olmuyor → sonsuz iskelet, izin reddi
 * kartı hiç görünmüyor) yapısal olarak kapanır: her durum açıkça adlandırılır.
 * Gizlilik: yalnız ~110 m'ye yuvarlanmış konum, 24 saat saklanır (önceden ham GPS 7 gün);
 * eski anahtar ilk açılışta silinir. localStorage erişilemezse sessizce bellekte kalır.
 */
export type LocationStatus = 'idle' | 'locating' | 'ready' | 'denied' | 'unavailable' | 'unsupported';

export interface CoarseLocation {
  lat: number;
  lng: number;
  /** Konumun alındığı an (ms). */
  at: number;
}

const STORAGE_KEY = 'qratex-places-loc-v2';
const LEGACY_KEY = 'qratex-customer-nearby-loc';
const MAX_AGE_MS = 24 * 60 * 60 * 1000;
/** Bu yaştan eski konumda "güncelle" önerilir. */
export const STALE_LOCATION_MS = 30 * 60 * 1000;

function readStored(): CoarseLocation | null {
  try {
    window.localStorage.removeItem(LEGACY_KEY);
  } catch {
    /* yok say */
  }
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const v = JSON.parse(raw) as Partial<CoarseLocation>;
    if (typeof v.lat !== 'number' || typeof v.lng !== 'number' || typeof v.at !== 'number') throw new Error('bozuk');
    if (!Number.isFinite(v.lat) || !Number.isFinite(v.lng) || Date.now() - v.at > MAX_AGE_MS) throw new Error('eski');
    return { lat: coarsen(v.lat), lng: coarsen(v.lng), at: v.at };
  } catch {
    try {
      window.localStorage.removeItem(STORAGE_KEY);
    } catch {
      /* yok say */
    }
    return null;
  }
}

function writeStored(loc: CoarseLocation | null): void {
  try {
    if (loc) window.localStorage.setItem(STORAGE_KEY, JSON.stringify(loc));
    else window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* özel mod / kota */
  }
}

export function useCoarseLocation() {
  const [status, setStatus] = useState<LocationStatus>('idle');
  const [location, setLocation] = useState<CoarseLocation | null>(null);
  /** Kayıtlı konum okundu (ilk açılışta konumsuz isteği boşa atmamak için). */
  const [initialized, setInitialized] = useState(false);
  const requestedRef = useRef(false);

  const request = useCallback(() => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      setStatus('unsupported');
      return;
    }
    setStatus('locating');
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const loc = { lat: coarsen(pos.coords.latitude), lng: coarsen(pos.coords.longitude), at: Date.now() };
        setLocation(loc);
        writeStored(loc);
        setStatus('ready');
      },
      (err) => {
        setStatus(err.code === err.PERMISSION_DENIED ? 'denied' : 'unavailable');
      },
      { enableHighAccuracy: false, timeout: 15_000, maximumAge: 5 * 60_000 },
    );
  }, []);

  const clear = useCallback(() => {
    writeStored(null);
    setLocation(null);
    setStatus('idle');
  }, []);

  useEffect(() => {
    const stored = readStored();
    if (stored) {
      setLocation(stored);
      setStatus('ready');
    }
    setInitialized(true);
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      if (!stored) setStatus('unsupported');
      return;
    }
    // İzin daha önce verilmişse sormadan tazele (kayıt yoksa ya da eskiyse).
    const perms = (navigator as Navigator & { permissions?: Permissions }).permissions;
    if (!perms?.query) return;
    perms
      .query({ name: 'geolocation' as PermissionName })
      .then((p) => {
        if (requestedRef.current) return;
        if (p.state === 'granted' && (!stored || Date.now() - stored.at > STALE_LOCATION_MS)) {
          requestedRef.current = true;
          request();
        } else if (p.state === 'denied' && !stored) {
          setStatus('denied');
        }
      })
      .catch(() => {
        /* Safari eski sürümler */
      });
  }, [request]);

  return { status, location, initialized, request, clear };
}
