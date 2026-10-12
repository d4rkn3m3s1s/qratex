'use client';

/**
 * Kasa modu (/dealer/scan): tara → müşteriyi tanı → tek dokunuşla ürün → kaydet → sıradaki.
 *
 *  - Kamera: D1 `useQrScanner` (scanner-panel.tsx). Kart bulununca kamera durur; "Sıradaki
 *    müşteri" kamerayı (açıktıysa) yeniden açar.
 *  - Kayıt: B1 ekonomi kuralları sunucuda (lib/consumption/service.ts → mintPoints). İstemci
 *    yalnız `clientOpId` üretir; ağ kopunca işlem cihaz kuyruğuna girer ve aynı kimlikle
 *    tekrar oynatılır (çift kayıt yok).
 *  - Başarı anı: kazanılan puan (sayaç), çarpan, ziyaret sırası ve 15 dk geri alma.
 */
import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { m as Motion, AnimatePresence } from 'framer-motion';
import { BookOpen, CheckCircle2, CloudOff, RefreshCw, UserRound, X } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { PageHeader } from '@/components/ds';
import { TONE_CALLOUT } from '@/components/states';
import { DURATION, EASE, useMotionPolicy, useNumberTicker } from '@/lib/motion';
import { KASA_TODAY_KEY, type CardLookupDto, type KasaBootstrap, type KasaQuickKey, type LedgerPage } from '@/lib/dealer/kasa/types';
import { KasaApiError, formatMoney, formatRelative, kasaFetch, postJson } from './api';
import { Composer, type ComposerDraft } from './composer';
import { CustomerAvatar, RatingBadge, VoidButton, VoidDialog } from './parts';
import { ScannerPanel, type ScannerPanelHandle } from './scanner-panel';
import { TodayFeed } from './today-feed';
import { useOfflineQueue } from './use-offline-queue';
import { useKasaCopy } from './copy';

type Lookup =
  | { kind: 'idle' }
  | { kind: 'found'; card: CardLookupDto; nonce: number }
  /** Çevrimdışı: kart doğrulanamadı; işlem kuyruğa alınabilir (sunucu gönderimde doğrular). */
  | { kind: 'unverified'; token: string; nonce: number };

type Success = {
  consumptionId: string;
  createdAt: string;
  points: number;
  capped: boolean;
  multiplier: number;
  duplicate: boolean;
  visitCount: number | null;
  label: string;
  amount: number | null;
};

const TODAY_URL = '/api/dealer/consumptions?range=today&pageSize=10';

export function KasaScreen({ initial }: { initial: KasaBootstrap }) {
  const { copy } = useKasaCopy();
  const c = copy.kasa;
  const qc = useQueryClient();
  const policy = useMotionPolicy();

  const [lookup, setLookup] = useState<Lookup>({ kind: 'idle' });
  const [lookupBusy, setLookupBusy] = useState(false);
  const [lookupError, setLookupError] = useState<{ message: string; action?: { label: string; run: () => void } } | null>(null);
  const [quickKeys, setQuickKeys] = useState<KasaQuickKey[]>(initial.quickKeys);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [success, setSuccess] = useState<Success | null>(null);
  const [voidOpen, setVoidOpen] = useState(false);
  const inFlight = useRef(false);
  const scannerRef = useRef<ScannerPanelHandle | null>(null);
  const cameraWasUsed = useRef(false);
  const resultRef = useRef<HTMLHeadingElement>(null);

  const today = useQuery({
    queryKey: KASA_TODAY_KEY,
    queryFn: () => kasaFetch<LedgerPage>(TODAY_URL),
    initialData: initial.today,
    staleTime: 15_000,
    refetchInterval: 60_000,
  });
  const refreshToday = useCallback(() => void qc.invalidateQueries({ queryKey: KASA_TODAY_KEY }), [qc]);

  const queue = useOfflineQueue({
    owner: initial.queueOwner,
    onSynced: (n) => {
      toast.success(c.offline.synced(n));
      refreshToday();
    },
  });

  const registerHandle = useCallback((h: ScannerPanelHandle) => {
    scannerRef.current = h;
  }, []);

  /** Kartı doğrular; bulunduysa true. Aynı anda tek sorgu. */
  const findCard = useCallback(
    async (token: string, fromCamera = true): Promise<boolean> => {
      if (inFlight.current) return false;
      inFlight.current = true;
      if (fromCamera) cameraWasUsed.current = true;
      setLookupBusy(true);
      setLookupError(null);
      try {
        const res = await kasaFetch<{ card: CardLookupDto }>(`/api/dealer/cards/scan/${encodeURIComponent(token)}`);
        setSuccess(null);
        setSubmitError(null);
        setLookup({ kind: 'found', card: res.card, nonce: Date.now() });
        return true;
      } catch (e) {
        const err = e instanceof KasaApiError ? e : null;
        if (!err || err.status === 0) {
          setLookupError({
            message: c.offline.offlineNow,
            action: {
              label: c.offline.queueUnverified,
              run: () => {
                setLookupError(null);
                setSuccess(null);
                setLookup({ kind: 'unverified', token, nonce: Date.now() });
              },
            },
          });
        } else {
          setLookupError({ message: c.errors[err.code ?? ''] ?? err.message ?? c.errors.generic });
        }
        return false;
      } finally {
        inFlight.current = false;
        setLookupBusy(false);
      }
    },
    [c]
  );

  // Kart bağlantısı (/c/<token>) işletme hesabıyla açılınca buraya `?token=` ile gelir.
  const deepLinkDone = useRef(false);
  useEffect(() => {
    if (deepLinkDone.current) return;
    deepLinkDone.current = true;
    const raw = new URLSearchParams(window.location.search).get('token');
    if (raw && /^[A-Za-z0-9_-]{1,128}$/.test(raw)) void findCard(raw, false);
  }, [findCard]);

  // Müşteri bulununca sonuca odak (mobilde kaydırır, ekran okuyucu başlığı okur).
  useEffect(() => {
    if (lookup.kind !== 'idle') resultRef.current?.focus({ preventScroll: false });
  }, [lookup]);

  const customerLabel =
    lookup.kind === 'found' ? (lookup.card.customer.displayName ?? c.customer.unnamed) : lookup.kind === 'unverified' ? `•••• ${lookup.token.slice(-4)}` : '';
  const cardToken = lookup.kind === 'found' ? lookup.card.token : lookup.kind === 'unverified' ? lookup.token : null;

  const nextCustomer = useCallback(() => {
    setLookup({ kind: 'idle' });
    setSuccess(null);
    setSubmitError(null);
    setLookupError(null);
    if (cameraWasUsed.current) void scannerRef.current?.start();
  }, []);

  const submit = async (draft: ComposerDraft) => {
    if (!cardToken || submitting) return;
    const queueIt = () => {
      queue.add({
        clientOpId: draft.clientOpId,
        cardToken,
        customerLabel,
        productId: draft.productId,
        productName: draft.productName,
        amount: draft.amount,
        note: draft.note,
        queuedAt: Date.now(),
      });
      toast.message(c.offline.queued);
      nextCustomer();
    };
    if (lookup.kind === 'unverified' || !queue.online) {
      queueIt();
      return;
    }
    setSubmitting(true);
    setSubmitError(null);
    try {
      const res = await postJson<{
        duplicate: boolean;
        consumption: { id: string; createdAt: string; amount: number | null };
        passivePoints: number;
        passiveCapped: boolean;
        multiplier: number;
        visitCountHere: number | null;
      }>('/api/dealer/consumptions', {
        cardToken,
        productId: draft.productId,
        amount: draft.amount,
        note: draft.note,
        clientOpId: draft.clientOpId,
      });
      setSuccess({
        consumptionId: res.consumption.id,
        createdAt: String(res.consumption.createdAt),
        points: res.passivePoints,
        capped: res.passiveCapped,
        multiplier: res.multiplier,
        duplicate: res.duplicate,
        visitCount: res.visitCountHere,
        label: draft.productName ?? copy.common.noProduct,
        amount: res.consumption.amount,
      });
      refreshToday();
    } catch (e) {
      const err = e instanceof KasaApiError ? e : null;
      if (!err || err.status === 0) {
        queueIt();
        return;
      }
      setSubmitError(
        err.status >= 500
          ? `${err.message} ${c.offline.retrySafe}`
          : (c.errors[err.code ?? ''] ?? err.message)
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="mx-auto w-full max-w-7xl space-y-5 pb-24">
      <PageHeader
        eyebrow={c.eyebrow}
        title={c.title}
        description={c.description}
        actions={
          <Button asChild variant="outline" className="min-h-11 gap-2">
            <Link href="/dealer/consumptions">
              <BookOpen className="h-4 w-4" aria-hidden />
              {c.ledgerLink}
            </Link>
          </Button>
        }
      />

      {(!queue.online || queue.pending.length > 0 || queue.failed.length > 0) && (
        <div role="status" className={cn('flex flex-wrap items-center gap-3 rounded-xl border px-3 py-2 text-sm', TONE_CALLOUT.warning)}>
          <CloudOff className="h-4 w-4 shrink-0" aria-hidden />
          <span className="flex-1">
            {!queue.online && <span className="block">{c.offline.offlineNow}</span>}
            {queue.pending.length > 0 && <span className="block">{queue.syncing ? c.offline.syncing : c.offline.badge(queue.pending.length)}</span>}
          </span>
          {queue.online && queue.pending.length > 0 && (
            <Button size="sm" variant="outline" className="min-h-11 gap-1.5" disabled={queue.syncing} onClick={() => void queue.flush()}>
              <RefreshCw className={cn('h-4 w-4', queue.syncing && 'animate-spin')} aria-hidden />
              {c.offline.sendNow}
            </Button>
          )}
          {queue.failed.length > 0 && (
            <div className="w-full space-y-1">
              <p className="font-medium">{c.offline.failedTitle}</p>
              <ul className="space-y-1">
                {queue.failed.map((f) => (
                  <li key={f.clientOpId} className="flex items-center gap-2">
                    <span className="flex-1 truncate">
                      {f.customerLabel ?? '—'} · {f.productName ?? copy.common.noProduct} · {formatMoney(f.amount, copy.locale)} — {f.failed?.message}
                    </span>
                    <Button size="sm" variant="ghost" className="min-h-11" onClick={() => queue.dismiss(f.clientOpId)} aria-label={c.offline.dismiss}>
                      <X className="h-4 w-4" aria-hidden />
                    </Button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {/* Üç sütun yalnız 2xl'de: 1440 masaüstünde (kenar çubuğuyla ~1100 px) orta sütun ~330 px'e sıkışıp müşteri kartı ve son işlem adlarını kesiyordu; lg–xl'de tarayıcı | müşteri, "Bugün" altta tam genişlik. */}
      <div className="grid gap-5 lg:grid-cols-[minmax(0,22rem)_minmax(0,1fr)] 2xl:grid-cols-[24rem_minmax(0,1fr)_22rem]">
        <ScannerPanel
          onToken={(tok) => findCard(tok, true)}
          busy={lookupBusy}
          lookupError={lookupError}
          onDismissError={() => setLookupError(null)}
          registerHandle={registerHandle}
        />

        <section aria-labelledby="kasa-customer-title" className="min-w-0 space-y-4">
          <h2 id="kasa-customer-title" ref={resultRef} tabIndex={-1} className="qx-h3 outline-none">
            {lookup.kind === 'idle' ? c.customer.region : customerLabel}
          </h2>
          <AnimatePresence mode="wait" initial={false}>
            {lookup.kind === 'idle' ? (
              <Motion.div
                key="empty"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={policy.transition({ duration: DURATION.base })}
                className="flex flex-col items-center gap-2 rounded-2xl border border-dashed border-border px-6 py-12 text-center"
              >
                <UserRound className="h-10 w-10 text-fg-subtle" aria-hidden />
                <p className="font-medium">{c.customer.empty}</p>
                <p className="max-w-sm text-sm text-fg-muted">{c.customer.emptyHint}</p>
              </Motion.div>
            ) : (
              <Motion.div
                key={`${lookup.kind}-${lookup.nonce}`}
                initial={policy.reduce ? { opacity: 0 } : { opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                transition={policy.transition({ type: 'spring', stiffness: 420, damping: 34 })}
                className="space-y-4"
              >
                {lookup.kind === 'found' ? <CustomerCard card={lookup.card} /> : null}
                <div className="rounded-2xl border border-border bg-surface p-4 qx-elevation-1 sm:p-5">
                  {success ? (
                    <SuccessPanel
                      success={success}
                      onNext={nextCustomer}
                      onUndo={() => setVoidOpen(true)}
                    />
                  ) : (
                    <Composer
                      key={`${lookup.kind}-${lookup.nonce}`}
                      customerLabel={customerLabel}
                      products={initial.products}
                      quickKeys={quickKeys}
                      canManageKeys={initial.role === 'DEALER'}
                      onQuickKeysChange={setQuickKeys}
                      onSubmit={(d) => void submit(d)}
                      submitting={submitting}
                      submitError={submitError}
                    />
                  )}
                </div>
                {!success && (
                  <Button variant="ghost" className="min-h-11 w-full gap-2" onClick={nextCustomer}>
                    <X className="h-4 w-4" aria-hidden />
                    {copy.common.cancel} · {c.customer.newScan}
                  </Button>
                )}
              </Motion.div>
            )}
          </AnimatePresence>
        </section>

        <aside className="min-w-0 lg:col-span-2 2xl:sticky 2xl:top-4 2xl:col-span-1 2xl:self-start">
          <TodayFeed query={today} onVoided={refreshToday} />
        </aside>
      </div>

      {success && (
        <VoidDialog
          open={voidOpen}
          onOpenChange={setVoidOpen}
          consumptionId={success.consumptionId}
          summary={{ label: success.label, amount: formatMoney(success.amount, copy.locale), points: success.points }}
          onDone={() => {
            refreshToday();
            nextCustomer();
          }}
        />
      )}
      <p className="sr-only" aria-live="polite">
        {success ? c.success.title : ''}
      </p>
    </div>
  );
}

function CustomerCard({ card }: { card: CardLookupDto }) {
  const { copy } = useKasaCopy();
  const c = copy.kasa.customer;
  const v = card.visits;
  return (
    <div className="rounded-2xl border border-success-border bg-success-subtle/60 p-4">
      <div className="flex items-center gap-4">
        <CustomerAvatar src={card.customer.avatar} initials={card.customer.initials} size={56} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-lg font-semibold">{card.customer.displayName ?? c.unnamed}</p>
          <p className="text-sm text-fg-muted">
            {c.card(card.last4)} · {c.level(card.customer.level)}
          </p>
          <p className="mt-1 text-sm font-medium text-success">{v.countHere === 0 ? c.firstVisit : c.visitNo(v.countHere + 1)}</p>
        </div>
      </div>
      {v.countHere > 0 && (
        <>
          <dl className="mt-4 grid grid-cols-3 gap-2 text-center">
            <div className="rounded-lg bg-surface px-2 py-2">
              <dt className="text-xs text-fg-muted">{c.visits}</dt>
              <dd className="qx-num font-semibold">{v.countHere}</dd>
            </div>
            <div className="rounded-lg bg-surface px-2 py-2">
              <dt className="text-xs text-fg-muted">{c.lastVisit}</dt>
              <dd className="truncate text-sm font-semibold">{v.lastAt ? formatRelative(v.lastAt, copy.locale) : '—'}</dd>
            </div>
            <div className="rounded-lg bg-surface px-2 py-2">
              <dt className="text-xs text-fg-muted">{c.spent}</dt>
              <dd className="qx-num truncate text-sm font-semibold">{formatMoney(v.totalSpentHere, copy.locale)}</dd>
            </div>
          </dl>
          {card.recent.length > 0 && (
            <div className="mt-3">
              <p className="qx-overline mb-1 text-fg-muted">{c.recent}</p>
              <ul className="space-y-1">
                {card.recent.map((r) => (
                  <li key={r.id} className="flex items-center gap-2 rounded-lg bg-surface px-3 py-1.5 text-sm">
                    <span className="min-w-0 flex-1 truncate">{r.productName ?? copy.common.noProduct}</span>
                    <span className="qx-num text-fg-muted">{r.amount === 0 ? copy.common.free : formatMoney(r.amount, copy.locale)}</span>
                    {r.rating != null && <RatingBadge rating={r.rating} />}
                    <span className="w-20 text-right text-xs text-fg-muted">{formatRelative(r.createdAt, copy.locale)}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function SuccessPanel({ success, onNext, onUndo }: { success: Success; onNext: () => void; onUndo: () => void }) {
  const { copy } = useKasaCopy();
  const c = copy.kasa.success;
  const policy = useMotionPolicy();
  const shown = useNumberTicker(success.points, { animateOnMount: true, durationMs: 400 });
  const nextRef = useRef<HTMLButtonElement>(null);
  useEffect(() => nextRef.current?.focus(), []);
  return (
    <div className="space-y-4 text-center" role="status">
      <Motion.div
        initial={policy.reduce ? false : { scale: 0.8, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={policy.transition({ duration: DURATION.base, ease: EASE.emphasized })}
        className="mx-auto inline-flex h-14 w-14 items-center justify-center rounded-full bg-success-subtle text-success ring-1 ring-inset ring-success-border"
      >
        <CheckCircle2 className="h-8 w-8" aria-hidden />
      </Motion.div>
      <p className="qx-h3">{c.title}</p>
      {success.duplicate ? (
        <p className="text-sm text-fg-muted">{c.duplicate}</p>
      ) : (
        <>
          {success.points > 0 ? (
            <p className="qx-num text-3xl font-bold text-brand" aria-label={c.points(success.points)}>
              +{Math.round(shown)}
            </p>
          ) : (
            <p className="text-sm text-fg-muted">{c.noPoints}</p>
          )}
          <ul className="space-y-0.5 text-sm text-fg-muted">
            {success.points > 0 && <li>{c.points(success.points)}</li>}
            {success.capped && <li>{c.capped}</li>}
            {success.multiplier > 1 && <li>{c.multiplier(success.multiplier.toLocaleString(copy.locale))}</li>}
            {success.visitCount != null && <li>{c.visit(success.visitCount)}</li>}
            <li>{c.invite}</li>
          </ul>
        </>
      )}
      <div className="flex flex-col gap-2 sm:flex-row sm:justify-center">
        <Button ref={nextRef} onClick={onNext} className="min-h-14 flex-1 text-base sm:flex-none sm:px-8">
          {c.next}
        </Button>
        {!success.duplicate && <VoidButton createdAt={success.createdAt} voidable onClick={onUndo} size="default" />}
      </div>
    </div>
  );
}
