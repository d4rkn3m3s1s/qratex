'use client';

/**
 * Ayar ekranları için `idle → loading → ready | error` durum makinesi (P0-28 / K4).
 * Saf mantık: `lib/versioned-resource.ts`.
 *
 *   const res = useVersionedResource(async () => {
 *     const body = await fetchResourceJson('/api/admin/settings/leagues', 'Lig ayarları alınamadı');
 *     return { data: body.rules as LeagueRule[], version: requireVersion(body) };
 *   });
 *
 *   <QueryState query={res.query} skeleton="form">{(rules) => <Form initial={rules} … />}</QueryState>
 *
 * Kaydetmede `res.version` `baseVersion` olarak gönderilir; başarıda `res.commit(data, version)`.
 */
import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import {
  initialResourceState,
  isEditable,
  resourceReducer,
  signatureOf,
  toQueryLike,
  type ResourceAction,
  type ResourceState,
  type SaveVersionedResult,
} from '@/lib/versioned-resource';

export type VersionedLoadResult<T> = { data: T; version: string };

export function useVersionedResource<T>(load: () => Promise<VersionedLoadResult<T>>) {
  const [state, dispatch] = useReducer(
    resourceReducer as (s: ResourceState<T>, a: ResourceAction<T>) => ResourceState<T>,
    undefined,
    () => initialResourceState<T>()
  );
  const loadRef = useRef(load);
  loadRef.current = load;
  const counter = useRef(0);

  const reload = useCallback(async () => {
    const requestId = ++counter.current;
    dispatch({ type: 'load', requestId });
    try {
      const result = await loadRef.current();
      dispatch({ type: 'loaded', requestId, data: result.data, version: result.version });
    } catch (error) {
      dispatch({ type: 'failed', requestId, error });
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  const commit = useCallback((data: T, version: string) => {
    dispatch({ type: 'committed', data, version });
  }, []);

  const query = useMemo(() => toQueryLike(state, reload), [state, reload]);

  return {
    status: state.status,
    data: state.data,
    version: state.version,
    error: state.error,
    editable: isEditable(state),
    /** Her yeniden yüklemede değişir — form bileşenini `key={loadId}` ile yeniden kurmak için. */
    loadId: state.requestId,
    reload,
    commit,
    query,
  };
}

/** Kaydedilmemiş değişiklik varken sekme kapatma/yenileme uyarısı. */
export function useUnsavedChangesGuard(dirty: boolean) {
  useEffect(() => {
    if (!dirty || typeof window === 'undefined') return;
    const handler = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [dirty]);
}

export type VersionConflictState = { message: string; currentVersion: string | null };

export type UseVersionedDraftOptions<T> = {
  /** Sunucudan gelen (ready) veri — form YALNIZ bununla başlar; istemci varsayılanı yok. */
  initial: T;
  initialVersion: string;
  /** Kaydetme isteği: taslak + baseVersion → `saveVersioned(...)` sonucu. */
  request: (draft: T, baseVersion: string) => Promise<SaveVersionedResult>;
  /** Başarılı yanıttan kaydedilen veriyi ve yeni sürümü çıkarır. */
  parse: (body: Record<string, unknown>) => { data: T; version: string };
  onSaved?: (data: T, version: string) => void;
  onError?: (error: unknown) => void;
};

/**
 * `ready` bir kaynağın düzenleme taslağı: kirli tespiti, kaydedilmemiş değişiklik uyarısı,
 * `baseVersion` ile kaydetme ve 409 çakışma durumu.
 */
export function useVersionedDraft<T>({ initial, initialVersion, request, parse, onSaved, onError }: UseVersionedDraftOptions<T>) {
  const [draft, setDraft] = useState<T>(initial);
  const [baseline, setBaseline] = useState<T>(initial);
  const [version, setVersion] = useState(initialVersion);
  const [saving, setSaving] = useState(false);
  const [conflict, setConflict] = useState<VersionConflictState | null>(null);

  const baselineSignature = useMemo(() => signatureOf(baseline), [baseline]);
  const dirty = useMemo(() => signatureOf(draft) !== baselineSignature, [draft, baselineSignature]);
  useUnsavedChangesGuard(dirty);

  const save = useCallback(
    async (opts?: { overwrite?: boolean }): Promise<boolean> => {
      // "Yine de kaydet": sunucunun bildirdiği güncel sürümün ÜZERİNE bilerek yazar.
      const baseVersion = opts?.overwrite && conflict?.currentVersion ? conflict.currentVersion : version;
      setSaving(true);
      try {
        const result = await request(draft, baseVersion);
        if (!result.ok) {
          setConflict({ message: result.message, currentVersion: result.currentVersion });
          return false;
        }
        const next = parse(result.body);
        setBaseline(next.data);
        setDraft(next.data);
        setVersion(next.version);
        setConflict(null);
        onSaved?.(next.data, next.version);
        return true;
      } catch (error) {
        onError?.(error);
        return false;
      } finally {
        setSaving(false);
      }
    },
    [conflict, version, request, draft, parse, onSaved, onError]
  );

  const reset = useCallback(() => setDraft(baseline), [baseline]);

  return { draft, setDraft, baseline, version, dirty, saving, conflict, save, reset, clearConflict: () => setConflict(null) };
}
