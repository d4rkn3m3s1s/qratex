'use client';

import * as React from 'react';
import { useFormState, type FieldValues, type UseFormReturn } from 'react-hook-form';
import { AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { ErrorState, SkeletonForm, classifyError } from '@/components/states';
import { Form, FormRootError } from './form';
import { SubmitButton } from './submit-button';
import { useFormCopy } from './copy';
import type { ServerErrorInfo } from './server-errors';

export type EntityEditorSheetProps<T extends FieldValues> = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** `create`: "Yeni …" + "Oluştur" · `edit`: "… düzenle" + "Kaydet". */
  mode: 'create' | 'edit';
  /** Varlık adı, küçük harf ("kampanya", "şube") — başlık ve toast metni türetilir. */
  entityLabel?: string;
  title?: React.ReactNode;
  description?: React.ReactNode;
  form: UseFormReturn<T>;
  /**
   * Kaydet. Fırlatırsa çekmece AÇIK kalır; alan hataları alanlara, genel hata üstte,
   * 409 sürüm çakışması uyarı bandı olarak gösterilir. Dönen değer `onSaved`'a geçer.
   */
  onSubmit: (values: T) => unknown | Promise<unknown>;
  /** Başarılı kayıttan sonra (liste yenileme, seçim). */
  onSaved?: (result: unknown, values: T) => void;
  onServerError?: (info: ServerErrorInfo, error: unknown) => void;
  /**
   * Hazır kapısı (P0-28): düzenlenecek kayıt yüklenirken form RENDER EDİLMEZ — böylece
   * yükleme hatasından sonra "varsayılan değerlerle kaydet" kazası olmaz.
   */
  loading?: boolean;
  /** Kayıt yüklenemedi — form yerine hata durumu ve "Tekrar dene". */
  loadError?: unknown;
  onRetryLoad?: () => unknown;
  /** 409 çakışmasında "Güncel hali yükle". */
  onReloadLatest?: () => unknown;
  /** Başarı toast'ı. `false` → gösterme; dize → özel metin. */
  successToast?: boolean | string;
  /** Başarıda kapat (varsayılan: evet). "Kaydet ve yeni ekle" akışında `false`. */
  closeOnSuccess?: boolean;
  submitLabel?: React.ReactNode;
  cancelLabel?: React.ReactNode;
  /** Alt çubuğun soluna ek eylem (ör. "Sil" — ConfirmAction ile). */
  footerStart?: React.ReactNode;
  /** `right` (varsayılan, masaüstü) · `bottom` (mobil akış). */
  side?: 'right' | 'bottom';
  /** Panel genişliği (right): md 32rem · lg 40rem · xl 48rem. */
  width?: 'md' | 'lg' | 'xl';
  /** Kaydet düğmesi değişiklik yokken devre dışı (edit modunda varsayılan: evet). */
  disableWhenPristine?: boolean;
  children: React.ReactNode;
  className?: string;
};

const WIDTH: Record<NonNullable<EntityEditorSheetProps<FieldValues>['width']>, string> = {
  md: 'sm:max-w-lg',
  lg: 'sm:max-w-2xl',
  xl: 'sm:max-w-3xl',
};

/**
 * Oluştur/düzenle çekmecesi — RHF formu, kaydetme durumu, kirli form koruması.
 * Kirliyken kapatma (Esc, dış tıklama, ✕, Vazgeç) doğrudan kapatmaz: çekmece içinde
 * "Düzenlemeye dön / Değişiklikleri at ve kapat" onayı çıkar. Kaydederken kapanmaz.
 *
 *   const form = useZodForm(campaignSchema, { defaultValues });
 *   <EntityEditorSheet open={open} onOpenChange={setOpen} mode={id ? 'edit' : 'create'}
 *     entityLabel="kampanya" form={form} loading={query.isLoading} loadError={query.error}
 *     onRetryLoad={query.refetch} onReloadLatest={() => query.refetch().then((r) => form.reset(r.data))}
 *     onSubmit={(v) => (id ? api.update(id, { ...v, baseVersion }) : api.create(v))}
 *     onSaved={() => list.refetch()}>
 *     <TextField name="name" label="Ad" required />
 *     <MoneyField name="budget" label="Bütçe" />
 *   </EntityEditorSheet>
 */
export function EntityEditorSheet<T extends FieldValues>({
  open,
  onOpenChange,
  mode,
  entityLabel,
  title,
  description,
  form,
  onSubmit,
  onSaved,
  onServerError,
  loading = false,
  loadError,
  onRetryLoad,
  onReloadLatest,
  successToast = true,
  closeOnSuccess = true,
  submitLabel,
  cancelLabel,
  footerStart,
  side = 'right',
  width = 'md',
  disableWhenPristine,
  children,
  className,
}: EntityEditorSheetProps<T>) {
  const copy = useFormCopy();
  const { isDirty, isSubmitting } = useFormState({ control: form.control });
  const [guard, setGuard] = React.useState(false);
  const keepEditingRef = React.useRef<HTMLButtonElement>(null);
  const ready = !loading && !loadError;

  React.useEffect(() => {
    if (!open) setGuard(false);
  }, [open]);

  React.useEffect(() => {
    if (guard) keepEditingRef.current?.focus();
  }, [guard]);

  const requestClose = React.useCallback(() => {
    if (isSubmitting) return;
    if (ready && isDirty) {
      setGuard(true);
      return;
    }
    onOpenChange(false);
  }, [isSubmitting, ready, isDirty, onOpenChange]);

  const handleOpenChange = (next: boolean) => {
    if (next) onOpenChange(true);
    else requestClose();
  };

  const discardAndClose = () => {
    setGuard(false);
    form.reset();
    onOpenChange(false);
  };

  const handleSubmit = async (values: T) => {
    const result = await onSubmit(values); // fırlatırsa <Form> hatayı forma yazar
    if (successToast !== false) {
      toast.success(
        typeof successToast === 'string' ? successToast : mode === 'create' ? copy.createdToast(entityLabel) : copy.updatedToast(entityLabel),
      );
    }
    onSaved?.(result, values);
    if (closeOnSuccess) {
      setGuard(false);
      onOpenChange(false);
    }
    return result;
  };

  const heading = title ?? (mode === 'create' ? copy.createTitle(entityLabel) : copy.editTitle(entityLabel));
  const pristineLock = disableWhenPristine ?? mode === 'edit';

  return (
    <Sheet open={open} onOpenChange={handleOpenChange}>
      <SheetContent
        side={side}
        {...(!description ? { 'aria-describedby': undefined } : {})}
        className={cn(
          'flex flex-col gap-0 p-0',
          side === 'right' ? cn('w-full', WIDTH[width]) : 'max-h-[92dvh] rounded-t-sheet',
          className,
        )}
      >
        <SheetHeader className="shrink-0 space-y-1 border-b border-subtle px-5 pb-4 pr-16 pt-[max(1.25rem,env(safe-area-inset-top))] text-left sm:text-left">
          <SheetTitle className="qx-h2 text-fg">{heading}</SheetTitle>
          {description && <SheetDescription className="qx-small text-fg-muted">{description}</SheetDescription>}
        </SheetHeader>

        {!ready ? (
          <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5" aria-busy={loading || undefined}>
            {loadError ? (
              <ErrorState kind={classifyError(loadError)} onRetry={onRetryLoad} headingLevel="h3" />
            ) : (
              <SkeletonForm fields={4} className="border-0 bg-transparent p-0" />
            )}
          </div>
        ) : (
          <Form form={form} onSubmit={handleSubmit} onServerError={onServerError} className="flex min-h-0 flex-1 flex-col">
            <div className="min-h-0 flex-1 space-y-5 overflow-y-auto overscroll-contain px-5 py-5">
              <FormRootError showConflict onReloadLatest={onReloadLatest} />
              <fieldset disabled={isSubmitting} className="m-0 min-w-0 space-y-5 border-0 p-0">
                {children}
              </fieldset>
            </div>

            <div className="shrink-0 border-t border-subtle bg-surface-1 px-5 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
              {guard ? (
                <div role="alert" className="flex flex-col gap-3">
                  <div className="flex items-start gap-2.5">
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" aria-hidden />
                    <div className="qx-small">
                      <p className="font-semibold text-fg">{copy.leaveTitle}</p>
                      <p className="text-fg-muted">{copy.leaveBody}</p>
                    </div>
                  </div>
                  <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                    <Button type="button" variant="outline" className="text-danger" onClick={discardAndClose}>
                      {copy.discardAndClose}
                    </Button>
                    <Button ref={keepEditingRef} type="button" onClick={() => setGuard(false)}>
                      {copy.keepEditing}
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center">
                  {footerStart && <div className="sm:mr-auto">{footerStart}</div>}
                  <div className="flex flex-col-reverse gap-2 sm:ml-auto sm:flex-row">
                    <Button type="button" variant="outline" disabled={isSubmitting} onClick={requestClose}>
                      {cancelLabel ?? copy.cancel}
                    </Button>
                    <SubmitButton disableWhenPristine={pristineLock}>
                      {submitLabel ?? (mode === 'create' ? copy.create : copy.save)}
                    </SubmitButton>
                  </div>
                </div>
              )}
            </div>
          </Form>
        )}
      </SheetContent>
    </Sheet>
  );
}
