'use client';

import { useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { SquadApiError, squadKeys } from './api';
import { squadErrorText, useKlanLocale } from './copy';

/** Hata → yerel metin (kodlu klan hataları çevrilir; diğerleri sunucunun Türkçe mesajı). */
export function useErrorText() {
  const { locale } = useKlanLocale();
  return useCallback(
    (err: unknown): string => {
      if (err instanceof SquadApiError) return squadErrorText(locale, err.code, err.message);
      if (err instanceof Error && err.message) return err.message;
      return locale === 'en' ? 'Something went wrong. Please try again.' : 'Bir şeyler ters gitti. Lütfen tekrar dene.';
    },
    [locale]
  );
}

/** Yazma sonrası klan verisini tazele (özet + savaş + geçmiş). */
export function useRefreshSquad() {
  const qc = useQueryClient();
  return useCallback(async () => {
    await Promise.all([
      qc.invalidateQueries({ queryKey: squadKeys.overview }),
      qc.invalidateQueries({ queryKey: squadKeys.battle }),
      qc.invalidateQueries({ queryKey: squadKeys.history }),
    ]);
  }, [qc]);
}

/**
 * ConfirmAction `onConfirm` sarmalayıcısı: işlem başarısızsa diyalog açık kalır ve yerel
 * hata metni gösterilir; başarıda tost + tazeleme.
 */
export function useConfirmRunner() {
  const errorText = useErrorText();
  const refresh = useRefreshSquad();
  return useCallback(
    async <T,>(fn: () => Promise<T>, success?: (r: T) => string | null) => {
      let r: T;
      try {
        r = await fn();
      } catch (err) {
        throw new Error(errorText(err));
      }
      const msg = success?.(r);
      if (msg) toast.success(msg);
      await refresh();
      return r;
    },
    [errorText, refresh]
  );
}
