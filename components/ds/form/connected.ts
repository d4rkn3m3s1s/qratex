'use client';

import type * as React from 'react';
import type { Control, FieldError, FieldPath, FieldValues, UseControllerProps } from 'react-hook-form';
import type { FieldProps } from './field';

/**
 * RHF'ye bağlı alanların ortak props'u.
 * `control` verilirse alan adları tiplenir (`name` yanlış yazılırsa derlenmez):
 *   <TextField control={form.control} name="email" … />
 * Verilmezse en yakın `<Form>` bağlamı kullanılır (`name: string`).
 */
export type ConnectedFieldProps<T extends FieldValues, N extends FieldPath<T>> = Pick<
  FieldProps,
  'label' | 'description' | 'required' | 'optional' | 'hideLabel' | 'layout' | 'disabled' | 'labelAside' | 'className' | 'id'
> & {
  name: N;
  control?: Control<T>;
  /** Ek RHF kuralları (doğrulama zod şemasında olmalı; bu yalnız istisna). */
  rules?: UseControllerProps<T, N>['rules'];
};

/** Alan hatasının mesajı (iç içe nesnelerde ilk mesaj). */
export function errorMessageOf(error: unknown): string | undefined {
  if (!error || typeof error !== 'object') return undefined;
  const e = error as FieldError & Record<string, unknown>;
  if (typeof e.message === 'string' && e.message) return e.message;
  for (const v of Object.values(e)) {
    if (v && typeof v === 'object' && 'message' in (v as object)) {
      const m = (v as { message?: unknown }).message;
      if (typeof m === 'string' && m) return m;
    }
  }
  return undefined;
}

/** Ref birleştirme (RHF `field.ref` + dış ref). */
export function mergeRefs<E>(...refs: Array<React.Ref<E> | undefined>): React.RefCallback<E> {
  return (node: E | null) => {
    for (const ref of refs) {
      if (!ref) continue;
      if (typeof ref === 'function') ref(node);
      else (ref as React.MutableRefObject<E | null>).current = node;
    }
  };
}
