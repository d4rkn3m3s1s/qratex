'use client';

import { useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { AiPatch, DealerSettingsSnapshot } from '@/lib/dealer-settings/contract';
import { SETTINGS_KEY, SettingsApiError, fetchSettings, patchAi } from './api';

/**
 * AI politikası yazımı (AI ve Bildirimler sekmeleri ortak). Güncel sürüm önbellekten okunur;
 * yanıt önbelleğe işlenir. 409'da güncel hâl yüklenir ve anlaşılır hata fırlatılır.
 */
export function useAiPatch() {
  const queryClient = useQueryClient();
  return useCallback(
    async (patch: Omit<AiPatch, 'baseVersion'>) => {
      const snap = queryClient.getQueryData<DealerSettingsSnapshot>(SETTINGS_KEY);
      const baseVersion = snap?.ai.settings.version ?? 'none';
      try {
        const view = await patchAi({ ...patch, baseVersion });
        queryClient.setQueryData<DealerSettingsSnapshot>(SETTINGS_KEY, (old) => (old ? { ...old, ai: { ...old.ai, settings: view } } : old));
        return view;
      } catch (e) {
        if (e instanceof SettingsApiError && e.status === 409) {
          await queryClient.fetchQuery({ queryKey: SETTINGS_KEY, queryFn: () => fetchSettings(), staleTime: 0 }).catch(() => undefined);
          throw new SettingsApiError(409, 'Ayarlar başka bir oturumda değişti. Güncel hâli yüklendi; tekrar deneyin.', e.code, e.details, false);
        }
        throw e;
      }
    },
    [queryClient]
  );
}
