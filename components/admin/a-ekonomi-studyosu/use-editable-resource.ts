'use client';

/**
 * Sunucuda ön yüklenmiş, sürümlü, düzenlenebilir kaynak (C2 yükleme kilidi + baseVersion).
 *
 *   ready   → taslak düzenlenebilir; kaydet `baseVersion` taşır, 409'da çakışma durumu.
 *   loading → yeniden yükleniyor; form gizli (eski veriyle düzenleme yok).
 *   error   → sunucu ön yüklemesi ya da yeniden yükleme başarısız; form YOK, "Tekrar dene".
 *
 * İstemcide varsayılan kopya yoktur: veri yalnız sunucudan (değer + sürüm) gelir.
 * Taslaklar sekmeler arasında korunur (kanca sekme dışındaki merkez bileşende yaşar).
 */
import { useCallback, useMemo, useRef, useState } from 'react';
import { signatureOf, type SaveVersionedResult } from '@/lib/versioned-resource';
import { useUnsavedChangesGuard } from '@/hooks/use-versioned-resource';

export type EditableStatus = 'ready' | 'loading' | 'error';

export type SaveOutcome = 'ok' | 'conflict' | 'error';

export type EditableConflict = { message: string; currentVersion: string | null };

export function useEditableResource<D, M = undefined>(opts: {
  initial: { data: D; meta: M; version: string } | null;
  load: () => Promise<{ data: D; meta: M; version: string }>;
  save: (draft: D, baseVersion: string) => Promise<SaveVersionedResult>;
  /** Başarılı kaydetme gövdesinden kaydedilen veri + yeni sürüm. */
  parse: (body: Record<string, unknown>) => { data: D; version: string };
  initialError?: string;
}) {
  const [status, setStatus] = useState<EditableStatus>(opts.initial ? 'ready' : 'error');
  const [error, setError] = useState<unknown>(
    opts.initial ? null : new Error(opts.initialError ?? 'Veriler sunucudan okunamadı. Kayıtlı değerler değişmedi.')
  );
  const [baseline, setBaseline] = useState<D | null>(opts.initial?.data ?? null);
  const [draft, setDraftState] = useState<D | null>(opts.initial?.data ?? null);
  const [meta, setMeta] = useState<M | null>(opts.initial ? opts.initial.meta : null);
  const [version, setVersion] = useState<string | null>(opts.initial?.version ?? null);
  const [saving, setSaving] = useState(false);
  const [conflict, setConflict] = useState<EditableConflict | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const reqId = useRef(0);
  const optsRef = useRef(opts);
  optsRef.current = opts;

  const dirty = useMemo(
    () => status === 'ready' && draft !== null && baseline !== null && signatureOf(draft) !== signatureOf(baseline),
    [status, draft, baseline]
  );
  useUnsavedChangesGuard(dirty);

  const reload = useCallback(async () => {
    const id = ++reqId.current;
    setStatus('loading');
    setConflict(null);
    setSaveError(null);
    try {
      const res = await optsRef.current.load();
      if (id !== reqId.current) return;
      if (!res.version) throw new Error('Sunucu sürüm bilgisi döndürmedi; güvenlik için düzenleme kilitli.');
      setBaseline(res.data);
      setDraftState(res.data);
      setMeta(res.meta);
      setVersion(res.version);
      setError(null);
      setStatus('ready');
    } catch (err) {
      if (id !== reqId.current) return;
      setBaseline(null);
      setDraftState(null);
      setVersion(null);
      setError(err);
      setStatus('error');
    }
  }, []);

  const setDraft = useCallback((updater: (prev: D) => D) => {
    setDraftState((prev) => (prev === null ? prev : updater(prev)));
    setSaveError(null);
  }, []);

  const save = useCallback(
    async (o?: { overwrite?: boolean }): Promise<SaveOutcome> => {
      if (status !== 'ready' || draft === null || !version) return 'error';
      const base = o?.overwrite && conflict?.currentVersion ? conflict.currentVersion : version;
      setSaving(true);
      setSaveError(null);
      try {
        const result = await optsRef.current.save(draft, base);
        if (!result.ok) {
          setConflict({ message: result.message, currentVersion: result.currentVersion });
          return 'conflict';
        }
        const next = optsRef.current.parse(result.body);
        setBaseline(next.data);
        setDraftState(next.data);
        setVersion(next.version);
        setConflict(null);
        return 'ok';
      } catch (err) {
        setSaveError(err instanceof Error ? err.message : 'Kaydedilemedi');
        return 'error';
      } finally {
        setSaving(false);
      }
    },
    [status, draft, version, conflict]
  );

  const discard = useCallback(() => {
    setDraftState(baseline);
    setSaveError(null);
  }, [baseline]);

  /** Geçmişteki bir sürümü TASLAĞA yükler (kaydetmez; gözden geçirip yayınlanır). */
  const loadIntoDraft = useCallback((data: D) => {
    setDraftState(data);
    setSaveError(null);
  }, []);

  return {
    status,
    error,
    baseline,
    draft,
    meta,
    setMeta,
    version,
    dirty,
    saving,
    conflict,
    saveError,
    reload,
    setDraft,
    save,
    discard,
    loadIntoDraft,
    clearConflict: () => setConflict(null),
  };
}

export type EditableResource<D, M = undefined> = ReturnType<typeof useEditableResource<D, M>>;
