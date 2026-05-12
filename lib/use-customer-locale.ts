'use client';

import { useAppLocale, useAppT } from '@/lib/app-locale';

export function useCustomerLocale() {
  return useAppLocale().locale;
}

export function useCustomerT() {
  return useAppT();
}
