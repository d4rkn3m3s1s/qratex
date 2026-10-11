'use client';

/**
 * Bağış paneli (mobilde tam ekran, masaüstünde panel). Kendi durumunu tutar ve her açılışta
 * sıfırlanır (denetim B14: projeler arası durum sızıntısı yok). Tam sayı girişi, bakiye ve
 * hedefe kalanla sınırlı "Tümü" kısayolu, canlı etki önizlemesi, sayaçlı not, görünürlük
 * (varsayılan: son tercih; hiç yoksa gizli). İşlem sürerken kapatılamaz. Tek-kez anahtarı:
 * ağ hatasında aynı anahtarla yeniden denenir → çift düşüm yok.
 *
 * Başarı anı: ilerleme çubuğu eski değerden yeni değere akar, onay ikonu belirir (`celebrate`
 * bütçesi içinde); azaltılmış harekette yalnız son durum.
 */
import { useId, useMemo, useState } from 'react';
import Link from 'next/link';
import { m as Motion } from 'framer-motion';
import { CheckCircle2, Heart, Loader2, Receipt } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { ChoiceChips, FullscreenModal, announce } from '@/components/ds/a11y';
import { DURATION, EASE, useReducedMotionPref } from '@/lib/motion';
import { cn } from '@/lib/utils';
import { impactValue, maxDonation } from '@/lib/customer-wallet/donate/impact';
import type { DonationProjectDto, MakeDonationResult } from '@/lib/customer-wallet/donate/service';
import { MovesFetchError, newRequestKey, postDonation } from './api';
import { useMovesCopy } from './copy';
import { ProjectIcon, ProgressBar } from './donate-parts';
import type { Formatters } from './format';

const QUICK = [50, 100, 250, 500, 1000];
const MESSAGE_MAX = 280;

type Props = {
  project: DonationProjectDto | null;
  balance: number;
  defaultPublic: boolean;
  fmt: Formatters;
  onClose: () => void;
  onDonated: (result: MakeDonationResult, projectBefore: DonationProjectDto) => void;
  onStale: () => void;
};

export function DonateSheet(props: Props) {
  // Proje değişince iç durum tamamen sıfırlanır.
  return props.project ? <DonateSheetInner key={props.project.id} {...props} project={props.project} /> : null;
}

/**
 * Tam sayı ayrıştırma: "1500", "1.500" ve "1,500" (binlik grup) kabul; "10.5" gibi ondalık
 * SESSİZCE kırpılmaz, hata olarak gösterilir (denetim #38).
 */
export function parseAmount(text: string): { kind: 'empty' } | { kind: 'invalid' } | { kind: 'ok'; value: number } {
  const t = text.replace(/\s/g, '');
  if (!t) return { kind: 'empty' };
  // Yalnız rakam ya da TEK tür binlik ayırıcıyla gruplanmış sayı ("1.500" / "1,500").
  const grouped = /^\d{1,3}(\.\d{3})+$/.test(t) || /^\d{1,3}(,\d{3})+$/.test(t);
  const digits = /^\d+$/.test(t) ? t : grouped ? t.replace(/[.,]/g, '') : null;
  if (!digits) return { kind: 'invalid' };
  const n = Number(digits);
  return Number.isSafeInteger(n) ? { kind: 'ok', value: n } : { kind: 'invalid' };
}

function DonateSheetInner({ project, balance, defaultPublic, fmt, onClose, onDonated, onStale }: Props & { project: DonationProjectDto }) {
  const { copy } = useMovesCopy();
  const reduce = useReducedMotionPref();
  const ids = { amount: useId(), amountHelp: useId(), amountErr: useId(), msg: useId(), msgHelp: useId(), pub: useId(), pubHelp: useId() };
  const [remainingOverride, setRemainingOverride] = useState<number | null>(null);
  const progress = remainingOverride != null ? { ...project.progress, remaining: remainingOverride } : project.progress;
  const max = maxDonation(balance, progress);
  const [text, setText] = useState(() => (max > 0 ? String(Math.min(max, 100)) : ''));
  const [message, setMessage] = useState('');
  const [isPublic, setIsPublic] = useState(defaultPublic);
  const [requestKey] = useState(() => newRequestKey());
  const [submitting, setSubmitting] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const [result, setResult] = useState<MakeDonationResult | null>(null);

  const parsed = parseAmount(text);
  const amount = parsed.kind === 'ok' ? parsed.value : 0;
  let localError: string | null = null;
  if (parsed.kind === 'invalid') localError = copy.wholeNumber;
  else if (parsed.kind === 'ok' && amount < 1) localError = copy.minAmount;
  else if (parsed.kind === 'ok' && amount > balance) localError = copy.overBalance;
  else if (parsed.kind === 'ok' && progress.remaining != null && amount > progress.remaining)
    localError = copy.overRemaining(fmt.int(progress.remaining));
  const canSubmit = parsed.kind === 'ok' && !localError && amount >= 1 && !submitting;

  const quick = useMemo(() => {
    const opts = QUICK.filter((q) => q < max).map((q) => ({ value: String(q), label: fmt.int(q) }));
    if (max > 0) opts.push({ value: String(max), label: copy.maxAmount(fmt.int(max)) });
    return opts;
  }, [max, fmt, copy]);
  const quickValue = quick.some((o) => o.value === String(amount)) ? String(amount) : null;

  const preview = amount > 0 && !localError ? impactValue(amount, project.impact) : null;

  const submit = async () => {
    if (!canSubmit) return;
    setSubmitting(true);
    setServerError(null);
    try {
      const res = await postDonation({
        projectId: project.id,
        points: amount,
        message: message.trim() ? message.trim() : null,
        isPublic,
        requestKey,
      });
      setResult(res);
      onDonated(res, project);
      announce(copy.successBody(fmt.int(res.receipt.points), project.name), { politeness: 'assertive' });
    } catch (e) {
      const err = e instanceof MovesFetchError ? e : null;
      const code = err?.code ?? '';
      let msg: string = copy.errors.generic;
      if (code === 'INSUFFICIENT_POINTS') msg = copy.errors.INSUFFICIENT_POINTS;
      else if (code === 'GOAL_EXCEEDED') {
        const rem = Number((err?.details as { remaining?: unknown } | null)?.remaining ?? 0);
        if (Number.isFinite(rem)) setRemainingOverride(rem);
        msg = copy.errors.GOAL_EXCEEDED(fmt.int(Number.isFinite(rem) ? rem : 0));
        onStale();
      } else if (code === 'GOAL_REACHED') {
        msg = copy.errors.GOAL_REACHED;
        setRemainingOverride(0);
        onStale();
      } else if (code === 'PROJECT_CLOSED') {
        msg = copy.errors.PROJECT_CLOSED;
        onStale();
      } else if (code === 'MODULE_DISABLED') msg = copy.errors.MODULE_DISABLED;
      else if (code === 'RATE_LIMITED') msg = copy.errors.RATE_LIMITED;
      else if (code === 'NOT_FOUND') msg = copy.errors.NOT_FOUND;
      setServerError(msg);
      announce(msg, { politeness: 'assertive' });
    } finally {
      setSubmitting(false);
    }
  };

  const title = copy.sheetTitle(project.name);

  if (result) {
    const before = project.progress.percent;
    const after = result.project.progress.percent;
    const impact = result.receipt.impact;
    return (
      <FullscreenModal
        open
        onOpenChange={(o) => !o && onClose()}
        title={copy.successTitle}
        footer={
          <div className="flex flex-col gap-2 sm:flex-row-reverse">
            <Button className="min-h-11 flex-1" onClick={onClose}>
              {copy.done}
            </Button>
            <Button asChild variant="outline" className="min-h-11 flex-1">
              <Link href={`/customer/wallet/donate?tab=history&receipt=${result.receipt.id}`} onClick={onClose}>
                <Receipt className="mr-2 h-4 w-4" aria-hidden />
                {copy.viewReceipt}
              </Link>
            </Button>
          </div>
        }
      >
        <div className="mx-auto flex max-w-md flex-col items-center gap-4 py-6 text-center">
          <Motion.span
            initial={reduce ? false : { opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: DURATION.base, ease: EASE.emphasized }}
            className="grid h-16 w-16 place-items-center rounded-full bg-success-subtle text-success"
          >
            <CheckCircle2 className="h-9 w-9" aria-hidden />
          </Motion.span>
          <p className="qx-body text-fg">{copy.successBody(fmt.int(result.receipt.points), project.name)}</p>
          {impact ? (
            <p className="qx-h3 text-fg">{copy.successImpact(fmt.dec(impact.value), impact.unit, impact.label)}</p>
          ) : null}
          {after != null ? (
            <div className="w-full space-y-1.5">
              <ProgressBar percent={after} label={copy.progressAria(fmt.int(result.project.current), fmt.int(result.project.goal), fmt.dec(after))}>
                <Motion.div
                  className="h-full w-full rounded-full bg-brand"
                  style={{ transformOrigin: 'left center' }}
                  initial={reduce ? false : { scaleX: (before ?? 0) / 100 }}
                  animate={{ scaleX: after / 100 }}
                  transition={{ duration: DURATION.celebrate * 0.6, ease: EASE.emphasized, delay: reduce ? 0 : 0.15 }}
                />
              </ProgressBar>
              <p className="qx-caption qx-num text-fg-muted">
                {copy.progressLabel(fmt.dec(after))} · {fmt.int(result.project.current)} / {fmt.int(result.project.goal)}
              </p>
            </div>
          ) : null}
          {result.goalReached ? <p className="qx-small font-semibold text-success">{copy.successGoal}</p> : null}
          <p className="qx-small qx-num text-fg-muted">{copy.newBalance(fmt.int(result.balance))}</p>
        </div>
      </FullscreenModal>
    );
  }

  return (
    <FullscreenModal
      open
      onOpenChange={(o) => !o && !submitting && onClose()}
      dismissible={!submitting}
      title={title}
      footer={
        max > 0 ? (
          <Button className="min-h-12 w-full" onClick={submit} disabled={!canSubmit} aria-describedby={localError ? ids.amountErr : undefined}>
            {submitting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />
                {copy.submitting}
              </>
            ) : (
              <>
                <Heart className="mr-2 h-4 w-4" aria-hidden />
                {copy.submit(fmt.int(Math.max(0, amount)))}
              </>
            )}
          </Button>
        ) : (
          <Button variant="outline" className="min-h-12 w-full" onClick={onClose}>
            {copy.close}
          </Button>
        )
      }
    >
      <div className="mx-auto max-w-lg space-y-5">
        <div className="flex items-center gap-3">
          <ProjectIcon icon={project.icon} category={project.category} />
          <div className="min-w-0">
            <p className="qx-small truncate font-semibold text-fg">{project.name}</p>
            <p className="qx-caption qx-num text-fg-muted">{copy.balanceLine(fmt.int(balance))}</p>
          </div>
        </div>

        {max <= 0 ? (
          <div role="status" className="rounded-card border border-subtle bg-surface-1 p-4">
            <p className="qx-small font-semibold text-fg">{progress.completed ? copy.goalReached : copy.notEnough}</p>
            {!progress.completed ? <p className="qx-caption mt-1 text-fg-muted">{copy.notEnoughDesc}</p> : null}
          </div>
        ) : (
          <>
            <div className="space-y-2">
              <label htmlFor={ids.amount} className="qx-small font-medium text-fg">
                {copy.amountLabel}
              </label>
              <Input
                id={ids.amount}
                inputMode="numeric"
                autoComplete="off"
                enterKeyHint="done"
                value={text}
                onChange={(e) => setText(e.target.value.slice(0, 9))}
                aria-invalid={!!localError}
                aria-describedby={`${ids.amountHelp}${localError ? ` ${ids.amountErr}` : ''}`}
                className="qx-num h-12 text-lg"
              />
              <p id={ids.amountHelp} className="qx-caption text-fg-muted">
                {copy.maxLine(fmt.int(max))}
              </p>
              {localError ? (
                <p id={ids.amountErr} role="alert" className="qx-caption text-danger">
                  {localError}
                </p>
              ) : null}
              <ChoiceChips
                aria-label={copy.quickAmounts}
                size="sm"
                options={quick}
                value={quickValue}
                onChange={(v) => v && setText(v)}
              />
            </div>

            <p className={cn('qx-small rounded-control px-3 py-2', preview != null ? 'bg-brand-subtle text-brand' : 'hidden')} aria-live="polite">
              {preview != null && project.impact ? copy.impactPreview(fmt.dec(preview), project.impact.unit, project.impact.label) : ''}
            </p>

            <div className="space-y-2">
              <div className="flex items-baseline justify-between gap-2">
                <label htmlFor={ids.msg} className="qx-small font-medium text-fg">
                  {copy.messageLabel}
                </label>
                <span aria-hidden className="qx-caption qx-num text-fg-subtle">
                  {copy.messageHint(message.length, MESSAGE_MAX)}
                </span>
              </div>
              <Textarea
                id={ids.msg}
                value={message}
                maxLength={MESSAGE_MAX}
                rows={3}
                onChange={(e) => setMessage(e.target.value.slice(0, MESSAGE_MAX))}
                aria-describedby={ids.msgHelp}
                className="text-base sm:text-sm"
              />
              <p id={ids.msgHelp} className="qx-caption text-fg-muted">
                {copy.messagePrivacy}
              </p>
            </div>

            <div className="flex items-start justify-between gap-3 rounded-card border border-subtle bg-surface-1 p-3">
              <div className="min-w-0">
                <label htmlFor={ids.pub} className="qx-small font-medium text-fg">
                  {copy.publicLabel}
                </label>
                <p id={ids.pubHelp} className="qx-caption mt-0.5 text-fg-muted">
                  {copy.publicHint}
                </p>
              </div>
              <Switch id={ids.pub} checked={isPublic} onCheckedChange={setIsPublic} aria-describedby={ids.pubHelp} />
            </div>

            {serverError ? (
              <p role="alert" className="qx-small rounded-control border border-danger-border bg-danger-subtle px-3 py-2 text-danger">
                {serverError}
              </p>
            ) : null}
          </>
        )}
      </div>
    </FullscreenModal>
  );
}
