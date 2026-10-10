'use client';

/**
 * Seçilen fotoğrafları seçildiği anda R2'ye yükler (her biri ayrı, küçük multipart istek;
 * gövde sınırı sorunu yok). Gönderim yalnız yüklemesi biten URL'leri taşır.
 * Taslaktan geri yüklenen fotoğraflar zaten yüklüdür (`restore`).
 */
import * as React from 'react';
import type { PickedPhoto } from '@/components/ds/a11y/photo-picker';
import { uploadPhoto } from './api';

export type UploadState =
  | { status: 'uploading'; progress: number }
  | { status: 'done'; url: string }
  | { status: 'error'; offline: boolean; message: string | null };

export function restoredPhoto(id: string, url: string): PickedPhoto {
  return {
    id,
    // Yüklenmiş fotoğrafın yerel dosyası yok; boş yer tutucu (yeniden yüklenmez).
    file: new File([], 'photo.jpg', { type: 'image/jpeg' }),
    url,
    width: 0,
    height: 0,
    originalBytes: 0,
  };
}

export function usePhotoUploads(code: string) {
  const [photos, setPhotos] = React.useState<PickedPhoto[]>([]);
  const [uploads, setUploads] = React.useState<Record<string, UploadState>>({});
  const aborters = React.useRef(new Map<string, () => void>());

  const start = React.useCallback(
    (photo: PickedPhoto) => {
      setUploads((u) => ({ ...u, [photo.id]: { status: 'uploading', progress: 0 } }));
      const job = uploadPhoto(code, photo.file, (progress) =>
        setUploads((u) => (u[photo.id]?.status === 'uploading' ? { ...u, [photo.id]: { status: 'uploading', progress } } : u))
      );
      aborters.current.set(photo.id, job.abort);
      void job.promise.then((res) => {
        aborters.current.delete(photo.id);
        setUploads((u) => {
          if (!(photo.id in u)) return u; // bu arada kaldırıldı
          if (res.ok) return { ...u, [photo.id]: { status: 'done', url: res.data.url } };
          const offline = res.kind === 'network' && typeof navigator !== 'undefined' && navigator.onLine === false;
          return { ...u, [photo.id]: { status: 'error', offline, message: res.message } };
        });
      });
    },
    [code]
  );

  // Yalnız onChange/restore günceller (fotoğraf listesini değiştiren tek yerler).
  const photosRef = React.useRef<PickedPhoto[]>([]);

  const onChange = React.useCallback(
    (next: PickedPhoto[]) => {
      const prev = photosRef.current;
      const nextIds = new Set(next.map((p) => p.id));
      const prevIds = new Set(prev.map((p) => p.id));
      for (const p of prev) {
        if (!nextIds.has(p.id)) {
          aborters.current.get(p.id)?.();
          aborters.current.delete(p.id);
        }
      }
      photosRef.current = next;
      setPhotos(next);
      setUploads((u) => {
        const keep: Record<string, UploadState> = {};
        for (const p of next) if (u[p.id]) keep[p.id] = u[p.id];
        return keep;
      });
      for (const p of next) if (!prevIds.has(p.id)) start(p);
    },
    [start]
  );

  /** Taslaktan geri yükleme: zaten yüklenmiş URL'ler (yeniden yüklenmez). */
  const restore = React.useCallback((media: readonly { id: string; url: string }[]) => {
    const list = media.map((m) => restoredPhoto(m.id, m.url));
    photosRef.current = list;
    setPhotos(list);
    setUploads(Object.fromEntries(media.map((m) => [m.id, { status: 'done', url: m.url } as UploadState])));
  }, []);

  const retryFailed = React.useCallback(() => {
    for (const p of photos) if (uploads[p.id]?.status === 'error') start(p);
  }, [photos, uploads, start]);

  React.useEffect(() => {
    const map = aborters.current;
    return () => map.forEach((abort) => abort());
  }, []);

  const doneMedia = React.useMemo(
    () =>
      photos
        .map((p) => {
          const s = uploads[p.id];
          return s?.status === 'done' ? { id: p.id, url: s.url } : null;
        })
        .filter((m): m is { id: string; url: string } => m !== null),
    [photos, uploads]
  );
  const uploading = photos.filter((p) => uploads[p.id]?.status === 'uploading');
  const failed = photos.filter((p) => uploads[p.id]?.status === 'error');
  const avgProgress = uploading.length
    ? Math.round(
        uploading.reduce((sum, p) => {
          const s = uploads[p.id];
          return sum + (s?.status === 'uploading' ? s.progress : 0);
        }, 0) / uploading.length
      )
    : 100;
  const anyOffline = failed.some((p) => {
    const s = uploads[p.id];
    return s?.status === 'error' && s.offline;
  });

  return { photos, onChange, restore, doneMedia, uploadingCount: uploading.length, failedCount: failed.length, avgProgress, anyOffline, retryFailed };
}
