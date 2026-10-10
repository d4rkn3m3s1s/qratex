'use client';

import { useCallback, useEffect, useMemo, useRef, useTransition } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';

/**
 * URL durum yardımcıları — FilterBar, SectionTabs, DetailSheet ve DataTable
 * (sayfalama/sıralama) durumu sorgu dizgisinde tutar: paylaşılabilir link,
 * geri tuşu ve yenileme sonrası aynı görünüm.
 *
 * ÖNEMLİ (Next 16): `useSearchParams` kullanan istemci bileşeni statik
 * üretilen bir rotada `<Suspense>` sınırı ister. ds bileşenleri bunu kendi
 * içinde yapar; bu kancayı doğrudan kullanan sayfa kendisi sarmalamalıdır.
 */

import { mergeSearchParams, readList, type MergeOptions, type UrlPatch } from './url-params';

export { mergeSearchParams, readList, type MergeOptions, type UrlPatch, type UrlPatchValue } from './url-params';

export type SetUrlStateOptions = MergeOptions & {
  /** `replace` (varsayılan): geçmişi kirletmez. `push`: geri tuşu önceki duruma döner. */
  history?: 'replace' | 'push';
  scroll?: boolean;
};

export type UrlStateApi = {
  searchParams: URLSearchParams;
  get: (key: string) => string | null;
  getList: (key: string) => string[];
  set: (patch: UrlPatch, opts?: SetUrlStateOptions) => void;
  /** URL geçişi sürüyor (sunucu bileşeni yeniden render ediliyor). */
  isPending: boolean;
};

const EMPTY = '';

/**
 * Sorgu dizgisini okuyup yazan kanca. Aynı tikte arka arkaya gelen
 * `set` çağrıları birleştirilir (ikinci çağrı birincinin değişikliğini ezmez).
 */
export function useUrlState(defaults: SetUrlStateOptions = {}): UrlStateApi {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const current = sp?.toString() ?? EMPTY;
  const [isPending, startTransition] = useTransition();
  const pendingRef = useRef<string | null>(null);
  const defaultsRef = useRef(defaults);

  useEffect(() => {
    defaultsRef.current = defaults;
  });

  useEffect(() => {
    pendingRef.current = null;
  }, [current]);

  const searchParams = useMemo(() => new URLSearchParams(current), [current]);

  const set = useCallback(
    (patch: UrlPatch, opts: SetUrlStateOptions = {}) => {
      const o = { ...defaultsRef.current, ...opts };
      const base = pendingRef.current ?? current;
      const qs = mergeSearchParams(base, patch, o);
      if (qs === base) return;
      pendingRef.current = qs;
      const href = `${pathname ?? ''}${qs ? `?${qs}` : ''}`;
      startTransition(() => {
        if (o.history === 'push') router.push(href, { scroll: o.scroll ?? false });
        else router.replace(href, { scroll: o.scroll ?? false });
      });
    },
    [current, pathname, router],
  );

  const get = useCallback((key: string) => searchParams.get(key), [searchParams]);
  const getList = useCallback((key: string) => readList(searchParams.get(key)), [searchParams]);

  return { searchParams, get, getList, set, isPending };
}
