'use client';

import { useEffect, useId, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import { AlertTriangle, ArrowLeft, ArrowRight, Check, Loader2, Search, Send, Shuffle, UserRound, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { ChoiceChips } from '@/components/ds/a11y';
import { matchesConfirmPhrase } from '@/components/states';
import {
  SURPRISE_BOX_LIMITS,
  TYPED_CONFIRM_PHRASE,
  TYPED_CONFIRM_POINTS,
  type RecipientOption,
} from '@/lib/admin-surprise-boxes/contract';
import { BoxPreview } from './box-preview';
import {
  KutuKuponApiError,
  boxKeys,
  confirmSend,
  errorText,
  fetchBoxCoupons,
  fieldErrors,
  idemKey,
  previewSend,
  searchRecipients,
  type SendBody,
  type SendPreview,
} from './api';
import { fmtDate, fmtNumber, pct } from './format';

type Step = 0 | 1 | 2;
type Mode = 'user' | 'random';
const STEPS = ['İçerik', 'Alıcılar', 'Önizle ve gönder'] as const;
const TITLE_MAX = 200;
const MESSAGE_MAX = 2000;

function useDebounced<T>(v: T, ms = 300): T {
  const [d, setD] = useState(v);
  useEffect(() => {
    const t = window.setTimeout(() => setD(v), ms);
    return () => window.clearTimeout(t);
  }, [v, ms]);
  return d;
}

export function BoxSendSheet({
  open,
  onOpenChange,
  remainingToday,
  moduleEnabled,
  presetCoupon,
  onSent,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  remainingToday: number | null;
  moduleEnabled: boolean;
  presetCoupon?: string | null;
  onSent: (campaignId: string) => void;
}) {
  const ids = useId();
  const [step, setStep] = useState<Step>(0);
  const [title, setTitle] = useState('');
  const [message, setMessage] = useState('');
  const [points, setPoints] = useState('0');
  const [coupon, setCoupon] = useState('');
  const [mode, setMode] = useState<Mode>('user');
  const [search, setSearch] = useState('');
  const [recipient, setRecipient] = useState<RecipientOption | null>(null);
  const [randomCount, setRandomCount] = useState('10');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [preview, setPreview] = useState<SendPreview | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [phrase, setPhrase] = useState('');
  const [requestId, setRequestId] = useState(idemKey);

  useEffect(() => {
    if (open && presetCoupon) setCoupon(presetCoupon);
  }, [open, presetCoupon]);

  const reset = () => {
    setStep(0);
    setTitle('');
    setMessage('');
    setPoints('0');
    setCoupon('');
    setMode('user');
    setSearch('');
    setRecipient(null);
    setRandomCount('10');
    setErrors({});
    setPreview(null);
    setPreviewError(null);
    setPhrase('');
    setRequestId(idemKey());
  };

  const coupons = useQuery({ queryKey: boxKeys.coupons(), queryFn: fetchBoxCoupons, enabled: open, staleTime: 60_000 });
  const q = useDebounced(search.trim());
  const recipients = useQuery({
    queryKey: boxKeys.recipients(q),
    queryFn: ({ signal }) => searchRecipients(q, signal),
    enabled: open && mode === 'user' && !recipient && q.length >= 2,
    staleTime: 30_000,
  });

  const pointsNum = Math.floor(Number(points.replace(/\./g, '').replace(',', '.')));
  const countNum = Math.floor(Number(randomCount));
  const selectedCoupon = coupons.data?.find((c) => c.code === coupon) ?? null;

  const body = useMemo<SendBody>(() => {
    const b: SendBody = { title: title.trim(), message: message.trim() || undefined, couponCode: coupon || undefined, points: Number.isFinite(pointsNum) ? pointsNum : 0 };
    if (mode === 'user' && recipient) b.userId = recipient.id;
    if (mode === 'random') b.randomCount = countNum;
    return b;
  }, [title, message, coupon, pointsNum, mode, recipient, countNum]);

  // İçerik/hedef değişince sunucu önizlemesi geçersizleşir.
  useEffect(() => {
    setPreview(null);
    setPhrase('');
  }, [body]);

  const validateContent = (): boolean => {
    const e: Record<string, string> = {};
    if (!title.trim()) e.title = 'Başlık girin.';
    else if (title.trim().length > TITLE_MAX) e.title = `Başlık en fazla ${TITLE_MAX} karakter olabilir.`;
    if (message.length > MESSAGE_MAX) e.message = `Mesaj en fazla ${fmtNumber(MESSAGE_MAX)} karakter olabilir.`;
    if (!Number.isFinite(pointsNum) || pointsNum < 0) e.points = 'Puan 0 ya da pozitif bir tam sayı olmalı.';
    else if (pointsNum > SURPRISE_BOX_LIMITS.maxPointsPerBox) e.points = `Kutu başına en fazla ${fmtNumber(SURPRISE_BOX_LIMITS.maxPointsPerBox)} puan.`;
    if (!e.points && pointsNum === 0 && !coupon && !message.trim()) e.points = 'Kutu boş olmasın: puan, kupon ya da mesaj ekleyin.';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const validateTarget = (): boolean => {
    const e: Record<string, string> = {};
    if (mode === 'user' && !recipient) e.recipient = 'Bir müşteri seçin.';
    if (mode === 'user' && recipient?.blocked) e.recipient = `Bu hesaba gönderilemez: ${recipient.blocked}.`;
    if (mode === 'random' && (!Number.isFinite(countNum) || countNum < 1 || countNum > SURPRISE_BOX_LIMITS.maxRecipients)) {
      e.randomCount = `1 ile ${fmtNumber(SURPRISE_BOX_LIMITS.maxRecipients)} arasında bir sayı girin.`;
    }
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const loadPreview = async () => {
    setBusy(true);
    setPreviewError(null);
    try {
      setPreview(await previewSend(body));
    } catch (e) {
      const fe = fieldErrors(e);
      if (e instanceof KutuKuponApiError && e.code === 'COUPON_INVALID') {
        setErrors({ coupon: e.message });
        setStep(0);
      } else if (Object.keys(fe).length) {
        setErrors(fe);
      }
      const p = e instanceof KutuKuponApiError ? (e.body?.preview as SendPreview | undefined) : undefined;
      if (p) setPreview(null);
      setPreviewError(errorText(e));
    } finally {
      setBusy(false);
    }
  };

  const next = async () => {
    if (step === 0 && validateContent()) setStep(1);
    else if (step === 1 && validateTarget()) {
      setStep(2);
      await loadPreview();
    }
  };

  const needsPhrase = !!preview && preview.totalPoints >= TYPED_CONFIRM_POINTS;
  const canSend = !!preview && moduleEnabled && (!needsPhrase || matchesConfirmPhrase(phrase, TYPED_CONFIRM_PHRASE));

  const send = async () => {
    if (!preview) return;
    setBusy(true);
    try {
      const r = await confirmSend(body, preview, requestId);
      toast.success(
        r.duplicate
          ? 'Bu gönderim zaten yapılmıştı; yeni kutu üretilmedi.'
          : `${fmtNumber(r.count)} kutu gönderildi${r.totalPoints > 0 ? ` · toplam ${fmtNumber(r.totalPoints)} puan` : ''}.`
      );
      onSent(r.campaignId);
      reset();
      onOpenChange(false);
    } catch (e) {
      if (e instanceof KutuKuponApiError && e.code === 'CONFIRMATION_REQUIRED') {
        const p = e.body?.preview as SendPreview | undefined;
        if (p) setPreview(p);
        setPhrase('');
        toast.warning('Alıcı sayısı ya da toplam değişti; güncel özeti kontrol edip yeniden onaylayın.');
      } else {
        setPreviewError(errorText(e));
      }
    } finally {
      setBusy(false);
    }
  };

  const budgetAfter = preview ? preview.remainingToday - preview.totalPoints : null;

  return (
    <Sheet
      open={open}
      onOpenChange={(o) => {
        if (!o && busy) return;
        onOpenChange(o);
      }}
    >
      <SheetContent side="right" className="flex w-full flex-col gap-0 overflow-y-auto p-0 sm:max-w-xl">
        <SheetHeader className="border-b border-subtle px-5 py-4 text-left">
          <SheetTitle>Yeni sürpriz kutu</SheetTitle>
          <SheetDescription>
            Kutu açıldığında puan defterden basılır. Kutu başına en çok {fmtNumber(SURPRISE_BOX_LIMITS.maxPointsPerBox)} puan, gönderim başına {fmtNumber(SURPRISE_BOX_LIMITS.maxCampaignPoints)}, günlük
            bütçeniz {remainingToday == null ? '—' : `${fmtNumber(remainingToday)} kaldı`}.
          </SheetDescription>
          <ol className="mt-3 flex gap-2" aria-label="Adımlar">
            {STEPS.map((s, i) => (
              <li key={s} aria-current={i === step ? 'step' : undefined} className="flex min-w-0 flex-1 items-center gap-2">
                <span
                  className={`inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${
                    i < step ? 'bg-success text-success-fg' : i === step ? 'bg-brand text-brand-fg' : 'bg-surface-3 text-fg-muted'
                  }`}
                >
                  {i < step ? <Check className="h-3.5 w-3.5" aria-hidden /> : i + 1}
                </span>
                <span className={`qx-caption truncate ${i === step ? 'font-semibold text-fg' : 'text-fg-muted'}`}>{s}</span>
              </li>
            ))}
          </ol>
        </SheetHeader>

        <div className="flex-1 space-y-5 px-5 py-5">
          {!moduleEnabled ? (
            <p role="status" className="qx-small flex gap-2 rounded-card border border-warning-border bg-warning-subtle px-3 py-2 text-fg">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" aria-hidden />
              Sürpriz kutu modülü kapalı; gönderim yapılamaz.
            </p>
          ) : null}

          {step === 0 ? (
            <div className="space-y-4">
              <div className="space-y-1.5">
                <div className="flex items-baseline justify-between">
                  <Label htmlFor={`${ids}-title`}>Başlık</Label>
                  <span className="qx-caption text-fg-muted" aria-live="polite">
                    {title.length}/{TITLE_MAX}
                  </span>
                </div>
                <Input
                  id={`${ids}-title`}
                  value={title}
                  maxLength={TITLE_MAX}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Örn. Hafta sonu sürprizi"
                  aria-invalid={!!errors.title || undefined}
                  aria-describedby={errors.title ? `${ids}-title-err` : undefined}
                />
                {errors.title ? (
                  <p id={`${ids}-title-err`} className="qx-caption text-danger">
                    {errors.title}
                  </p>
                ) : null}
              </div>
              <div className="space-y-1.5">
                <div className="flex items-baseline justify-between">
                  <Label htmlFor={`${ids}-msg`}>Mesaj (isteğe bağlı)</Label>
                  <span className="qx-caption text-fg-muted">
                    {fmtNumber(message.length)}/{fmtNumber(MESSAGE_MAX)}
                  </span>
                </div>
                <Textarea id={`${ids}-msg`} value={message} maxLength={MESSAGE_MAX} rows={3} onChange={(e) => setMessage(e.target.value)} placeholder="Kutuyu açınca görünecek kısa not" />
                {errors.message ? <p className="qx-caption text-danger">{errors.message}</p> : null}
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor={`${ids}-points`}>Kutu başına puan</Label>
                  <Input
                    id={`${ids}-points`}
                    inputMode="numeric"
                    value={points}
                    onChange={(e) => setPoints(e.target.value.replace(/[^\d]/g, ''))}
                    aria-invalid={!!errors.points || undefined}
                    aria-describedby={`${ids}-points-hint`}
                  />
                  <p id={`${ids}-points-hint`} className={`qx-caption ${errors.points ? 'text-danger' : 'text-fg-muted'}`}>
                    {errors.points ?? `0–${fmtNumber(SURPRISE_BOX_LIMITS.maxPointsPerBox)}. 0 = yalnız kupon/mesaj.`}
                  </p>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor={`${ids}-coupon`}>Kupon (isteğe bağlı)</Label>
                  <select
                    id={`${ids}-coupon`}
                    value={coupon}
                    onChange={(e) => setCoupon(e.target.value)}
                    disabled={coupons.isLoading}
                    aria-invalid={!!errors.coupon || undefined}
                    className="flex h-11 w-full rounded-control border border-strong bg-surface-1 px-3 text-sm text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:h-10"
                  >
                    <option value="">Kupon yok</option>
                    {presetCoupon && !coupons.data?.some((c) => c.code === presetCoupon) ? <option value={presetCoupon}>{presetCoupon}</option> : null}
                    {coupons.data?.map((c) => (
                      <option key={c.id} value={c.code}>
                        {c.code} · {c.label}
                        {c.remaining != null ? ` · ${fmtNumber(c.remaining)} hak` : ''}
                      </option>
                    ))}
                  </select>
                  <p className={`qx-caption ${errors.coupon ? 'text-danger' : 'text-fg-muted'}`}>
                    {errors.coupon ??
                      (coupons.isError
                        ? 'Kuponlar yüklenemedi.'
                        : selectedCoupon?.expiresAt
                          ? `Son kullanım ${fmtDate(selectedCoupon.expiresAt)}`
                          : 'Yalnız aktif, süresi ve hakkı kalan kuponlar listelenir.')}
                  </p>
                </div>
              </div>
            </div>
          ) : null}

          {step === 1 ? (
            <div className="space-y-4">
              <p className="qx-small font-medium text-fg" id={`${ids}-mode`}>
                Kime gönderilsin?
              </p>
              <ChoiceChips
                aria-labelledby={`${ids}-mode`}
                value={mode}
                onChange={(v) => {
                  if (!v) return;
                  setMode(v as Mode);
                  setErrors({});
                }}
                options={[
                  { value: 'user', label: 'Tek müşteri', icon: <UserRound className="h-4 w-4" aria-hidden /> },
                  { value: 'random', label: 'Rastgele müşteriler', icon: <Shuffle className="h-4 w-4" aria-hidden /> },
                ]}
              />
              {mode === 'user' ? (
                <div className="space-y-2">
                  {recipient ? (
                    <div className="flex items-center gap-3 rounded-card border border-brand-border bg-brand-subtle p-3">
                      <UserRound className="h-5 w-5 shrink-0 text-brand" aria-hidden />
                      <div className="min-w-0 flex-1">
                        <p className="qx-small truncate font-semibold text-fg">{recipient.name || 'İsimsiz müşteri'}</p>
                        <p className="qx-caption truncate text-fg-muted">{recipient.email}</p>
                        {recipient.blocked ? <p className="qx-caption text-danger">Gönderilemez: {recipient.blocked}</p> : null}
                      </div>
                      <Button type="button" variant="ghost" size="sm" className="min-h-11 sm:min-h-9" onClick={() => setRecipient(null)} aria-label="Alıcıyı değiştir">
                        <X className="h-4 w-4" aria-hidden />
                      </Button>
                    </div>
                  ) : (
                    <>
                      <Label htmlFor={`${ids}-search`}>Müşteri ara</Label>
                      <div className="relative">
                        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-fg-muted" aria-hidden />
                        <Input
                          id={`${ids}-search`}
                          className="pl-9"
                          value={search}
                          onChange={(e) => setSearch(e.target.value)}
                          placeholder="Ad, e-posta ya da kullanıcı kimliği"
                          role="combobox"
                          aria-expanded={!!recipients.data?.length}
                          aria-controls={`${ids}-results`}
                          aria-autocomplete="list"
                        />
                      </div>
                      <div id={`${ids}-results`} role="listbox" aria-label="Arama sonuçları" className="space-y-1">
                        {q.length < 2 ? (
                          <p className="qx-caption text-fg-muted">En az 2 karakter yazın. Yalnız müşteri hesapları listelenir.</p>
                        ) : recipients.isLoading ? (
                          <p className="qx-caption inline-flex items-center gap-2 text-fg-muted">
                            <Loader2 className="h-3.5 w-3.5 animate-spin motion-reduce:animate-none" aria-hidden /> Aranıyor…
                          </p>
                        ) : recipients.isError ? (
                          <p className="qx-caption text-danger">{errorText(recipients.error)}</p>
                        ) : recipients.data && recipients.data.length === 0 ? (
                          <p className="qx-caption text-fg-muted">Eşleşen müşteri yok.</p>
                        ) : (
                          recipients.data?.map((r) => (
                            <button
                              key={r.id}
                              type="button"
                              role="option"
                              aria-selected={false}
                              aria-disabled={!!r.blocked || undefined}
                              onClick={() => setRecipient(r)}
                              className="flex min-h-11 w-full items-center gap-3 rounded-control border border-subtle bg-surface-1 px-3 py-2 text-left transition-colors duration-fast hover:border-brand-border hover:bg-brand-subtle focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                            >
                              <span className="min-w-0 flex-1">
                                <span className="qx-small block truncate font-medium text-fg">{r.name || 'İsimsiz müşteri'}</span>
                                <span className="qx-caption block truncate text-fg-muted">{r.email}</span>
                              </span>
                              {r.blocked ? <span className="qx-caption shrink-0 text-danger">{r.blocked}</span> : null}
                            </button>
                          ))
                        )}
                      </div>
                    </>
                  )}
                  {errors.recipient ? <p className="qx-caption text-danger">{errors.recipient}</p> : null}
                </div>
              ) : (
                <div className="space-y-1.5">
                  <Label htmlFor={`${ids}-count`}>Kaç müşteri?</Label>
                  <Input
                    id={`${ids}-count`}
                    inputMode="numeric"
                    value={randomCount}
                    onChange={(e) => setRandomCount(e.target.value.replace(/[^\d]/g, ''))}
                    aria-invalid={!!errors.randomCount || undefined}
                    aria-describedby={`${ids}-count-hint`}
                  />
                  <p id={`${ids}-count-hint`} className={`qx-caption ${errors.randomCount ? 'text-danger' : 'text-fg-muted'}`}>
                    {errors.randomCount ??
                      `1–${fmtNumber(SURPRISE_BOX_LIMITS.maxRecipients)}. Tüm müşteriler arasından veritabanında rastgele seçilir; askıdaki, anonimleştirilmiş ve inceleme altındaki hesaplar dışarıda kalır.`}
                  </p>
                </div>
              )}
            </div>
          ) : null}

          {step === 2 ? (
            <div className="space-y-4">
              {busy && !preview ? (
                <p className="qx-small inline-flex items-center gap-2 text-fg-muted" aria-live="polite">
                  <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden /> Sunucu özeti hazırlanıyor…
                </p>
              ) : null}
              {previewError ? (
                <div role="alert" className="qx-small flex gap-2 rounded-card border border-danger-border bg-danger-subtle px-3 py-2 text-fg">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-danger" aria-hidden />
                  <span className="min-w-0 flex-1">{previewError}</span>
                  <Button type="button" variant="outline" size="sm" className="min-h-11 sm:min-h-8" onClick={loadPreview} disabled={busy}>
                    Tekrar dene
                  </Button>
                </div>
              ) : null}
              {preview ? (
                <dl className="grid grid-cols-2 gap-3 rounded-card border border-subtle bg-surface-1 p-4 text-sm">
                  <div>
                    <dt className="qx-caption text-fg-muted">Alıcı</dt>
                    <dd className="qx-num text-lg font-semibold text-fg">{fmtNumber(preview.recipientCount)}</dd>
                    {preview.recipient ? <dd className="qx-caption truncate text-fg-muted">{preview.recipient.name} · {preview.recipient.email}</dd> : null}
                  </div>
                  <div>
                    <dt className="qx-caption text-fg-muted">Toplam puan yükümlülüğü</dt>
                    <dd className="qx-num text-lg font-semibold text-fg">{fmtNumber(preview.totalPoints)}</dd>
                    <dd className="qx-caption text-fg-muted">{fmtNumber(preview.pointsPerBox)} × {fmtNumber(preview.recipientCount)}</dd>
                  </div>
                  <div className="col-span-2 space-y-1">
                    <dt className="qx-caption flex justify-between text-fg-muted">
                      <span>Günlük bütçe</span>
                      <span className="qx-num">
                        {fmtNumber(Math.max(0, budgetAfter ?? 0))} / {fmtNumber(SURPRISE_BOX_LIMITS.dailySenderBudget)} kalacak
                      </span>
                    </dt>
                    <dd>
                      <div
                        className="h-2 overflow-hidden rounded-full bg-surface-3"
                        role="meter"
                        aria-label="Bu gönderimden sonra kullanılan günlük bütçe"
                        aria-valuemin={0}
                        aria-valuemax={SURPRISE_BOX_LIMITS.dailySenderBudget}
                        aria-valuenow={SURPRISE_BOX_LIMITS.dailySenderBudget - Math.max(0, budgetAfter ?? 0)}
                      >
                        <div
                          className={`h-full rounded-full ${budgetAfter != null && budgetAfter < SURPRISE_BOX_LIMITS.dailySenderBudget * 0.1 ? 'bg-warning' : 'bg-brand'}`}
                          style={{ width: `${pct(SURPRISE_BOX_LIMITS.dailySenderBudget - Math.max(0, budgetAfter ?? 0), SURPRISE_BOX_LIMITS.dailySenderBudget)}%` }}
                        />
                      </div>
                    </dd>
                  </div>
                  {coupon ? (
                    <div className="col-span-2">
                      <dt className="qx-caption text-fg-muted">Kupon</dt>
                      <dd className="font-mono text-fg">
                        {coupon}
                        {selectedCoupon ? <span className="qx-caption ml-2 font-sans text-fg-muted">{selectedCoupon.label}</span> : null}
                      </dd>
                    </div>
                  ) : null}
                </dl>
              ) : null}
              <BoxPreview title={title} message={message} points={Number.isFinite(pointsNum) ? pointsNum : 0} couponCode={coupon || null} />
              {needsPhrase ? (
                <div className="space-y-1.5 rounded-card border border-warning-border bg-warning-subtle p-3">
                  <Label htmlFor={`${ids}-phrase`}>
                    Toplam {fmtNumber(preview!.totalPoints)} puan. Onaylamak için <span className="font-mono font-semibold">{TYPED_CONFIRM_PHRASE}</span> yazın.
                  </Label>
                  <Input id={`${ids}-phrase`} value={phrase} onChange={(e) => setPhrase(e.target.value)} autoComplete="off" />
                </div>
              ) : null}
              <p className="qx-caption text-fg-muted">Alıcılar uygulama içi bildirim alır. Açılmamış kutuları kampanya ayrıntısından geri çekebilirsiniz.</p>
            </div>
          ) : null}
        </div>

        <div className="sticky bottom-0 flex flex-wrap items-center justify-between gap-2 border-t border-subtle bg-surface-1 px-5 py-3">
          {step > 0 ? (
            <Button type="button" variant="outline" className="min-h-11 sm:min-h-10" onClick={() => setStep((s) => (s - 1) as Step)} disabled={busy}>
              <ArrowLeft className="h-4 w-4" aria-hidden /> Geri
            </Button>
          ) : (
            <span />
          )}
          {step < 2 ? (
            <Button type="button" className="min-h-11 sm:min-h-10" onClick={next} disabled={busy}>
              İleri <ArrowRight className="h-4 w-4" aria-hidden />
            </Button>
          ) : (
            <Button type="button" className="min-h-11 sm:min-h-10" onClick={send} disabled={!canSend || busy} aria-busy={busy || undefined}>
              {busy ? <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden /> : <Send className="h-4 w-4" aria-hidden />}
              {preview ? `${fmtNumber(preview.recipientCount)} kutuyu gönder` : 'Gönder'}
            </Button>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
