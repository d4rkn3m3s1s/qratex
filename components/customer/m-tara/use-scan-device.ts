'use client';

/**
 * Tara yüzeyinin cihaz kancaları:
 *  - useCameraPermission: Permissions API ile kamera izni (granted / prompt / denied / unknown)
 *  - useTrackControls: açık video izinden fener (torch) ve yakınlaştırma (zoom)
 *  - useScanCopy: uygulama diline göre metinler
 *  - haptic: hareket politikasına bağlı titreşim
 *
 * Fener/zoom html5-qrcode API'si yerine doğrudan MediaStreamTrack üzerinden uygulanır:
 * ortak tarama kancasına (lib/hooks/use-qr-scanner) dokunmadan, kütüphane sürümünden bağımsız.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAppLocale } from '@/lib/app-locale';
import { getScanCopy, type ScanCopy, type ScanLocale, type PermissionGuidePlatform } from './copy';

export function useScanCopy(): { copy: ScanCopy; locale: ScanLocale } {
  const { locale } = useAppLocale();
  const l: ScanLocale = locale === 'en' ? 'en' : 'tr';
  return useMemo(() => ({ copy: getScanCopy(l), locale: l }), [l]);
}

export type CameraPermission = 'granted' | 'prompt' | 'denied' | 'unknown';

/** Kamera izni (Safari 16+, Chromium). Firefox `camera` sorgusunu desteklemez → 'unknown'. */
export function useCameraPermission(): { permission: CameraPermission; refresh: () => void } {
  const [permission, setPermission] = useState<CameraPermission>('unknown');
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let cancelled = false;
    let status: PermissionStatus | null = null;
    const onChange = () => {
      if (!cancelled && status) setPermission(status.state as CameraPermission);
    };
    const perms = typeof navigator !== 'undefined' ? navigator.permissions : undefined;
    if (!perms?.query) return;
    perms
      .query({ name: 'camera' as PermissionName })
      .then((s) => {
        if (cancelled) return;
        status = s;
        setPermission(s.state as CameraPermission);
        s.addEventListener?.('change', onChange);
      })
      .catch(() => {
        if (!cancelled) setPermission('unknown');
      });
    return () => {
      cancelled = true;
      status?.removeEventListener?.('change', onChange);
    };
  }, [tick]);

  const refresh = useCallback(() => setTick((n) => n + 1), []);
  return { permission, refresh };
}

/** Kaba işaretçili (dokunmatik) cihaz mı? SSR'de false. */
export function isCoarsePointer(): boolean {
  try {
    return typeof window !== 'undefined' && window.matchMedia('(pointer: coarse)').matches;
  } catch {
    return false;
  }
}

export function detectPlatform(): PermissionGuidePlatform {
  if (typeof navigator === 'undefined') return 'desktop';
  const ua = navigator.userAgent || '';
  const iPadOS = navigator.platform === 'MacIntel' && (navigator.maxTouchPoints ?? 0) > 1;
  if (/iPhone|iPad|iPod/i.test(ua) || iPadOS) return 'ios';
  if (/Android/i.test(ua)) return 'android';
  return 'desktop';
}

type ZoomRange = { min: number; max: number; step: number };

type TorchZoomCapabilities = MediaTrackCapabilities & {
  torch?: boolean;
  zoom?: { min?: number; max?: number; step?: number };
};

type TorchZoomSettings = MediaTrackSettings & { torch?: boolean; zoom?: number };

function findVideoTrack(elementId: string): MediaStreamTrack | null {
  if (typeof document === 'undefined') return null;
  const video = document.querySelector<HTMLVideoElement>(`#${CSS.escape(elementId)} video`);
  const stream = video?.srcObject;
  if (!stream || typeof (stream as MediaStream).getVideoTracks !== 'function') return null;
  const track = (stream as MediaStream).getVideoTracks()[0];
  return track && track.readyState === 'live' ? track : null;
}

export interface TrackControls {
  torchSupported: boolean;
  torchOn: boolean;
  toggleTorch: () => Promise<void>;
  zoom: ZoomRange | null;
  zoomValue: number;
  setZoom: (value: number) => Promise<void>;
}

/**
 * Kamera açıkken (`active`) video izinin yeteneklerini okur. Fener çoğu Android Chrome'da,
 * zoom Android Chrome ve bazı masaüstü kameralarda var; iOS Safari ikisini de açmaz →
 * düğmeler hiç gösterilmez (sahte kontrol yok).
 */
export function useTrackControls(elementId: string, active: boolean): TrackControls {
  const [torchSupported, setTorchSupported] = useState(false);
  const [torchOn, setTorchOn] = useState(false);
  const [zoom, setZoomRange] = useState<ZoomRange | null>(null);
  const [zoomValue, setZoomValue] = useState(1);

  useEffect(() => {
    if (!active) {
      setTorchSupported(false);
      setTorchOn(false);
      setZoomRange(null);
      return;
    }
    let cancelled = false;
    let tries = 0;
    // Video izi `playing` olayından hemen sonra hazır olur; birkaç kare dener.
    const probe = () => {
      if (cancelled) return;
      const track = findVideoTrack(elementId);
      if (!track) {
        if (tries++ < 20) window.setTimeout(probe, 150);
        return;
      }
      const caps = (typeof track.getCapabilities === 'function' ? track.getCapabilities() : {}) as TorchZoomCapabilities;
      const settings = (typeof track.getSettings === 'function' ? track.getSettings() : {}) as TorchZoomSettings;
      setTorchSupported(caps.torch === true);
      setTorchOn(settings.torch === true);
      const z = caps.zoom;
      if (z && typeof z.max === 'number' && typeof z.min === 'number' && z.max > z.min) {
        setZoomRange({ min: z.min, max: Math.min(z.max, z.min * 8), step: z.step && z.step > 0 ? z.step : 0.1 });
        setZoomValue(typeof settings.zoom === 'number' ? settings.zoom : z.min);
      } else {
        setZoomRange(null);
      }
    };
    probe();
    return () => {
      cancelled = true;
    };
  }, [elementId, active]);

  const toggleTorch = useCallback(async () => {
    const track = findVideoTrack(elementId);
    if (!track) return;
    const next = !torchOn;
    try {
      await track.applyConstraints({ advanced: [{ torch: next } as MediaTrackConstraintSet] });
      setTorchOn(next);
    } catch {
      setTorchSupported(false);
    }
  }, [elementId, torchOn]);

  const setZoom = useCallback(
    async (value: number) => {
      const track = findVideoTrack(elementId);
      if (!track || !zoom) return;
      const clamped = Math.min(zoom.max, Math.max(zoom.min, value));
      setZoomValue(clamped);
      try {
        await track.applyConstraints({ advanced: [{ zoom: clamped } as MediaTrackConstraintSet] });
      } catch {
        setZoomRange(null);
      }
    },
    [elementId, zoom]
  );

  return { torchSupported, torchOn, toggleTorch, zoom, zoomValue, setZoom };
}

/** Kısa titreşim — yalnız hareket politikası kutlamaya izin veriyorsa ve cihaz destekliyorsa. */
export function haptic(allowed: boolean, pattern: number | number[] = 30): void {
  if (!allowed) return;
  try {
    if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') navigator.vibrate(pattern);
  } catch {
    // Desteklenmiyor.
  }
}
