'use client';

import { useEffect, useRef, useState } from 'react';
import { ImageOff } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { mailBodyUrl } from '../api';

/**
 * Gelen mail gövdesi. Belge ayrı bir uçtan HTTP CSP başlığıyla gelir (işaretlemeyle atlatılamaz);
 * çerçeve kum havuzunda (opak köken: çerez/DOM/API erişimi yok), yalnız bizim yükseklik betiğimiz
 * çalışır. Yükseklik mesajı KAYNAĞI doğrulanarak kabul edilir (Bulgu 16).
 */
export function MailFrame({ id, subject, hasRemoteImages }: { id: string; subject: string; hasRemoteImages: boolean }) {
  const ref = useRef<HTMLIFrameElement>(null);
  const [height, setHeight] = useState(240);
  const [images, setImages] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    setImages(false);
    setHeight(240);
    setLoaded(false);
  }, [id]);

  useEffect(() => {
    const onMsg = (e: MessageEvent) => {
      if (!ref.current || e.source !== ref.current.contentWindow) return;
      const d = e.data as { qxMailFrame?: number; h?: number } | null;
      if (!d || d.qxMailFrame !== 1 || typeof d.h !== 'number' || !Number.isFinite(d.h)) return;
      setHeight(Math.min(Math.max(120, Math.ceil(d.h) + 8), 6000));
    };
    window.addEventListener('message', onMsg);
    return () => window.removeEventListener('message', onMsg);
  }, []);

  return (
    <div className="space-y-2">
      {hasRemoteImages && !images && (
        <div className="flex flex-wrap items-center gap-2 rounded-control border border-border bg-surface-2 px-3 py-2 text-sm text-fg-muted">
          <ImageOff className="h-4 w-4 shrink-0" aria-hidden />
          <span className="min-w-0 flex-1">
            Gizliliğiniz için uzak görseller engellendi. Göstermek, göndericiye maili açtığınızı ve IP adresinizi bildirebilir.
          </span>
          <Button size="sm" variant="outline" className="min-h-11" onClick={() => setImages(true)}>
            Görselleri göster
          </Button>
        </div>
      )}
      <div className="relative overflow-hidden rounded-control border border-border bg-white">
        {!loaded && (
          <div className="absolute inset-0 animate-pulse bg-surface-2 motion-reduce:animate-none" aria-hidden />
        )}
        <iframe
          key={`${id}:${images ? 1 : 0}`}
          ref={ref}
          src={mailBodyUrl(id, images)}
          title={`Mail içeriği: ${subject || 'konu yok'}`}
          sandbox="allow-scripts allow-popups allow-popups-to-escape-sandbox"
          referrerPolicy="no-referrer"
          loading="lazy"
          onLoad={() => setLoaded(true)}
          className="block w-full border-0"
          style={{ height }}
        />
      </div>
    </div>
  );
}
