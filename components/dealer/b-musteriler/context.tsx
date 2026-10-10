'use client';

import { createContext, useContext } from 'react';
import type { ComposerRequest } from './action-composer';

export type CustomersActions = {
  /** Önizle-gönder penceresini açar (yalnız işletme sahibi). */
  compose: (req: ComposerRequest) => void;
  /** 360 çekmecesini açar (`?id=`). */
  openCustomer: (ref: string) => void;
  /** Gönderim yetkisi (işletme sahibi). */
  canSend: boolean;
};

const Ctx = createContext<CustomersActions | null>(null);

export const CustomersActionsProvider = Ctx.Provider;

export function useCustomersActions(): CustomersActions {
  const v = useContext(Ctx);
  if (!v) throw new Error('useCustomersActions: CustomersActionsProvider eksik');
  return v;
}
