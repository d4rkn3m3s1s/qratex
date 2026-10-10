'use client';

import { useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { CustomerSettingsSnapshot } from '@/lib/customer-settings/contract';
import { settingsKeys } from './api';

/**
 * Ayarlar önbelleğine yerel (iyimser) güncelleme + sunucudan tazeleme. Bölümler kendi
 * mutasyonlarından sonra yalnız ilgili dalı değiştirir; başarısızlıkta eski değeri geri yazar.
 */
export function useSettingsCache() {
  const qc = useQueryClient();
  const patch = useCallback(
    (fn: (prev: CustomerSettingsSnapshot) => CustomerSettingsSnapshot) => {
      qc.setQueryData<CustomerSettingsSnapshot>(settingsKeys.snapshot, (old) => (old ? fn(old) : old));
    },
    [qc],
  );
  const refresh = useCallback(() => qc.invalidateQueries({ queryKey: settingsKeys.snapshot }), [qc]);
  const read = useCallback(() => qc.getQueryData<CustomerSettingsSnapshot>(settingsKeys.snapshot), [qc]);
  return { patch, refresh, read };
}
