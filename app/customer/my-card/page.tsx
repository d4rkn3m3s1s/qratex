'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useSession } from 'next-auth/react';
import { useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  m as Motion,
  useMotionTemplate,
  useMotionValue,
  useReducedMotion,
  useSpring,
  useTransform,
} from 'framer-motion';
import {
  ArrowRight,
  Award,
  Copy,
  CreditCard,
  Download,
  Expand,
  History,
  Loader2,
  QrCode,
  ScanLine,
  ShieldCheck,
  Smartphone,
  Store,
  SunMedium,
  Wallet,
  WifiOff,
} from 'lucide-react';
import { BRAND_CARD_QR_DARK_HEX, HEX_WHITE } from '@/lib/brand-colors';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { EmptyState, InlineError, PageHeader, QueryState, SectionCard, TONE_CALLOUT } from '@/components/states';
import { useAppLocale } from '@/lib/app-locale';
import { cn, formatDate, formatRelativeTime } from '@/lib/utils';
import {
  buildCardUrl,
  buildSnapshot,
  maskCardToken,
  parseCardsResponse,
  readSnapshot,
  resolveCardOrigin,
  snapshotKey,
  spokenCardCode,
  type CardsSnapshot,
  type MyCard,
  type MyCardsData,
} from './_lib/card-helpers';

type Locale = 'tr' | 'en';

/** Sayfaya özgü metinler (paylaşılan i18n kataloğuna dokunmadan iki dilli). */
const COPY = {
  tr: {
    title: 'Kartım',
    description: 'Kasada QR kodunu göster; tüketimlerin ve puanların hesabına işlensin.',
    membership: 'Üyelik kartı',
    holder: 'Kart sahibi',
    consumptions: 'Tüketim',
    activated: 'Aktivasyon',
    status: { ACTIVATED: 'Aktif', UNUSED: 'Etkinleştirilmedi', BLOCKED: 'Engelli' } as Record<string, string>,
    presentTitle: 'Kasada göster',
    presentHint: 'Kasiyer bu kodu okuttuğunda tüketimin ve puanın hesabına işlenir.',
    fullscreen: 'Tam ekran göster',
    copyCode: 'Kart numarasını kopyala',
    copied: 'Kart numarası kopyalandı',
    copyFailed: 'Kopyalanamadı. Numarayı kasiyere söyleyebilirsin.',
    spokenCode: 'Kod okunmazsa kasiyere söyle',
    qrAlt: 'Kart QR kodu',
    qrLoading: 'QR kodu hazırlanıyor',
    dialogTitle: 'Kasada göster',
    dialogDesc: 'Telefonunu kasiyere uzat. Ekran açık kalır; okunmazsa parlaklığı artır.',
    brightness: 'Okunmazsa ekran parlaklığını artır.',
    recent: 'Son işlemler',
    noRecent: 'Bu kartla henüz tüketim kaydı yok.',
    allConsumptions: 'Tüm tüketimler',
    spending: 'Harcama özetim',
    pendingTitle: (n: number) => `${n} tüketimin yorum bekliyor`,
    pendingBody: 'Deneyimini puanla, yorum başına puan kazan.',
    pendingCta: 'Yorum yap',
    wallet: 'Cüzdana ekle',
    walletFailed: 'Kart cüzdana eklenemedi. Lütfen daha sonra tekrar dene.',
    safety: 'Kart kodun kasada tüketim kaydı için kullanılır. Ekran görüntüsünü ya da bağlantısını kimseyle paylaşma.',
    emptyTitle: 'Henüz kartın yok',
    emptyBody: 'İşletmedeki QRateX kartını telefonunun kamerasıyla okut; kart hesabına bağlansın.',
    emptyCta: 'Kart nasıl etkinleştirilir?',
    emptyHelp: 'Kartın üzerindeki QR kodunu telefonunun kamerasıyla okut, açılan sayfada “Kartı etkinleştir”e dokun.',
    offline: (ago: string) => `Çevrimdışı: son kaydedilen kartın gösteriliyor (${ago}). QR kodu kasada çalışır.`,
    errorTitle: 'Kartların yüklenemedi',
    blocked: 'Bu kart engellendi. Kasada kullanılamaz; destek için işletmeyle iletişime geç.',
  },
  en: {
    title: 'My card',
    description: 'Show your QR code at the counter to collect consumptions and points.',
    membership: 'Membership card',
    holder: 'Card holder',
    consumptions: 'Visits',
    activated: 'Activated',
    status: { ACTIVATED: 'Active', UNUSED: 'Not activated', BLOCKED: 'Blocked' } as Record<string, string>,
    presentTitle: 'Show at counter',
    presentHint: 'When the cashier scans this code, the purchase and points are added to your account.',
    fullscreen: 'Show full screen',
    copyCode: 'Copy card number',
    copied: 'Card number copied',
    copyFailed: 'Could not copy. You can tell the number to the cashier.',
    spokenCode: 'If the code does not scan, tell the cashier',
    qrAlt: 'Card QR code',
    qrLoading: 'Preparing QR code',
    dialogTitle: 'Show at counter',
    dialogDesc: 'Hand your phone to the cashier. The screen stays on; raise brightness if it does not scan.',
    brightness: 'Raise screen brightness if it does not scan.',
    recent: 'Recent activity',
    noRecent: 'No purchases recorded with this card yet.',
    allConsumptions: 'All purchases',
    spending: 'Spending overview',
    pendingTitle: (n: number) => `${n} purchase${n === 1 ? '' : 's'} awaiting your review`,
    pendingBody: 'Rate your experience and earn points per review.',
    pendingCta: 'Write a review',
    wallet: 'Add to wallet',
    walletFailed: 'Could not add the card to your wallet. Please try again later.',
    safety: 'Your card code records purchases at the counter. Do not share screenshots or the link with anyone.',
    emptyTitle: 'You do not have a card yet',
    emptyBody: 'Scan the QRateX card at a business with your phone camera to link it to your account.',
    emptyCta: 'How to activate a card?',
    emptyHelp: 'Scan the QR code on the card with your phone camera and tap “Activate card” on the page that opens.',
    offline: (ago: string) => `Offline: showing your last saved card (${ago}). The QR code still works at the counter.`,
    errorTitle: 'Could not load your cards',
    blocked: 'This card is blocked and cannot be used at the counter. Contact the business for help.',
  },
} as const;

type Copy = (typeof COPY)[Locale];

/** İnce gürültü — kart yüzeyine derinlik. */
const NOISE_SVG =
  "url(\"data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.8' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='0.05'/%3E%3C/svg%3E\")";

class CardsHttpError extends Error {
  status: number;
  constructor(status: number) {
    super(`cards ${status}`);
    this.status = status;
  }
}

async function fetchCards(): Promise<MyCardsData> {
  const res = await fetch('/api/customer/cards', { cache: 'no-store' });
  if (!res.ok) throw new CardsHttpError(res.status);
  return parseCardsResponse(await res.json());
}

function cardOrigin(): string {
  return resolveCardOrigin(process.env.NEXT_PUBLIC_APP_URL, typeof window !== 'undefined' ? window.location.origin : null);
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
    const ok = document.execCommand('copy');
    document.body.removeChild(ta);
    return ok;
  } catch {
    return false;
  }
}

/** QR görselleri — `qrcode` yalnız gerektiğinde yüklenir (ilk paket dışı). */
function useCardQrCodes(cards: MyCard[] | undefined): Record<string, string> {
  const [codes, setCodes] = useState<Record<string, string>>({});
  const tokens = useMemo(() => (cards ?? []).filter((c) => c.status !== 'BLOCKED').map((c) => c.token), [cards]);
  const tokensKey = tokens.join('|');
  useEffect(() => {
    if (tokens.length === 0) return;
    let cancelled = false;
    (async () => {
      try {
        const QRCode = (await import('qrcode')).default;
        const origin = cardOrigin();
        const entries = await Promise.all(
          tokens.map(async (token) => {
            const url = await QRCode.toDataURL(buildCardUrl(token, origin), {
              width: 480,
              margin: 2,
              color: { dark: BRAND_CARD_QR_DARK_HEX, light: HEX_WHITE },
              errorCorrectionLevel: 'M',
            });
            return [token, url] as const;
          })
        );
        if (!cancelled) setCodes(Object.fromEntries(entries));
      } catch (error) {
        console.error('[my-card] QR üretilemedi', error);
      }
    })();
    return () => {
      cancelled = true;
    };
    // tokensKey, token listesinin kararlı özeti.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tokensKey]);
  return codes;
}

/** Ekranı açık tut (kasada QR gösterilirken). Desteklenmiyorsa sessizce geçer. */
function useWakeLock(active: boolean): void {
  useEffect(() => {
    if (!active || typeof navigator === 'undefined') return;
    type Sentinel = { release: () => Promise<void> };
    const nav = navigator as Navigator & { wakeLock?: { request: (t: 'screen') => Promise<Sentinel> } };
    if (!nav.wakeLock) return;
    let sentinel: Sentinel | null = null;
    let released = false;
    const acquire = async () => {
      try {
        sentinel = await nav.wakeLock!.request('screen');
        if (released) await sentinel.release();
      } catch {
        /* izin/destek yok */
      }
    };
    const onVisible = () => {
      if (document.visibilityState === 'visible' && !released) void acquire();
    };
    void acquire();
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      released = true;
      document.removeEventListener('visibilitychange', onVisible);
      void sentinel?.release().catch(() => undefined);
    };
  }, [active]);
}

type WalletAvailability = { apple: boolean; google: boolean };

async function fetchWalletAvailability(): Promise<WalletAvailability> {
  const check = async (kind: 'apple' | 'google') => {
    try {
      const res = await fetch(`/api/wallet/${kind}`, { method: 'POST' });
      if (!res.ok) return false;
      const body = (await res.json()) as { available?: boolean; configured?: boolean };
      return body.available === true && body.configured === true;
    } catch {
      return false;
    }
  };
  const [apple, google] = await Promise.all([check('apple'), check('google')]);
  return { apple, google };
}

// ───────────────────────────── Kart yüzü ─────────────────────────────

/**
 * Kart yüzü — yalnız kimlik (marka, durum, sahip, maskeli numara, tüketim). QR kart yüzünde
 * DEĞİL: eskiden `aspect-ratio + overflow-hidden` kutu mobilde dikey yığılan QR'ı kırpıyordu
 * (P0-39). `overflow-clip` kutuyu kaydırma kabı yapmadığı için aspect-ratio'nun içerik tabanlı
 * min-yüksekliği korunur: içerik sığmazsa kart uzar, kırpılmaz.
 */
function CardFace({ card, holderName, locale, copy }: { card: MyCard; holderName: string; locale: Locale; copy: Copy }) {
  const reduceMotion = useReducedMotion() === true;
  const ref = useRef<HTMLDivElement>(null);
  const px = useMotionValue(0.5);
  const py = useMotionValue(0.5);
  const sx = useSpring(px, { stiffness: 220, damping: 24 });
  const sy = useSpring(py, { stiffness: 220, damping: 24 });
  const rotateY = useTransform(sx, [0, 1], [5, -5]);
  const rotateX = useTransform(sy, [0, 1], [-4, 4]);
  const gx = useTransform(sx, (v) => `${v * 100}%`);
  const gy = useTransform(sy, (v) => `${v * 100}%`);
  const glare = useMotionTemplate`radial-gradient(circle at ${gx} ${gy}, rgba(255,255,255,0.22), transparent 45%)`;

  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (reduceMotion || e.pointerType !== 'mouse' || !ref.current) return;
    const r = ref.current.getBoundingClientRect();
    px.set((e.clientX - r.left) / r.width);
    py.set((e.clientY - r.top) / r.height);
  };
  const onPointerLeave = () => {
    px.set(0.5);
    py.set(0.5);
  };

  const statusLabel = copy.status[card.status] ?? card.status;
  const statusTone =
    card.status === 'ACTIVATED'
      ? 'bg-emerald-400/15 text-emerald-200 ring-emerald-300/30'
      : card.status === 'BLOCKED'
        ? 'bg-red-400/15 text-red-200 ring-red-300/30'
        : 'bg-white/10 text-white/80 ring-white/20';

  return (
    <div className="mx-auto w-full max-w-md" style={{ perspective: 1200 }}>
      <Motion.div
        ref={ref}
        onPointerMove={onPointerMove}
        onPointerLeave={onPointerLeave}
        style={reduceMotion ? undefined : { rotateX, rotateY, transformStyle: 'preserve-3d' }}
        className="rounded-[1.4rem] bg-gradient-to-br from-white/40 via-primary/50 to-cyan-400/40 p-[1.5px] shadow-[0_28px_60px_-30px_rgba(0,0,0,0.7)]"
      >
        <div
          role="group"
          aria-label={`${copy.membership}, ${statusLabel}`}
          className="relative isolate flex aspect-[1.586/1] w-full flex-col justify-between overflow-clip rounded-[1.3rem] bg-[#07070f] p-5 text-white sm:p-6"
          style={{ backgroundImage: NOISE_SVG }}
        >
          <div aria-hidden className="absolute inset-0 -z-10 bg-gradient-to-br from-violet-950/85 via-[#0a0a14] to-cyan-950/55" />
          <div
            aria-hidden
            className="absolute inset-0 -z-10 opacity-90 mix-blend-screen"
            style={{
              background:
                'radial-gradient(ellipse 90% 70% at 10% -10%, hsl(var(--primary) / 0.45), transparent 52%), radial-gradient(ellipse 70% 60% at 100% 100%, rgba(34,211,238,0.22), transparent 48%)',
            }}
          />
          {!reduceMotion && (
            <>
              <Motion.div aria-hidden className="pointer-events-none absolute inset-0 -z-10 mix-blend-overlay" style={{ background: glare }} />
              {/* Tek seferlik parıltı (sonsuz döngü yok). */}
              <Motion.div
                aria-hidden
                className="pointer-events-none absolute inset-y-0 -left-1/2 -z-10 w-1/2 -skew-x-12 bg-gradient-to-r from-transparent via-white/[0.14] to-transparent"
                initial={{ x: '0%' }}
                animate={{ x: '400%' }}
                transition={{ duration: 1.4, ease: [0.22, 1, 0.36, 1], delay: 0.25 }}
              />
            </>
          )}
          <QrCode aria-hidden className="pointer-events-none absolute -bottom-6 -right-4 -z-10 h-36 w-36 text-white/[0.05]" />

          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-white/70">QRateX</p>
              <p className="truncate text-lg font-semibold tracking-tight sm:text-xl">{copy.membership}</p>
            </div>
            <span className={cn('shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ring-inset', statusTone)}>{statusLabel}</span>
          </div>

          <div className="flex items-end justify-between gap-4">
            <div className="min-w-0">
              <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-white/70">{copy.holder}</p>
              <p className="truncate text-base font-semibold sm:text-lg">{holderName}</p>
              <p className="mt-1 font-mono text-sm tracking-[0.14em] text-white/90 sm:text-base" aria-label={spokenCardCode(card.token)}>
                {maskCardToken(card.token)}
              </p>
            </div>
            <div className="shrink-0 text-right">
              <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-white/70">{copy.consumptions}</p>
              <p className="font-mono text-2xl font-bold tabular-nums sm:text-3xl">
                {new Intl.NumberFormat(locale === 'en' ? 'en-US' : 'tr-TR').format(card.consumptionsCount)}
              </p>
              {card.activatedAt && (
                <p className="text-[11px] text-white/70">
                  {copy.activated}: {formatDate(card.activatedAt, { day: 'numeric', month: 'short', year: 'numeric' }, locale)}
                </p>
              )}
            </div>
          </div>
        </div>
      </Motion.div>
    </div>
  );
}

// ───────────────────────────── Kasada göster paneli ─────────────────────────────

function QrImage({ src, alt, loadingLabel, className }: { src?: string; alt: string; loadingLabel: string; className?: string }) {
  return (
    <div className={cn('relative aspect-square w-full rounded-control bg-white p-2 ring-1 ring-black/5', className)}>
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element -- data: URL, next/image gereksiz
        <img src={src} alt={alt} className="h-full w-full [image-rendering:pixelated]" />
      ) : (
        <div role="status" className="grid h-full w-full place-items-center text-zinc-500">
          <Loader2 className="h-6 w-6 motion-safe:animate-spin" aria-hidden />
          <span className="sr-only">{loadingLabel}</span>
        </div>
      )}
    </div>
  );
}

function PresentPanel({
  card,
  qrSrc,
  copy,
  onFullscreen,
  wallet,
}: {
  card: MyCard;
  qrSrc?: string;
  copy: Copy;
  onFullscreen: () => void;
  wallet: WalletAvailability | undefined;
}) {
  const [walletBusy, setWalletBusy] = useState<'apple' | 'google' | null>(null);

  if (card.status === 'BLOCKED') {
    return (
      <InlineError variant="banner" tone="danger">
        {copy.blocked}
      </InlineError>
    );
  }

  const onCopy = async () => {
    const ok = await copyText(card.token);
    if (ok) toast.success(copy.copied);
    else toast.error(copy.copyFailed);
  };

  const addGoogle = async () => {
    setWalletBusy('google');
    try {
      const res = await fetch(`/api/wallet/google?cardId=${encodeURIComponent(card.id)}`);
      const body = (await res.json()) as { saveUrl?: string };
      if (res.ok && body.saveUrl) window.location.assign(body.saveUrl);
      else toast.error(copy.walletFailed);
    } catch {
      toast.error(copy.walletFailed);
    } finally {
      setWalletBusy(null);
    }
  };

  const addApple = () => {
    setWalletBusy('apple');
    // iOS Safari pkpass'i yalnız doğrudan gezinmeyle Wallet'a açar (blob + a[download] değil).
    window.location.assign(`/api/wallet/apple?cardId=${encodeURIComponent(card.id)}`);
    window.setTimeout(() => setWalletBusy(null), 4000);
  };

  return (
    <SectionCard title={copy.presentTitle} description={copy.presentHint} icon={<ScanLine />} tone="brand">
      <div className="flex flex-col items-center gap-4 sm:flex-row sm:items-start sm:gap-6">
        <button
          type="button"
          onClick={onFullscreen}
          className="w-full max-w-[15rem] shrink-0 rounded-control outline-none transition-transform duration-fast focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2 active:scale-[0.99] sm:max-w-[12rem]"
          aria-label={copy.fullscreen}
        >
          <QrImage src={qrSrc} alt={copy.qrAlt} loadingLabel={copy.qrLoading} />
        </button>
        <div className="flex w-full min-w-0 flex-col gap-3">
          <div className="rounded-control border bg-surface-muted px-3 py-2.5">
            <p className="qx-caption text-fg-muted">{copy.spokenCode}</p>
            <p className="font-mono text-lg font-semibold tracking-[0.18em] text-fg">{spokenCardCode(card.token)}</p>
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            <Button type="button" onClick={onFullscreen}>
              <Expand className="h-4 w-4" aria-hidden />
              {copy.fullscreen}
            </Button>
            <Button type="button" variant="outline" onClick={onCopy}>
              <Copy className="h-4 w-4" aria-hidden />
              {copy.copyCode}
            </Button>
          </div>
          {(wallet?.apple || wallet?.google) && card.status === 'ACTIVATED' && (
            <div className="space-y-2 border-t pt-3">
              <p className="qx-caption font-medium text-fg-muted">{copy.wallet}</p>
              <div className="grid gap-2 sm:grid-cols-2">
                {wallet.apple && (
                  <Button type="button" variant="outline" onClick={addApple} loading={walletBusy === 'apple'}>
                    <Download className="h-4 w-4" aria-hidden />
                    Apple Wallet
                  </Button>
                )}
                {wallet.google && (
                  <Button type="button" variant="outline" onClick={addGoogle} loading={walletBusy === 'google'}>
                    <Smartphone className="h-4 w-4" aria-hidden />
                    Google Wallet
                  </Button>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </SectionCard>
  );
}

function RecentActivity({ card, locale, copy }: { card: MyCard; locale: Locale; copy: Copy }) {
  return (
    <SectionCard
      title={copy.recent}
      icon={<History />}
      actions={
        <Button asChild variant="ghost" size="sm">
          <Link href="/customer/spending-overview">
            <Wallet className="h-4 w-4" aria-hidden />
            {copy.spending}
          </Link>
        </Button>
      }
      footer={
        <Button asChild variant="outline" className="w-full">
          <Link href="/customer/consumptions">
            {copy.allConsumptions}
            <ArrowRight className="h-4 w-4" aria-hidden />
          </Link>
        </Button>
      }
    >
      {card.consumptions.length === 0 ? (
        <p className="qx-small text-fg-muted">{copy.noRecent}</p>
      ) : (
        <ul className="divide-y">
          {card.consumptions.slice(0, 3).map((c) => (
            <li key={c.id} className="flex items-center justify-between gap-3 py-2.5 first:pt-0 last:pb-0">
              <span className="flex min-w-0 items-center gap-2.5">
                <span aria-hidden className="grid h-8 w-8 shrink-0 place-items-center rounded-control bg-surface-muted text-fg-muted">
                  <Store className="h-4 w-4" />
                </span>
                <span className="min-w-0">
                  <span className="qx-small block truncate font-medium text-fg">{c.dealer?.businessName || 'İşletme'}</span>
                  {c.product?.name && <span className="qx-caption block truncate text-fg-muted">{c.product.name}</span>}
                </span>
              </span>
              <time dateTime={c.createdAt} className="qx-caption shrink-0 tabular-nums text-fg-muted">
                {formatRelativeTime(c.createdAt, locale)}
              </time>
            </li>
          ))}
        </ul>
      )}
    </SectionCard>
  );
}

function PendingReviews({ count, copy }: { count: number; copy: Copy }) {
  if (count <= 0) return null;
  return (
    <div className={cn('flex flex-col gap-3 rounded-card border p-4 sm:flex-row sm:items-center', TONE_CALLOUT.warning)}>
      <div className="flex min-w-0 flex-1 items-start gap-3">
        <span aria-hidden className="grid h-10 w-10 shrink-0 place-items-center rounded-control bg-warning-subtle text-warning ring-1 ring-inset ring-warning-border">
          <Award className="h-5 w-5" />
        </span>
        <div className="min-w-0">
          <p className="qx-body font-semibold text-fg">{copy.pendingTitle(count)}</p>
          <p className="qx-small text-fg-muted">{copy.pendingBody}</p>
        </div>
      </div>
      <Button asChild variant="outline" className="w-full sm:w-auto">
        <Link href="/customer/consumptions?hasReview=false">
          {copy.pendingCta}
          <ArrowRight className="h-4 w-4" aria-hidden />
        </Link>
      </Button>
    </div>
  );
}

function NoCard({ copy }: { copy: Copy }) {
  const [help, setHelp] = useState(false);
  return (
    <SectionCard>
      <EmptyState
        variant="first-use"
        icon={CreditCard}
        title={copy.emptyTitle}
        description={copy.emptyBody}
        action={
          <Button type="button" variant="outline" onClick={() => setHelp((v) => !v)} aria-expanded={help}>
            {copy.emptyCta}
          </Button>
        }
      />
      {help && <p className="qx-small mx-auto max-w-md pb-4 text-center text-fg-muted">{copy.emptyHelp}</p>}
    </SectionCard>
  );
}

// ───────────────────────────── Sayfa ─────────────────────────────

export default function CustomerMyCardPage() {
  const { data: session } = useSession();
  const { locale: appLocale } = useAppLocale();
  const locale: Locale = appLocale === 'en' ? 'en' : 'tr';
  const copy = COPY[locale];
  const userId = (session?.user?.id as string | undefined) ?? null;
  const holderName = session?.user?.name || (locale === 'en' ? 'Member' : 'Üye');

  const query = useQuery({
    queryKey: ['customer', 'cards'],
    queryFn: fetchCards,
    staleTime: 60_000,
    retry: (count, error) => !(error instanceof CardsHttpError && error.status >= 400 && error.status < 500) && count < 2,
  });

  // Çevrimdışı anlık görüntü: başarılı yanıtı sakla, hata anında göster.
  const [snapshot, setSnapshot] = useState<CardsSnapshot | null>(null);
  useEffect(() => {
    if (!userId) return;
    try {
      setSnapshot(readSnapshot(window.localStorage.getItem(snapshotKey(userId)), Date.now()));
    } catch {
      /* depolama kapalı */
    }
  }, [userId]);
  useEffect(() => {
    if (!userId || !query.data) return;
    try {
      const snap = buildSnapshot(query.data, Date.now());
      if (snap.data.cards.length > 0) window.localStorage.setItem(snapshotKey(userId), JSON.stringify(snap));
      else window.localStorage.removeItem(snapshotKey(userId));
    } catch {
      /* depolama dolu/kapalı */
    }
  }, [userId, query.data]);

  // Yalnız ağ/sunucu hatasında (4xx yetki hatasında değil) son kart gösterilir.
  const isClientError = query.error instanceof CardsHttpError && query.error.status >= 400 && query.error.status < 500;
  const usingSnapshot = !query.data && query.isError && !isClientError && !!snapshot;
  const data: MyCardsData | undefined = query.data ?? (usingSnapshot ? snapshot!.data : undefined);
  const effectiveQuery = usingSnapshot ? { ...query, data, isError: false, error: null } : query;

  const qrCodes = useCardQrCodes(data?.cards);
  const wallet = useQuery({
    queryKey: ['customer', 'wallet-availability'],
    queryFn: fetchWalletAvailability,
    enabled: !!query.data?.cards.some((c) => c.status === 'ACTIVATED'),
    staleTime: 10 * 60_000,
  });

  const [openCard, setOpenCard] = useState<MyCard | null>(null);
  useWakeLock(!!openCard);
  const closeDialog = useCallback((open: boolean) => {
    if (!open) setOpenCard(null);
  }, []);

  return (
    <div className="space-y-6 pb-8">
      <PageHeader title={copy.title} description={copy.description} icon={<CreditCard />} />

      {usingSnapshot && (
        <div role="status" className={cn('qx-small flex items-start gap-2.5 rounded-card border px-4 py-3', TONE_CALLOUT.warning)}>
          <WifiOff className="mt-0.5 h-4 w-4 shrink-0 text-warning" aria-hidden />
          <span className="min-w-0 flex-1">{copy.offline(formatRelativeTime(new Date(snapshot!.savedAt), locale))}</span>
        </div>
      )}

      <QueryState
        query={effectiveQuery}
        skeleton="detail"
        isEmpty={() => false}
        error={{ title: copy.errorTitle }}
      >
        {(d: MyCardsData) =>
          d.cards.length === 0 ? (
            <NoCard copy={copy} />
          ) : (
            <div className="space-y-8">
              {d.cards.map((card) => (
                <Motion.article
                  key={card.id}
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ type: 'spring', stiffness: 320, damping: 30 }}
                  className="space-y-4"
                  aria-label={`${copy.membership} ${maskCardToken(card.token)}`}
                >
                  <CardFace card={card} holderName={holderName} locale={locale} copy={copy} />
                  <PresentPanel
                    card={card}
                    qrSrc={qrCodes[card.token]}
                    copy={copy}
                    onFullscreen={() => setOpenCard(card)}
                    wallet={wallet.data}
                  />
                  {!usingSnapshot && <RecentActivity card={card} locale={locale} copy={copy} />}
                </Motion.article>
              ))}
              {!usingSnapshot && <PendingReviews count={d.stats.reviewPending} copy={copy} />}
              <p className="qx-caption flex items-start gap-2 text-fg-muted">
                <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-success" aria-hidden />
                {copy.safety}
              </p>
            </div>
          )
        }
      </QueryState>

      <Dialog open={!!openCard} onOpenChange={closeDialog}>
        <DialogContent className="max-h-[min(94dvh,calc(100dvh-env(safe-area-inset-bottom)))] overflow-y-auto sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{copy.dialogTitle}</DialogTitle>
            <DialogDescription>{copy.dialogDesc}</DialogDescription>
          </DialogHeader>
          {openCard && (
            <div className="flex flex-col items-center gap-4 pb-2">
              <QrImage
                src={qrCodes[openCard.token]}
                alt={copy.qrAlt}
                loadingLabel={copy.qrLoading}
                className="max-w-[min(80vw,22rem)] p-3"
              />
              <p className="font-mono text-xl font-semibold tracking-[0.2em] text-fg">{spokenCardCode(openCard.token)}</p>
              <p className="qx-caption inline-flex items-center gap-1.5 text-fg-muted">
                <SunMedium className="h-3.5 w-3.5" aria-hidden />
                {copy.brightness}
              </p>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
