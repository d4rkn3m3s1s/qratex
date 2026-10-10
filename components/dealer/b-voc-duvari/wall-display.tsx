'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, m } from 'framer-motion';
import { MapPin, MessageSquareReply, Pause, Pin, Play, Sparkles, Star } from 'lucide-react';
import { Ambient, useMotionPolicy } from '@/lib/motion';
import { cn } from '@/lib/utils';
import type { WallFeedDto, WallItemDto } from '@/lib/dealer/voc-wall/config';

const rtf = new Intl.RelativeTimeFormat('tr', { numeric: 'auto' });
export function relativeTime(iso: string, now: number = Date.now()): string {
  const diff = (new Date(iso).getTime() - now) / 1000;
  const abs = Math.abs(diff);
  if (abs < 60) return 'az önce';
  if (abs < 3600) return rtf.format(Math.round(diff / 60), 'minute');
  if (abs < 86400) return rtf.format(Math.round(diff / 3600), 'hour');
  if (abs < 86400 * 30) return rtf.format(Math.round(diff / 86400), 'day');
  return new Intl.DateTimeFormat('tr-TR', { day: 'numeric', month: 'long', timeZone: 'Europe/Istanbul' }).format(new Date(iso));
}

const fmt1 = (n: number) => n.toLocaleString('tr-TR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });

function Stars({ rating, className }: { rating: number; className?: string }) {
  return (
    <span className={cn('inline-flex items-center gap-1', className)} role="img" aria-label={`${rating} / 5 yıldız`}>
      {[1, 2, 3, 4, 5].map((i) => (
        <Star key={i} aria-hidden className={cn('h-[1em] w-[1em]', i <= rating ? 'fill-amber-400 text-amber-400' : 'text-white/25')} />
      ))}
    </span>
  );
}

/**
 * Düşük GPU ambient katman: yalnız `transform: rotate` (kompozitör) ile çok yavaş dönen iki
 * renk alanı — blur filtresi, canvas, parçacık yok. `Ambient` azaltılmış harekette ve sekme
 * gizliyken durdurur (statik kare kalır).
 */
function AmbientField() {
  const field = (
    <div
      className="absolute left-1/2 top-1/2 h-[160vmax] w-[160vmax] -translate-x-1/2 -translate-y-1/2 opacity-60"
      style={{
        background:
          'radial-gradient(closest-side at 30% 35%, hsl(262 83% 58% / 0.28), transparent 70%), radial-gradient(closest-side at 70% 65%, hsl(189 94% 43% / 0.18), transparent 70%)',
      }}
    />
  );
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
      <Ambient fallback={field} className="absolute inset-0">
        <div className="absolute inset-0" style={{ animation: 'spin-slow 180s linear infinite' }}>
          {field}
        </div>
      </Ambient>
    </div>
  );
}

export interface WallDisplayProps {
  feed: WallFeedDto;
  variant: 'tv' | 'preview';
  /** Son başarılı güncelleme (ISO) ve bağlantı durumu — "canlı" iddiası yalnız buna dayanır. */
  status?: { updatedAt: number; offline: boolean };
  /** TV'de kontroller boşta gizlenir. */
  controlsVisible?: boolean;
  extraControls?: React.ReactNode;
}

export function WallDisplay({ feed, variant, status, controlsVisible = true, extraControls }: WallDisplayProps) {
  const policy = useMotionPolicy();
  const items = feed.items;
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const [freshIds, setFreshIds] = useState<Set<string>>(() => new Set());
  const seen = useRef<Set<string> | null>(null);
  const [pageVisible, setPageVisible] = useState(true);
  const [now, setNow] = useState(() => Date.now());

  // Yeni gelen yorumlar sıranın önüne alınır ve "Yeni" vurgusu alır (ilk yüklemede değil).
  useEffect(() => {
    const ids = new Set(items.map((i) => i.id));
    if (seen.current) {
      const fresh = items.filter((i) => !seen.current!.has(i.id)).map((i) => i.id);
      if (fresh.length) {
        setFreshIds(new Set(fresh));
        const firstFresh = items.findIndex((i) => i.id === fresh[0]);
        if (firstFresh >= 0) setIndex(firstFresh);
      }
    }
    seen.current = ids;
    setIndex((i) => (i >= items.length ? 0 : i));
  }, [items]);

  useEffect(() => {
    const onVis = () => setPageVisible(!document.hidden);
    onVis();
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, []);

  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(t);
  }, []);

  // Otomatik döngü: azaltılmış harekette süre iki katı ve geçiş anlık; duraklatılabilir (WCAG 2.2.2).
  const seconds = feed.rotateSeconds * (policy.reduce ? 2 : 1);
  const rotating = items.length > 1 && !paused && pageVisible;
  useEffect(() => {
    if (!rotating) return;
    const t = window.setTimeout(() => setIndex((i) => (i + 1) % items.length), seconds * 1000);
    return () => window.clearTimeout(t);
  }, [rotating, seconds, items.length, index]);

  const current: WallItemDto | undefined = items[index];
  const tv = variant === 'tv';
  const transition = policy.transition({ duration: 0.4, ease: [0.22, 1, 0.36, 1] });
  const updatedLabel = useMemo(() => {
    if (!status) return null;
    const sec = Math.max(0, Math.round((now - status.updatedAt) / 1000));
    return sec < 60 ? 'şimdi güncellendi' : `${Math.round(sec / 60)} dk önce güncellendi`;
  }, [status, now]);

  return (
    <div
      className={cn(
        'dark relative isolate flex flex-col overflow-hidden bg-background text-white',
        tv ? 'min-h-dvh' : 'aspect-video w-full rounded-card border border-subtle'
      )}
      style={tv ? undefined : { containerType: 'inline-size' }}
    >
      <AmbientField />

      <header className={cn('flex items-center justify-between gap-4', tv ? 'px-[4vw] pt-[3vh]' : 'px-[4cqw] pt-[3cqw]')}>
        <p className={cn('truncate font-semibold tracking-tight text-white/85', tv ? 'text-[clamp(1.1rem,2vw,2rem)]' : 'text-[2.6cqw]')}>
          {feed.business ?? 'Müşterilerimiz ne diyor?'}
        </p>
        <div className={cn('flex items-center gap-3 text-white/70', tv ? 'text-[clamp(0.9rem,1.2vw,1.25rem)]' : 'text-[1.7cqw]')}>
          {status && (
            <span className="inline-flex items-center gap-2" aria-live="polite">
              <span aria-hidden className={cn('h-2 w-2 rounded-full', status.offline ? 'bg-amber-400' : 'bg-emerald-400')} />
              {status.offline ? 'Bağlantı yok · son veri gösteriliyor' : updatedLabel}
            </span>
          )}
        </div>
      </header>

      <main className={cn('flex flex-1 items-center', tv ? 'px-[6vw] py-[4vh]' : 'px-[6cqw] py-[3cqw]')}>
        {current ? (
          <AnimatePresence mode="wait" initial={false}>
            <m.figure
              key={current.id}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={transition}
              className="w-full max-w-[70ch]"
            >
              <div className={cn('mb-[0.6em] flex flex-wrap items-center gap-3', tv ? 'text-[clamp(1.25rem,2.4vw,2.5rem)]' : 'text-[3cqw]')}>
                <Stars rating={current.rating} />
                {freshIds.has(current.id) && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-emerald-400/15 px-3 py-0.5 text-[0.55em] font-semibold text-emerald-300">
                    <Sparkles aria-hidden className="h-[1em] w-[1em]" /> Yeni
                  </span>
                )}
                {current.pinned && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-white/10 px-3 py-0.5 text-[0.55em] font-semibold text-white/85">
                    <Pin aria-hidden className="h-[1em] w-[1em]" /> Öne çıkan
                  </span>
                )}
              </div>
              <blockquote
                className={cn(
                  'font-semibold leading-[1.2] tracking-tight text-white [text-wrap:balance]',
                  tv ? 'text-[clamp(1.75rem,4.2vw,4rem)]' : 'text-[4.4cqw]'
                )}
              >
                {current.text ? `“${current.text}”` : <span className="text-white/80">{current.rating} yıldızlı değerlendirme</span>}
              </blockquote>
              <figcaption
                className={cn('mt-[1em] flex flex-wrap items-center gap-x-4 gap-y-1 text-white/70', tv ? 'text-[clamp(1rem,1.6vw,1.6rem)]' : 'text-[2.2cqw]')}
              >
                <span className="font-medium text-white/90">{current.name ?? 'Bir misafirimiz'}</span>
                {current.location && (
                  <span className="inline-flex items-center gap-1">
                    <MapPin aria-hidden className="h-[1em] w-[1em]" /> {current.location}
                  </span>
                )}
                <span>{relativeTime(current.createdAt, now)}</span>
                {current.replied && (
                  <span className="inline-flex items-center gap-1 text-emerald-300">
                    <MessageSquareReply aria-hidden className="h-[1em] w-[1em]" /> İşletme yanıtladı
                  </span>
                )}
              </figcaption>
            </m.figure>
          </AnimatePresence>
        ) : (
          <div className={cn('max-w-[40ch]', tv ? 'text-[clamp(1.5rem,3vw,3rem)]' : 'text-[3.4cqw]')}>
            <p className="font-semibold text-white">İlk yorumu siz yazın.</p>
            <p className="mt-2 text-[0.6em] text-white/70">
              Müşteri yorumları onaylandıkça burada görünecek. QR kodu okutup deneyiminizi paylaşabilirsiniz.
            </p>
          </div>
        )}
      </main>

      <footer
        className={cn(
          'flex items-end justify-between gap-6 border-t border-white/10 bg-black/25',
          tv ? 'px-[4vw] py-[2.5vh]' : 'px-[4cqw] py-[2cqw]'
        )}
      >
        <dl className={cn('flex flex-wrap gap-x-[3em] gap-y-2', tv ? 'text-[clamp(0.95rem,1.4vw,1.5rem)]' : 'text-[1.9cqw]')}>
          <div>
            <dt className="text-white/60">Son 30 gün ortalaması</dt>
            <dd className="qx-num text-[1.6em] font-bold text-white">
              {feed.summary.avgRating30d != null ? (
                <>
                  {fmt1(feed.summary.avgRating30d)} <span className="text-[0.6em] font-medium text-white/70">/ 5 · {feed.summary.count30d.toLocaleString('tr-TR')} değerlendirme</span>
                </>
              ) : (
                <span className="text-[0.7em] font-medium text-white/70">Henüz değerlendirme yok</span>
              )}
            </dd>
          </div>
          <div>
            <dt className="text-white/60">Son 24 saat</dt>
            <dd className="qx-num text-[1.6em] font-bold text-white">
              {feed.summary.count24h.toLocaleString('tr-TR')} <span className="text-[0.6em] font-medium text-white/70">yorum</span>
            </dd>
          </div>
        </dl>
        <div className="flex items-end gap-4">
          {(controlsVisible || !tv) && items.length > 1 && (
            <button
              type="button"
              onClick={() => setPaused((p) => !p)}
              aria-pressed={paused}
              className="inline-flex min-h-11 min-w-11 items-center justify-center gap-2 rounded-control border border-white/20 bg-white/10 px-3 text-sm font-medium text-white hover:bg-white/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
            >
              {paused ? <Play aria-hidden className="h-4 w-4" /> : <Pause aria-hidden className="h-4 w-4" />}
              {paused ? 'Sürdür' : 'Duraklat'}
            </button>
          )}
          {controlsVisible && extraControls}
          {feed.feedbackQr && (
            <figure className="flex items-center gap-3">
              <figcaption className={cn('text-right font-semibold text-white', tv ? 'text-[clamp(0.95rem,1.4vw,1.5rem)]' : 'text-[1.9cqw]')}>
                Siz de puan verin
                <span className="block text-[0.75em] font-normal text-white/65">Kamerayla okutun</span>
              </figcaption>
              <svg
                viewBox={`-2 -2 ${feed.feedbackQr.size + 4} ${feed.feedbackQr.size + 4}`}
                className={cn('rounded-md bg-white', tv ? 'h-[clamp(5rem,11vw,10rem)] w-[clamp(5rem,11vw,10rem)]' : 'h-[12cqw] w-[12cqw]')}
                role="img"
                aria-label="Geri bildirim QR kodu"
                shapeRendering="crispEdges"
              >
                <path d={feed.feedbackQr.path} fill="#000" />
              </svg>
            </figure>
          )}
        </div>
      </footer>

      {/* Ekran okuyucu: döngü yerine tam liste (otomatik değişen içerik duyurulmaz). */}
      <ul className="sr-only">
        {items.map((i) => (
          <li key={i.id}>
            {i.rating} yıldız. {i.text ?? ''} {i.name ?? ''} {i.location ?? ''}
          </li>
        ))}
      </ul>
    </div>
  );
}
