'use client';

import { useCallback, useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Maximize, Minimize } from 'lucide-react';
import type { WallFeedDto } from '@/lib/dealer/voc-wall/config';
import { WallApiError, wallFetch } from './api';
import { WallDisplay } from './wall-display';
import { WallNotice } from './wall-notice';

const POLL_MS = 30_000;
const IDLE_MS = 3_000;

/**
 * Mağaza TV'si (oturumsuz). İlk veri sunucudan gelir; sonra 30 sn'de bir ARKA PLANDA yenilenir —
 * eski veri ekranda kalır (iskelete dönmez), bağlantı koparsa son veri + uyarı gösterilir.
 * Bağlantı iptal edilirse ekran dürüstçe kapanır. İmleç ve kontroller boşta gizlenir.
 */
export function WallTvClient({ token, initial }: { token: string; initial: WallFeedDto }) {
  const [updatedAt, setUpdatedAt] = useState(() => Date.now());
  const query = useQuery({
    queryKey: ['wall-display', token],
    queryFn: async () => {
      const data = await wallFetch<WallFeedDto>(`/api/wall/${encodeURIComponent(token)}`);
      setUpdatedAt(Date.now());
      return data;
    },
    initialData: initial,
    initialDataUpdatedAt: Date.now(),
    refetchInterval: POLL_MS,
    refetchIntervalInBackground: false,
    staleTime: POLL_MS / 2,
    retry: (count, err) => !(err instanceof WallApiError && (err.status === 404 || err.status === 403)) && count < 2,
  });

  const [idle, setIdle] = useState(false);
  const [isFull, setIsFull] = useState(false);
  const [fsSupported, setFsSupported] = useState(false);

  useEffect(() => {
    let t: number | undefined;
    const wake = () => {
      setIdle(false);
      window.clearTimeout(t);
      t = window.setTimeout(() => setIdle(true), IDLE_MS);
    };
    wake();
    const evs = ['mousemove', 'keydown', 'pointerdown', 'focusin'] as const;
    evs.forEach((e) => window.addEventListener(e, wake));
    return () => {
      window.clearTimeout(t);
      evs.forEach((e) => window.removeEventListener(e, wake));
    };
  }, []);

  useEffect(() => {
    setFsSupported(!!document.fullscreenEnabled);
    const onFs = () => setIsFull(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', onFs);
    return () => document.removeEventListener('fullscreenchange', onFs);
  }, []);

  const toggleFull = useCallback(async () => {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await document.documentElement.requestFullscreen();
    } catch {
      /* tarayıcı izin vermedi — sessiz değil: düğme durumu değişmez */
    }
  }, []);

  const err = query.error;
  if (err instanceof WallApiError && err.status === 404) {
    return <WallNotice title="Bu ekran bağlantısı artık geçerli değil." description="İşletme bağlantıyı iptal etmiş olabilir. Yeni bir ekran bağlantısı için işletme yöneticisine başvurun." />;
  }
  if (err instanceof WallApiError && err.code === 'MODULE_DISABLED') {
    return <WallNotice title="Müşteri sesi ekranı şu an kapalı." description="Bu özellik geçici olarak devre dışı." />;
  }

  return (
    <div className={idle ? 'cursor-none' : undefined}>
      <WallDisplay
        feed={query.data}
        variant="tv"
        status={{ updatedAt, offline: query.isError }}
        controlsVisible={!idle}
        extraControls={
          fsSupported ? (
            <button
              type="button"
              onClick={toggleFull}
              className="inline-flex min-h-11 min-w-11 items-center justify-center gap-2 rounded-control border border-white/20 bg-white/10 px-3 text-sm font-medium text-white hover:bg-white/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
            >
              {isFull ? <Minimize aria-hidden className="h-4 w-4" /> : <Maximize aria-hidden className="h-4 w-4" />}
              {isFull ? 'Tam ekrandan çık' : 'Tam ekran'}
            </button>
          ) : null
        }
      />
    </div>
  );
}
