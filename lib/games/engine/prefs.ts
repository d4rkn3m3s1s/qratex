/**
 * Oyun ses / titreşim tercihleri (oyuncu başına, bu tarayıcıda). Oyun kabuğundaki
 * 🔊 / 📳 anahtarları bunu yazar; `fx.ts` okur.
 *
 * Hareket politikası ile ilişki (yol haritası §4.2 kural 1): azaltılmış hareket (OS VEYA
 * `html.reduce-animations`) açıksa ses ve titreşim zaten kapalıdır; bu tercihler onun
 * ÜSTÜNE ek bir kısma anahtarıdır (açmak politikayı delmez).
 *
 * localStorage erişimi her yerde try/catch: gizli mod / engelli depolama → varsayılanlar.
 */

export interface GamePrefs {
  /** Oyun sesleri (efekt). */
  sound: boolean;
  /** Dokunsal geri bildirim (titreşim). */
  haptics: boolean;
}

export const GAME_PREFS_KEY = 'qratex-game-prefs';
export const DEFAULT_GAME_PREFS: Readonly<GamePrefs> = { sound: true, haptics: true };

let cache: GamePrefs | null = null;
const listeners = new Set<() => void>();

function read(): GamePrefs {
  if (typeof window === 'undefined') return DEFAULT_GAME_PREFS;
  try {
    const raw = window.localStorage.getItem(GAME_PREFS_KEY);
    if (!raw) return { ...DEFAULT_GAME_PREFS };
    const v = JSON.parse(raw) as Partial<GamePrefs>;
    return {
      sound: typeof v.sound === 'boolean' ? v.sound : DEFAULT_GAME_PREFS.sound,
      haptics: typeof v.haptics === 'boolean' ? v.haptics : DEFAULT_GAME_PREFS.haptics,
    };
  } catch {
    return { ...DEFAULT_GAME_PREFS };
  }
}

/** Güncel tercihler (useSyncExternalStore anlık görüntüsü; aynı nesne kimliği korunur). */
export function getGamePrefs(): GamePrefs {
  if (!cache) cache = read();
  return cache;
}

/** Sunucu anlık görüntüsü (SSR): varsayılanlar. */
export function getServerGamePrefs(): GamePrefs {
  return DEFAULT_GAME_PREFS as GamePrefs;
}

export function setGamePrefs(patch: Partial<GamePrefs>): GamePrefs {
  const next = { ...getGamePrefs(), ...patch };
  cache = next;
  if (typeof window !== 'undefined') {
    try {
      window.localStorage.setItem(GAME_PREFS_KEY, JSON.stringify(next));
    } catch {
      /* depolama yok: oturum içinde bellekte kalır */
    }
  }
  for (const l of Array.from(listeners)) l();
  return next;
}

export function subscribeGamePrefs(cb: () => void): () => void {
  listeners.add(cb);
  const onStorage = (e: StorageEvent) => {
    if (e.key === GAME_PREFS_KEY) {
      cache = null;
      cb();
    }
  };
  if (typeof window !== 'undefined') window.addEventListener('storage', onStorage);
  return () => {
    listeners.delete(cb);
    if (typeof window !== 'undefined') window.removeEventListener('storage', onStorage);
  };
}

/** Yalnız testler. */
export function __resetGamePrefsCache(): void {
  cache = null;
}
