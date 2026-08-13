'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useSession } from 'next-auth/react';
import Link from 'next/link';
import { m as Motion, useReducedMotion } from 'framer-motion';
import {
  CreditCard,
  History,
  Wallet,
  Star,
  Calendar,
  Store,
  ArrowRight,
  Loader2,
  QrCode,
  Sparkles,
  Copy,
  Share2,
  Eye,
  EyeOff,
  Smartphone,
  Download,
  Shield,
  Zap,
  Award,
  Wifi,
  Crown,
} from 'lucide-react';
import { BRAND_CARD_QR_DARK_HEX, HEX_WHITE } from '@/lib/brand-colors';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { DashboardPageHeading } from '@/components/dashboard/page-heading';
import { DashboardPageHeroChrome } from '@/components/layout/dashboard-page-hero';
import { toast } from '@/lib/admin-toast';
import { formatDate, formatRelativeTime, getCardStatusLabel, getCardStatusColor, cn } from '@/lib/utils';
import { useAppT } from '@/lib/app-locale';

const QR_DOMAIN = 'https://demoqratex.vercel.app';

/** İnce gürültü — kart yüzeyine derinlik */
const NOISE_SVG =
  "url(\"data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.8' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='0.05'/%3E%3C/svg%3E\")";

interface UserCard {
  id: string;
  token: string;
  status: string;
  activatedAt: string | null;
  _count: {
    consumptions: number;
  };
  consumptions: {
    id: string;
    createdAt: string;
    dealer: {
      id: string;
      businessName: string | null;
    };
    product: {
      id: string;
      name: string;
    } | null;
  }[];
}

function StatTile({
  label,
  value,
  icon: Icon,
  tone,
}: {
  label: string;
  value: number;
  icon: typeof CreditCard;
  tone: 'primary' | 'cyan' | 'amber';
}) {
  const toneCls =
    tone === 'primary'
      ? 'border-primary/20 bg-primary/[0.06]'
      : tone === 'cyan'
        ? 'border-cyan-500/20 bg-cyan-500/[0.06]'
        : 'border-amber-500/25 bg-amber-500/[0.07]';
  return (
    <div className={cn('rounded-2xl border px-3 py-3 text-center shadow-sm sm:px-4 sm:py-3.5', toneCls)}>
      <Icon className="mx-auto mb-1 h-4 w-4 text-muted-foreground sm:mb-1.5 sm:h-5 sm:w-5" aria-hidden />
      <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground sm:text-xs">{label}</p>
      <p className="mt-0.5 font-mono text-xl font-bold tabular-nums sm:text-2xl">{value}</p>
    </div>
  );
}

function EmvChip() {
  return (
    <div
      className="relative h-10 w-[2.65rem] shrink-0 overflow-hidden rounded-md shadow-[inset_0_1px_0_rgba(255,255,255,0.35),inset_0_-2px_8px_rgba(0,0,0,0.35)] ring-1 ring-amber-950/40 sm:h-11 sm:w-12"
      aria-hidden
    >
      <div className="absolute inset-0 bg-gradient-to-br from-amber-100 via-amber-500 to-amber-900" />
      <div className="absolute inset-[3px] rounded-sm bg-gradient-to-b from-amber-950/25 to-transparent" />
      <div className="absolute inset-x-1 top-1/2 h-px -translate-y-1/2 bg-amber-950/20" />
      <div className="absolute inset-y-1 left-1/2 w-px -translate-x-1/2 bg-amber-950/15" />
    </div>
  );
}

type LegendCardProps = {
  card: UserCard;
  qrSrc?: string;
  holderName: string;
  showFullToken: boolean;
  onToggleToken: () => void;
  onOpenQr: () => void;
  reduceMotion: boolean;
};

function LegendDigitalCard({
  card,
  qrSrc,
  holderName,
  showFullToken,
  onToggleToken,
  onOpenQr,
  reduceMotion,
}: LegendCardProps) {
  const t = useAppT();
  const wrapRef = useRef<HTMLDivElement>(null);
  const [glare, setGlare] = useState({ x: 50, y: 40 });
  const [tilt, setTilt] = useState({ rx: 0, ry: 0 });

  const onMove = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      const el = wrapRef.current;
      if (!el || reduceMotion) return;
      const r = el.getBoundingClientRect();
      const x = ((e.clientX - r.left) / r.width) * 100;
      const y = ((e.clientY - r.top) / r.height) * 100;
      setGlare({ x, y });
      const ry = ((e.clientX - r.left) / r.width - 0.5) * -6;
      const rx = ((e.clientY - r.top) / r.height - 0.5) * 6;
      setTilt({ rx, ry });
    },
    [reduceMotion]
  );

  const onLeave = useCallback(() => {
    setGlare({ x: 50, y: 40 });
    setTilt({ rx: 0, ry: 0 });
  }, []);

  const last8 = card.token.slice(-8).toUpperCase();
  const tokenDisplay = showFullToken ? `${card.token.slice(0, 12)}…` : `•••• •••• ${last8}`;

  return (
    <div className="mx-auto w-full max-w-lg perspective-[1400px] sm:max-w-xl">
      <Motion.div
        ref={wrapRef}
        initial={reduceMotion ? false : { opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ type: 'spring', stiffness: 280, damping: 26 }}
        onMouseMove={onMove}
        onMouseLeave={onLeave}
        style={{
          transform: reduceMotion ? undefined : `rotateX(${tilt.rx}deg) rotateY(${tilt.ry}deg)`,
          transformStyle: 'preserve-3d',
        }}
        className="motion-reduce:transform-none"
      >
        {/* Dış: metalik gradient çerçeve */}
        <div className="rounded-[1.45rem] bg-gradient-to-br from-white/35 via-primary/50 to-cyan-400/35 p-[1.5px] shadow-[0_32px_64px_-28px_rgba(0,0,0,0.65),0_0_0_1px_rgba(255,255,255,0.06)_inset] dark:shadow-[0_36px_80px_-32px_rgba(0,0,0,0.85)]">
          <div
            className="relative aspect-[1.586/1] w-full overflow-hidden rounded-[1.35rem] bg-[#07070f]"
            style={{ backgroundImage: NOISE_SVG }}
          >
            {/* Derinlik katmanları */}
            <div className="absolute inset-0 bg-gradient-to-br from-violet-950/80 via-[#0a0a14] to-cyan-950/50" />
            <div
              className="pointer-events-none absolute inset-0 opacity-90 mix-blend-screen"
              style={{
                background:
                  'radial-gradient(ellipse 90% 70% at 10% -10%, hsl(var(--primary) / 0.45), transparent 52%), radial-gradient(ellipse 70% 60% at 100% 100%, rgba(34,211,238,0.22), transparent 48%), radial-gradient(ellipse 50% 40% at 80% 10%, rgba(167,139,250,0.18), transparent 45%)',
              }}
            />
            <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/50 via-transparent to-white/[0.07]" />

            {/* Yavaş ışık bandı */}
            {!reduceMotion && (
              <Motion.div
                className="pointer-events-none absolute -inset-full z-[1] rotate-[18deg] bg-gradient-to-r from-transparent via-white/12 to-transparent"
                animate={{ x: ['-30%', '130%'] }}
                transition={{ duration: 7, repeat: Infinity, ease: 'linear' }}
              />
            )}

            {/* Fare parlaması */}
            <div
              className="pointer-events-none absolute inset-0 z-[2] opacity-70 mix-blend-overlay transition-opacity duration-300"
              style={{
                background: `radial-gradient(circle at ${glare.x}% ${glare.y}%, rgba(255,255,255,0.28), transparent 42%)`,
              }}
            />

            {/* Filigran */}
            <Crown className="pointer-events-none absolute -bottom-6 -right-2 z-[1] h-36 w-36 text-white/[0.06] sm:h-44 sm:w-44" aria-hidden />

            <div className="relative z-[3] flex h-full flex-col p-4 sm:p-6">
              {/* Üst şerit */}
              <div className="flex items-start justify-between gap-3">
                <div className="flex min-w-0 items-center gap-3 sm:gap-4">
                  <EmvChip />
                  <div className="min-w-0">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.28em] text-white/45 sm:text-[11px]">QRateX</p>
                    <p className="truncate bg-gradient-to-r from-white via-white to-white/70 bg-clip-text text-lg font-semibold tracking-tight text-transparent sm:text-xl">
                      Signature Member
                    </p>
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-2 sm:gap-2.5">
                  <Wifi className="h-5 w-5 text-white/35 sm:h-6 sm:w-6" strokeWidth={1.5} aria-hidden />
                  <Badge
                    variant="outline"
                    className={cn(
                      'border bg-black/25 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide backdrop-blur-sm sm:text-xs',
                      getCardStatusColor(card.status)
                    )}
                  >
                    {getCardStatusLabel(card.status)}
                  </Badge>
                </div>
              </div>

              {/* Orta: istatistik + QR */}
              <div className="mt-4 flex min-h-0 flex-1 flex-col gap-4 sm:mt-5 sm:flex-row sm:items-stretch sm:gap-5">
                <div className="flex flex-1 flex-col justify-center gap-3 sm:gap-4">
                  <div>
                    <p className="text-[10px] font-medium uppercase tracking-[0.2em] text-white/40">Tüketim</p>
                    <p className="mt-0.5 font-mono text-3xl font-bold tabular-nums tracking-tight text-white drop-shadow-sm sm:text-4xl">
                      {card._count.consumptions}
                    </p>
                  </div>
                  <div className="rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2.5 backdrop-blur-md sm:px-4 sm:py-3">
                    <p className="text-[10px] uppercase tracking-[0.18em] text-white/40">Aktivasyon</p>
                    <p className="mt-0.5 text-sm font-medium text-white/95 sm:text-base">
                      {card.activatedAt ? formatDate(card.activatedAt) : '—'}
                    </p>
                  </div>
                </div>

                <div className="flex shrink-0 justify-center sm:items-center sm:justify-end">
                  <button
                    type="button"
                    onClick={onOpenQr}
                    className="group relative touch-manipulation outline-none focus-visible:ring-2 focus-visible:ring-white/60 focus-visible:ring-offset-2 focus-visible:ring-offset-transparent"
                    aria-label="Büyük QR kodu göster"
                  >
                    <div className="absolute -inset-0.5 rounded-2xl bg-gradient-to-br from-white/40 via-primary/30 to-cyan-400/40 opacity-70 blur-md transition-opacity group-hover:opacity-100" />
                    <div className="relative rounded-2xl bg-gradient-to-b from-white to-zinc-100 p-2 shadow-[0_12px_40px_-12px_rgba(0,0,0,0.55),inset_0_1px_0_rgba(255,255,255,0.9)] ring-2 ring-white/80 sm:p-2.5">
                      <div className="absolute left-2 top-2 h-3 w-3 rounded-sm border border-zinc-300/80 sm:left-2.5 sm:top-2.5" />
                      <div className="absolute bottom-2 right-2 h-3 w-3 rounded-sm border border-zinc-300/80 sm:bottom-2.5 sm:right-2.5" />
                      {qrSrc ? (
                        <img
                          src={qrSrc}
                          alt="QR önizleme"
                          className="relative z-[1] h-[6.5rem] w-[6.5rem] rounded-lg object-cover sm:h-[7.25rem] sm:w-[7.25rem]"
                        />
                      ) : (
                        <QrCode className="relative z-[1] h-[6.5rem] w-[6.5rem] text-zinc-900 sm:h-[7.25rem] sm:w-[7.25rem]" />
                      )}
                    </div>
                    <p className="mt-2 text-center text-[10px] font-medium uppercase tracking-wider text-white/40 sm:text-xs">
                      Dokun — büyüt
                    </p>
                  </button>
                </div>
              </div>

              {/* Alt: PAN satırı */}
              <div className="mt-auto border-t border-white/10 pt-3 sm:pt-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                  <div className="min-w-0 flex-1">
                    <p className="text-[10px] font-medium uppercase tracking-[0.2em] text-white/38">Kart sahibi</p>
                    <p className="mt-0.5 truncate text-base font-semibold tracking-tight text-white sm:text-lg">{holderName}</p>
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      <code className="font-mono text-sm tracking-[0.12em] text-white/85 sm:text-base">{tokenDisplay}</code>
                      <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        className="h-10 w-10 shrink-0 touch-manipulation rounded-lg text-white/60 hover:bg-white/10 hover:text-white"
                        onClick={(e) => {
                          e.stopPropagation();
                          onToggleToken();
                        }}
                        aria-label={showFullToken ? t('common.hide') : t('common.show')}
                      >
                        {showFullToken ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </Button>
                    </div>
                  </div>
                  <div className="hidden items-center gap-1.5 text-white/25 sm:flex" aria-hidden>
                    <Sparkles className="h-4 w-4" />
                    <span className="text-[10px] uppercase tracking-widest">Digital</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </Motion.div>
    </div>
  );
}

export default function CustomerMyCardPage() {
  const t = useAppT();
  const { data: session } = useSession();
  const reduceMotion = useReducedMotion() === true;
  const [cards, setCards] = useState<UserCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({
    totalCards: 0,
    totalConsumptions: 0,
    reviewPending: 0,
  });
  const [qrCodes, setQrCodes] = useState<{ [key: string]: string }>({});
  const [showToken, setShowToken] = useState<{ [key: string]: boolean }>({});
  const [selectedCard, setSelectedCard] = useState<UserCard | null>(null);
  const [showQrDialog, setShowQrDialog] = useState(false);
  const [walletLoading, setWalletLoading] = useState<string | null>(null);

  useEffect(() => {
    fetchCards();
  }, []);

  const fetchCards = async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/customer/cards');
      const data = await res.json();

      if (data.success) {
        setCards(data.cards);
        setStats(data.stats);

        // PERF: qrcode (~25KB) ilk bundle'dan çıkarıldı — QR üretimi zaten mount SONRASI
        // olduğundan lib'i burada dynamic import ediyoruz (sayfa shell'i daha hızlı boyanır).
        const QRCode = (await import('qrcode')).default;
        const qrPromises = data.cards.map(async (card: UserCard) => {
          const url = `${QR_DOMAIN}/c/${card.token}`;
          const qrDataUrl = await QRCode.toDataURL(url, {
            width: 400,
            margin: 2,
            color: {
              dark: BRAND_CARD_QR_DARK_HEX,
              light: HEX_WHITE,
            },
            errorCorrectionLevel: 'H',
          });
          return { token: card.token, qrDataUrl };
        });

        const qrResults = await Promise.all(qrPromises);
        const qrMap: { [key: string]: string } = {};
        qrResults.forEach((result) => {
          qrMap[result.token] = result.qrDataUrl;
        });
        setQrCodes(qrMap);
      }
    } catch (err) {
      console.error('Error fetching cards:', err);
    } finally {
      setLoading(false);
    }
  };

  const copyToken = (token: string) => {
    navigator.clipboard.writeText(token);
    toast.success('Kart ID kopyalandı!');
  };

  const copyUrl = (token: string) => {
    const url = `${QR_DOMAIN}/c/${token}`;
    navigator.clipboard.writeText(url);
    toast.success('Kart URL kopyalandı!');
  };

  const shareCard = async (token: string) => {
    const url = `${QR_DOMAIN}/c/${token}`;
    if (navigator.share) {
      try {
        await navigator.share({
          title: 'QRateX Kartım',
          text: 'QRateX dijital kartımı inceleyin!',
          url,
        });
      } catch {
        copyUrl(token);
      }
    } else {
      copyUrl(token);
    }
  };

  const toggleShowToken = (cardId: string) => {
    setShowToken((prev) => ({
      ...prev,
      [cardId]: !prev[cardId],
    }));
  };

  const addToAppleWallet = async (cardId: string) => {
    setWalletLoading('apple');
    try {
      const response = await fetch(`/api/wallet/apple?cardId=${cardId}`);

      if (!response.ok) {
        const data = await response.json();
        toast.error(data.error || 'Kart oluşturulamadı');
        return;
      }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `qratex-card.pkpass`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);

      toast.success("Kart indirildi! Apple Wallet'a ekleyebilirsiniz.");
    } catch {
      toast.error('Kart indirilemedi');
    } finally {
      setWalletLoading(null);
    }
  };

  const addToGoogleWallet = async (cardId: string) => {
    setWalletLoading('google');
    try {
      const response = await fetch(`/api/wallet/google?cardId=${cardId}`);
      const data = await response.json();

      if (!response.ok) {
        toast.error(data.error || 'Kart oluşturulamadı');
        return;
      }

      if (data.saveUrl) {
        window.open(data.saveUrl, '_blank');
        toast.success('Google Wallet sayfası açıldı');
      } else if (data.fallbackUrl) {
        toast.info('Google Wallet henüz yapılandırılmamış');
      }
    } catch {
      toast.error('Kart eklenemedi');
    } finally {
      setWalletLoading(null);
    }
  };

  const openQr = (card: UserCard) => {
    setSelectedCard(card);
    setShowQrDialog(true);
  };

  if (loading) {
    return (
      <div className="space-y-6 pb-8">
        <div className="h-10 w-48 animate-pulse rounded-lg bg-muted md:h-12 md:w-64" />
        <div className="h-36 animate-pulse rounded-2xl bg-muted sm:h-40" />
        <div className="grid grid-cols-3 gap-2 sm:gap-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-24 animate-pulse rounded-2xl bg-muted sm:h-28" />
          ))}
        </div>
        <div className="mx-auto max-w-lg p-[2px]">
          <div className="aspect-[1.586/1] animate-pulse rounded-[1.35rem] bg-muted" />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5 pb-8 md:space-y-6">
      <DashboardPageHeading
        title="Dijital Kartlarım"
        description="Kartını işletmede göster, tüketim ve puanların tek hesapta toplansın."
      />

      <div className="rounded-2xl border border-border/60 bg-card/40 p-4 shadow-sm backdrop-blur-sm sm:hidden dark:bg-card/30">
        <h1 className="text-balance text-xl font-bold tracking-tight">Dijital Kartlarım</h1>
        <p className="mt-1 text-pretty text-sm leading-relaxed text-muted-foreground">
          Kartını işletmede göster, tüketim ve puanların tek hesapta toplansın.
        </p>
      </div>

      <DashboardPageHeroChrome tone="auto" padded={false}>
        <div className="space-y-4 p-4 sm:p-6 md:p-8">
          <div className="flex items-start gap-3 sm:gap-4">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-primary/25 to-violet-500/20 ring-1 ring-primary/20">
              <CreditCard className="h-6 w-6 text-primary" aria-hidden />
            </div>
            <div className="min-w-0">
              <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Üyelik</p>
              <h2 className="mt-0.5 text-balance text-lg font-semibold tracking-tight sm:text-xl">Tek kart, tüm işletmeler</h2>
              <p className="mt-1 max-w-2xl text-pretty text-sm text-muted-foreground">
                QR veya link ile tanın; yorum ve ödüller hesabına işlenir.
              </p>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-2 sm:gap-3">
            <StatTile label="Kart" value={stats.totalCards} icon={CreditCard} tone="primary" />
            <StatTile label={t('common.consumptions')} value={stats.totalConsumptions} icon={Zap} tone="cyan" />
            <StatTile label="Yorum" value={stats.reviewPending} icon={Star} tone="amber" />
          </div>
        </div>
      </DashboardPageHeroChrome>

      <Card className="overflow-hidden border-border/70">
        <CardContent className="p-4 sm:p-5">
          <div className="flex gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-muted">
              <Shield className="h-5 w-5 text-muted-foreground" aria-hidden />
            </div>
            <div className="min-w-0 space-y-3">
              <div>
                <h3 className="font-semibold text-foreground">Paylaşım nasıl çalışır?</h3>
                <p className="mt-1 text-pretty text-sm leading-relaxed text-muted-foreground">
                  Link veya QR kodu işletmede okutulduğunda veya paylaşıldığında hesabınla eşleşir; kişisel parola içermez.
                </p>
              </div>
              <ol className="grid gap-2 text-sm sm:grid-cols-3 sm:gap-3">
                <li className="rounded-xl border border-border/60 bg-muted/30 px-3 py-2.5">
                  <span className="font-medium text-foreground">1.</span> Paylaş veya kopyala
                </li>
                <li className="rounded-xl border border-border/60 bg-muted/30 px-3 py-2.5">
                  <span className="font-medium text-foreground">2.</span> İşletmede göster
                </li>
                <li className="rounded-xl border border-border/60 bg-muted/30 px-3 py-2.5">
                  <span className="font-medium text-foreground">3.</span> Puan & geçmiş
                </li>
              </ol>
            </div>
          </div>
        </CardContent>
      </Card>

      {cards.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center px-4 py-12 text-center sm:py-14">
            <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-muted">
              <CreditCard className="h-8 w-8 text-muted-foreground" />
            </div>
            <h3 className="text-lg font-semibold">Henüz kartın yok</h3>
            <p className="mt-2 max-w-md text-sm text-muted-foreground">
              İşletmedeki QR ile kartını etkinleştirerek başla.
            </p>
            <Button asChild className="mt-6 min-h-11 w-full max-w-xs touch-manipulation sm:w-auto">
              <Link href="/customer/scan" className="gap-2">
                <QrCode className="h-4 w-4" />
                QR tara
              </Link>
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-10">
          {cards.map((card, index) => (
            <Motion.article
              key={card.id}
              initial={reduceMotion ? false : { opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: reduceMotion ? 0 : index * 0.08, type: 'spring', stiffness: 320, damping: 28 }}
              className="space-y-5"
            >
              <LegendDigitalCard
                card={card}
                qrSrc={qrCodes[card.token]}
                holderName={session?.user?.name || 'Üye'}
                showFullToken={!!showToken[card.id]}
                onToggleToken={() => toggleShowToken(card.id)}
                onOpenQr={() => openQr(card)}
                reduceMotion={reduceMotion}
              />

              <div className="mx-auto max-w-lg sm:max-w-xl">
                <div className="grid grid-cols-3 gap-2 sm:flex sm:flex-wrap sm:justify-center sm:gap-3">
                  <Button type="button" variant="secondary" className="min-h-11 touch-manipulation sm:min-w-[7.5rem]" onClick={() => copyToken(card.token)}>
                    <Copy className="mr-1.5 h-4 w-4" />
                    ID
                  </Button>
                  <Button type="button" variant="secondary" className="min-h-11 touch-manipulation sm:min-w-[7.5rem]" onClick={() => copyUrl(card.token)}>
                    <Copy className="mr-1.5 h-4 w-4" />
                    URL
                  </Button>
                  <Button type="button" className="min-h-11 touch-manipulation sm:min-w-[7.5rem]" onClick={() => shareCard(card.token)}>
                    <Share2 className="mr-1.5 h-4 w-4" />
                    Paylaş
                  </Button>
                </div>
                {/* "Büyük QR göster" butonu kaldırıldı — QR koduna dokununca zaten büyüyor (openQr). */}
              </div>

              {/* Tüketimlerim + Harcama Özetim — kartın altında kısayol (menüden Kartım grubuna taşındı) */}
              <div className="grid grid-cols-2 gap-3">
                <Link
                  href="/customer/consumptions"
                  className="group flex items-center gap-3 rounded-xl border border-border/60 bg-card/50 p-3 transition-all hover:border-primary/40 hover:bg-primary/5"
                >
                  <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
                    <History className="h-5 w-5" />
                  </span>
                  <span className="min-w-0">
                    <span className="block text-sm font-semibold group-hover:text-primary">Tüketimlerim</span>
                    <span className="block text-xs text-muted-foreground">Geçmiş & kayıtlar</span>
                  </span>
                </Link>
                <Link
                  href="/customer/spending-overview"
                  className="group flex items-center gap-3 rounded-xl border border-border/60 bg-card/50 p-3 transition-all hover:border-primary/40 hover:bg-primary/5"
                >
                  <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-emerald-500/10 text-emerald-500">
                    <Wallet className="h-5 w-5" />
                  </span>
                  <span className="min-w-0">
                    <span className="block text-sm font-semibold group-hover:text-primary">Harcama Özetim</span>
                    <span className="block text-xs text-muted-foreground">Aylık trend & analiz</span>
                  </span>
                </Link>
              </div>

              <Card className="border-border/70">
                <CardContent className="space-y-4 p-4 sm:p-5">
                  <div className="flex flex-wrap gap-x-6 gap-y-2 text-sm text-muted-foreground">
                    <span className="inline-flex items-center gap-2">
                      <History className="h-4 w-4 shrink-0" />
                      <span className="font-medium text-foreground">{card._count.consumptions}</span> tüketim
                    </span>
                    <span className="inline-flex items-center gap-2">
                      <Calendar className="h-4 w-4 shrink-0" />
                      {card.activatedAt ? formatDate(card.activatedAt) : '—'}
                    </span>
                  </div>

                  {card.consumptions.length > 0 && (
                    <div className="space-y-2">
                      <p className="text-xs font-medium text-muted-foreground">Son işlemler</p>
                      <ul className="space-y-2">
                        {card.consumptions.slice(0, 4).map((c) => (
                          <li
                            key={c.id}
                            className="flex items-center justify-between gap-3 rounded-xl border border-border/50 bg-muted/30 px-3 py-2.5"
                          >
                            <span className="flex min-w-0 items-center gap-2">
                              <Store className="h-4 w-4 shrink-0 text-muted-foreground" />
                              <span className="truncate text-sm font-medium">{c.dealer.businessName || 'İşletme'}</span>
                            </span>
                            <span className="shrink-0 text-xs tabular-nums text-muted-foreground">{formatRelativeTime(c.createdAt)}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  <div className="flex flex-col gap-2 sm:flex-row">
                    <Button asChild className="min-h-11 flex-1 touch-manipulation">
                      <Link href="/customer/consumptions" className="gap-2">
                        Tüm tüketimler
                        <ArrowRight className="h-4 w-4" />
                      </Link>
                    </Button>
                    <Button type="button" variant="outline" className="min-h-11 touch-manipulation sm:shrink-0" onClick={() => shareCard(card.token)}>
                      <Share2 className="mr-2 h-4 w-4" />
                      Paylaş
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </Motion.article>
          ))}
        </div>
      )}

      <Dialog open={showQrDialog} onOpenChange={setShowQrDialog}>
        <DialogContent className="max-h-[min(92dvh,calc(100dvh-env(safe-area-inset-bottom)))] gap-0 overflow-y-auto border-border/80 bg-card p-0 sm:max-w-md">
          <DialogHeader className="border-b border-border/60 bg-gradient-to-r from-primary/5 to-transparent px-4 pb-4 pt-6 text-left sm:px-6">
            <DialogTitle className="flex items-center gap-2 text-lg font-semibold">
              <Sparkles className="h-5 w-5 text-primary" aria-hidden />
              Dijital kart
            </DialogTitle>
          </DialogHeader>
          {selectedCard && (
            <div className="space-y-5 px-4 py-5 sm:px-6 sm:py-6">
              <Motion.div
                className="relative mx-auto w-fit"
                initial={reduceMotion ? false : { opacity: 0, scale: 0.94, y: 10 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                transition={{ type: 'spring', stiffness: 400, damping: 28 }}
              >
                {!reduceMotion && (
                  <Motion.div
                    className="pointer-events-none absolute -inset-4 rounded-[2rem] bg-gradient-to-tr from-primary/35 via-violet-500/20 to-cyan-500/25 blur-2xl"
                    animate={{ opacity: [0.4, 0.75, 0.4] }}
                    transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
                  />
                )}
                <div className="relative rounded-2xl bg-gradient-to-b from-white to-zinc-100 p-4 shadow-2xl ring-2 ring-white/90 sm:p-5">
                  <div className="absolute left-3 top-3 h-4 w-4 rounded border border-zinc-300/90 sm:left-4 sm:top-4" />
                  <div className="absolute bottom-3 right-3 h-4 w-4 rounded border border-zinc-300/90 sm:bottom-4 sm:right-4" />
                  {qrCodes[selectedCard.token] && (
                    <img
                      src={qrCodes[selectedCard.token]}
                      alt="Kart QR kodu"
                      className="mx-auto h-52 w-52 rounded-xl sm:h-60 sm:w-60"
                    />
                  )}
                </div>
              </Motion.div>

              <p className="text-center text-sm text-muted-foreground">Bu kodu kasada göstererek tüketim kaydı oluşturabilirsin.</p>
              <code className="block break-all rounded-xl bg-muted/60 px-3 py-2 text-center text-[11px] text-muted-foreground">
                {QR_DOMAIN}/c/{selectedCard.token}
              </code>

              <div className="grid grid-cols-2 gap-2">
                <Button type="button" variant="outline" className="min-h-11 touch-manipulation" onClick={() => copyUrl(selectedCard.token)}>
                  <Copy className="mr-2 h-4 w-4" />
                  Kopyala
                </Button>
                <Button type="button" className="min-h-11 touch-manipulation" onClick={() => shareCard(selectedCard.token)}>
                  <Share2 className="mr-2 h-4 w-4" />
                  Paylaş
                </Button>
              </div>

              <div className="space-y-2 border-t border-border/60 pt-4">
                <p className="text-center text-xs font-medium text-muted-foreground">Cüzdana ekle</p>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  <Button
                    type="button"
                    variant="outline"
                    className="min-h-11 touch-manipulation bg-zinc-950 text-white hover:bg-zinc-900 hover:text-white dark:bg-zinc-900"
                    onClick={() => addToAppleWallet(selectedCard.id)}
                    disabled={walletLoading === 'apple'}
                  >
                    {walletLoading === 'apple' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="mr-2 h-4 w-4" />}
                    Apple Wallet
                  </Button>
                  <Button
                    type="button"
                    className="min-h-11 touch-manipulation bg-blue-600 text-white hover:bg-blue-700"
                    onClick={() => addToGoogleWallet(selectedCard.id)}
                    disabled={walletLoading === 'google'}
                  >
                    {walletLoading === 'google' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Smartphone className="mr-2 h-4 w-4" />}
                    Google Wallet
                  </Button>
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {stats.reviewPending > 0 && (
        <Motion.div
          initial={reduceMotion ? false : { opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ type: 'spring', stiffness: 380, damping: 32 }}
        >
          <Card className="border-amber-500/25 bg-gradient-to-br from-amber-500/10 to-orange-500/5">
            <CardContent className="p-4 sm:p-5">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
                <div className="flex flex-1 items-start gap-3">
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-amber-500/20">
                    <Award className="h-5 w-5 text-amber-600 dark:text-amber-400" />
                  </div>
                  <div className="min-w-0">
                    <h3 className="font-semibold">Yorum bekleyen tüketimler</h3>
                    <p className="mt-1 text-sm text-muted-foreground">{stats.reviewPending} kayıt için yorum yazarak puan kazan.</p>
                  </div>
                </div>
                <Button asChild variant="outline" className="w-full min-h-11 shrink-0 touch-manipulation sm:w-auto">
                  <Link href="/customer/consumptions?hasReview=false" className="gap-2">
                    Yorum yap
                    <ArrowRight className="h-4 w-4" />
                  </Link>
                </Button>
              </div>
            </CardContent>
          </Card>
        </Motion.div>
      )}
    </div>
  );
}
