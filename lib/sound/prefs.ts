/**
 * Arayüz sesi tercihleri — saf mantık (DOM'suz test edilebilir).
 *
 * Kapsam (scope) URL'den türer: müşteri yüzü varsayılan AÇIK (düşük seviye),
 * bayi/admin varsayılan KAPALI (iş aracı; ofiste ses beklenmez). Tercih kapsam
 * başına localStorage'da saklanır; böylece aynı cihazda admin sesi kapatmak
 * müşteri deneyimini etkilemez.
 */
export type SoundScope = 'customer' | 'dealer' | 'admin';

export interface SoundPrefs {
  enabled: boolean;
  /** 0..1 — ana ses seviyesi (sentez kazancıyla çarpılır). */
  volume: number;
}

export const SOUND_STORAGE_PREFIX = 'qratex-sound:';
export const SOUND_PREFS_EVENT = 'qratex-sound-prefs';

export const DEFAULT_SOUND_PREFS: Record<SoundScope, SoundPrefs> = {
  customer: { enabled: true, volume: 0.35 },
  dealer: { enabled: false, volume: 0.35 },
  admin: { enabled: false, volume: 0.35 },
};

export function scopeFromPath(pathname: string | null | undefined): SoundScope {
  const p = pathname ?? '';
  if (p === '/admin' || p.startsWith('/admin/')) return 'admin';
  if (p === '/dealer' || p.startsWith('/dealer/')) return 'dealer';
  return 'customer';
}

function clamp01(n: unknown, fallback: number): number {
  return typeof n === 'number' && Number.isFinite(n) ? Math.min(1, Math.max(0, n)) : fallback;
}

/** Ham localStorage değerini doğrular; bozuk/eksik alan varsayılana düşer. */
export function parseSoundPrefs(raw: string | null, scope: SoundScope): SoundPrefs {
  const def = DEFAULT_SOUND_PREFS[scope];
  if (!raw) return { ...def };
  try {
    const v = JSON.parse(raw) as Partial<SoundPrefs> | null;
    if (!v || typeof v !== 'object') return { ...def };
    return {
      enabled: typeof v.enabled === 'boolean' ? v.enabled : def.enabled,
      volume: clamp01(v.volume, def.volume),
    };
  } catch {
    return { ...def };
  }
}

type StorageLike = Pick<Storage, 'getItem' | 'setItem'>;

function storage(): StorageLike | null {
  try {
    return typeof window !== 'undefined' ? window.localStorage : null;
  } catch {
    return null;
  }
}

export function readSoundPrefs(scope: SoundScope, store: StorageLike | null = storage()): SoundPrefs {
  try {
    return parseSoundPrefs(store?.getItem(SOUND_STORAGE_PREFIX + scope) ?? null, scope);
  } catch {
    return { ...DEFAULT_SOUND_PREFS[scope] };
  }
}

export function writeSoundPrefs(scope: SoundScope, prefs: SoundPrefs, store: StorageLike | null = storage()): void {
  try {
    store?.setItem(SOUND_STORAGE_PREFIX + scope, JSON.stringify({ enabled: !!prefs.enabled, volume: clamp01(prefs.volume, 0.35) }));
  } catch {
    /* gizli sekme / kota — sessizce yoksay */
  }
  try {
    if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent(SOUND_PREFS_EVENT, { detail: { scope } }));
  } catch {
    /* ignore */
  }
}
