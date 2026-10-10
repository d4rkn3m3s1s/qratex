'use client';

import { createContext, useContext, type ReactNode } from 'react';
import { getOffersCopy, type OffersCopy, type OffersLocale } from './copy';

const OffersCtx = createContext<{ locale: OffersLocale; copy: OffersCopy }>({ locale: 'tr', copy: getOffersCopy('tr') });

export function OffersCopyProvider({ locale, children }: { locale: OffersLocale; children: ReactNode }) {
  return <OffersCtx.Provider value={{ locale, copy: getOffersCopy(locale) }}>{children}</OffersCtx.Provider>;
}

export function useOffersCopy(): OffersCopy {
  return useContext(OffersCtx).copy;
}

export function useOffersLocale(): OffersLocale {
  return useContext(OffersCtx).locale;
}
