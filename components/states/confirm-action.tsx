'use client';

import { useCallback, useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { AlertTriangle, ShieldAlert, Info } from 'lucide-react';
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { useStateCopy } from './copy';
import { InlineError } from './inline-error';
import { TONE_CALLOUT, TONE_CHIP, TONE_TEXT } from './tone';
import { matchesConfirmPhrase } from './confirm-phrase';

export type ImpactItem = {
  label: ReactNode;
  value: ReactNode;
  /** Vurgulanacak (ör. silinecek kayıt sayısı). */
  emphasis?: boolean;
};

export type ImpactPreview = {
  items: ImpactItem[];
  /** Önizlemeye eklenecek uyarı (ör. "3 aktif kampanya durdurulacak"). */
  warning?: ReactNode;
};

export type ConfirmActionProps = {
  /** Diyaloğu açan öğe (Button vb.). Kontrollü kullanımda verilmeyebilir. */
  trigger?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  /** `danger`: kalıcı/yıkıcı; `warning`: geri alınabilir ama etkili; `brand`: olağan onay. */
  tone?: 'danger' | 'warning' | 'brand';
  /** Sabit etki önizlemesi. */
  impact?: ImpactItem[] | ImpactPreview;
  /** Sunucudan etki önizlemesi (açılışta çağrılır). Hata önizlemeyi engellemez. */
  loadImpact?: () => Promise<ImpactItem[] | ImpactPreview>;
  /**
   * Tipli onay: kullanıcı bu ifadeyi yazmadan onay butonu açılmaz
   * (büyük/küçük harf ve Türkçe İ/ı duyarsız; baş/son boşluk yok sayılır).
   */
  confirmPhrase?: string;
  confirmLabel?: ReactNode;
  cancelLabel?: ReactNode;
  /** Varsayılan: tone="danger" iken "Bu işlem geri alınamaz." */
  irreversibleNote?: ReactNode | false;
  /**
   * Onaylanınca çalışır. Hata fırlatırsa diyalog AÇIK kalır ve hata gösterilir
   * (sessizce kapanıp "olmuş gibi" görünmez).
   */
  onConfirm: () => unknown | Promise<unknown>;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  disabled?: boolean;
};

function normalizeImpact(v: ImpactItem[] | ImpactPreview | undefined): ImpactPreview | null {
  if (!v) return null;
  return Array.isArray(v) ? { items: v } : v;
}

/**
 * Etki önizlemeli, tipli onay diyaloğu — native `confirm()` ve tek tıkla kalıcı
 * işlem yerine. Erişilebilir (Radix AlertDialog: odak tuzağı, Esc, başlık/açıklama
 * bağları), azaltılmış harekete saygılı (CSS animasyonu politika ile kapanır).
 *
 *   <ConfirmAction
 *     trigger={<Button variant="destructive">Kampanyayı sil</Button>}
 *     title="Kampanya silinsin mi?"
 *     loadImpact={() => api.previewDelete(id)}
 *     confirmPhrase={campaign.name}
 *     onConfirm={() => api.delete(id)}
 *   />
 */
export function ConfirmAction({
  trigger,
  title,
  description,
  tone = 'danger',
  impact,
  loadImpact,
  confirmPhrase,
  confirmLabel,
  cancelLabel,
  irreversibleNote,
  onConfirm,
  open: openProp,
  onOpenChange,
  disabled,
}: ConfirmActionProps) {
  const copy = useStateCopy();
  const phraseId = useId();
  const errorId = useId();
  const [openState, setOpenState] = useState(false);
  const open = openProp ?? openState;
  const [typed, setTyped] = useState('');
  const [pending, setPending] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [remoteImpact, setRemoteImpact] = useState<ImpactPreview | null>(null);
  const [impactState, setImpactState] = useState<'idle' | 'loading' | 'error' | 'ready'>('idle');
  const loadRef = useRef(loadImpact);
  useEffect(() => {
    loadRef.current = loadImpact;
  });

  const setOpen = useCallback(
    (next: boolean) => {
      if (pending && !next) return; // işlem sürerken kapatma
      if (openProp === undefined) setOpenState(next);
      onOpenChange?.(next);
    },
    [onOpenChange, openProp, pending],
  );

  // Açılışta durumu sıfırla + sunucu önizlemesini çek
  useEffect(() => {
    if (!open) return;
    setTyped('');
    setActionError(null);
    const loader = loadRef.current;
    if (!loader) return;
    let cancelled = false;
    setImpactState('loading');
    setRemoteImpact(null);
    loader()
      .then((res) => {
        if (cancelled) return;
        setRemoteImpact(normalizeImpact(res));
        setImpactState('ready');
      })
      .catch(() => {
        if (!cancelled) setImpactState('error');
      });
    return () => {
      cancelled = true;
    };
  }, [open]);

  const preview = remoteImpact ?? normalizeImpact(impact);
  const phraseOk = !confirmPhrase || matchesConfirmPhrase(typed, confirmPhrase);
  const canConfirm = phraseOk && !pending && !disabled;
  const note = irreversibleNote === undefined ? (tone === 'danger' ? copy.irreversible : null) : irreversibleNote || null;
  const ToneIcon = tone === 'danger' ? ShieldAlert : tone === 'warning' ? AlertTriangle : Info;

  const handleConfirm = async () => {
    if (!canConfirm) return;
    setPending(true);
    setActionError(null);
    try {
      await onConfirm();
      setPending(false);
      if (openProp === undefined) setOpenState(false);
      onOpenChange?.(false);
    } catch (err) {
      setPending(false);
      const msg = err instanceof Error && err.message ? err.message : copy.actionFailed;
      setActionError(msg);
    }
  };

  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      {trigger && <AlertDialogTrigger asChild disabled={disabled}>{trigger}</AlertDialogTrigger>}
      <AlertDialogContent className="max-h-[calc(100dvh-2rem)] w-[calc(100vw-2rem)] max-w-lg overflow-y-auto rounded-sheet border bg-surface-elevated p-5 sm:rounded-sheet sm:p-6">
        <AlertDialogHeader className="space-y-3">
          <div className="flex items-start gap-3">
            <div aria-hidden className={cn('grid h-10 w-10 shrink-0 place-items-center rounded-control', TONE_CHIP[tone])}>
              <ToneIcon className="h-5 w-5" />
            </div>
            <div className="min-w-0 space-y-1 text-left">
              <AlertDialogTitle className="qx-h3 text-fg">{title}</AlertDialogTitle>
              {description ? (
                <AlertDialogDescription className="qx-body text-fg-muted">{description}</AlertDialogDescription>
              ) : (
                <AlertDialogDescription className="sr-only">{typeof title === 'string' ? title : copy.confirm}</AlertDialogDescription>
              )}
            </div>
          </div>
        </AlertDialogHeader>

        {(loadImpact || preview) && (
          <div className={cn('rounded-control border p-3.5', TONE_CALLOUT[tone === 'brand' ? 'neutral' : tone])} aria-live="polite">
            <p className="qx-overline mb-2 text-fg-muted">{copy.impactTitle}</p>
            {impactState === 'loading' && !preview ? (
              <p className="qx-small text-fg-muted" role="status">
                {copy.impactLoading}
              </p>
            ) : preview && preview.items.length > 0 ? (
              <dl className="space-y-1.5">
                {preview.items.map((item, i) => (
                  <div key={i} className="flex items-baseline justify-between gap-4">
                    <dt className="qx-small text-fg-muted">{item.label}</dt>
                    <dd className={cn('qx-small qx-num text-right', item.emphasis ? cn('font-semibold', TONE_TEXT[tone]) : 'font-medium text-fg')}>
                      {item.value}
                    </dd>
                  </div>
                ))}
              </dl>
            ) : null}
            {impactState === 'error' && <p className="qx-small mt-1 text-fg-muted">{copy.impactError}</p>}
            {preview?.warning && (
              <p className={cn('qx-small mt-2 flex items-start gap-1.5 font-medium', TONE_TEXT[tone])}>
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
                <span>{preview.warning}</span>
              </p>
            )}
          </div>
        )}

        {note && <p className="qx-small font-medium text-fg">{note}</p>}

        {confirmPhrase && (
          <div className="space-y-1.5">
            <label htmlFor={phraseId} className="qx-small block text-fg-muted">
              {copy.typeToConfirm(confirmPhrase)}
            </label>
            <Input
              id={phraseId}
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              autoComplete="off"
              autoCapitalize="off"
              autoCorrect="off"
              spellCheck={false}
              aria-invalid={typed.length > 0 && !phraseOk ? true : undefined}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && canConfirm) {
                  e.preventDefault();
                  void handleConfirm();
                }
              }}
            />
          </div>
        )}

        {actionError && (
          <InlineError variant="banner" id={errorId}>
            <span className="font-medium">{copy.actionFailed}:</span> {actionError}
          </InlineError>
        )}

        <AlertDialogFooter className="gap-2 sm:gap-0">
          <AlertDialogCancel disabled={pending}>{cancelLabel ?? copy.cancel}</AlertDialogCancel>
          <Button
            type="button"
            variant={tone === 'danger' ? 'destructive' : 'default'}
            onClick={() => void handleConfirm()}
            disabled={!canConfirm}
            loading={pending}
            aria-describedby={actionError ? errorId : undefined}
          >
            {confirmLabel ?? copy.confirm}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
