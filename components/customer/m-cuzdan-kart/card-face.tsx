'use client';

/**
 * Kart yüzü — yalnız kimlik: marka, durum, lig (kademe), sahip, maskeli numara, tüketim.
 * QR kart yüzünde DEĞİL (eski `aspect-ratio + overflow-hidden` kutu mobilde QR'ı kırpıyordu,
 * P0-39); kart bir düğmedir → dokununca "Kasada göster" tam ekranı açılır.
 *
 * Hareket (yol haritası §4.2, 3D politikası "Kartım kart yüzü: CSS 3D tilt"):
 *  - Tilt/glare `useMotionValue` + `useSpring` ile render'sız; perspektif inline style
 *    (Tailwind 3.4'te `perspective-[…]` yok). Yalnız fare; dokunmatikte tilt yok.
 *  - Girişte TEK seferlik parıltı; sonsuz döngü yok.
 *  - Dış kap `layoutId` taşır: kart → tam ekran panel paylaşılan öğe geçişi (domMax yalnız
 *    bu yüzeyde lazy). Konum dış sarmalayıcıda, dönüş içteki elemanda (kural §4.2-2).
 *  - Azaltılmış harekette (`useReducedMotionPref`) tilt, glare ve parıltı hiç çizilmez.
 */
import { useRef } from 'react';
import { m as Motion, useMotionTemplate, useMotionValue, useSpring, useTransform } from 'framer-motion';
import { Snowflake } from 'lucide-react';
import { LeagueEmblem, getLeagueColors } from '@/components/ds/play';
import { DURATION, EASE, useReducedMotionPref } from '@/lib/motion';
import { cn, formatRelativeTime } from '@/lib/utils';
import type { WalletCard, WalletLeague } from '@/lib/wallet-card/dto';
import { cardTokenAria, maskCardToken } from '@/lib/wallet-card/snapshot';
import type { CardCopy, CardLocale } from './copy';

/** Kart malzemesi: tema bağımsız koyu yüzey (fiziksel kart gibi); metin ≥ %72 beyaz (AA). */
export const CARD_SURFACE_STYLE: React.CSSProperties = {
  backgroundColor: '#0b0a14',
  backgroundImage:
    'radial-gradient(ellipse 90% 70% at 8% -12%, hsl(var(--brand) / 0.55), transparent 55%), radial-gradient(ellipse 70% 60% at 105% 110%, hsl(var(--category-2) / 0.28), transparent 55%)',
};

export const CARD_RADIUS = 22;

export function cardStatusLabel(card: WalletCard, copy: CardCopy): string {
  if (card.frozenByCustomer) return copy.status.FROZEN;
  return copy.status[card.status];
}

export function CardFace({
  card,
  holderName,
  league,
  locale,
  copy,
  onPresent,
  generation = 0,
}: {
  card: WalletCard;
  holderName: string;
  league: WalletLeague | null;
  locale: CardLocale;
  copy: CardCopy;
  onPresent?: () => void;
  /**
   * Paylaşılan öğe nesli: tam ekran kapanınca artırılır → kart yeni düğümle bağlanır ve
   * tam ekran yüzeyinden yerine döner (eski düğümde kalan çapraz geçiş opaklığı taşınmaz).
   */
  generation?: number;
}) {
  const reduce = useReducedMotionPref();
  const ref = useRef<HTMLDivElement>(null);
  const px = useMotionValue(0.5);
  const py = useMotionValue(0.5);
  const sx = useSpring(px, { stiffness: 220, damping: 26 });
  const sy = useSpring(py, { stiffness: 220, damping: 26 });
  const rotateY = useTransform(sx, [0, 1], [4, -4]);
  const rotateX = useTransform(sy, [0, 1], [-4, 4]);
  const gx = useTransform(sx, (v) => `${v * 100}%`);
  const gy = useTransform(sy, (v) => `${v * 100}%`);
  const glare = useMotionTemplate`radial-gradient(circle at ${gx} ${gy}, rgba(255,255,255,0.20), transparent 48%)`;

  const presentable = card.status === 'ACTIVATED';
  const statusLabel = cardStatusLabel(card, copy);
  const leagueColors = getLeagueColors(league?.key);
  const nf = new Intl.NumberFormat(locale === 'en' ? 'en-US' : 'tr-TR');

  const onPointerMove = (e: React.PointerEvent<HTMLElement>) => {
    if (reduce || e.pointerType !== 'mouse' || !ref.current) return;
    const r = ref.current.getBoundingClientRect();
    px.set((e.clientX - r.left) / r.width);
    py.set((e.clientY - r.top) / r.height);
  };
  const resetTilt = () => {
    px.set(0.5);
    py.set(0.5);
  };

  const statusTone = card.frozenByCustomer
    ? 'bg-sky-300/15 text-sky-100 ring-sky-200/30'
    : card.status === 'ACTIVATED'
      ? 'bg-emerald-300/15 text-emerald-100 ring-emerald-200/30'
      : card.status === 'BLOCKED'
        ? 'bg-red-300/15 text-red-100 ring-red-200/30'
        : 'bg-white/10 text-white/85 ring-white/20';

  const face = (
    <Motion.div
      ref={ref}
      style={reduce ? undefined : { rotateX, rotateY, transformStyle: 'preserve-3d' }}
      className="relative h-full w-full"
    >
      <div
        className="relative isolate flex h-full w-full flex-col justify-between overflow-clip p-5 text-left text-white sm:p-6"
        style={{ ...CARD_SURFACE_STYLE, borderRadius: CARD_RADIUS }}
      >
        {/* Lig kademesi: üst kenarda ince renk şeridi (kademe yalnız renge dayanmaz; ad aşağıda yazılı). */}
        <span
          aria-hidden
          className="absolute inset-x-0 top-0 -z-10 h-1"
          style={{ background: `linear-gradient(90deg, ${leagueColors.from}, ${leagueColors.via ?? leagueColors.to}, ${leagueColors.to})` }}
        />
        {!reduce && (
          <>
            <Motion.span aria-hidden className="pointer-events-none absolute inset-0 -z-10 mix-blend-overlay" style={{ background: glare }} />
            <Motion.span
              aria-hidden
              className="pointer-events-none absolute inset-y-0 -left-1/2 -z-10 w-1/2 -skew-x-12 bg-gradient-to-r from-transparent via-white/[0.14] to-transparent"
              initial={{ x: '0%' }}
              animate={{ x: '420%' }}
              transition={{ duration: DURATION.celebrate, ease: EASE.emphasized, delay: 0.2 }}
            />
          </>
        )}

        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-white/75">QRateX</p>
            <p className="truncate text-lg font-semibold tracking-tight sm:text-xl">{copy.membership}</p>
          </div>
          <span className={cn('inline-flex shrink-0 items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ring-inset', statusTone)}>
            {card.frozenByCustomer && <Snowflake aria-hidden className="h-3.5 w-3.5" />}
            {statusLabel}
          </span>
        </div>

        {league && (
          <div className="flex items-center gap-2">
            <LeagueEmblem leagueKey={league.key} name={league.name} size="sm" register="ops" />
            <span className="text-sm font-medium text-white/90">{copy.league(league.name)}</span>
          </div>
        )}

        <div className="flex items-end justify-between gap-4">
          <div className="min-w-0">
            <p className="truncate text-base font-semibold sm:text-lg">{holderName}</p>
            <p className="mt-0.5 font-mono text-sm tracking-[0.14em] text-white/90 sm:text-base">
              <span className="sr-only">{copy.number}: </span>
              <span aria-hidden>{maskCardToken(card.token)}</span>
              <span className="sr-only">{cardTokenAria(card.token.slice(-8), locale)}</span>
            </p>
          </div>
          <div className="shrink-0 text-right">
            <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-white/75">{copy.visits}</p>
            <p className="font-mono text-2xl font-bold tabular-nums sm:text-3xl">{nf.format(card.consumptionsCount)}</p>
          </div>
        </div>

      </div>
    </Motion.div>
  );

  const label = copy.cardLabel(statusLabel, maskCardToken(card.token).replace('•••• ', ''));
  const lastUsed = card.lastUsedAt ? copy.lastUsed(formatRelativeTime(card.lastUsedAt, locale)) : null;

  return (
    <div className="mx-auto w-full max-w-md">
      {/* Konum/boyut: framer'sız dış kutu (oran sabit; içerik oran içinde tasarlandı, kırpılmaz). */}
      <div className="relative w-full" style={{ aspectRatio: '1.586 / 1', minHeight: '13.5rem' }}>
        <Motion.div
            key={generation}
            layoutId={`wallet-card-${card.id}`}
            className="absolute inset-0 shadow-[0_28px_60px_-30px_rgba(0,0,0,0.7)]"
            style={{ borderRadius: CARD_RADIUS, perspective: 1200 }}
            transition={{ duration: DURATION.slow, ease: EASE.emphasized }}
          >
            {presentable && onPresent ? (
              <button
                type="button"
                onClick={() => {
                  resetTilt();
                  onPresent();
                }}
                onPointerMove={onPointerMove}
                onPointerLeave={resetTilt}
                aria-label={`${copy.present}. ${label}`}
                aria-haspopup="dialog"
                className="block h-full w-full rounded-[22px] outline-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2 focus-visible:ring-offset-background active:scale-[0.99] motion-reduce:active:scale-100"
              >
                {face}
              </button>
            ) : (
              <div role="group" aria-label={label} className="h-full w-full" onPointerMove={onPointerMove} onPointerLeave={resetTilt}>
                {face}
              </div>
            )}
          </Motion.div>
      </div>
      {lastUsed && <p className="qx-caption mt-2 text-center text-fg-muted">{lastUsed}</p>}
    </div>
  );
}
