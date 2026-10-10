'use client';

import * as React from 'react';
import {
  FormProvider,
  useForm,
  useFormContext,
  useFormState,
  type FieldValues,
  type SubmitErrorHandler,
  type UseFormProps,
  type UseFormReturn,
} from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import type { z } from 'zod';
import { RotateCw } from 'lucide-react';
import { cn } from '@/lib/utils';
import { InlineError } from '@/components/states';
import { Button } from '@/components/ui/button';
import { applyServerErrors, type ServerErrorInfo } from './server-errors';
import { useFormCopy } from './copy';

/* ─────────────────────────────────────────────────────────────
   useZodForm — paylaşılan zod şemasıyla RHF
───────────────────────────────────────────────────────────── */

/**
 * Zod şemasıyla form. Şema sunucu rotasıyla (defineRoute) PAYLAŞILIR — istemci ve
 * sunucu aynı kuralı uygular. Varsayılan `mode: 'onTouched'` (alan terk edilince
 * doğrular, sonra her değişimde): yazarken erken hata göstermez.
 *
 *   // lib/schemas/campaign.ts  (sunucu da import eder)
 *   export const campaignSchema = z.object({ name: z.string().min(2), budget: z.number().int().min(0) });
 *
 *   const form = useZodForm(campaignSchema, { defaultValues: { name: '', budget: 0 } });
 */
export function useZodForm<TValues extends FieldValues>(
  schema: z.ZodType<TValues, z.ZodTypeDef, unknown>,
  options?: Omit<UseFormProps<TValues>, 'resolver'>,
): UseFormReturn<TValues> {
  return useForm<TValues>({ mode: 'onTouched', ...options, resolver: zodResolver(schema) });
}

/* ─────────────────────────────────────────────────────────────
   Form meta bağlamı (form id → dışarıdaki SubmitButton/DirtyBar)
───────────────────────────────────────────────────────────── */

type FormMeta = { formId: string };
const FormMetaContext = React.createContext<FormMeta | null>(null);

/** En yakın `<Form>`'un id'si (form dışına konan gönder düğmesi `form={id}` ile bağlanır). */
export function useFormMeta(): FormMeta | null {
  return React.useContext(FormMetaContext);
}

/**
 * RHF bağlamı varsa döndürür, yoksa `null` (useFormContext sağlayıcı yokken null verir,
 * ama tipi bunu söylemez).
 */
export function useOptionalFormContext<T extends FieldValues = FieldValues>(): UseFormReturn<T> | null {
  return (useFormContext<T>() as UseFormReturn<T> | null) ?? null;
}

/* ─────────────────────────────────────────────────────────────
   <Form>
───────────────────────────────────────────────────────────── */

export type FormProps<T extends FieldValues> = Omit<React.FormHTMLAttributes<HTMLFormElement>, 'onSubmit' | 'children'> & {
  form: UseFormReturn<T>;
  /**
   * Geçerli değerlerle çağrılır. Fırlatırsa hata forma yazılır (alan hataları alana,
   * genel mesaj `root.server`'a, 409 sürüm çakışması `root.conflict`'e) — form AÇIK ve
   * değerler YERİNDE kalır.
   */
  onSubmit: (values: T, event?: React.BaseSyntheticEvent) => unknown | Promise<unknown>;
  onInvalid?: SubmitErrorHandler<T>;
  /** Hata forma uygulandıktan sonra (toast, telemetri). */
  onServerError?: (info: ServerErrorInfo, error: unknown) => void;
  /** `false` → hatayı forma uygulamak yerine yukarı fırlat. */
  handleServerErrors?: boolean;
  /**
   * Başarıdan sonra formu sıfırla → `isDirty` false olur (DirtyBar kaybolur).
   * `true` (varsayılan): mevcut değerlerle. Fonksiyon: sunucu yanıtından yeni değerler
   * (ör. yeni `version` alanı) üretin.
   */
  resetOnSuccess?: boolean | ((result: unknown, submitted: T) => T);
  children: React.ReactNode;
};

/**
 * RHF + zod formu. `noValidate`: tarayıcı balonları yerine erişilebilir satır içi hatalar;
 * geçersiz gönderimde ilk hatalı alana odaklanır (RHF `shouldFocusError`).
 *
 *   <Form form={form} onSubmit={(v) => api.campaigns.update(id, { ...v, baseVersion })}>
 *     <TextField name="name" label="Kampanya adı" required />
 *     <FormRootError />
 *     <SubmitButton>Kaydet</SubmitButton>
 *   </Form>
 */
export function Form<T extends FieldValues>({
  form,
  onSubmit,
  onInvalid,
  onServerError,
  handleServerErrors = true,
  resetOnSuccess = true,
  children,
  id,
  className,
  ...props
}: FormProps<T>) {
  const autoId = React.useId();
  const formId = id ?? `form-${autoId.replace(/:/g, '')}`;
  const copy = useFormCopy();
  const meta = React.useMemo(() => ({ formId }), [formId]);

  const submit = form.handleSubmit(async (values, event) => {
    let result: unknown;
    try {
      result = await onSubmit(values, event);
    } catch (error) {
      if (!handleServerErrors) throw error;
      const info = applyServerErrors(form, error, copy.saveFailed);
      onServerError?.(info, error);
      return;
    }
    if (resetOnSuccess === true) form.reset(form.getValues());
    else if (typeof resetOnSuccess === 'function') form.reset(resetOnSuccess(result, values));
  }, onInvalid);

  return (
    <FormProvider {...form}>
      <FormMetaContext.Provider value={meta}>
        <form
          id={formId}
          noValidate
          onSubmit={(event) => {
            // İç içe formlarda (ör. sayfa formu içindeki çekmece) olay dış forma sızmasın.
            event.stopPropagation();
            void submit(event);
          }}
          className={className}
          {...props}
        >
          {children}
        </form>
      </FormMetaContext.Provider>
    </FormProvider>
  );
}

/* ─────────────────────────────────────────────────────────────
   <FormRootError>
───────────────────────────────────────────────────────────── */

export type FormRootErrorProps = {
  /** 409 sürüm çakışmasını da göster (DirtyBar kullanmayan formlar, çekmeceler). */
  showConflict?: boolean;
  /** Çakışmada "Güncel hali yükle" eylemi. */
  onReloadLatest?: () => unknown;
  className?: string;
};

/**
 * Formun genel (alan dışı) sunucu hatası — bant olarak. Çakışma `showConflict` ile.
 * `<Form>` içinde kullanılır.
 */
export function FormRootError({ showConflict = false, onReloadLatest, className }: FormRootErrorProps) {
  const copy = useFormCopy();
  const ctx = useOptionalFormContext();
  if (!ctx) return null;
  return <FormRootErrorInner control={ctx.control} showConflict={showConflict} onReloadLatest={onReloadLatest} className={className} copy={copy} />;
}

function FormRootErrorInner({
  control,
  showConflict,
  onReloadLatest,
  className,
  copy,
}: FormRootErrorProps & { control: UseFormReturn['control']; copy: ReturnType<typeof useFormCopy> }) {
  const { errors } = useFormState({ control });
  const root = errors.root as Record<string, { message?: string } | undefined> | undefined;
  const server = root?.server?.message;
  const conflict = root?.conflict;
  return (
    <div className={cn('space-y-2 empty:hidden', className)}>
      {showConflict && conflict && (
        <InlineError variant="banner" tone="warning">
          <p className="font-semibold text-fg">{copy.conflictTitle}</p>
          <p className="mt-0.5 text-fg-muted">{copy.conflictBody}</p>
          {onReloadLatest && (
            <Button type="button" variant="outline" size="sm" className="mt-2" onClick={() => void onReloadLatest()}>
              <RotateCw className="h-4 w-4" aria-hidden />
              {copy.reloadLatest}
            </Button>
          )}
        </InlineError>
      )}
      {server && <InlineError variant="banner">{server}</InlineError>}
    </div>
  );
}
