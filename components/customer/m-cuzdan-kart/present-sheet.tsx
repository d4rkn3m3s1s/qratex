'use client';

/**
 * "Kasada göster" — tam ekran QR (mobilde kırpılmasız). Kart yüzünden paylaşılan öğe
 * geçişiyle (`layoutId`) büyür; azaltılmış harekette geçiş yok, yalnız görünür olur.
 *
 * Radix Dialog ilkelleri doğrudan ve PORTAL'SIZ kullanılır (FullscreenModal'ın CSS
 * kayma/yakınlaşma animasyonu ve Portal'ın gecikmeli bağlanması `layoutId` ölçümünü bozardı): odak tuzağı, Esc ile kapanma, açanı geri
 * odaklama, `aria-modal`, başlık/açıklama bağları Radix'ten gelir.
 *
 * QR boyutu `min(100%, 22rem, 52dvh)`: küçük/yatay ekranda da tamamı görünür; içerik yine
 * sığmazsa panel kaydırılır (hiçbir şey kırpılmaz). Ekran kilidi (wake lock) açık tutulur;
 * web'den parlaklık ayarlanamadığı için dürüst bir ipucu gösterilir ve QR beyaz zemindedir.
 */
import { useEffect, useState } from 'react';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { m as Motion } from 'framer-motion';
import { Copy, Loader2, SunMedium, X } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { LeagueEmblem } from '@/components/ds/play';
import { DURATION, EASE, useReducedMotionPref } from '@/lib/motion';
import type { WalletCard, WalletLeague } from '@/lib/wallet-card/dto';
import { cardTokenAria, groupedCardToken } from '@/lib/wallet-card/snapshot';
import { CARD_RADIUS, CARD_SURFACE_STYLE } from './card-face';
import type { CardCopy, CardLocale } from './copy';

/** Ekranı açık tut. Desteklenmiyorsa ya da reddedilirse `false` döner (ipucu gizlenir). */
function useWakeLock(active: boolean): boolean {
  const [held, setHeld] = useState(false);
  useEffect(() => {
    if (!active || typeof navigator === 'undefined') return;
    type Sentinel = { release: () => Promise<void>; addEventListener?: (t: 'release', cb: () => void) => void };
    const nav = navigator as Navigator & { wakeLock?: { request: (t: 'screen') => Promise<Sentinel> } };
    if (!nav.wakeLock) return;
    let sentinel: Sentinel | null = null;
    let disposed = false;
    const acquire = async () => {
      try {
        const s = await nav.wakeLock!.request('screen');
        if (disposed) {
          await s.release().catch(() => undefined);
          return;
        }
        sentinel = s;
        setHeld(true);
        s.addEventListener?.('release', () => setHeld(false));
      } catch {
        setHeld(false);
      }
    };
    const onVisible = () => {
      if (document.visibilityState === 'visible' && !disposed) void acquire();
    };
    void acquire();
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      disposed = true;
      document.removeEventListener('visibilitychange', onVisible);
      void sentinel?.release().catch(() => undefined);
      setHeld(false);
    };
  }, [active]);
  return held;
}

async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    /* izin reddi → yedek yol */
  }
  try {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    const done = document.execCommand('copy');
    document.body.removeChild(ta);
    return done;
  } catch {
    return false;
  }
}

export function QrImage({ src, failed, copy }: { src?: string; failed?: boolean; copy: CardCopy }) {
  return (
    <div className="relative aspect-square w-full rounded-[14px] bg-white p-3 shadow-sm ring-1 ring-black/5">
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element -- data: URL; next/image gereksiz
        <img src={src} alt={copy.qrAlt} className="h-full w-full [image-rendering:pixelated]" draggable={false} />
      ) : failed ? (
        <p role="alert" className="grid h-full place-items-center px-4 text-center text-sm font-medium text-zinc-700">
          {copy.qrFailed}
        </p>
      ) : (
        <div role="status" className="grid h-full w-full place-items-center text-zinc-600">
          <Loader2 className="h-7 w-7 motion-safe:animate-spin" aria-hidden />
          <span className="sr-only">{copy.qrLoading}</span>
        </div>
      )}
    </div>
  );
}

export function PresentSheet({
  card,
  open,
  onOpenChange,
  qrSrc,
  qrFailed,
  holderName,
  league,
  copy,
  locale,
  returnFocusTo,
}: {
  card: WalletCard | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  qrSrc?: string;
  qrFailed?: boolean;
  holderName: string;
  league: WalletLeague | null;
  copy: CardCopy;
  locale: CardLocale;
  /** Kapanınca odak buraya döner (kart düğümü yeniden bağlandığı için açan öğe DOM'da olmayabilir). */
  returnFocusTo?: () => HTMLElement | null;
}) {
  const reduce = useReducedMotionPref();
  const held = useWakeLock(open && !!card);

  const onCopy = async () => {
    if (!card) return;
    const done = await copyText(card.token);
    if (done) toast.success(copy.copied);
    else toast.error(copy.copyFailed);
  };

  return (
    <DialogPrimitive.Root open={open && !!card} onOpenChange={onOpenChange}>
      {/* Portal YOK (bilerek): Radix Portal içeriği bir sonraki commit'te bağlar; kart düğümünün
          anlık görüntüsü o zaman düşmüş olur ve `layoutId` geçişi oynamaz. Kart görünümünün
          ataları dönüşüm/filtre/z-index taşımadığından `fixed` + `z-modal` doğru katmanda kalır. */}
        <DialogPrimitive.Content
          className="fixed inset-0 z-modal flex flex-col overflow-y-auto overscroll-contain bg-[#07060d] text-white outline-none"
          onCloseAutoFocus={(e) => {
            const target = returnFocusTo?.();
            if (target) {
              e.preventDefault();
              target.focus();
            }
          }}
          onOpenAutoFocus={(e) => {
            // Odak kapatma düğmesine (ilk odaklanabilir); QR görselinin üstünde halka çizilmesin.
            e.preventDefault();
            (e.currentTarget as HTMLElement | null)?.querySelector<HTMLElement>('[data-present-close]')?.focus();
          }}
        >
          <div className="mx-auto flex min-h-full w-full max-w-md flex-col px-[max(1rem,env(safe-area-inset-left))] pb-[max(1rem,env(safe-area-inset-bottom))] pt-[max(0.75rem,env(safe-area-inset-top))]">
            <div className="flex items-center justify-between gap-3 py-1">
              <div className="min-w-0">
                <DialogPrimitive.Title className="qx-h2 truncate text-white">{copy.presentTitle}</DialogPrimitive.Title>
                <DialogPrimitive.Description className="qx-small text-white/75">{copy.presentDesc}</DialogPrimitive.Description>
              </div>
              <DialogPrimitive.Close asChild>
                <button
                  type="button"
                  data-present-close
                  aria-label={copy.close}
                  className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-white/10 text-white transition-colors duration-fast hover:bg-white/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
                >
                  <X className="h-5 w-5" aria-hidden />
                </button>
              </DialogPrimitive.Close>
            </div>

            {card && (
              <div className="flex flex-1 flex-col items-center justify-center py-4">
                <Motion.div
                  layoutId={`wallet-card-${card.id}`}
                  className="w-full overflow-hidden shadow-[0_30px_80px_-30px_rgba(0,0,0,0.9)]"
                  style={{ ...CARD_SURFACE_STYLE, borderRadius: CARD_RADIUS }}
                  transition={{ duration: DURATION.slow, ease: EASE.emphasized }}
                >
                  <Motion.div
                    className="flex flex-col items-center gap-4 p-5 sm:p-6"
                    initial={reduce ? false : { opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ duration: DURATION.base, delay: reduce ? 0 : DURATION.fast }}
                  >
                    <div className="flex w-full items-center justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-white/75">QRateX</p>
                        <p className="truncate text-base font-semibold">{holderName}</p>
                      </div>
                      {league && (
                        <span className="inline-flex shrink-0 items-center gap-2 text-sm font-medium text-white/90">
                          <LeagueEmblem leagueKey={league.key} name={league.name} size="sm" register="ops" aria-hidden />
                          {league.name}
                        </span>
                      )}
                    </div>

                    <div className="w-[min(100%,22rem,52dvh)]">
                      <QrImage src={qrSrc} failed={qrFailed} copy={copy} />
                    </div>

                    <div className="w-full text-center">
                      <p className="text-xs font-medium text-white/75">{copy.spokenCode}</p>
                      <p className="break-all font-mono text-lg font-bold tracking-[0.12em] sm:text-xl">
                        <span aria-hidden>{groupedCardToken(card.token)}</span>
                        <span className="sr-only">{cardTokenAria(card.token, locale)}</span>
                      </p>
                    </div>
                  </Motion.div>
                </Motion.div>

                <div className="mt-5 flex w-full flex-col items-center gap-3">
                  <p className="qx-small inline-flex items-center gap-2 text-white/85">
                    <SunMedium className="h-4 w-4 shrink-0" aria-hidden />
                    {copy.brightness}
                  </p>
                  {held && <p className="qx-caption text-white/70">{copy.wakeLock}</p>}
                  <Button type="button" variant="secondary" className="min-h-11" onClick={onCopy}>
                    <Copy className="h-4 w-4" aria-hidden />
                    {copy.copyCode}
                  </Button>
                </div>
              </div>
            )}
          </div>
        </DialogPrimitive.Content>
    </DialogPrimitive.Root>
  );
}
