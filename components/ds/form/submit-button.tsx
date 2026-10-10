'use client';

import * as React from 'react';
import { useFormStatus } from 'react-dom';
import { useFormState, type Control, type FieldValues } from 'react-hook-form';
import { Button, type ButtonProps } from '@/components/ui/button';
import { useFormMeta, useOptionalFormContext } from './form';

export type SubmitButtonProps = Omit<ButtonProps, 'type' | 'loading'> & {
  /**
   * Bekleme durumu. Verilmezse otomatik: en yakın `<Form>`'un `isSubmitting`'i ya da
   * (server action formunda) React `useFormStatus().pending`.
   */
  pending?: boolean;
  /** Bekleme sırasında etiket (varsayılan: etiket korunur + dönen gösterge). */
  pendingLabel?: React.ReactNode;
  /** Form değişmemişken devre dışı (düzenleme ekranları). */
  disableWhenPristine?: boolean;
  /** Formun dışına konduğunda bağlanacak form id'si (varsayılan: en yakın `<Form>`). */
  form?: string;
};

/**
 * Gönder düğmesi — bekleme durumunda devre dışı + `aria-busy` + gösterge; etiket korunur
 * (buton genişliği zıplamaz). Çift gönderimi önler.
 *
 *   <SubmitButton>Kaydet</SubmitButton>
 *   <SubmitButton disableWhenPristine pendingLabel="Kaydediliyor…">Kaydet</SubmitButton>
 */
export const SubmitButton = React.forwardRef<HTMLButtonElement, SubmitButtonProps>((props, ref) => {
  const ctx = useOptionalFormContext();
  if (ctx) return <ConnectedSubmitButton {...props} control={ctx.control} ref={ref} />;
  return <PlainSubmitButton {...props} ref={ref} />;
});
SubmitButton.displayName = 'SubmitButton';

const PlainSubmitButton = React.forwardRef<HTMLButtonElement, SubmitButtonProps & { rhfPending?: boolean; rhfPristine?: boolean }>(
  ({ pending, pendingLabel, disableWhenPristine, rhfPending, rhfPristine, form, children, disabled, ...rest }, ref) => {
    const status = useFormStatus();
    const meta = useFormMeta();
    const isPending = pending ?? (rhfPending || status.pending);
    return (
      <Button
        ref={ref}
        type="submit"
        form={form ?? meta?.formId}
        loading={isPending}
        disabled={disabled || (disableWhenPristine && rhfPristine)}
        {...rest}
      >
        {isPending && pendingLabel ? pendingLabel : children}
      </Button>
    );
  },
);
PlainSubmitButton.displayName = 'PlainSubmitButton';

const ConnectedSubmitButton = React.forwardRef<HTMLButtonElement, SubmitButtonProps & { control: Control<FieldValues> }>(
  ({ control, ...props }, ref) => {
    const { isSubmitting, isDirty } = useFormState({ control });
    return <PlainSubmitButton {...props} ref={ref} rhfPending={isSubmitting} rhfPristine={!isDirty} />;
  },
);
ConnectedSubmitButton.displayName = 'ConnectedSubmitButton';
