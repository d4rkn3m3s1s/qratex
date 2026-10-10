'use client';

/**
 * Masa sinyali — istemci adası (rapor: docs/audit/2026-10-08/musteri/table-signal.md).
 *
 * Akış: işletme kimliği (sunucudan) → "Her şey yolunda mı?" iki büyük kart → "Bir şey var"
 * alttan açılan sayfa (neden çipleri + not + isteğe bağlı hesap ilişkilendirme) → kalıcı durum
 * kartı (İletildi → Ekip ilgileniyor → Çözüldü; imzalı anahtarla 15 sn'de bir sorgu).
 * Hizmet istekleri (garson / hesap) tek dokunuştur ve bayi Vakalar kuyruğuna düşer.
 *
 * Hareket (ops kaydı, ölçülü): sayfa açılışı, durum kartının belirmesi, adımın dolması.
 * Konfeti/3B YOK — bu bir sorun bildirme anı. Azaltılmış harekette yalnız opaklık.
 */
import Link from 'next/link';
import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { AnimatePresence, m as Motion } from 'framer-motion';
import {
  AlertTriangle,
  ArrowRight,
  BellRing,
  Check,
  CheckCircle2,
  CloudOff,
  Hand,
  Languages,
  Pencil,
  Receipt,
  RotateCcw,
  Star,
  X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { ChoiceChips, announce } from '@/components/ds/a11y';
import { TONE_CALLOUT } from '@/components/states';
import { DURATION, EASE, SPRING, useMotionPolicy } from '@/lib/motion';
import { useAppLocale } from '@/lib/app-locale';
import { track } from '@/lib/analytics';
import { cn } from '@/lib/utils';
import {
  CONCERN_REASONS,
  NOTE_MAX,
  TABLE_CODE_MAX,
  type ConcernReason,
  type RequestType,
  type SignalKind,
  type SignalStage,
} from '@/lib/table-signal/kinds';
import type { SignalVenue } from '@/lib/table-signal/venue';
import { fill, getSignalCopy, type SignalCopy, type SignalLocale } from './copy';
import {
  enqueueSignal,
  fetchSignalStatus,
  newNonce,
  readQueue,
  readStoredTrack,
  removeQueued,
  sendSignal,
  writeStoredTrack,
  type QueuedSignal,
  type SignalPayload,
  type SignalSuccess,
} from './signal-client';
import { VenueBadge } from './venue-badge';

export interface SignalEntryParams {
  qr?: string;
  dealerId?: string;
  qrCodeId?: string;
}

export interface TableSignalExperienceProps {
  initialLocale: SignalLocale;
  entry: SignalEntryParams;
  /** Depolama kapsamı (aynı cihazda farklı işletmelerin takibi karışmasın). */
  scope: string;
  venue: SignalVenue;
  initialTable: string | null;
  casesEnabled: boolean;
  canLink: boolean;
  feedbackHref: string | null;
  feedbackPoints: number | null;
  kiosk: boolean;
}

type View =
  | { type: 'form' }
  | { type: 'result'; kind: SignalKind; result: SignalSuccess; checkedAt: number | null; trackingEnded: boolean }
  | { type: 'queued'; item: QueuedSignal };

const POLL_MS = 15_000;
const KIOSK_RESET_S = 8;

function safeStorage(kind: 'local' | 'session'): Storage | null {
  try {
    return kind === 'local' ? window.localStorage : window.sessionStorage;
  } catch {
    return null;
  }
}

function formatTime(ts: number, locale: SignalLocale): string {
  return new Intl.DateTimeFormat(locale === 'en' ? 'en-GB' : 'tr-TR', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    timeZone: 'Europe/Istanbul',
  }).format(ts);
}

function errorText(copy: SignalCopy, code: string): string {
  return copy.errors[code] ?? copy.errors.generic;
}

export function TableSignalExperience(props: TableSignalExperienceProps) {
  const { entry, scope, venue, casesEnabled, canLink, feedbackHref, feedbackPoints, kiosk } = props;
  const policy = useMotionPolicy();
  const { setLocale } = useAppLocale();
  const [locale, setLocalLocale] = useState<SignalLocale>(props.initialLocale);
  const copy = getSignalCopy(locale);

  const [table, setTable] = useState(props.initialTable ?? '');
  const [editingTable, setEditingTable] = useState(!props.initialTable);
  const [busy, setBusy] = useState<null | 'OK' | 'CONCERN' | RequestType>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [reasons, setReasons] = useState<ConcernReason[]>([]);
  const [note, setNote] = useState('');
  const [linkAccount, setLinkAccount] = useState(false);
  const [sheetError, setSheetError] = useState<string | null>(null);
  const [view, setView] = useState<View>({ type: 'form' });
  const [kioskLeft, setKioskLeft] = useState<number | null>(null);

  const headingRef = useRef<HTMLHeadingElement | null>(null);
  const resultHeadingRef = useRef<HTMLHeadingElement | null>(null);
  const tableInputId = useId();
  const noteId = useId();
  const noteHintId = useId();
  const reasonsLabelId = useId();
  const linkId = useId();

  // İlk açılış: önceki takibi geri yükle (yenileme sonrası durum kaybolmasın) + huni olayı.
  useEffect(() => {
    track('table_signal_viewed', { kiosk, hasTable: !!props.initialTable });
    if (kiosk) return;
    const stored = readStoredTrack(safeStorage('session'), scope, Date.now());
    if (stored) {
      setView({
        type: 'result',
        kind: stored.kind,
        result: { kind: stored.kind, duplicate: stored.duplicate, stage: stored.stage, tracking: stored.tracking, teamNotified: true, linked: false },
        checkedAt: null,
        trackingEnded: false,
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const toggleLocale = () => {
    const next: SignalLocale = locale === 'tr' ? 'en' : 'tr';
    setLocalLocale(next);
    try {
      setLocale(next);
    } catch {
      // sağlayıcı yoksa yalnız bu sayfa değişir
    }
  };

  const basePayload = useCallback(
    (kind: SignalKind): SignalPayload => ({
      ...(entry.qr ? { qr: entry.qr } : {}),
      ...(entry.dealerId ? { dealerId: entry.dealerId } : {}),
      ...(entry.qrCodeId ? { qrCodeId: entry.qrCodeId } : {}),
      kind,
      ...(table.trim() ? { tableCode: table.trim().slice(0, TABLE_CODE_MAX) } : {}),
    }),
    [entry.dealerId, entry.qr, entry.qrCodeId, table]
  );

  const showResult = useCallback(
    (kind: SignalKind, result: SignalSuccess) => {
      setView({ type: 'result', kind, result, checkedAt: Date.now(), trackingEnded: false });
      if (result.tracking && !kiosk) {
        writeStoredTrack(safeStorage('session'), scope, {
          kind,
          tracking: result.tracking,
          stage: result.stage,
          duplicate: result.duplicate,
        });
      }
    },
    [kiosk, scope]
  );

  /** Gönder; ağ yoksa kuyruğa al. true → form kapatılabilir. */
  const submit = useCallback(
    async (payload: SignalPayload, busyKey: NonNullable<typeof busy>): Promise<boolean> => {
      setBusy(busyKey);
      setFormError(null);
      const nonce = newNonce();
      try {
        const out = await sendSignal(payload, nonce);
        if (out.ok) {
          track('table_signal_sent', {
            kind: payload.kind,
            reasons: payload.reasons?.length ?? 0,
            hasNote: !!payload.note,
            hasTable: !!payload.tableCode,
            requestType: payload.requestType ?? null,
            duplicate: out.data.duplicate,
          });
          showResult(payload.kind, out.data);
          return true;
        }
        if (out.network) {
          const item: QueuedSignal = { nonce, createdAt: Date.now(), payload };
          enqueueSignal(safeStorage('local'), item, Date.now());
          setView({ type: 'queued', item });
          return true;
        }
        const msg = errorText(copy, out.code);
        setFormError(msg);
        setSheetError(msg);
        announce(msg, { politeness: 'assertive' });
        return false;
      } finally {
        setBusy(null);
      }
    },
    [copy, showResult]
  );

  const sendOk = () => {
    void submit(basePayload('OK'), 'OK');
  };

  const sendRequest = (requestType: RequestType) => {
    void submit({ ...basePayload('REQUEST'), requestType }, requestType);
  };

  const openConcern = () => {
    setSheetError(null);
    setSheetOpen(true);
  };

  const sendConcern = async () => {
    const trimmed = note.trim();
    if (reasons.length === 0 && !trimmed) {
      setSheetError(copy.reasonRequired);
      announce(copy.reasonRequired, { politeness: 'assertive' });
      return;
    }
    const done = await submit(
      {
        ...basePayload('CONCERN'),
        ...(reasons.length ? { reasons } : {}),
        ...(trimmed ? { note: trimmed.slice(0, NOTE_MAX) } : {}),
        ...(canLink && linkAccount && !kiosk ? { linkAccount: true } : {}),
      },
      'CONCERN'
    );
    if (done) {
      setSheetOpen(false);
      setReasons([]);
      setNote('');
    }
  };

  // Kuyruktaki sinyal: bağlantı gelince otomatik gönder.
  const flushQueued = useCallback(
    async (item: QueuedSignal) => {
      const out = await sendSignal(item.payload, item.nonce);
      if (out.ok) {
        removeQueued(safeStorage('local'), item.nonce, Date.now());
        showResult(item.payload.kind, out.data);
        announce(copy.stageLive.sent);
      } else if (!out.network) {
        removeQueued(safeStorage('local'), item.nonce, Date.now());
        const msg = errorText(copy, out.code);
        setView({ type: 'form' });
        setFormError(msg);
        announce(msg, { politeness: 'assertive' });
      }
    },
    [copy, showResult]
  );

  useEffect(() => {
    if (view.type !== 'queued') return;
    const item = view.item;
    const onOnline = () => void flushQueued(item);
    window.addEventListener('online', onOnline);
    return () => window.removeEventListener('online', onOnline);
  }, [view, flushQueued]);

  // Sayfa açıkken önceden kuyruğa alınmış (bu işletmeye ait) sinyal varsa göster.
  useEffect(() => {
    const pending = readQueue(safeStorage('local'), Date.now()).find(
      (q) => (q.payload.qr ?? q.payload.dealerId) === (entry.qr ?? entry.dealerId)
    );
    if (pending) {
      setView({ type: 'queued', item: pending });
      // Sayfa bağlantı varken yeniden açıldıysa (ör. çevrimdışı ekrandan dönüş) hemen gönder.
      if (navigator.onLine !== false) void flushQueued(pending);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Durum takibi (yalnız görünürken; çözülünce ya da süre dolunca durur).
  const tracking = view.type === 'result' ? view.result.tracking : null;
  const stage = view.type === 'result' ? view.result.stage : null;
  const trackingEnded = view.type === 'result' ? view.trackingEnded : false;
  useEffect(() => {
    if (!tracking || stage === 'resolved' || trackingEnded) return;
    let cancelled = false;
    const tick = async () => {
      if (document.visibilityState !== 'visible') return;
      const out = await fetchSignalStatus(tracking);
      if (cancelled) return;
      setView((v) => {
        if (v.type !== 'result') return v;
        if (!out.ok) return out.expired ? { ...v, trackingEnded: true } : v;
        if (out.stage !== v.result.stage) announce(copy.stageLive[out.stage]);
        const next = { ...v, checkedAt: Date.now(), result: { ...v.result, stage: out.stage } };
        if (!kiosk) {
          writeStoredTrack(safeStorage('session'), scope, {
            kind: v.kind,
            tracking: v.result.tracking!,
            stage: out.stage,
            duplicate: v.result.duplicate,
          });
        }
        return next;
      });
    };
    const id = window.setInterval(() => void tick(), POLL_MS);
    const onVisible = () => {
      if (document.visibilityState === 'visible') void tick();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      cancelled = true;
      window.clearInterval(id);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [tracking, stage, trackingEnded, copy, kiosk, scope]);

  // Sonuç görününce odak başlığa (ekran okuyucu yeni durumu okur).
  const viewKey = view.type === 'result' ? `r:${view.kind}` : view.type;
  useEffect(() => {
    if (view.type === 'result' || view.type === 'queued') resultHeadingRef.current?.focus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewKey]);

  const resetToForm = useCallback(() => {
    writeStoredTrack(safeStorage('session'), scope, null);
    setView({ type: 'form' });
    setFormError(null);
    setKioskLeft(null);
    requestAnimationFrame(() => headingRef.current?.focus());
  }, [scope]);

  // Kiosk: sonuçtan sonra ekran kendini sıfırlar (geri sayım görünür).
  useEffect(() => {
    if (!kiosk || view.type !== 'result') return;
    setKioskLeft(KIOSK_RESET_S);
    const id = window.setInterval(() => {
      setKioskLeft((s) => {
        if (s === null) return s;
        if (s <= 1) {
          window.clearInterval(id);
          resetToForm();
          return null;
        }
        return s - 1;
      });
    }, 1000);
    return () => window.clearInterval(id);
  }, [kiosk, view.type, resetToForm]);

  const reasonOptions = useMemo(
    () => CONCERN_REASONS.map((r) => ({ value: r, label: copy.reasons[r] })),
    [copy]
  );

  const enter = policy.reduce
    ? { initial: { opacity: 0 }, animate: { opacity: 1 }, exit: { opacity: 0 } }
    : { initial: { opacity: 0, y: 8 }, animate: { opacity: 1, y: 0 }, exit: { opacity: 0, y: -8 } };
  const enterTransition = { duration: policy.reduce ? DURATION.fast : DURATION.base, ease: EASE.standard };

  return (
    <main className="min-h-dvh bg-background" lang={locale}>
      <div className="mx-auto flex w-full max-w-md flex-col gap-5 px-4 pb-[calc(env(safe-area-inset-bottom)+1.5rem)] pt-5 sm:pt-8">
        <div className="flex items-start justify-between gap-3">
          <VenueBadge venue={venue} />
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="min-h-11 shrink-0 gap-1.5 px-3"
            onClick={toggleLocale}
            aria-label={copy.languageToggleAria}
          >
            <Languages className="h-4 w-4" aria-hidden />
            {copy.languageToggle}
          </Button>
        </div>

        <AnimatePresence mode="wait" initial={false}>
          {view.type === 'form' && (
            <Motion.section key="form" {...enter} transition={enterTransition} aria-labelledby="ts-heading" className="flex flex-col gap-5">
              <div className="space-y-1.5">
                <p className="qx-overline text-fg-muted">{copy.eyebrow}</p>
                <h1 id="ts-heading" ref={headingRef} tabIndex={-1} className="qx-h1 text-fg outline-none">
                  {copy.heading}
                </h1>
                <p className="text-base text-fg-muted">{copy.lead}</p>
              </div>

              <TableField
                copy={copy}
                id={tableInputId}
                value={table}
                editing={editingTable}
                onEdit={() => setEditingTable(true)}
                onChange={setTable}
              />

              <div className="grid grid-cols-1 gap-3 min-[400px]:grid-cols-2">
                <BigChoice
                  tone="success"
                  icon={<CheckCircle2 className="h-7 w-7" aria-hidden />}
                  title={copy.okTitle}
                  body={copy.okBody}
                  loading={busy === 'OK'}
                  disabled={busy !== null}
                  onClick={sendOk}
                />
                <BigChoice
                  tone="warning"
                  icon={<AlertTriangle className="h-7 w-7" aria-hidden />}
                  title={copy.concernTitle}
                  body={copy.concernBody}
                  loading={busy === 'CONCERN'}
                  disabled={busy !== null}
                  onClick={openConcern}
                  haspopup
                />
              </div>

              <section aria-labelledby="ts-requests" className="rounded-card border border-border bg-surface-1 p-4">
                <h2 id="ts-requests" className="flex items-center gap-2 text-sm font-semibold text-fg">
                  <BellRing className="h-4 w-4 text-brand" aria-hidden />
                  {copy.requestHeading}
                </h2>
                {casesEnabled ? (
                  <div className="mt-3 grid grid-cols-2 gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      className="min-h-12 gap-2"
                      onClick={() => sendRequest('waiter')}
                      loading={busy === 'waiter'}
                      disabled={busy !== null}
                    >
                      <Hand className="h-4 w-4" aria-hidden />
                      {copy.requestWaiter}
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      className="min-h-12 gap-2"
                      onClick={() => sendRequest('bill')}
                      loading={busy === 'bill'}
                      disabled={busy !== null}
                    >
                      <Receipt className="h-4 w-4" aria-hidden />
                      {copy.requestBill}
                    </Button>
                  </div>
                ) : (
                  <p className="mt-2 text-sm text-fg-muted">{copy.requestsUnavailable}</p>
                )}
              </section>

              {formError && (
                <p role="alert" className={cn('rounded-control border p-3 text-sm', TONE_CALLOUT.danger)}>
                  {formError}
                </p>
              )}
            </Motion.section>
          )}

          {view.type === 'result' && (
            <Motion.section key={`result-${view.kind}`} {...enter} transition={enterTransition} aria-labelledby="ts-result">
              <ResultCard
                copy={copy}
                locale={locale}
                view={view}
                headingRef={resultHeadingRef}
                feedbackHref={kiosk ? null : feedbackHref}
                feedbackPoints={feedbackPoints}
                kioskLeft={kioskLeft}
                onNew={resetToForm}
                onStillIssue={() => {
                  resetToForm();
                  openConcern();
                }}
                reduce={policy.reduce}
              />
            </Motion.section>
          )}

          {view.type === 'queued' && (
            <Motion.section key="queued" {...enter} transition={enterTransition} aria-labelledby="ts-result">
              <div role="status" className={cn('rounded-card border p-5', TONE_CALLOUT.warning)}>
                <div className="flex items-start gap-3">
                  <CloudOff className="mt-0.5 h-6 w-6 shrink-0 text-warning" aria-hidden />
                  <div className="space-y-1">
                    <h1 id="ts-result" ref={resultHeadingRef} tabIndex={-1} className="qx-h3 text-fg outline-none">
                      {copy.queuedTitle}
                    </h1>
                    <p className="text-sm text-fg">{copy.queuedBody}</p>
                  </div>
                </div>
                <div className="mt-4 flex flex-wrap gap-2">
                  <Button type="button" className="min-h-11" onClick={() => void flushQueued(view.item)}>
                    <RotateCcw className="h-4 w-4" aria-hidden />
                    {copy.queuedRetry}
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    className="min-h-11"
                    onClick={() => {
                      removeQueued(safeStorage('local'), view.item.nonce, Date.now());
                      resetToForm();
                    }}
                  >
                    {copy.queuedDiscard}
                  </Button>
                </div>
              </div>
            </Motion.section>
          )}
        </AnimatePresence>

        <p className="text-xs leading-relaxed text-fg-muted">{copy.privacy}</p>
      </div>

      <DialogPrimitive.Root
        open={sheetOpen}
        onOpenChange={(next) => {
          if (!next && busy === 'CONCERN') return;
          setSheetOpen(next);
        }}
      >
        <DialogPrimitive.Portal>
          <DialogPrimitive.Overlay className="fixed inset-0 z-modal bg-overlay/60 data-[state=closed]:animate-out data-[state=open]:animate-in data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
          <DialogPrimitive.Content
            aria-describedby="ts-sheet-desc"
            className="fixed inset-x-0 bottom-0 z-modal outline-none sm:inset-0 sm:flex sm:items-center sm:justify-center sm:p-6"
          >
            <Motion.div
              initial={policy.reduce ? { opacity: 0 } : { y: 48, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={policy.transition({ ...SPRING.gentle })}
              className="max-h-[90dvh] w-full overflow-y-auto rounded-t-sheet border border-border bg-surface-1 p-5 pb-[calc(env(safe-area-inset-bottom)+1.25rem)] shadow-xl sm:max-w-md sm:rounded-sheet"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="space-y-1">
                  <DialogPrimitive.Title className="qx-h2 text-fg">{copy.sheetTitle}</DialogPrimitive.Title>
                  <DialogPrimitive.Description id="ts-sheet-desc" className="text-sm text-fg-muted">
                    {copy.sheetDescription}
                  </DialogPrimitive.Description>
                </div>
                <DialogPrimitive.Close asChild>
                  <Button type="button" variant="ghost" size="icon" aria-label={copy.sheetCancel} disabled={busy === 'CONCERN'}>
                    <X className="h-5 w-5" aria-hidden />
                  </Button>
                </DialogPrimitive.Close>
              </div>

              <div className="mt-4 space-y-4">
                <div className="space-y-2">
                  <p id={reasonsLabelId} className="text-sm font-medium text-fg">
                    {copy.reasonsLabel}
                  </p>
                  <ChoiceChips
                    mode="multiple"
                    aria-labelledby={reasonsLabelId}
                    options={reasonOptions}
                    value={reasons}
                    onChange={(v) => {
                      setReasons(v);
                      setSheetError(null);
                    }}
                  />
                </div>

                <div className="space-y-1.5">
                  <div className="flex items-baseline justify-between gap-2">
                    <Label htmlFor={noteId}>{copy.noteLabel}</Label>
                    <span className="text-xs tabular-nums text-fg-muted" aria-hidden>
                      {fill(copy.noteCounter, { count: note.length, max: NOTE_MAX })}
                    </span>
                  </div>
                  <Textarea
                    id={noteId}
                    value={note}
                    maxLength={NOTE_MAX}
                    rows={3}
                    placeholder={copy.notePlaceholder}
                    aria-describedby={noteHintId}
                    onChange={(e) => {
                      setNote(e.target.value);
                      setSheetError(null);
                    }}
                  />
                  <p id={noteHintId} className="text-xs text-fg-muted">
                    {copy.noteHint}
                  </p>
                </div>

                {canLink && !kiosk && (
                  <div className="flex items-start justify-between gap-4 rounded-control border border-border p-3">
                    <div className="space-y-0.5">
                      <Label htmlFor={linkId}>{copy.linkLabel}</Label>
                      <p className="text-xs text-fg-muted">{copy.linkHint}</p>
                    </div>
                    <Switch id={linkId} checked={linkAccount} onCheckedChange={setLinkAccount} className="mt-1" />
                  </div>
                )}

                {sheetError && (
                  <p role="alert" className={cn('rounded-control border p-3 text-sm', TONE_CALLOUT.danger)}>
                    {sheetError}
                  </p>
                )}

                <Button type="button" className="min-h-12 w-full" onClick={() => void sendConcern()} loading={busy === 'CONCERN'}>
                  {copy.sheetSubmit}
                </Button>
              </div>
            </Motion.div>
          </DialogPrimitive.Content>
        </DialogPrimitive.Portal>
      </DialogPrimitive.Root>
    </main>
  );
}

function TableField({
  copy,
  id,
  value,
  editing,
  onEdit,
  onChange,
}: {
  copy: SignalCopy;
  id: string;
  value: string;
  editing: boolean;
  onEdit: () => void;
  onChange: (v: string) => void;
}) {
  const hintId = `${id}-hint`;
  if (!editing && value.trim()) {
    return (
      <div className="flex items-center justify-between gap-3 rounded-control border border-border bg-surface-1 px-3 py-2">
        <span className="font-semibold text-fg">{fill(copy.tableChip, { table: value.trim() })}</span>
        <Button type="button" variant="ghost" size="sm" className="min-h-11 gap-1.5" onClick={onEdit}>
          <Pencil className="h-4 w-4" aria-hidden />
          {copy.tableChange}
        </Button>
      </div>
    );
  }
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{copy.tableLabel}</Label>
      <Input
        id={id}
        value={value}
        maxLength={TABLE_CODE_MAX}
        autoComplete="off"
        inputMode="text"
        placeholder={copy.tablePlaceholder}
        aria-describedby={hintId}
        onChange={(e) => onChange(e.target.value)}
      />
      <p id={hintId} className="text-xs text-fg-muted">
        {copy.tableHint}
      </p>
    </div>
  );
}

function BigChoice({
  tone,
  icon,
  title,
  body,
  loading,
  disabled,
  onClick,
  haspopup,
}: {
  tone: 'success' | 'warning';
  icon: React.ReactNode;
  title: string;
  body: string;
  loading: boolean;
  disabled: boolean;
  onClick: () => void;
  haspopup?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-busy={loading || undefined}
      aria-haspopup={haspopup ? 'dialog' : undefined}
      className={cn(
        'group flex min-h-[8.5rem] w-full flex-col items-start justify-between gap-3 rounded-card border-2 p-4 text-left transition-[transform,box-shadow,border-color] duration-fast ease-standard',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2 focus-visible:ring-offset-background',
        'active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60',
        tone === 'success'
          ? 'border-success-border bg-success-subtle hover:border-success'
          : 'border-warning-border bg-warning-subtle hover:border-warning'
      )}
    >
      <span className={cn(tone === 'success' ? 'text-success' : 'text-warning')}>
        {loading ? <span className="inline-block h-7 w-7 animate-spin rounded-full border-2 border-current border-t-transparent" aria-hidden /> : icon}
      </span>
      <span className="space-y-0.5">
        <span className="block text-lg font-semibold text-fg">{title}</span>
        <span className="block text-sm text-fg-muted">{body}</span>
      </span>
    </button>
  );
}

const STAGES: SignalStage[] = ['sent', 'seen', 'resolved'];

function ResultCard({
  copy,
  locale,
  view,
  headingRef,
  feedbackHref,
  feedbackPoints,
  kioskLeft,
  onNew,
  onStillIssue,
  reduce,
}: {
  copy: SignalCopy;
  locale: SignalLocale;
  view: Extract<View, { type: 'result' }>;
  headingRef: React.RefObject<HTMLHeadingElement | null>;
  feedbackHref: string | null;
  feedbackPoints: number | null;
  kioskLeft: number | null;
  onNew: () => void;
  onStillIssue: () => void;
  reduce: boolean;
}) {
  const { kind, result } = view;
  const title = kind === 'OK' ? copy.sentOkTitle : kind === 'REQUEST' ? copy.sentRequestTitle : copy.sentConcernTitle;
  const showBridge = !!feedbackHref && (kind === 'OK' || (kind === 'CONCERN' && result.stage === 'resolved'));
  const activeIndex = STAGES.indexOf(result.stage);

  return (
    <div className="space-y-4">
      <div className="rounded-card border border-border bg-surface-1 p-5 qx-elevation-1">
        <div className="flex items-start gap-3">
          <Motion.span
            initial={reduce ? { opacity: 0 } : { opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: DURATION.base, ease: EASE.emphasized }}
            className={cn(
              'flex h-11 w-11 shrink-0 items-center justify-center rounded-full',
              kind === 'OK' || result.stage === 'resolved' ? 'bg-success-subtle text-success' : 'bg-brand-subtle text-brand'
            )}
          >
            {kind === 'OK' || result.stage === 'resolved' ? <Check className="h-6 w-6" aria-hidden /> : <BellRing className="h-6 w-6" aria-hidden />}
          </Motion.span>
          <div className="min-w-0 space-y-1">
            <h1 id="ts-result" ref={headingRef} tabIndex={-1} className="qx-h2 text-fg outline-none">
              {title}
            </h1>
            <p className="text-sm text-fg-muted">
              {kind === 'OK' ? copy.sentOkBody : result.tracking ? copy.stageLive[result.stage] : copy.sentNoTracking}
            </p>
            {result.duplicate && <p className="text-sm text-fg">{copy.duplicateNote}</p>}
            {result.linked && <p className="text-xs text-fg-muted">{copy.linkedNote}</p>}
          </div>
        </div>

        {kind !== 'OK' && result.tracking && (
          <div className="mt-5">
            <ol className="grid grid-cols-3 gap-2" aria-label={fill(copy.stageAria, { stage: copy.stages[result.stage] })}>
              {STAGES.map((s, i) => {
                const done = i <= activeIndex;
                return (
                  <li key={s} className="space-y-1.5" aria-current={i === activeIndex ? 'step' : undefined}>
                    <span className="block h-1.5 overflow-hidden rounded-full bg-surface-3">
                      <Motion.span
                        className="block h-full origin-left rounded-full bg-brand"
                        initial={false}
                        animate={{ scaleX: done ? 1 : 0 }}
                        transition={{ duration: reduce ? 0 : DURATION.slow, ease: EASE.standard }}
                      />
                    </span>
                    <span className={cn('flex items-center gap-1 text-xs', done ? 'font-semibold text-fg' : 'text-fg-muted')}>
                      {done && <Check className="h-3.5 w-3.5 text-brand" aria-hidden />}
                      {copy.stages[s]}
                    </span>
                  </li>
                );
              })}
            </ol>
            {view.trackingEnded ? (
              <p className="mt-3 text-xs text-fg-muted">{copy.trackingEnded}</p>
            ) : (
              view.checkedAt && (
                <p className="mt-3 text-xs text-fg-muted">{fill(copy.checkedAt, { time: formatTime(view.checkedAt, locale) })}</p>
              )
            )}
          </div>
        )}

        <div className="mt-5 flex flex-wrap gap-2">
          {kind === 'CONCERN' && result.stage === 'resolved' && (
            <Button type="button" variant="outline" className="min-h-11" onClick={onStillIssue}>
              <AlertTriangle className="h-4 w-4" aria-hidden />
              {copy.stillIssue}
            </Button>
          )}
          <Button type="button" variant="ghost" className="min-h-11" onClick={onNew}>
            <RotateCcw className="h-4 w-4" aria-hidden />
            {copy.newSignal}
          </Button>
        </div>
        {kioskLeft !== null && (
          <p className="mt-3 text-xs tabular-nums text-fg-muted" aria-live="off">
            {fill(copy.kioskReset, { seconds: kioskLeft })}
          </p>
        )}
      </div>

      {showBridge && feedbackHref && (
        <Link
          href={feedbackHref}
          onClick={() => track('table_signal_bridge_clicked', { kind })}
          className="flex min-h-11 items-center justify-between gap-3 rounded-card border border-brand-border bg-brand-subtle p-4 transition-colors duration-fast hover:border-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
        >
          <span className="flex items-start gap-3">
            <Star className="mt-0.5 h-5 w-5 shrink-0 text-brand" aria-hidden />
            <span className="space-y-0.5">
              <span className="block font-semibold text-fg">{copy.bridgeTitle}</span>
              <span className="block text-sm text-fg-muted">
                {feedbackPoints && feedbackPoints > 0 ? fill(copy.bridgeBody, { points: feedbackPoints }) : copy.bridgeBodyNoPoints}
              </span>
            </span>
          </span>
          <span className="flex shrink-0 items-center gap-1 text-sm font-semibold text-brand">
            {copy.bridgeCta}
            <ArrowRight className="h-4 w-4" aria-hidden />
          </span>
        </Link>
      )}
    </div>
  );
}
