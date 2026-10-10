'use client';

/**
 * Cüzdan → Kartım istemci adası. Kritik veri sunucuda yüklenip `initialData` olarak gelir;
 * bu ada yalnız etkileşimi (kasada göster, dondur/yeni kod, doğum günü talebi) ve
 * çevrimdışı yedeği yönetir.
 *
 * Sıra (rapor vizyonu): Kart + "Kasada göster" → bekleyen aksiyon → statü → son işlemler →
 * kart yönetimi. Hata ≠ boş: sunucu/ağ hatasında "kartın yok" DEĞİL hata + yeniden dene,
 * ya da son kaydedilen kart (çevrimdışı rozeti ile) gösterilir.
 */
import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { LayoutGroup, LazyMotion } from 'framer-motion';
import { CreditCard, QrCode, ScanLine, WifiOff } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { EmptyState, ErrorState, InlineError, SectionCard, TONE_CALLOUT } from '@/components/states';
import { BRAND_CARD_QR_DARK_HEX, HEX_WHITE } from '@/lib/brand-colors';
import { cn, formatRelativeTime } from '@/lib/utils';
import { parseWalletCardResponse, type WalletCard, type WalletCardPayload } from '@/lib/wallet-card/dto';
import {
  buildCardUrl,
  buildSnapshot,
  legacySnapshotKey,
  maskCardToken,
  readSnapshot,
  resolveCardOrigin,
  snapshotKey,
  type WalletSnapshot,
} from '@/lib/wallet-card/snapshot';
import { CardFace } from './card-face';
import { PendingReviews, RecentActivity } from './card-activity';
import { CardManage } from './card-manage';
import { CARD_COPY, type CardCopy, type CardLocale } from './copy';
import { loadDomMax } from './dom-max';
import { PresentSheet } from './present-sheet';
import { StatusPanel } from './status-panel';

export const WALLET_CARD_QUERY_KEY = ['customer', 'wallet-card'] as const;

class WalletHttpError extends Error {
  constructor(readonly status: number) {
    super(`wallet-card ${status}`);
  }
}

async function fetchWalletCard(): Promise<WalletCardPayload> {
  const res = await fetch('/api/customer/wallet/card', { cache: 'no-store' });
  if (!res.ok) throw new WalletHttpError(res.status);
  return parseWalletCardResponse(await res.json());
}

function isClientError(error: unknown): boolean {
  return error instanceof WalletHttpError && error.status >= 400 && error.status < 500;
}

/** QR görselleri — `qrcode` yalnız gerektiğinde yüklenir (ilk paket dışı). */
function useCardQrCodes(cards: readonly WalletCard[], fallback: Record<string, string>) {
  const [codes, setCodes] = useState<Record<string, string>>({});
  const [failed, setFailed] = useState(false);
  const tokens = useMemo(() => cards.filter((c) => c.status === 'ACTIVATED').map((c) => c.token), [cards]);
  const key = tokens.join('|');
  useEffect(() => {
    if (tokens.length === 0) return;
    let cancelled = false;
    (async () => {
      try {
        const QRCode = (await import('qrcode')).default;
        const origin = resolveCardOrigin(process.env.NEXT_PUBLIC_APP_URL, window.location.origin);
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
        if (!cancelled) {
          setCodes(Object.fromEntries(entries));
          setFailed(false);
        }
      } catch (error) {
        console.error('[wallet-card] QR üretilemedi', error);
        if (!cancelled) setFailed(true);
      }
    })();
    return () => {
      cancelled = true;
    };
    // `key`, token listesinin kararlı özeti.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return { codes: { ...fallback, ...codes }, failed };
}

function readStoredSnapshot(userId: string): WalletSnapshot | null {
  try {
    window.localStorage.removeItem(legacySnapshotKey(userId));
    return readSnapshot(window.localStorage.getItem(snapshotKey(userId)), Date.now());
  } catch {
    return null;
  }
}

function writeStoredSnapshot(userId: string, data: WalletCardPayload, qr: Record<string, string>) {
  try {
    const snap = buildSnapshot(data, qr, Date.now());
    if (snap) window.localStorage.setItem(snapshotKey(userId), JSON.stringify(snap));
    else window.localStorage.removeItem(snapshotKey(userId));
  } catch {
    /* depolama dolu/kapalı */
  }
}

/** `?present=1` (⌘K "Kartımı kasada göster", ana sayfa kısayolu) → tam ekran doğrudan açılır. */
function PresentDeepLink({ onPresent }: { onPresent: () => boolean }) {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const wants = params.get('present') === '1';
  useEffect(() => {
    if (!wants) return;
    onPresent();
    const next = new URLSearchParams(params.toString());
    next.delete('present');
    const qs = next.toString();
    router.replace(`${pathname}${qs ? `?${qs}` : ''}`, { scroll: false });
    // yalnız ilk açılış
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wants]);
  return null;
}

function CardStateNote({ card, copy }: { card: WalletCard; copy: CardCopy }) {
  if (card.status === 'ACTIVATED') return null;
  if (card.frozenByCustomer) {
    return (
      <InlineError variant="banner" tone="info">
        {copy.frozen}
      </InlineError>
    );
  }
  if (card.status === 'BLOCKED') {
    return (
      <InlineError variant="banner" tone="danger">
        {copy.blockedByAdmin}
      </InlineError>
    );
  }
  return (
    <InlineError variant="banner" tone="warning">
      {copy.unused}
    </InlineError>
  );
}

function NoCard({ copy }: { copy: CardCopy }) {
  return (
    <SectionCard>
      <EmptyState
        variant="first-use"
        icon={CreditCard}
        title={copy.emptyTitle}
        description={copy.emptyBody}
        action={
          <Button asChild className="min-h-11">
            <Link href="/customer/scan">
              <ScanLine className="h-4 w-4" aria-hidden />
              {copy.emptyScan}
            </Link>
          </Button>
        }
      />
      <p className="qx-small mx-auto max-w-md pb-4 text-center text-fg-muted">{copy.emptyHelp}</p>
    </SectionCard>
  );
}

export function WalletCardView({
  initialData,
  userId,
  locale,
}: {
  initialData: WalletCardPayload | null;
  userId: string;
  locale: CardLocale;
}) {
  const copy = CARD_COPY[locale];
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: WALLET_CARD_QUERY_KEY,
    queryFn: fetchWalletCard,
    initialData: initialData ?? undefined,
    // Sunucu verisi tazeyse ilk açılışta yeniden çekme.
    initialDataUpdatedAt: initialData ? Date.parse(initialData.generatedAt) : undefined,
    staleTime: 30_000,
    retry: (count, error) => !isClientError(error) && count < 2,
  });

  const [snapshot, setSnapshot] = useState<WalletSnapshot | null>(null);
  useEffect(() => {
    setSnapshot(readStoredSnapshot(userId));
  }, [userId]);

  const data = query.data;
  const usingSnapshot = !data && query.isError && !isClientError(query.error) && !!snapshot;
  const cards = data?.cards ?? (usingSnapshot ? snapshot!.cards : []);
  const holderName = (data ? data.holderName : snapshot?.holderName) || copy.holderFallback;
  const { codes, failed } = useCardQrCodes(cards, usingSnapshot ? snapshot!.qr : {});

  // Başarılı yanıtı (ve üretilen QR'ı) çevrimdışı için sakla.
  const codesKey = Object.keys(codes).sort().join('|');
  useEffect(() => {
    if (!data) return;
    writeStoredSnapshot(userId, data, codes);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, data, codesKey]);

  const [presentId, setPresentId] = useState<string | null>(null);
  const [generation, setGeneration] = useState(0);
  const presentButtons = useRef(new Map<string, HTMLButtonElement>());
  const lastPresentedId = useRef<string | null>(null);
  const presentCard = cards.find((c) => c.id === presentId && c.status === 'ACTIVATED') ?? null;
  if (presentCard) lastPresentedId.current = presentCard.id;
  const firstActive = cards.find((c) => c.status === 'ACTIVATED') ?? null;
  const openFirst = useCallback(() => {
    if (!firstActive) return false;
    setPresentId(firstActive.id);
    return true;
  }, [firstActive]);

  const refresh = useCallback(() => queryClient.invalidateQueries({ queryKey: WALLET_CARD_QUERY_KEY }), [queryClient]);
  const league = data?.status.league ?? null;

  if (!data && !usingSnapshot) {
    if (query.isError) {
      return (
        <ErrorState
          title={copy.errorTitle}
          description={copy.errorBody}
          onRetry={() => void query.refetch()}
          kind={
            isClientError(query.error)
              ? 'forbidden'
              : typeof navigator !== 'undefined' && navigator.onLine === false
                ? 'offline'
                : 'generic'
          }
        />
      );
    }
    return (
      <div role="status" aria-busy="true" className="space-y-4">
        <span className="sr-only">{copy.qrLoading}</span>
        <div className="mx-auto aspect-[1.586/1] w-full max-w-md rounded-[22px] bg-surface-muted" />
        <div className="h-24 rounded-card bg-surface-muted" />
      </div>
    );
  }

  return (
    <LazyMotion features={loadDomMax}>
      <LayoutGroup id="wallet-card">
        <Suspense fallback={null}>
          <PresentDeepLink onPresent={openFirst} />
        </Suspense>

        <div className="space-y-5">
          {usingSnapshot && (
            <div role="status" className={cn('qx-small flex items-start gap-2.5 rounded-card border px-4 py-3', TONE_CALLOUT.warning)}>
              <WifiOff className="mt-0.5 h-4 w-4 shrink-0 text-warning" aria-hidden />
              <span className="min-w-0 flex-1">{copy.offline(formatRelativeTime(new Date(snapshot!.savedAt), locale))}</span>
              <Button type="button" size="sm" variant="ghost" onClick={() => void query.refetch()} className="min-h-11 sm:min-h-9">
                {copy.retry}
              </Button>
            </div>
          )}

          {cards.length === 0 ? (
            <NoCard copy={copy} />
          ) : (
            <div className="space-y-8">
              {cards.length > 1 && <p className="qx-small text-fg-muted">{copy.multiCard(cards.length)}</p>}
              {cards.map((card) => (
                <article key={card.id} className="space-y-3" aria-label={`${copy.membership} ${maskCardToken(card.token)}`}>
                  <CardFace
                    card={card}
                    holderName={holderName}
                    league={league}
                    locale={locale}
                    copy={copy}
                    onPresent={() => setPresentId(card.id)}
                    generation={generation}
                  />
                  <div className="mx-auto w-full max-w-md space-y-3">
                    {card.status === 'ACTIVATED' ? (
                      <>
                        <Button
                          ref={(el) => {
                            if (el) presentButtons.current.set(card.id, el);
                            else presentButtons.current.delete(card.id);
                          }}
                          type="button"
                          size="lg"
                          className="min-h-12 w-full"
                          onClick={() => setPresentId(card.id)}
                          aria-haspopup="dialog"
                        >
                          <QrCode className="h-5 w-5" aria-hidden />
                          {copy.present}
                        </Button>
                        <p className="qx-caption text-center text-fg-muted">{copy.presentHint}</p>
                      </>
                    ) : (
                      <CardStateNote card={card} copy={copy} />
                    )}
                  </div>
                </article>
              ))}
            </div>
          )}

          {data && (
            <>
              <PendingReviews pending={data.pending} copy={copy} locale={locale} />
              <StatusPanel status={data.status} birthday={data.birthday} copy={copy} locale={locale} onBirthdayClaimed={refresh} />
              <RecentActivity recent={data.recent} copy={copy} locale={locale} />
              {data.cards.map((card) => (
                <CardManage key={card.id} card={card} wallet={data.wallet} copy={copy} onChanged={refresh} />
              ))}
            </>
          )}
        </div>

        <PresentSheet
          card={presentCard}
          open={!!presentCard}
          onOpenChange={(open) => {
            if (!open) {
              setPresentId(null);
              setGeneration((g) => g + 1);
            }
          }}
          qrSrc={presentCard ? codes[presentCard.token] : undefined}
          qrFailed={failed && !!presentCard && !codes[presentCard.token]}
          holderName={holderName}
          league={league}
          copy={copy}
          locale={locale}
          returnFocusTo={() => (lastPresentedId.current ? presentButtons.current.get(lastPresentedId.current) ?? null : null)}
        />
      </LayoutGroup>
    </LazyMotion>
  );
}
