'use client';

import { useMutation, useQueryClient, type InfiniteData, type QueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { announce } from '@/components/ds/a11y';
import type { DealsResponse, NearbyResponse, SavedResponse, TopResponse } from '@/lib/places/types';
import { placesKeys, setSaved } from './api';
import { usePlacesCopy } from './copy';

type Vars = { dealerId: string; name: string; saved: boolean; silent?: boolean };

/** Tüm Keşfet önbelleklerinde "kayıtlı" bayrağını iyimser günceller (tek doğruluk: sunucu). */
function patchCaches(qc: QueryClient, dealerId: string, saved: boolean): void {
  for (const [key, data] of qc.getQueriesData({ queryKey: placesKeys.all })) {
    if (!data) continue;
    const kind = key[2];
    if (kind === 'nearby') {
      const d = data as InfiniteData<NearbyResponse>;
      qc.setQueryData(key, {
        ...d,
        pages: d.pages.map((p) => ({ ...p, items: p.items.map((i) => (i.dealerId === dealerId ? { ...i, isSaved: saved } : i)) })),
      });
    } else if (kind === 'saved') {
      const d = data as SavedResponse;
      if (!saved) qc.setQueryData(key, { ...d, items: d.items.filter((i) => i.dealerId !== dealerId) });
    } else if (kind === 'top') {
      const d = data as TopResponse;
      qc.setQueryData(key, { ...d, entries: d.entries.map((e) => (e.dealerId === dealerId ? { ...e, isSaved: saved } : e)) });
    } else if (kind === 'deals') {
      const d = data as DealsResponse;
      const set = new Set(d.savedDealerIds);
      if (saved) set.add(dealerId);
      else set.delete(dealerId);
      qc.setQueryData(key, { ...d, savedDealerIds: [...set] });
    }
  }
}

/**
 * Kaydet / çıkar — iyimser, hata olursa geri alınır; çıkarmada "Geri al" eylemli bildirim.
 * Ana sayfadaki "Favorilerim" şeridi aynı tabloyu okuduğu için onun önbelleği de tazelenir.
 */
export function useSaveToggle() {
  const qc = useQueryClient();
  const { copy } = usePlacesCopy();
  const mutation = useMutation({
    mutationFn: (v: Vars) => setSaved(v.dealerId, v.saved),
    onMutate: async (v) => {
      await qc.cancelQueries({ queryKey: placesKeys.all });
      const snapshot = qc.getQueriesData({ queryKey: placesKeys.all });
      patchCaches(qc, v.dealerId, v.saved);
      return { snapshot };
    },
    onError: (err, _v, ctx) => {
      ctx?.snapshot.forEach(([key, data]) => qc.setQueryData(key, data));
      toast.error(err instanceof Error && err.message ? err.message : copy.saveError);
    },
    onSuccess: (_r, v) => {
      if (v.silent) return;
      if (v.saved) {
        announce(`${v.name}: ${copy.saved}`);
      } else {
        toast(`${v.name}: ${copy.removed}`, {
          action: { label: copy.undo, onClick: () => mutation.mutate({ ...v, saved: true, silent: true }) },
        });
      }
    },
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: ['customer', 'places', 'saved'] });
      void qc.invalidateQueries({ queryKey: ['customer', 'places', 'deals'] });
      void qc.invalidateQueries({ queryKey: ['customer', 'favorites'] });
      void qc.invalidateQueries({ queryKey: ['customer', 'dashboard'] });
    },
  });
  return {
    toggle: (dealerId: string, name: string, next: boolean) => mutation.mutate({ dealerId, name, saved: next }),
    pendingId: mutation.isPending ? mutation.variables?.dealerId ?? null : null,
  };
}
